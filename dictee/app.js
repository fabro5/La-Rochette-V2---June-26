/* ===== Flow Dictée — dictée vocale intelligente, 100 % navigateur ===== */
(function () {
  'use strict';

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  var $ = function (id) { return document.getElementById(id); };

  var micBtn = $('micBtn');
  var statusLine = $('statusLine');
  var liveText = $('liveText');
  var resultCard = $('resultCard');
  var resultText = $('resultText');
  var copiedBadge = $('copiedBadge');
  var langSelect = $('langSelect');
  var historyList = $('historyList');
  var historyEmpty = $('historyEmpty');
  var toast = $('toast');

  var STORAGE = {
    settings: 'flowDictee.settings',
    history: 'flowDictee.history',
    dict: 'flowDictee.dictionary'
  };

  /* ---------- Réglages ---------- */

  var defaults = { fillers: true, voicePunct: true, caps: true, autoCopy: true, lang: 'fr-FR' };
  var settings = loadJSON(STORAGE.settings, defaults);

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
    } catch (e) { return Object.assign({}, fallback); }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE.settings, JSON.stringify(settings)); } catch (e) {}
  }

  /* ---------- Support ---------- */

  if (!SpeechRecognition) {
    $('unsupported').classList.remove('hidden');
    micBtn.disabled = true;
    micBtn.style.opacity = '0.4';
  }

  /* ---------- Reconnaissance vocale ---------- */

  // Sur mobile (Android surtout), les résultats sont CUMULATIFS : chaque événement
  // renvoie la phrase entière depuis le début, pas le nouveau morceau. Il faut donc
  // remplacer au lieu d'ajouter, et désactiver le mode continu (bugué là-bas).
  var IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  var recognition = null;
  var state = 'idle'; // idle | recording | stopping
  var segments = [];        // phrases finalisées (une par segment de reconnaissance)
  var interimTranscript = '';

  function fullTranscript() {
    return (segments.join(' ') + ' ' + interimTranscript).replace(/\s+/g, ' ').trim();
  }

  function buildRecognition() {
    var rec = new SpeechRecognition();
    rec.continuous = !IS_MOBILE;
    rec.interimResults = true;
    rec.lang = settings.lang;

    rec.onresult = function (event) {
      if (IS_MOBILE) {
        // Résultats cumulatifs : on garde le dernier instantané, on n'additionne pas.
        var interim = '';
        var finalChunk = '';
        for (var m = 0; m < event.results.length; m++) {
          var t = event.results[m][0].transcript;
          if (event.results[m].isFinal) finalChunk = t;
          else interim = t;
        }
        if (finalChunk) {
          segments.push(finalChunk.trim());
          interimTranscript = '';
        } else {
          interimTranscript = interim;
        }
      } else {
        interimTranscript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            segments.push(chunk.trim());
          } else {
            interimTranscript += chunk;
          }
        }
      }
      liveText.textContent = fullTranscript();
    };

    rec.onerror = function (event) {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        state = 'idle';
        setRecordingUI(false);
        showToast('🎤 Autorise l’accès au micro pour dicter');
      } else if (event.error === 'no-speech') {
        // silence : on laisse onend décider (redémarrage si toujours en cours)
      }
    };

    rec.onend = function () {
      if (state === 'recording') {
        // Fin de segment (mobile) ou coupure après silence : on relance tant
        // que l'utilisateur n'a pas arrêté la dictée.
        try { rec.start(); } catch (e) {
          setTimeout(function () {
            if (state === 'recording') { try { rec.start(); } catch (e2) {} }
          }, 150);
        }
      } else if (state === 'stopping') {
        state = 'idle';
        finishDictation();
      }
    };

    return rec;
  }

  function startRecording() {
    if (!SpeechRecognition || state === 'recording') return;
    segments = [];
    interimTranscript = '';
    liveText.textContent = '';
    recognition = buildRecognition();
    try {
      recognition.start();
      state = 'recording';
      setRecordingUI(true);
    } catch (e) {
      state = 'idle';
      setRecordingUI(false);
    }
  }

  function stopRecording(cancelled) {
    if (state !== 'recording') return;
    state = cancelled ? 'idle' : 'stopping';
    setRecordingUI(false);
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    if (cancelled) {
      liveText.textContent = '';
      showToast('Dictée annulée');
    }
  }

  function setRecordingUI(on) {
    document.body.classList.toggle('recording', on);
    statusLine.classList.toggle('rec', on);
    if (on) {
      statusLine.innerHTML = '● Enregistrement… relâche ou touche pour terminer';
    } else {
      statusLine.innerHTML = '<span class="kbd-hint">Maintiens <kbd>Espace</kbd> pour dicter&nbsp;· ou touche le micro</span>';
    }
  }

  function finishDictation() {
    var raw = fullTranscript();
    liveText.textContent = '';
    if (!raw) {
      showToast('Je n’ai rien entendu 🤫');
      return;
    }
    var clean = cleanText(raw);
    resultText.value = clean;
    resultCard.classList.remove('hidden');
    addToHistory(clean);
    if (settings.autoCopy) {
      copyToClipboard(clean, true);
    }
  }

  /* ---------- Nettoyage du texte ---------- */

  var FILLERS_FR = /\b(?:euh+|heu+|hum+|hem+|mmh+|bah\s+euh|ben\s+euh)\b/gi;
  var FILLERS_EN = /\b(?:uh+|um+|erm+|hmm+)\b/gi;

  var PUNCT_FR = [
    [/\bpoint d[’']interrogation\b/gi, ' ?'],
    [/\bpoint d[’']exclamation\b/gi, ' !'],
    [/\bpoints? de suspension\b/gi, '…'],
    [/\bpoint[- ]virgule\b/gi, ' ;'],
    [/\bdeux[- ]points\b/gi, ' :'],
    [/\bnouveau paragraphe\b/gi, '\n\n'],
    // (^|\s) plutôt que \b : les regex JS ne voient pas de limite de mot avant « à »
    [/(^|\s)(?:à la ligne|a la ligne|nouvelle ligne|retour à la ligne)(?=\s|$)/gi, '$1\n'],
    [/\bouvrez? (?:la |les )?parenth[èe]ses?\b/gi, ' ('],
    [/\bfermez? (?:la |les )?parenth[èe]ses?\b/gi, ')'],
    [/\bouvrez? (?:les )?guillemets\b/gi, ' «'],
    [/\bfermez? (?:les )?guillemets\b/gi, '»'],
    [/\bvirgule\b/gi, ','],
    // « point » seulement s'il n'est pas suivi d'un complément (« point de vue », « point final »…)
    [/\bpoint\b(?!\s+(?:de|d[’']|final|com|fr|net|org))/gi, '.']
  ];

  var PUNCT_EN = [
    [/\bquestion mark\b/gi, '?'],
    [/\bexclamation (?:mark|point)\b/gi, '!'],
    [/\bsemicolon\b/gi, ';'],
    [/\bcolon\b/gi, ':'],
    [/\bnew paragraph\b/gi, '\n\n'],
    [/\bnew line\b/gi, '\n'],
    [/\bcomma\b/gi, ','],
    [/\bperiod\b/gi, '.'],
    [/\bfull stop\b/gi, '.']
  ];

  function getDictionary() {
    var raw = '';
    try { raw = localStorage.getItem(STORAGE.dict) || ''; } catch (e) {}
    var rules = [];
    raw.split('\n').forEach(function (line) {
      var parts = line.split('=>');
      if (parts.length === 2) {
        var from = parts[0].trim();
        var to = parts[1].trim();
        if (from && to) rules.push([from, to]);
      }
    });
    return rules;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cleanText(text) {
    var isFrench = settings.lang.indexOf('fr') === 0;
    var out = ' ' + text + ' ';

    // 1. Dictionnaire personnel
    getDictionary().forEach(function (rule) {
      out = out.replace(new RegExp('\\b' + escapeRegExp(rule[0]) + '\\b', 'gi'), rule[1]);
    });

    // 2. Ponctuation vocale
    if (settings.voicePunct) {
      var punctRules = isFrench ? PUNCT_FR : PUNCT_EN;
      punctRules.forEach(function (rule) {
        out = out.replace(rule[0], rule[1]);
      });
    }

    // 3. Hésitations et répétitions
    if (settings.fillers) {
      out = out.replace(isFrench ? FILLERS_FR : FILLERS_EN, ' ');
      // mots doublés involontairement (« le le », « je je »)
      out = out.replace(/\b(\p{L}+)(\s+\1\b)+/giu, '$1');
    }

    // 4. Espaces et ponctuation propres
    out = out
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\s+([,.])/g, '$1')
      .replace(/([,.;:!?…])(?=\p{L})/gu, '$1 ');

    if (isFrench) {
      // espace insécable avant ? ! ; :
      out = out.replace(/\s*([?!;:])/g, ' $1');
      out = out.replace(/«\s*/g, '« ').replace(/\s*»/g, ' »');
    }

    out = out.trim();

    // 5. Majuscules
    if (settings.caps && out) {
      out = out.charAt(0).toUpperCase() + out.slice(1);
      out = out.replace(/([.!?…]\s*\n?|\n\n)(\p{Ll})/gu, function (m, sep, letter) {
        return sep + letter.toUpperCase();
      });
    }

    // 6. Point final si la phrase se termine sans ponctuation
    if (settings.caps && out && !/[.!?…:»)\n]$/.test(out)) {
      out += '.';
    }

    return out;
  }

  /* ---------- Presse-papiers ---------- */

  function copyToClipboard(text, auto) {
    function done() {
      copiedBadge.classList.remove('hidden');
      showToast(auto ? '✓ Copié automatiquement — colle où tu veux !' : '✓ Copié !');
      setTimeout(function () { copiedBadge.classList.add('hidden'); }, 3000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- Historique ---------- */

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE.history) || '[]'); } catch (e) { return []; }
  }

  function setHistory(items) {
    try { localStorage.setItem(STORAGE.history, JSON.stringify(items.slice(0, 50))); } catch (e) {}
  }

  function addToHistory(text) {
    var items = getHistory();
    items.unshift({ text: text, date: new Date().toISOString() });
    setHistory(items);
    renderHistory();
  }

  function renderHistory() {
    var items = getHistory();
    historyList.innerHTML = '';
    historyEmpty.classList.toggle('hidden', items.length > 0);
    items.forEach(function (item, index) {
      var li = document.createElement('li');
      li.className = 'history-item';

      var textDiv = document.createElement('div');
      textDiv.className = 'history-text';
      textDiv.title = 'Toucher pour copier';
      textDiv.textContent = item.text;

      var dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = formatDate(item.date);
      textDiv.appendChild(dateSpan);

      textDiv.addEventListener('click', function () { copyToClipboard(item.text, false); });

      var actions = document.createElement('div');
      actions.className = 'history-actions';

      var copyB = document.createElement('button');
      copyB.textContent = '📋';
      copyB.title = 'Copier';
      copyB.addEventListener('click', function () { copyToClipboard(item.text, false); });

      var delB = document.createElement('button');
      delB.textContent = '🗑️';
      delB.title = 'Supprimer';
      delB.addEventListener('click', function () {
        var current = getHistory();
        current.splice(index, 1);
        setHistory(current);
        renderHistory();
      });

      actions.appendChild(copyB);
      actions.appendChild(delB);
      li.appendChild(textDiv);
      li.appendChild(actions);
      historyList.appendChild(li);
    });
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) +
        ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  /* ---------- Toast ---------- */

  var toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.add('hidden'); }, 2600);
  }

  /* ---------- Événements ---------- */

  // Micro : toucher pour démarrer / arrêter (mobile et desktop)
  micBtn.addEventListener('click', function () {
    if (state === 'recording') stopRecording(false);
    else startRecording();
  });

  // Push-to-talk : maintenir Espace (desktop)
  var spaceHeld = false;
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    var typing = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable);
    if (e.code === 'Space' && !typing && !e.repeat) {
      e.preventDefault();
      spaceHeld = true;
      if (state !== 'recording') startRecording();
    }
    if (e.code === 'Escape' && state === 'recording') {
      stopRecording(true);
    }
  });

  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space' && spaceHeld) {
      spaceHeld = false;
      if (state === 'recording') stopRecording(false);
    }
  });

  // Empêche le scroll quand on maintient Espace
  window.addEventListener('keypress', function (e) {
    if (e.code === 'Space' && spaceHeld) e.preventDefault();
  });

  // Résultat
  $('copyBtn').addEventListener('click', function () { copyToClipboard(resultText.value, false); });
  $('redoBtn').addEventListener('click', function () { startRecording(); });
  $('clearBtn').addEventListener('click', function () {
    resultText.value = '';
    resultCard.classList.add('hidden');
  });

  // Langue
  langSelect.value = settings.lang;
  langSelect.addEventListener('change', function () {
    settings.lang = langSelect.value;
    saveSettings();
  });

  // Historique
  $('clearHistoryBtn').addEventListener('click', function () {
    if (getHistory().length === 0) return;
    if (confirm('Effacer tout l’historique ?')) {
      setHistory([]);
      renderHistory();
    }
  });

  // Réglages
  var overlay = $('settingsOverlay');
  var optIds = { fillers: 'optFillers', voicePunct: 'optVoicePunct', caps: 'optCaps', autoCopy: 'optAutoCopy' };

  $('settingsBtn').addEventListener('click', function () {
    Object.keys(optIds).forEach(function (key) { $(optIds[key]).checked = !!settings[key]; });
    try { $('dictText').value = localStorage.getItem(STORAGE.dict) || ''; } catch (e) {}
    overlay.classList.remove('hidden');
  });

  $('settingsClose').addEventListener('click', function () { overlay.classList.add('hidden'); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.add('hidden'); });

  Object.keys(optIds).forEach(function (key) {
    $(optIds[key]).addEventListener('change', function (e) {
      settings[key] = e.target.checked;
      saveSettings();
    });
  });

  $('dictSave').addEventListener('click', function () {
    try { localStorage.setItem(STORAGE.dict, $('dictText').value); } catch (e) {}
    showToast('✓ Dictionnaire enregistré');
  });

  /* ---------- Init ---------- */
  renderHistory();

  // Exposé pour les tests
  window.__flowDictee = { cleanText: cleanText, settings: settings };
})();
