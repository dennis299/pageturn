import { HttpError } from "@/lib/http";

type Opts = { system: string; prompt: string; json?: boolean; imageBase64?: string };
type Result = { text: string; provider: "openrouter" | "gemini"; model: string };

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const j = JSON.parse(body);
    return `${res.status} ${j.error?.message ?? body}`.slice(0, 200);
  } catch {
    return `${res.status} ${body}`.slice(0, 200);
  }
}

async function viaOpenRouter(model: string, o: Opts, key: string): Promise<string> {
  const userContent = o.imageBase64
    ? [{ type: "text", text: o.prompt }, { type: "image_url", image_url: { url: o.imageBase64 } }]
    : o.prompt;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Pageturn" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: userContent },
      ],
      ...(o.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(await errorText(res));
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("empty reply");
  return text;
}

async function viaGemini(model: string, o: Opts, key: string): Promise<string> {
  const parts: object[] = [{ text: o.prompt }];
  if (o.imageBase64) {
    const [, mimeType, data] = o.imageBase64.match(/^data:([^;]+);base64,(.*)$/) ?? [];
    if (data) parts.push({ inlineData: { mimeType, data } });
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts }],
      ...(o.json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(await errorText(res));
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text?.trim()) throw new Error("empty reply");
  return text;
}

/**
 * Runs a text (or image+text) prompt on free OpenRouter models first, in the order of
 * OPENROUTER_TEXT_MODELS, then falls back to Gemini. Throws HttpError(502) if every one fails.
 */
export async function generateText(o: Opts): Promise<Result> {
  const errors: string[] = [];
  const orKey = process.env.OPENROUTER_API_KEY;
  const models = (process.env.OPENROUTER_TEXT_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (orKey) {
    for (const model of models) {
      try {
        return { text: await viaOpenRouter(model, o, orKey), provider: "openrouter", model };
      } catch (e) {
        errors.push(`${model}: ${(e as Error).message}`);
      }
    }
  }
  const gKey = process.env.GEMINI_API_KEY;
  const gModel = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
  if (gKey) {
    try {
      return { text: await viaGemini(gModel, o, gKey), provider: "gemini", model: gModel };
    } catch (e) {
      errors.push(`${gModel}: ${(e as Error).message}`);
    }
  }
  if (!errors.length) errors.push("no AI keys configured (OPENROUTER_API_KEY or GEMINI_API_KEY)");
  throw new HttpError(502, `The AI step failed. ${errors.join(" | ")}`);
}

/** Parses a JSON reply, tolerating ```json fences. */
export function parseJsonReply<T = unknown>(text: string): T {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned) as T;
}
