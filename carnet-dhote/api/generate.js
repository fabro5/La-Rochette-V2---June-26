// Fonction serverless Vercel : enrichit le contenu du carnet avec Claude.
// Reçoit les réponses du questionnaire, renvoie du contenu rédigé (mot d'accueil,
// texte "découvrir la région", bons plans par catégorie) au format JSON.
import Anthropic from "@anthropic-ai/sdk";

const clip = (v, n = 500) => String(v == null ? "" : v).slice(0, n).trim();

function buildBrief(d) {
  const arr = (x) => [].concat(x || []).filter(Boolean).map((s) => clip(s, 60)).join(", ");
  const L = [];
  L.push(`Nom du gîte : ${clip(d.giteName) || "—"}`);
  L.push(`Type : ${clip(d.giteType) || "—"} · Capacité : ${clip(d.capacity) || "—"} voyageurs · ${clip(d.bedrooms) || "?"} chambres`);
  L.push(`Lieu : ${[clip(d.city), clip(d.postal)].filter(Boolean).join(" ") || "—"}${d.address ? " · " + clip(d.address) : ""}`);
  if (d.ambiance) L.push(`Ambiance : ${clip(d.ambiance)}`);
  if (d.highlights) L.push(`Atouts phares : ${clip(d.highlights)}`);
  const ams = arr(d.amenities);
  if (ams) L.push(`Équipements : ${ams}`);
  if (d.hosts) L.push(`Hôtes : ${clip(d.hosts, 80)}`);
  L.push("");
  L.push("Adresses fournies par l'hôte (à sublimer, ne pas inventer d'autres noms précis) :");
  L.push(`- Restaurants & tables : ${clip(d.restos, 800) || "(aucune)"}`);
  L.push(`- Nature, activités & balades : ${clip(d.activites, 800) || "(aucune)"}`);
  L.push(`- Commerces & marché : ${clip(d.commerces, 800) || "(aucun)"}`);
  L.push(`- En famille / jours de pluie : ${clip(d.family, 800) || "(aucun)"}`);
  if (d.secret) L.push(`- Coups de cœur secrets : ${clip(d.secret, 400)}`);
  return L.join("\n");
}

const SYSTEM = `Tu es la plume éditoriale de "Carnet d'Hôte", une marque premium qui crée des livrets de bienvenue pour gîtes et maisons d'hôtes. Ton style : chaleureux, élégant, sobre — jamais mièvre ni "marketing", jamais de superlatifs creux ni d'emojis. Tu écris en français, à la 1re personne du pluriel (les hôtes qui accueillent).

À partir du brief d'un gîte, tu rédiges le contenu d'un carnet :
- "motAccueil" : un mot d'accueil personnalisé de 3 à 4 phrases (utilise le nom du gîte et l'ambiance décrite).
- "decouvrir" : un court paragraphe (2-3 phrases) qui donne envie de découvrir la région autour du gîte, dans un esprit "art de vivre".
- "bonsPlans" : pour chaque catégorie (restaurants, activites, commerces, famille), une liste d'entrées {nom, description}. Description = une phrase courte et évocatrice.

RÈGLES STRICTES :
- N'invente JAMAIS de noms d'établissements, d'adresses, d'horaires ou de distances précises que l'hôte n'a pas fournis. Reformule et sublime uniquement les adresses données.
- Tu peux compléter chaque catégorie avec 1 à 2 suggestions GÉNÉRIQUES (sans nom propre inventé), par ex. {"nom":"Le marché du samedi","description":"..."} ou {"nom":"Balade au fil de la rivière","description":"..."}, clairement génériques.
- Si une catégorie est vide et que tu n'as aucune matière, renvoie une liste vide.
- Reste concis : chaque description ≤ 120 caractères.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises de code, exactement dans cette forme :
{"motAccueil":"...","decouvrir":"...","bonsPlans":{"restaurants":[{"nom":"...","description":"..."}],"activites":[...],"commerces":[...],"famille":[...]}}`;

function parseJson(text) {
  let t = String(text || "").trim();
  // retire d'éventuelles balises de code
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
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{ role: "user", content: buildBrief(d) }],
    });
    const text = (response.content.find((b) => b.type === "text") || {}).text || "";
    let data;
    try {
      data = parseJson(text);
    } catch (e) {
      res.status(502).json({ error: "bad_output", message: "La réponse de l'IA n'a pas pu être lue." });
      return;
    }
    // normalisation défensive
    const items = (a) => (Array.isArray(a) ? a : []).filter((x) => x && x.nom).map((x) => ({ nom: String(x.nom).slice(0, 80), description: String(x.description || "").slice(0, 160) }));
    const bp = data.bonsPlans || {};
    res.status(200).json({
      motAccueil: String(data.motAccueil || "").slice(0, 900),
      decouvrir: String(data.decouvrir || "").slice(0, 700),
      bonsPlans: {
        restaurants: items(bp.restaurants),
        activites: items(bp.activites),
        commerces: items(bp.commerces),
        famille: items(bp.famille),
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
