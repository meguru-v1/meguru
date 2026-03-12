import { PlaceDetails } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * テキスト検索でエリアの中心となる場所を探す
 */
export async function searchAreaCenter(query: string): Promise<{ lat: number; lng: number; name: string } | null> {
    const url = `https://places.googleapis.com/v1/places:searchText`;
    const data = {
        textQuery: query,
        languageCode: 'ja'
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': 'places.location,places.displayName',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            console.error(`Places API Error: ${response.status} ${response.statusText}`);
            return null;
        }

        const result = await response.json();
        if (result.places && result.places.length > 0) {
            const place = result.places[0];
            return {
                lat: place.location.latitude,
                lng: place.location.longitude,
                name: place.displayName.text,
            };
        }
        return null;
    } catch (e) {
        console.error("Failed to search area center", e);
        return null;
    }
}

/**
 * 中心座標から指定半径内のプレイスを検索する
 */
export async function searchNearbySpots(lat: number, lng: number, radiusMeters: number): Promise<PlaceDetails[]> {
    const url = `https://places.googleapis.com/v1/places:searchNearby`;

    // 検索に含めるPlace types (観光地、飲食店など)
    // 種類を絞りすぎると見つからないことがあるので、主要なものに留める
    // 注: 'temple', 'shrine' は Places API (New) の includedTypes としてサポートされていないため外しています
    const includedTypes = [
        'tourist_attraction', 'museum', 'park',
        'historical_landmark', 'art_gallery', 'observation_deck',
        'amusement_park', 'aquarium', 'zoo',
        'cafe', 'restaurant'
    ];

    // 半径が小さすぎるとゼロ件になりやすいので最低値を保証(500m以上)
    const safeRadiusMeters = Math.max(radiusMeters, 500);

    const data = {
        includedTypes: includedTypes,
        maxResultCount: 50, // 候補を大幅に増やして多様性を確保
        locationRestriction: {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius: safeRadiusMeters,
            }
        },
        languageCode: 'ja'
    };

    console.log(`Places API: searchNearby request (Lat: ${lat}, Lng: ${lng}, Radius: ${safeRadiusMeters}m)`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.types,places.formattedAddress,places.photos',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            console.error(`Places API Error: ${response.status} ${response.statusText}`);
            return [];
        }

        const result = await response.json();
        if (!result.places || result.places.length === 0) {
            console.warn(`Places API: No spots found for Lat: ${lat}, Lng: ${lng}, Radius: ${safeRadiusMeters}m`);
            return [];
        }

        console.log(`Places API: Found ${result.places.length} spots`);
        return result.places.map((p: any) => ({
            place_id: p.id,
            name: p.displayName.text,
            lat: p.location.latitude,
            lng: p.location.longitude,
            rating: p.rating,
            user_ratings_total: p.userRatingCount,
            types: p.types,
            formatted_address: p.formattedAddress,
            photo_reference: p.photos && p.photos.length > 0 ? p.photos[0].name : undefined
        }));
    } catch (e) {
        console.error("Failed to search nearby spots", e);
        return [];
    }
}

/**
 * ルート検索用に複数エリアのプレイスを取得する（出発地、目的地、その中間など）
 */
export async function searchRouteSpots(originObj: { lat: number, lng: number }, destObj: { lat: number, lng: number }, radiusMeters: number): Promise<PlaceDetails[]> {
    // 簡易的に、出発地周辺、目的地周辺、および中間地点周辺の候補を取得してマージする
    const midLat = (originObj.lat + destObj.lat) / 2;
    const midLng = (originObj.lng + destObj.lng) / 2;

    const [originSpots, midSpots, destSpots] = await Promise.all([
        searchNearbySpots(originObj.lat, originObj.lng, radiusMeters),
        searchNearbySpots(midLat, midLng, radiusMeters),
        searchNearbySpots(destObj.lat, destObj.lng, radiusMeters),
    ]);

    // 重複を排除
    const map = new Map<string, PlaceDetails>();
    [...originSpots, ...midSpots, ...destSpots].forEach(spot => {
        if (!map.has(spot.place_id)) {
            map.set(spot.place_id, spot);
        }
    });

    return Array.from(map.values());
}
