import { useState, useEffect, useRef, useCallback } from 'react';
import { getDistance } from 'geolib';
import type { Spot } from '../types';

export type NavStatus = 'idle' | 'active' | 'arrived_all';

interface NavState {
    status: NavStatus;
    currentSpotIndex: number;
    currentPosition: { lat: number; lng: number } | null;
    distanceToNext: number | null; // meters
    headingToNext: number | null;  // degrees
}

export function useNavigation(spots: Spot[]) {
    const [nav, setNav] = useState<NavState>({
        status: 'idle',
        currentSpotIndex: 0,
        currentPosition: null,
        distanceToNext: null,
        headingToNext: null,
    });
    const watchIdRef = useRef<number | null>(null);

    const ARRIVAL_THRESHOLD_M = 60; // 60m以内で到着判定

    const stopNavigation = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setNav(prev => ({ ...prev, status: 'idle' }));
    }, []);

    const startNavigation = useCallback(() => {
        if (!navigator.geolocation) {
            alert('このブラウザはGPSに対応していません。');
            return;
        }
        setNav(prev => ({ ...prev, status: 'active', currentSpotIndex: 0 }));

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                setNav(prev => {
                    if (prev.status !== 'active') return prev;
                    const targetSpot = spots[prev.currentSpotIndex];
                    if (!targetSpot) return prev;

                    const dist = getDistance(
                        { latitude, longitude },
                        { latitude: targetSpot.lat, longitude: targetSpot.lon }
                    );

                    // 到着判定
                    if (dist <= ARRIVAL_THRESHOLD_M) {
                        const nextIndex = prev.currentSpotIndex + 1;
                        // 到着通知
                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification(`📍 到着！`, {
                                body: `「${targetSpot.name}」に到着しました！`,
                                icon: '/meguru/pwa-192x192.png',
                                tag: 'meguru-arrival',
                            });
                        }
                        if (nextIndex >= spots.length) {
                            return { ...prev, status: 'arrived_all', currentPosition: { lat: latitude, lng: longitude }, distanceToNext: 0, headingToNext: null };
                        }
                        return { ...prev, currentSpotIndex: nextIndex, currentPosition: { lat: latitude, lng: longitude }, distanceToNext: null, headingToNext: null };
                    }

                    return { ...prev, currentPosition: { lat: latitude, lng: longitude }, distanceToNext: dist, headingToNext: null };
                });
            },
            (err) => { console.warn('GPS error:', err); },
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
    }, [spots]);

    const goToSpot = useCallback((index: number) => {
        setNav(prev => ({ ...prev, currentSpotIndex: index }));
    }, []);

    // アンマウント時にwatchを止める
    useEffect(() => () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current!); }, []);

    return { nav, startNavigation, stopNavigation, goToSpot };
}
