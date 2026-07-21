// ===== Routes API (v2) プロキシ =====
import { reqObjectBody, reqLatLng, reqString, BadRequest } from "../lib/validate.js";

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

const ALLOWED_TRAVEL_MODES = new Set(["WALK", "BICYCLE", "DRIVE", "TRANSIT"]);
const MAX_INTERMEDIATES = 23; // Routes API の上限

/** POST /routes */
export async function computeRoutes(req, res) {
  const body = reqObjectBody(req.body);
  const origin = reqLatLng(body.origin, "origin");
  const destination = reqLatLng(body.destination, "destination");
  const travelMode = reqString(body.travelMode, "travelMode", 20);
  if (!ALLOWED_TRAVEL_MODES.has(travelMode)) {
    throw new BadRequest("Invalid travelMode");
  }

  const rawIntermediates = Array.isArray(body.intermediates) ? body.intermediates : [];
  if (rawIntermediates.length > MAX_INTERMEDIATES) {
    throw new BadRequest("Too many intermediates");
  }
  const intermediates = rawIntermediates.map((p, i) => reqLatLng(p, `intermediates[${i}]`));

  const payload = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode,
  };
  if (intermediates.length > 0) {
    payload.intermediates = intermediates.map((p) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    }));
  }
  // TRAFFIC_AWARE は DRIVE のみ有効
  if (travelMode === "DRIVE") {
    payload.routingPreference = "TRAFFIC_AWARE";
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": MAPS_KEY,
      // polyline も返す（クライアントで Directions API を別途叩かないため）
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.warn(`Routes API failed (${response.status})`);
    res.status(200).json({ routes: [] });
    return;
  }
  const data = await response.json();
  res.status(200).json({ routes: data.routes || [] });
}
