// ===== 共通セキュリティ層 =====
// CORS / App Check / レート制限 をここに集約する。

// 本番オリジン。localhost は開発時のみ許可する（本番では ALLOW_LOCALHOST を設定しない）
const PROD_ORIGINS = [
  "https://meguru-v1.github.io",
  "https://meguru-rho.vercel.app",
];
const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:4173"];

export const ALLOWED_ORIGINS =
  process.env.ALLOW_LOCALHOST === "true"
    ? [...PROD_ORIGINS, ...DEV_ORIGINS]
    : PROD_ORIGINS;

// ===== App Check =====
// Origin ヘッダは詐称可能なので、実質的な認証は App Check が担う。
// 有効化手順:
//   1. Firebase コンソールで App Check（reCAPTCHA Enterprise）を登録
//   2. フロントで VITE_FIREBASE_* / VITE_RECAPTCHA_SITE_KEY を設定
//   3. この関数に REQUIRE_APP_CHECK=true を設定してデプロイ
export const REQUIRE_APP_CHECK = process.env.REQUIRE_APP_CHECK === "true";

let appCheckPromise = null;
async function getAppCheckClient() {
  if (!appCheckPromise) {
    appCheckPromise = (async () => {
      const { initializeApp, getApps } = await import("firebase-admin/app");
      const { getAppCheck } = await import("firebase-admin/app-check");
      if (getApps().length === 0) initializeApp();
      return getAppCheck();
    })();
  }
  return appCheckPromise;
}

export async function verifyAppCheck(token) {
  if (!token || typeof token !== "string") return false;
  try {
    const client = await getAppCheckClient();
    await client.verifyToken(token);
    return true;
  } catch (err) {
    console.warn("App Check verification failed:", err?.message);
    return false;
  }
}

// ===== レート制限（メモリ内、インスタンス単位）=====
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);

export function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 120_000);

/**
 * クライアントIPの取得。
 * Cloud Run/Functions のLBが付与する信頼できる値は X-Forwarded-For の「末尾から2番目」。
 * 先頭はクライアントが自由に詐称できるためレート制限のキーに使わない。
 */
export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    if (parts.length === 1) return parts[0];
  }
  return req.socket?.remoteAddress || "unknown";
}

export function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Firebase-AppCheck",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

/**
 * リクエストの共通ゲート。
 * 通過したら null、拒否する場合は {status, body} を返す。
 * @param {object} opts.requireAppCheck 画像など App Check ヘッダを送れない経路では false にする
 */
export async function guard(req, { requireAppCheck = true } = {}) {
  const origin = req.headers.origin || "";

  // 画像は <img> から読み込まれるため Origin が付かない。その場合は Referer で判定する。
  const isImageRequest = !requireAppCheck;
  if (!ALLOWED_ORIGINS.includes(origin)) {
    if (!isImageRequest) {
      return { status: 403, body: { error: "Forbidden: invalid origin" } };
    }
    const referer = req.headers.referer || "";
    const refererOk = ALLOWED_ORIGINS.some((o) => referer.startsWith(o + "/"));
    if (!refererOk) {
      return { status: 403, body: { error: "Forbidden: invalid referer" } };
    }
  }

  if (REQUIRE_APP_CHECK && requireAppCheck) {
    const ok = await verifyAppCheck(req.headers["x-firebase-appcheck"]);
    if (!ok) return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!checkRateLimit(getClientIp(req))) {
    return { status: 429, body: { error: "Rate limit exceeded. Please wait." } };
  }

  return null;
}
