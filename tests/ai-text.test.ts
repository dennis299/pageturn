import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "@/lib/ai/text";
import { HttpError } from "@/lib/http";

const orOk = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
const gemOk = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const fail = (status: number) => new Response(JSON.stringify({ error: { message: `boom ${status}` } }), { status });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "or-key");
  vi.stubEnv("OPENROUTER_TEXT_MODELS", "a/one:free, b/two:free");
  vi.stubEnv("GEMINI_API_KEY", "g-key");
  vi.stubEnv("GEMINI_TEXT_MODEL", "gemini-test");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("generateText", () => {
  it("uses the first OpenRouter free model", async () => {
    fetchMock.mockResolvedValueOnce(orOk("hello"));
    const r = await generateText({ system: "s", prompt: "p" });
    expect(r).toEqual({ text: "hello", provider: "openrouter", model: "a/one:free" });
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe("a/one:free");
  });

  it("falls through 429/5xx to the next model, then to Gemini", async () => {
    fetchMock.mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(gemOk("from gemini"));
    const r = await generateText({ system: "s", prompt: "p" });
    expect(r.provider).toBe("gemini");
    expect(r.model).toBe("gemini-test");
    expect(r.text).toBe("from gemini");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain("models/gemini-test:generateContent");
  });

  it("throws HttpError 502 listing every provider's error when all fail", async () => {
    fetchMock.mockResolvedValue(fail(500));
    const err = await generateText({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(502);
    expect(err.message).toContain("a/one:free");
    expect(err.message).toContain("b/two:free");
    expect(err.message).toContain("gemini-test");
  });

  it("asks for JSON when json is set", async () => {
    fetchMock.mockResolvedValueOnce(orOk("{}"));
    await generateText({ system: "s", prompt: "p", json: true });
    expect(bodyOf(fetchMock.mock.calls[0]).response_format).toEqual({ type: "json_object" });
  });

  it("skips OpenRouter when no key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    fetchMock.mockResolvedValueOnce(gemOk("g"));
    const r = await generateText({ system: "s", prompt: "p" });
    expect(r.provider).toBe("gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends an image to vision models", async () => {
    fetchMock.mockResolvedValueOnce(orOk("page text"));
    await generateText({ system: "s", prompt: "p", imageBase64: "data:image/jpeg;base64,AAAA" });
    const content = bodyOf(fetchMock.mock.calls[0]).messages[1].content;
    expect(content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
  });
});
