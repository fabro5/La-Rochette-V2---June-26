// Fonction serverless Vercel : concierge local IA.
// À partir de la localisation du gîte, Claude RECHERCHE sur le web de vraies
// adresses autour et compose une sélection riche (mot d'accueil, découverte de
// la région, bons plans par catégorie). Renvoie du JSON structuré.
import Anthropic from "@anthropic-ai/sdk";

// Vercel : laisser le temps à la recherche web (jusqu'à 60 s).
export const maxDuration = 60;

const clip = (v, n = 500) => String(v == null ? "" : v).slice(0, n).trim();

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
1. Utilise l'outil de recherche web pour trouver de VRAIES adresses situées autour de la localisation fournie (commune, code postal, région). Fais plusieurs recherches ciblées : restaurants et tables du coin, activités de nature et randonnées, sites à visiter / patrimoine / villages, marchés et producteurs locaux, sorties en famille et options jours de pluie, curiosités et coups de cœur. Croise les résultats.
2. Reprends d'abord les adresses déjà fournies par l'hôte (enrichis-les), puis complète ABONDAMMENT avec tes trouvailles.

RÉDACTION (français, ton chaleureux, élégant et sobre — jamais "marketing", pas d'emojis) :
- "motAccueil" : 3 à 4 phrases d'accueil personnalisées (nom du gîte, ambiance).
- "decouvrir" : 3 à 5 phrases qui plantent le décor de la région (paysages, art de vivre, incontournables tout proches).
- "bonsPlans" : pour CHAQUE catégorie, propose entre 4 et 6 entrées {nom, description, detail} quand la zone le permet.
  - "nom" : le nom réel du lieu/établissement/site.
  - "description" : une phrase courte et évocatrice (≤ 130 caractères).
  - "detail" : une info pratique courte (distance ou temps approximatif depuis la commune, jour de marché, "réservation conseillée"…). Reste général si tu n'es pas sûr.
  Catégories : restaurants, activites, visites, commerces, famille, secrets.

RÈGLES :
- Privilégie des lieux RÉELS et vérifiables trouvés via la recherche. N'invente pas de numéros de téléphone ni d'horaires précis ; si tu n'es pas sûr d'un détail, reste général.
- Vise l'abondance et la vraie valeur locale : le voyageur doit sentir qu'on lui a préparé une sélection généreuse et sur-mesure.

SORTIE : après tes recherches, réponds en DERNIER par UNIQUEMENT un objet JSON valide, sans aucun texte autour ni balise de code, dans cette forme exacte :
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "not_configured",
      message: "Le moteur IA n'est pas encore activé (clé API manquante). Ajoutez ANTHROPIC_API_KEY dans les réglages Vercel.",
    });
    return;
  }
  try {
    const d = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    // Garde-fou : un email valide est requis pour déclencher la génération (capture du lead + anti-abus).
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || "").trim())) {
      res.status(400).json({ error: "email_required", message: "Un email valide est requis pour générer l'aperçu." });
      return;
    }
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: buildBrief(d) }],
    });
    // le JSON final est le dernier bloc texte de la réponse
    const textBlocks = (response.content || []).filter((b) => b.type === "text").map((b) => b.text);
    let data;
    try {
      data = parseJson(textBlocks[textBlocks.length - 1] || "");
    } catch (_) {
      try { data = parseJson(textBlocks.join("\n")); }
      catch (e2) {
        res.status(502).json({ error: "bad_output", message: "La réponse de l'IA n'a pas pu être lue. Réessayez." });
        return;
      }
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
    const status = e && e.status === 401 ? 401 : 500;
    res.status(status).json({
      error: "generation_failed",
      message: status === 401 ? "Clé API refusée." : "La génération a échoué. Réessayez dans un instant.",
    });
  }
}
