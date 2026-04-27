import { GoogleGenerativeAI } from "@google/generative-ai";
import functions from "@google-cloud/functions-framework";

// ===== 設定 =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_ORIGINS = [
  "https://meguru-v1.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

// ===== レート制限（メモリ内、インスタンス単位）=====
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1分
const RATE_LIMIT_MAX = 15; // 1分あたり15リクエスト

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

// 古いエントリを定期的にクリーンアップ（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 120_000);

// ===== CORS ヘルパー =====
function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
  };
}

// ===== メイン関数 =====
functions.http("geminiProxy", async (req, res) => {
  const origin = req.headers.origin || "";
  const corsHeaders = getCorsHeaders(origin);

  // CORS ヘッダーを設定
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.set(key, value);
  });

  // Preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // POST 以外は拒否
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Origin チェック
  if (!ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "Forbidden: invalid origin" });
    return;
  }

  // レート制限チェック
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    "unknown";
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: "Rate limit exceeded. Please wait." });
    return;
  }

  // API キー検証
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  try {
    const { prompt, model, jsonMode } = req.body;

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Missing or invalid 'prompt' field" });
      return;
    }

    // プロンプトサイズ制限（100KB）
    if (prompt.length > 100_000) {
      res.status(400).json({ error: "Prompt too large" });
      return;
    }

    // モデルのホワイトリスト
    const allowedModels = [
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ];
    const selectedModel = allowedModels.includes(model)
      ? model
      : "gemini-2.5-flash-lite";

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const generationConfig = jsonMode
      ? { responseMimeType: "application/json" }
      : {};

    const aiModel = genAI.getGenerativeModel({
      model: selectedModel,
      generationConfig,
    });

    const result = await aiModel.generateContent(prompt);
    const text = (await result.response).text();

    res.status(200).json({ text, model: selectedModel });
  } catch (err) {
    console.error("Gemini API error:", err);

    // 429 を透過
    if (
      err?.status === 429 ||
      err?.message?.includes("429") ||
      err?.message?.includes("RESOURCE_EXHAUSTED")
    ) {
      res
        .status(429)
        .json({ error: "AI service rate limited. Please retry later." });
      return;
    }

    res.status(500).json({
      error: "AI generation failed",
      details: err?.message || "Unknown error",
    });
  }
});
