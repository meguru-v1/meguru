import type { Spot, TravelMode } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const TRAVEL_MODE_MAP: Record<TravelMode, string> = {
    walk: 'WALK',
    bicycle: 'BICYCLE',
    car: 'DRIVE',
    transit: 'TRANSIT',
};

import type { RouteLegResult, RouteComputeResult } from '../types';
export type { RouteLegResult, RouteComputeResult };

/**
 * Routes API (v2) でスポット列の実移動時間・距離を計算する。
 * CORS対応のため、ブラウザから直接呼べる。
 * 料金: Compute Routes Basic = $5/1000リクエスト
 */
export async function computeRoute(
    spots: Spot[],
    travelMode: TravelMode = 'walk'
): Promise<RouteComputeResult | null> {
    if (!API_KEY) return null;
    if (spots.length < 2) return null;

    const origin = spots[0];
    const destination = spots[spots.length - 1];
    const intermediates = spots.slice(1, -1);

    const body: any = {
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
        travelMode: TRAVEL_MODE_MAP[travelMode] || 'WALK',
    };

    if (intermediates.length > 0) {
        body.intermediates = intermediates.map(s => ({
            location: { latLng: { latitude: s.lat, longitude: s.lon } },
        }));
    }

    // TRANSIT/WALK の場合は routingPreference 不可
    if (travelMode === 'car') {
        body.routingPreference = 'TRAFFIC_AWARE';
    }

    try {
        const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.warn(`[directions] Routes API failed (${response.status}):`, errText);
            return null;
        }

        const data = await response.json();
        const route = data.routes?.[0];
        if (!route || !route.legs) return null;

        const legs: RouteLegResult[] = route.legs.map((leg: any) => {
            // duration は "123s" 形式
            const durSec = parseInt((leg.duration || '0s').replace('s', ''), 10);
            return {
                durationMin: Math.max(1, Math.ceil(durSec / 60)),
                distanceM: leg.distanceMeters || 0,
            };
        });

        const totalDurSec = parseInt((route.duration || '0s').replace('s', ''), 10);
        return {
            legs,
            totalDurationMin: Math.max(1, Math.ceil(totalDurSec / 60)),
            totalDistanceM: route.distanceMeters || 0,
        };
    } catch (e) {
        console.warn('[directions] Compute route exception:', e);
        return null;
    }
}
