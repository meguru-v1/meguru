import { getDistance } from 'geolib';
import type { Spot, TravelMode } from '../types';

// 移動方法ごとの速度 (m/min)
const SPEEDS_M_PER_MIN: Record<TravelMode, number> = {
    walk: 80,
    bicycle: 250,
    car: 600,
    transit: 600,
};

export function getSpeed(mode: TravelMode = 'walk'): number {
    return SPEEDS_M_PER_MIN[mode] ?? 80;
}

// 直線距離 × 速度でスポット列の travel_time_minutes を再計算
export function applyTravelTimes(spots: Spot[], mode: TravelMode = 'walk'): Spot[] {
    const speed = getSpeed(mode);
    return spots.map((spot, index, arr) => {
        if (index === 0) return { ...spot, travel_time_minutes: 0 };
        const prev = arr[index - 1];
        const dist = getDistance(
            { latitude: prev.lat, longitude: prev.lon },
            { latitude: spot.lat, longitude: spot.lon }
        );
        return { ...spot, travel_time_minutes: Math.max(1, Math.ceil(dist / speed)) };
    });
}
