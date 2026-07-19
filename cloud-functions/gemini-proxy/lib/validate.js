// ===== リクエスト検証ユーティリティ =====
// クライアントからのボディをそのまま Google API に横流ししないための型・範囲チェック。

export class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequest";
  }
}

export function reqString(v, field, maxLen) {
  if (typeof v !== "string" || v.length === 0) {
    throw new BadRequest(`'${field}' must be a non-empty string`);
  }
  if (v.length > maxLen) {
    throw new BadRequest(`'${field}' is too long`);
  }
  return v;
}

export function optString(v, field, maxLen) {
  if (v === undefined || v === null) return undefined;
  return reqString(v, field, maxLen);
}

export function reqNumber(v, field, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new BadRequest(`'${field}' must be a number between ${min} and ${max}`);
  }
  return v;
}

export function optNumber(v, field, min, max, fallback) {
  if (v === undefined || v === null) return fallback;
  return reqNumber(v, field, min, max);
}

export function reqLatLng(v, field) {
  if (!v || typeof v !== "object") throw new BadRequest(`'${field}' is required`);
  return {
    lat: reqNumber(v.lat, `${field}.lat`, -90, 90),
    lng: reqNumber(v.lng, `${field}.lng`, -180, 180),
  };
}

export function optLatLng(v, field) {
  if (v === undefined || v === null) return undefined;
  return reqLatLng(v, field);
}

/** 文字列配列を allowlist で絞り込む（未知の値は捨てる） */
export function filterStringArray(v, field, allowed, maxItems) {
  if (!Array.isArray(v)) throw new BadRequest(`'${field}' must be an array`);
  const out = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    if (allowed && !allowed.has(item)) continue;
    if (!out.includes(item)) out.push(item);
    if (out.length >= maxItems) break;
  }
  if (out.length === 0) throw new BadRequest(`'${field}' has no valid entries`);
  return out;
}

export function reqObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequest("Invalid request body");
  }
  return body;
}
