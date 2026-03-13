import { PlaceDetails, AutocompleteResult } from '../types';

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
                'X-Goog-FieldMask': 'places.location,places.displayName,places.id',
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

    // 1. カテゴリの拡充 (Table A に準拠)
    const primaryTypes = [
        'tourist_attraction', 'museum', 'park',
        'amusement_park', 'aquarium', 'zoo', 'art_gallery',
        'historical_landmark', 'observation_deck', 'shrine', 'temple'
    ];
    const diningTypes = ['cafe', 'restaurant'];
    const allSearchTypes = [...primaryTypes, ...diningTypes];

    const initialRadius = Math.max(radiusMeters, 500);
    const maxRadius = 5000; // 最大 5km まで拡大
    
    // スポット取得用内部関数
    const fetchData = async (currentRadius: number, types: string[]) => {
        const data = {
            maxResultCount: 20, // API制限により1リクエスト最大20件
            locationRestriction: {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: currentRadius,
                }
            },
            includedTypes: types,
            languageCode: 'ja'
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.types,places.formattedAddress,places.photos,places.editorialSummary,places.regularOpeningHours,places.reviews,places.priceLevel,places.businessStatus',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Places API Error (${response.status}):`, errorText);
            return [];
        }
        const result = await response.json();
        return result.places || [];
    };

    try {
        let allFoundSpots: any[] = [];
        const foundIds = new Set<string>();

        const addSpots = (spots: any[]) => {
            spots.forEach(p => {
                if (!foundIds.has(p.id)) {
                    foundIds.add(p.id);
                    allFoundSpots.push(p);
                }
            });
        };

        // 段階的検索
        let currentRadius = initialRadius;
        console.log(`Places API: Multi-stage search start (Initial Radius: ${currentRadius}m)`);

        // 第一段階: 観光・施設
        addSpots(await fetchData(currentRadius, primaryTypes));
        // 第二段階: 飲食
        addSpots(await fetchData(currentRadius, diningTypes));

        // スポットが少ない場合(15件未満)、半径を拡大して再試行
        if (allFoundSpots.length < 15 && currentRadius < maxRadius) {
            currentRadius = Math.min(initialRadius * 2, maxRadius);
            console.log(`Places API: Expanding radius to ${currentRadius}m for more spots...`);
            addSpots(await fetchData(currentRadius, primaryTypes));
            addSpots(await fetchData(currentRadius, diningTypes));
        }

        // それでも極端に少ない場合(5件未満)、さらに拡大
        if (allFoundSpots.length < 5 && currentRadius < maxRadius) {
            currentRadius = maxRadius;
            console.log(`Places API: Final expansion to ${currentRadius}m...`);
            addSpots(await fetchData(currentRadius, allSearchTypes));
        }

        if (allFoundSpots.length === 0) return [];

        console.log(`Places API: Found ${allFoundSpots.length} unique spots total.`);

        return allFoundSpots.slice(0, 50).map((p: any) => ({
            place_id: p.id,
            name: p.displayName.text,
            lat: p.location.latitude,
            lng: p.location.longitude,
            rating: p.rating,
            user_ratings_total: p.userRatingCount,
            types: p.types,
            formatted_address: p.formattedAddress,
            photo_reference: p.photos && p.photos.length > 0 ? p.photos[0].name : undefined,
            editorial_summary: p.editorialSummary?.text,
            opening_hours: p.regularOpeningHours?.weekdayDescriptions,
            reviews: p.reviews?.map((r: any) => ({ text: r.text?.text || r.text || "", rating: r.rating })),
            price_level: p.priceLevel,
            business_status: p.businessStatus
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

/**
 * 入力テキストから場所の候補を取得する (Autocomplete)
 */
export async function getAutocompleteSuggestions(input: string, lat?: number, lng?: number): Promise<AutocompleteResult[]> {
    if (!input.trim()) return [];
    const url = `https://places.googleapis.com/v1/places:autocomplete`;
    
    const data: any = {
        input,
        languageCode: 'ja',
        regionCode: 'JP'
    };

    if (lat !== undefined && lng !== undefined) {
        data.locationBias = {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius: 10000 // 10km bias
            }
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) return [];
        const result = await response.json();
        
        return (result.suggestions || []).map((s: any) => ({
            placeId: s.placePrediction.placeId,
            description: s.placePrediction.text.text,
            mainText: s.placePrediction.structuredFormat.mainText.text,
            secondaryText: s.placePrediction.structuredFormat.secondaryText?.text
        }));
    } catch (e) {
        console.error("Autocomplete failed", e);
        return [];
    }
}

/**
 * Place ID から緯度経度を取得する (GetDetails)
 */
export async function getPlaceLatLng(placeId: string): Promise<{ lat: number; lng: number; name: string } | null> {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': API_KEY,
                'X-Goog-FieldMask': 'location,displayName',
            }
        });

        if (!response.ok) return null;
        const place = await response.json();
        
        return {
            lat: place.location.latitude,
            lng: place.location.longitude,
            name: place.displayName.text
        };
    } catch (e) {
        console.error("GetPlaceLatLng failed", e);
        return null;
    }
}
