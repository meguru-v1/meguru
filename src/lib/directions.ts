import type { Spot, TravelMode } from '../types';
import { apiPost } from './apiClient';

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
    if (spots.length < 2) return null;

    const origin = spots[0];
    const destination = spots[spots.length - 1];
    const intermediates = spots.slice(1, -1);

    try {
        // 経路計算はプロキシ経由（APIキーはサーバー側）
        const data = await apiPost<{ routes?: any[] }>('/routes', {
            origin: { lat: origin.lat, lng: origin.lon },
            destination: { lat: destination.lat, lng: destination.lon },
            intermediates: intermediates.map(s => ({ lat: s.lat, lng: s.lon })),
            travelMode: TRAVEL_MODE_MAP[travelMode] || 'WALK',
        });
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
            encodedPolyline: route.polyline?.encodedPolyline,
        };
    } catch (e) {
        console.warn('[directions] Compute route exception:', e);
        return null;
    }
}
