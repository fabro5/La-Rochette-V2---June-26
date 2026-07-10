// Fonction serverless Vercel : concierge local IA (Google Gemini).
// À partir de la localisation du gîte, Gemini utilise Google Search (grounding)
// pour trouver de vraies adresses autour et compose une sélection riche.
// Sortie JSON identique à l'ancienne version (l'aperçu ne change pas).
import { GoogleGenAI } from "@google/genai";

// Vercel : laisser le temps à la recherche web (jusqu'à 60 s).
export const maxDuration = 60;

const clip = (v, n = 500) => String(v == null ? "" : v).slice(0, n).trim();
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

function buildBrief(d) {
  const arr = (x) => [].concat(x || []).filter(Boolean).map((s) => clip(s, 60)).join(", ");
  const L = [];
  L.push(`GÎTE À DOCUMENTER`);
  L.push(`Nom : ${clip(d.giteName) || "—"}`);
  L.push(`Type : ${clip(d.giteType) || "—"} · Capacité : ${clip(d.capacity) || "—"} voyageurs`);
  L.push(`LOCALISATION (à utiliser pour la recherche web) : ${[clip(d.address), clip(d.city), clip(d.postal)].filter(Boolean).join(", ") || "—"}`);
  if (d.ambiance) L.push(`Ambiance du gîte : ${clip(d.ambiance)}`);
  if (d.highlights) L.push(`Atouts phares : ${clip(d.highlights)}`);
  const ams = arr(d.amenities);
  if (ams) L.push(`Équipements : ${ams}`);
  if (d.hosts) L.push(`Signature des hôtes : ${clip(d.hosts, 80)}`);
  L.push("");
  L.push("ADRESSES DÉJÀ CONNUES DE L'HÔTE (à reprendre en priorité et à enrichir) :");
  L.push(`- Restaurants & tables : ${clip(d.restos, 800) || "(aucune)"}`);
  L.push(`- Nature, activités & balades : ${clip(d.activites, 800) || "(aucune)"}`);
  L.push(`- Commerces & marché : ${clip(d.commerces, 800) || "(aucun)"}`);
  L.push(`- En famille / jours de pluie : ${clip(d.family, 800) || "(aucun)"}`);
  if (d.secret) L.push(`- Coups de cœur secrets : ${clip(d.secret, 400)}`);
  return L.join("\n");
}

const SYSTEM = `Tu es le concierge local de "Carnet d'Hôte", une marque premium de livrets de bienvenue pour gîtes et maisons d'hôtes. Ton rôle : composer une sélection RICHE et RÉELLE d'adresses et d'activités autour d'un gîte, comme le ferait un habitant qui connaît sa région par cœur.

MÉTHODE (obligatoire) :
1. Utilise la recherche Google pour trouver de VRAIES adresses situées autour de la localisation fournie (commune, code postal, région). Fais plusieurs recherches ciblées : restaurants et tables du coin, activités de nature et randonnées, sites à visiter / patrimoine / villages, marchés et producteurs locaux, sorties en famille et options jours de pluie, curiosités et coups de cœur.
2. Reprends d'abord les adresses déjà fournies par l'hôte (enrichis-les), puis complète ABONDAMMENT avec tes trouvailles.

RÉDACTION (français, ton chaleureux, élégant et sobre — jamais "marketing", pas d'emojis) :
- "motAccueil" : 3 à 4 phrases d'accueil personnalisées (nom du gîte, ambiance).
- "decouvrir" : 3 à 5 phrases qui plantent le décor de la région.
- "bonsPlans" : pour CHAQUE catégorie, entre 4 et 6 entrées {nom, description, detail} quand la zone le permet.
  - "nom" : le nom réel du lieu/établissement/site.
  - "description" : une phrase courte et évocatrice (≤ 130 caractères).
  - "detail" : une info pratique courte (distance/temps approximatif depuis la commune, jour de marché…). Reste général si tu n'es pas sûr.
  Catégories : restaurants, activites, visites, commerces, famille, secrets.

RÈGLES :
- Privilégie des lieux RÉELS et vérifiables trouvés via la recherche. N'invente pas de numéros de téléphone ni d'horaires précis ; si tu n'es pas sûr d'un détail, reste général.
- Vise l'abondance et la vraie valeur locale.

SORTIE : réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour ni balise de code, dans cette forme exacte :
{"motAccueil":"...","decouvrir":"...","bonsPlans":{"restaurants":[{"nom":"","description":"","detail":""}],"activites":[],"visites":[],"commerces":[],"famille":[],"secrets":[]}}`;

function parseJson(text) {
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "not_configured",
      message: "Le moteur IA n'est pas encore activé (clé API manquante). Ajoutez GEMINI_API_KEY dans les réglages Vercel.",
    });
    return;
  }
  try {
    const d = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    if (!emailOk(d.email)) {
      res.status(400).json({ error: "email_required", message: "Un email valide est requis pour générer l'aperçu." });
      return;
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildBrief(d),
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 8000,
        tools: [{ googleSearch: {} }],
      },
    });
    const text = typeof response.text === "function" ? response.text() : response.text;
    let data;
    try {
      data = parseJson(text);
    } catch (_) {
      res.status(502).json({ error: "bad_output", message: "La réponse de l'IA n'a pas pu être lue. Réessayez." });
      return;
    }
    const items = (a) => (Array.isArray(a) ? a : [])
      .filter((x) => x && x.nom)
      .slice(0, 8)
      .map((x) => ({
        nom: String(x.nom).slice(0, 90),
        description: String(x.description || "").slice(0, 190),
        detail: String(x.detail || "").slice(0, 90),
      }));
    const bp = data.bonsPlans || {};
    res.status(200).json({
      motAccueil: String(data.motAccueil || "").slice(0, 900),
      decouvrir: String(data.decouvrir || "").slice(0, 800),
      bonsPlans: {
        restaurants: items(bp.restaurants),
        activites: items(bp.activites),
        visites: items(bp.visites),
        commerces: items(bp.commerces),
        famille: items(bp.famille),
        secrets: items(bp.secrets),
      },
    });
  } catch (e) {
    const msg = String((e && e.message) || e || "");
    const status = /api key|permission|invalid|unauthenticated|401|403/i.test(msg) ? 401 : 500;
    res.status(status).json({
      error: "generation_failed",
      message: status === 401 ? "Clé API refusée ou invalide." : "La génération a échoué. Réessayez dans un instant.",
    });
  }
}
