/**
 * Meguru API プロキシ
 *
 * Gemini / Places / Routes / Geocoding / 画像 の全呼び出しをサーバー側で中継し、
 * APIキーをクライアントバンドルから完全に排除する。
 *
 * 必要な環境変数:
 *   GEMINI_API_KEY       … Gemini API キー
 *   GOOGLE_MAPS_API_KEY  … Places/Routes/Geocoding/StreetView 用のサーバーキー
 *                          （HTTPリファラ制限は付けず、IP制限＋API制限で保護する）
 *   REQUIRE_APP_CHECK    … "true" で App Check 必須（本番推奨）
 *   ALLOW_LOCALHOST      … "true" で localhost オリジンを許可（開発時のみ）
 */
import functions from "@google-cloud/functions-framework";
import { guard, getCorsHeaders } from "./lib/security.js";
import { BadRequest } from "./lib/validate.js";
import * as gemini from "./handlers/gemini.js";
import * as places from "./handlers/places.js";
import * as routes from "./handlers/routes.js";

// ルート定義: [method, path, handler, {appCheck}]
// appCheck: false … <img> から呼ばれるため App Check ヘッダを送れない経路（Referer で判定）
const ROUTES = [
  ["POST", "/", gemini.generate, {}],                   // 後方互換（既存クライアント）
  ["POST", "/gemini", gemini.generate, {}],
  ["POST", "/places/searchText", places.searchText, {}],
  ["POST", "/places/searchNearby", places.searchNearby, {}],
  ["POST", "/places/autocomplete", places.autocomplete, {}],
  ["GET", "/places/details", places.placeDetails, {}],
  ["GET", "/geocode", places.geocode, {}],
  ["POST", "/routes", routes.computeRoutes, {}],
  ["GET", "/photo", places.photo, { appCheck: false }],
  ["GET", "/streetview", places.streetView, { appCheck: false }],
];

function matchRoute(method, path) {
  // 関数名がURLに含まれる場合（/gemini-proxy/places/... 等）を吸収する
  const normalized = path.replace(/^\/gemini-proxy/, "") || "/";
  const trimmed = normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
  return ROUTES.find(([m, p]) => m === method && p === trimmed);
}

functions.http("geminiProxy", async (req, res) => {
  const origin = req.headers.origin || "";
  Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => res.set(key, value));

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const route = matchRoute(req.method, req.path || "/");
  if (!route) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [, , handler, opts] = route;

  const rejection = await guard(req, { requireAppCheck: opts.appCheck !== false });
  if (rejection) {
    res.status(rejection.status).json(rejection.body);
    return;
  }

  try {
    await handler(req, res);
  } catch (err) {
    if (err instanceof BadRequest) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(`Handler error on ${req.method} ${req.path}:`, err);
    // 内部エラーの詳細はクライアントに返さない
    res.status(500).json({ error: "Internal error" });
  }
});
