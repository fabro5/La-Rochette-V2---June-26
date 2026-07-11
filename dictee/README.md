# Flow Dictée 🎙️

Dictée vocale intelligente dans le navigateur, inspirée de Wispr Flow.

## Utilisation

Ouvrir `index.html` via **HTTPS** ou `localhost` (la reconnaissance vocale du
navigateur l'exige). Navigateurs pris en charge : Chrome, Edge, Safari
(desktop et mobile). Firefox ne prend pas en charge la reconnaissance vocale.

Test rapide en local :

```bash
cd dictee
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Fonctionnalités

- **Push-to-talk** : maintenir `Espace` (desktop) ou toucher le micro (mobile),
  `Échap` pour annuler
- **Transcription en direct** pendant la dictée
- **Nettoyage automatique** : hésitations (« euh », « hum »), mots doublés,
  majuscules, espaces français
- **Ponctuation vocale** : dire « point », « virgule », « à la ligne »,
  « nouveau paragraphe »…
- **Copie automatique** dans le presse-papiers à la fin de la dictée
- **Dictionnaire personnel** : corrige les mots écorchés (noms propres, jargon)
- **Historique local** (50 dernières dictées) et **8 langues**
- **Installable** sur l'écran d'accueil mobile (PWA)

## Confidentialité

Aucune donnée n'est envoyée sur un serveur applicatif : la reconnaissance
utilise l'API Web Speech du navigateur, et l'historique, les réglages et le
dictionnaire sont stockés dans le `localStorage` de l'appareil.

## Version tout-en-un

`standalone/index.html` embarque CSS et JS dans un seul fichier : à utiliser quand
l'hébergement réécrit les URL inconnues (SPA Vercel/Netlify) et casse le chargement
des fichiers annexes.
