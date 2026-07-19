// ===== Places API (New) プロキシ =====
// APIキーはサーバー側のみ。FieldMask もサーバーが固定し、クライアントからは指定させない
// （課金対象フィールドをクライアントに選ばせない＝コスト面の攻撃を防ぐ）。
import {
  BadRequest,
  reqString,
  optString,
  reqNumber,
  optNumber,
  reqLatLng,
  optLatLng,
  filterStringArray,
  reqObjectBody,
} from "../lib/validate.js";

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

// スポット取得用の固定 FieldMask
const SPOT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.formattedAddress",
  "places.photos",
  "places.editorialSummary",
  "places.priceLevel",
  "places.businessStatus",
  "places.regularOpeningHours",
].join(",");

const CENTER_FIELD_MASK = "places.location,places.displayName,places.id";

// searchNearby に渡してよい type の allowlist
const ALLOWED_TYPES = new Set([
  "tourist_attraction", "observation_deck", "museum", "art_gallery",
  "park", "zoo", "aquarium", "amusement_park", "historical_landmark",
  "cafe", "restaurant", "point_of_interest", "establishment",
  "store", "lodging", "shrine", "bakery", "bar", "meal_takeaway",
  "meal_delivery", "shopping_mall", "clothing_store", "convenience_store",
  "supermarket", "book_store", "hotel", "guest_house", "amusement_center",
  "bowling_alley", "movie_theater", "spa", "transit_station",
  "train_station", "bus_station", "library", "local_government_office",
  "city_hall", "post_office", "hindu_temple", "place_of_worship",
]);

async function callPlaces(path, body, fieldMask) {
  const response = await fetch(`https://places.googleapis.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": MAPS_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(`Places API ${path} failed (${response.status}):`, detail);
    return null;
  }
  return response.json();
}

/** POST /places/searchText */
export async function searchText(req, res) {
  const body = reqObjectBody(req.body);
  const textQuery = reqString(body.textQuery, "textQuery", 300);
  const bias = optLatLng(body.bias, "bias");
  const detailed = body.detailed === true;

  const payload = { textQuery, languageCode: "ja", regionCode: "JP" };
  if (bias) {
    payload.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: optNumber(body.radius, "radius", 1, 50000, 50000),
      },
    };
  }

  const data = await callPlaces(
    "places:searchText",
    payload,
    detailed ? SPOT_FIELD_MASK : CENTER_FIELD_MASK
  );
  res.status(200).json({ places: data?.places || [] });
}

/** POST /places/searchNearby */
export async function searchNearby(req, res) {
  const body = reqObjectBody(req.body);
  const center = reqLatLng(body.center, "center");
  const radius = reqNumber(body.radius, "radius", 1, 50000);
  const includedTypes = filterStringArray(body.includedTypes, "includedTypes", ALLOWED_TYPES, 50);

  const data = await callPlaces(
    "places:searchNearby",
    {
      maxResultCount: optNumber(body.maxResultCount, "maxResultCount", 1, 20, 20),
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius },
      },
      includedTypes,
      languageCode: "ja",
    },
    SPOT_FIELD_MASK
  );
  res.status(200).json({ places: data?.places || [] });
}

/** POST /places/autocomplete */
export async function autocomplete(req, res) {
  const body = reqObjectBody(req.body);
  const input = reqString(body.input, "input", 200);
  const bias = optLatLng(body.bias, "bias");

  const payload = { input, languageCode: "ja", regionCode: "JP" };
  if (bias) {
    payload.locationBias = {
      circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 10000 },
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": MAPS_KEY },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.warn(`Places autocomplete failed (${response.status})`);
    res.status(200).json({ suggestions: [] });
    return;
  }
  const data = await response.json();
  res.status(200).json({ suggestions: data.suggestions || [] });
}

/** GET /places/details?placeId=... */
export async function placeDetails(req, res) {
  const placeId = reqString(req.query.placeId, "placeId", 300);
  // placeId は Google が発行する識別子。パス結合前に形式を検証する
  if (!/^[A-Za-z0-9_-]+$/.test(placeId)) {
    throw new BadRequest("Invalid placeId");
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": MAPS_KEY,
      "X-Goog-FieldMask": "location,displayName",
    },
  });
  if (!response.ok) {
    res.status(200).json({ place: null });
    return;
  }
  res.status(200).json({ place: await response.json() });
}

/** GET /photo?ref=places/xxx/photos/yyy&maxWidthPx=1200 → 画像へリダイレクト */
export async function photo(req, res) {
  const ref = reqString(req.query.ref, "ref", 512);
  // パストラバーサル・クエリ混入を拒否
  if (!/^[A-Za-z0-9_\-/]+$/.test(ref) || ref.includes("..") || ref.startsWith("/")) {
    throw new BadRequest("Invalid photo reference");
  }
  const maxWidthPx = Math.min(Math.max(parseInt(req.query.maxWidthPx, 10) || 400, 50), 1600);

  const url = `https://places.googleapis.com/v1/${ref}/media`
    + `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(MAPS_KEY)}`;

  const response = await fetch(url);
  if (!response.ok) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  const data = await response.json();
  if (!data.photoUri) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  // 画像URLはキーを含まない一時URL。ブラウザには 302 で返す
  res.set("Cache-Control", "public, max-age=3600");
  res.redirect(302, data.photoUri);
}

/** GET /streetview?lat=&lng= → ストリートビュー画像を中継 */
export async function streetView(req, res) {
  const lat = reqNumber(Number(req.query.lat), "lat", -90, 90);
  const lng = reqNumber(Number(req.query.lng), "lng", -180, 180);
  const size = /^\d{2,4}x\d{2,4}$/.test(req.query.size || "") ? req.query.size : "1200x800";

  const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}`
    + `&location=${lat},${lng}&fov=90&heading=235&pitch=10&key=${encodeURIComponent(MAPS_KEY)}`;

  const response = await fetch(url);
  if (!response.ok) {
    res.status(404).json({ error: "Street view not available" });
    return;
  }
  // ストリートビューはリダイレクトを返さないためバイト列を中継する
  const buffer = Buffer.from(await response.arrayBuffer());
  res.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400");
  res.status(200).send(buffer);
}

/** GET /geocode?address=... または ?lat=&lng= */
export async function geocode(req, res) {
  const address = optString(req.query.address, "address", 300);
  const params = new URLSearchParams({ language: "ja", key: MAPS_KEY });

  if (address) {
    params.set("address", address);
    params.set("region", "jp");
  } else {
    const lat = reqNumber(Number(req.query.lat), "lat", -90, 90);
    const lng = reqNumber(Number(req.query.lng), "lng", -180, 180);
    params.set("latlng", `${lat},${lng}`);
    params.set("result_type", "sublocality|locality");
  }

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!response.ok) {
    res.status(200).json({ results: [] });
    return;
  }
  const data = await response.json();
  res.status(200).json({ status: data.status, results: data.results || [] });
}
