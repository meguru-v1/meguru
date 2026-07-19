// ===== Gemini API プロキシ =====
import { GoogleGenerativeAI } from "@google/generative-ai";
import { reqObjectBody, reqString } from "../lib/validate.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ALLOWED_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const MAX_PROMPT_LEN = 100_000;

/** POST / （後方互換のためルート直下） または POST /gemini */
export async function generate(req, res) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const body = reqObjectBody(req.body);
  const prompt = reqString(body.prompt, "prompt", MAX_PROMPT_LEN);
  const selectedModel = ALLOWED_MODELS.includes(body.model)
    ? body.model
    : ALLOWED_MODELS[0];

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const aiModel = genAI.getGenerativeModel(
      {
        model: selectedModel,
        generationConfig: body.jsonMode ? { responseMimeType: "application/json" } : {},
      },
      {
        // Gemini APIキーにはHTTPリファラ制限が掛かっているため、
        // サーバーからの呼び出しでも Referer を明示する必要がある（削除すると403になる）
        customHeaders: { Referer: "https://meguru-v1.github.io/" },
      }
    );

    const result = await aiModel.generateContent(prompt);
    const text = (await result.response).text();
    res.status(200).json({ text, model: selectedModel });
  } catch (err) {
    console.error("Gemini API error:", err);

    if (
      err?.status === 429 ||
      err?.message?.includes("429") ||
      err?.message?.includes("RESOURCE_EXHAUSTED")
    ) {
      res.status(429).json({ error: "AI service rate limited. Please retry later." });
      return;
    }
    // 内部エラーの詳細（内部URL・Google側のエラー本文）はクライアントに返さない
    res.status(500).json({ error: "AI generation failed" });
  }
}
