import { resolveLocation } from './places';

// ブラウザ位置情報をバイアスとして利用する geocode
export async function geocodeWithBias(
    q: string,
    placeId?: string
): Promise<{ lat: number; lon: number; name: string } | null> {
    let bias: { lat: number; lng: number } | undefined;
    try {
        await new Promise<void>((resolve) => {
            if (!navigator.geolocation) return resolve();
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    bias = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    resolve();
                },
                () => resolve(),
                { enableHighAccuracy: false, timeout: 1500, maximumAge: 300000 }
            );
        });
    } catch { /* ignore */ }
    const res = await resolveLocation(q, placeId, bias);
    return res ? { lat: res.lat, lon: res.lng, name: res.name } : null;
}
