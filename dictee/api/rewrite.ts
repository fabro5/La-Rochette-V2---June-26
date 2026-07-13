// Reformulation IA pour Flow Dictée — fonction serverless Vercel.
// Requiert la variable d'environnement ANTHROPIC_API_KEY sur le projet.
// Volontairement sans dépendance npm : appel HTTP direct à l'API Anthropic.

const MODEL = "claude-opus-4-8"; // alternative plus rapide et économique : "claude-haiku-4-5"
const MAX_INPUT_CHARS = 8000;

// Tarifs officiels Anthropic en $ par million de tokens, pour estimer le coût
// de chaque appel côté client.
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const TONES: Record<string, string> = {
  neutre: "Garde un ton neutre et naturel, fidèle à la façon de parler du locuteur.",
  professionnel:
    "Adopte un ton professionnel et soigné, adapté à un email ou un courrier d'affaires.",
  decontracte: "Adopte un ton détendu et familier, adapté à un message entre proches.",
};

export async function POST(request: Request): Promise<Response> {
  let body: { text?: unknown; lang?: unknown; tone?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ error: "Champ 'text' manquant" }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return Response.json({ error: "Texte trop long" }, { status: 413 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY non configurée sur le projet" },
      { status: 500 },
    );
  }

  const lang = typeof body.lang === "string" ? body.lang : "fr-FR";
  const toneKey = typeof body.tone === "string" ? body.tone : "neutre";
  const toneInstruction = TONES[toneKey] ?? TONES.neutre;

  const system = [
    "Tu es le moteur de reformulation d'une application de dictée vocale.",
    "On te donne la transcription brute d'une dictée. Réécris-la en texte propre :",
    "- ajoute la ponctuation et les majuscules manquantes",
    "- supprime les hésitations, répétitions et faux départs restants",
    "- corrige les mots visiblement mal reconnus par la reconnaissance vocale, d'après le contexte",
    "- n'invente rien : conserve le sens, les informations et la langue d'origine (" + lang + ")",
    "- " + toneInstruction,
    "Réponds UNIQUEMENT avec le texte reformulé, sans commentaire, sans guillemets.",
  ].join("\n");

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!anthropicResponse.ok) {
    const detail = await anthropicResponse.text().catch(() => "");
    console.error("Anthropic API error", anthropicResponse.status, detail);
    return Response.json({ error: "Service IA indisponible" }, { status: 502 });
  }

  const data = (await anthropicResponse.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  if (data.stop_reason === "refusal") {
    return Response.json({ error: "Reformulation refusée" }, { status: 502 });
  }

  const rewritten = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!rewritten) {
    return Response.json({ error: "Réponse vide" }, { status: 502 });
  }

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  const price = PRICING_PER_MTOK[MODEL];
  const costUsd = price
    ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000
    : null;

  return Response.json({
    text: rewritten,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    cost_usd: costUsd,
  });
}
