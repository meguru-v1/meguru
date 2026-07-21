import { useState, useEffect, useRef, useCallback } from 'react';
import { computeRoute } from '../lib/directions';
import type { Spot, TravelMode, RouteComputeResult } from '../types';

/** 同じ経路を何度も課金しないための簡易キャッシュ（セッション限り） */
const routeCache = new Map<string, RouteComputeResult>();
const CACHE_LIMIT = 50;

const routeKey = (spots: Spot[], travelMode: TravelMode) =>
    `${travelMode}|${spots.map(s => `${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).join(';')}`;

/**
 * コースの経路（所要時間・距離・地図に描く線）を Routes API から取得する。
 * アプリ内の経路情報はここが唯一の情報源で、ブラウザから Directions API は叩かない。
 */
export function useRoutePath(spots: Spot[], travelMode: TravelMode = 'walk') {
    const [route, setRoute] = useState<RouteComputeResult | null>(null);
    const [loading, setLoading] = useState(false);

    // key が同じなら座標も移動手段も同じなので、配列の同一性は依存に含めない
    const key = spots.length >= 2 ? routeKey(spots, travelMode) : null;
    const spotsRef = useRef(spots);
    const modeRef = useRef(travelMode);
    spotsRef.current = spots;
    modeRef.current = travelMode;

    // 取得中にコースが切り替わったときに古い応答を捨てるための目印
    const activeKeyRef = useRef<string | null>(null);

    const fetchRoute = useCallback(async (force: boolean): Promise<RouteComputeResult | null> => {
        if (!key) {
            setRoute(null);
            return null;
        }
        if (!force) {
            const cached = routeCache.get(key);
            if (cached) {
                setRoute(cached);
                return cached;
            }
        }
        activeKeyRef.current = key;
        setLoading(true);
        try {
            const result = await computeRoute(spotsRef.current, modeRef.current);
            if (activeKeyRef.current !== key) return null; // 別コースに切り替わっていた
            if (result) {
                if (routeCache.size >= CACHE_LIMIT) {
                    const oldest = routeCache.keys().next().value;
                    if (oldest !== undefined) routeCache.delete(oldest);
                }
                routeCache.set(key, result);
                setRoute(result);
            }
            return result;
        } finally {
            if (activeKeyRef.current === key) setLoading(false);
        }
    }, [key]);

    useEffect(() => { void fetchRoute(false); }, [fetchRoute]);

    const refresh = useCallback(() => fetchRoute(true), [fetchRoute]);

    return { route, loading, refresh };
}
