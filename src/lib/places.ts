import { PlaceDetails, AutocompleteResult } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ===== セッションキャッシュ（5分有効） =====
const CACHE_TTL = 5 * 60 * 1000; // 5分
const placesCache = new Map<string, { data: any; timestamp: number }>();

const getCached = (key: string) => {
    const entry = placesCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        console.log(`[PlacesCache] HIT: ${key.substring(0, 50)}...`);
        return entry.data;
    }
    placesCache.delete(key);
    return null;
};

const setCache = (key: string, data: any) => {
    placesCache.set(key, { data, timestamp: Date.now() });
};

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
export async function searchNearbySpots(lat: number, lng: number, radiusMeters: number, options?: { maxStage?: number }): Promise<PlaceDetails[]> {
    const maxStage = options?.maxStage ?? 4; // デフォルト: Stage 4まで全て許可
    // キャッシュチェック
    const cacheKey = `nearby:${lat.toFixed(3)},${lng.toFixed(3)},${Math.round(radiusMeters)},s${maxStage}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `https://places.googleapis.com/v1/places:searchNearby`;

    // 1. カテゴリの拡充とグループ化 (APIの20件制限を回避するため分割して検索)
    // 注意: searchNearby (New) では shrine, temple などの Table B タイプはサポートされていないため除外
    const attractionTypes = ['tourist_attraction', 'observation_deck'];
    const cultureTypes = ['museum', 'art_gallery'];
    const natureTypes = ['park', 'zoo', 'aquarium', 'amusement_park'];
    const historicTypes = ['historical_landmark'];
    const diningTypes = ['cafe', 'restaurant'];
    const allSearchTypes = [...attractionTypes, ...cultureTypes, ...natureTypes, ...historicTypes, ...diningTypes];

    const initialRadius = Math.max(radiusMeters, 500);
    const maxRadius = 5000; // 最大 5km まで拡大
    
    // スポット取得用内部関数
    const fetchData = async (currentRadius: number, types: string[]) => {
        const data = {
            maxResultCount: 20, 
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
                'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.types,places.formattedAddress,places.photos,places.editorialSummary,places.priceLevel,places.businessStatus',
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

        let currentRadius = initialRadius;
        
        console.log(`Places API: Optimized single-request search start (Radius: ${currentRadius}m)`);

        // 第一段階: 観光地と飲食店を優先度の高い順に（でもリクエストは最小限に）
        // 観光地カテゴリをまとめて1リクエスト
        const primarySearchTypes = [...attractionTypes, ...cultureTypes, ...natureTypes, ...historicTypes];
        
        // 【20】 カテゴリ検索統合: 観光地+飲食店を1リクエストに統合
        const allSearchTypesUnified = [...primarySearchTypes, ...diningTypes];
        const rawAll = await fetchData(currentRadius, allSearchTypesUnified);

        let allFoundSpotsRaw = [...rawAll];

        // 2段階欲張り検索: 1回目で10件未満の場合のみ、カテゴリ緩和（Stage 2）
        if (allFoundSpotsRaw.length < 10 && currentRadius < maxRadius && maxStage >= 2) {
            currentRadius = Math.min(currentRadius * 1.4, maxRadius);
            console.log(`Places API: Stage 2 search (${currentRadius}m)...`);
            const fallbackTypes = ['point_of_interest', 'establishment', 'tourist_attraction', 'restaurant', 'cafe'];
            const expandedSpots = await fetchData(currentRadius, fallbackTypes);
            const existingIds = new Set(allFoundSpotsRaw.map(s => s.id));
            expandedSpots.forEach((s: any) => { if (!existingIds.has(s.id)) allFoundSpotsRaw.push(s); });
        }

        // 【23】 Stage 3: ルート検索経由の場合はスキップ
        if (allFoundSpotsRaw.length < 3 && currentRadius <= maxRadius && maxStage >= 3) {
            currentRadius = maxRadius;
            console.log(`Places API: Stage 3 (Emergency) broad search at full radius (${currentRadius}m)...`);
            
            // APIの仕様上、includedTypesは空にできず（403エラー）、最大50個まで指定可能。
            // そのため、何らかの「見どころ」になり得るあらゆるタイプの施設を列挙する。
            const ultimateFallbackTypes = [
                'point_of_interest', 'establishment', 'tourist_attraction', 'restaurant', 'cafe',
                'park', 'store', 'lodging', 'shrine', 'museum', 'historical_landmark',
                'bakery', 'bar', 'meal_takeaway', 'meal_delivery', 'shopping_mall',
                'clothing_store', 'convenience_store', 'supermarket', 'book_store',
                'hotel', 'guest_house', 'amusement_center', 'amusement_park', 'aquarium',
                'bowling_alley', 'movie_theater', 'spa', 'zoo', 'transit_station',
                'train_station', 'bus_station', 'library', 'local_government_office',
                'city_hall', 'post_office', 'hindu_temple', 'place_of_worship', 'art_gallery'
            ];

            const emergencySpots = await fetchData(currentRadius, ultimateFallbackTypes); 
            const existingIds = new Set(allFoundSpotsRaw.map(s => s.id));
            emergencySpots.forEach((s: any) => { if (!existingIds.has(s.id)) allFoundSpotsRaw.push(s); });
        }

        // Stage 4: テキスト検索 (ルート検索経由の場合はスキップ)
        if (allFoundSpotsRaw.length < 3 && maxStage >= 4) {
            console.log(`Places API: Stage 4 (Last Resort) Text Search...`);
            // 現在地周辺の「観光スポット」というキーワードで広域検索
            const textSearchUrl = `https://places.googleapis.com/v1/places:searchText`;
            const tsResponse = await fetch(textSearchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': API_KEY,
                    'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.types,places.formattedAddress,places.photos,places.editorialSummary,places.priceLevel,places.businessStatus',
                },
                body: JSON.stringify({
                    textQuery: "観光スポット 飲食店",
                    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: maxRadius } },
                    languageCode: 'ja'
                }),
            });
            if (tsResponse.ok) {
                const tsResult = await tsResponse.json();
                const tsPlaces = tsResult.places || [];
                const existingIds = new Set(allFoundSpotsRaw.map(s => s.id));
                tsPlaces.forEach((s: any) => { if (!existingIds.has(s.id)) allFoundSpotsRaw.push(s); });
            }
        }

        if (allFoundSpotsRaw.length === 0) {
            console.warn(`Places API: Final count 0 even after Stage 4.`);
            return [];
        }
        console.log(`Places API: Success. Stage results: ${allFoundSpotsRaw.length}`);

        const result = allFoundSpotsRaw.slice(0, 50).map((p: any) => ({
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

        // キャッシュに保存
        setCache(cacheKey, result);
        return result;
    } catch (e) {
        console.error("Failed to search nearby spots", e);
        return [];
    }
}

/**
 * 点Pからラインセグメント(A→B)への最短距離をメートルで返す
 */
function distanceToSegmentM(
    P: { lat: number; lng: number },
    A: { lat: number; lng: number },
    B: { lat: number; lng: number }
): number {
    const cosLat = Math.cos(A.lat * Math.PI / 180);
    const ax = 0, ay = 0;
    const bx = (B.lat - A.lat) * 111000;
    const by = (B.lng - A.lng) * 111000 * cosLat;
    const px = (P.lat - A.lat) * 111000;
    const py = (P.lng - A.lng) * 111000 * cosLat;
    const len2 = bx * bx + by * by;
    if (len2 === 0) return Math.sqrt(px * px + py * py);
    const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const qx = ax + t * bx;
    const qy = ay + t * by;
    return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
}

/**
 * ルート検索用に複数エリアのプレイスを取得し、ルート沿いのスポットに絞り込む
 */
export async function searchRouteSpots(originObj: { lat: number, lng: number }, destObj: { lat: number, lng: number }, radiusMeters: number): Promise<PlaceDetails[]> {
    const dx = (originObj.lat - destObj.lat) * 111000;
    const dy = (originObj.lng - destObj.lng) * 111000 * Math.cos(originObj.lat * Math.PI / 180);
    const directDist = Math.sqrt(dx * dx + dy * dy);

    // サンプル点数を距離に応じて決定
    const numPoints = directDist < 2000 ? 3 : directDist < 5000 ? 4 : 6;
    const points: { lat: number, lng: number }[] = Array.from({ length: numPoints }, (_, i) => {
        const t = i / (numPoints - 1);
        return {
            lat: originObj.lat * (1 - t) + destObj.lat * t,
            lng: originObj.lng * (1 - t) + destObj.lng * t,
        };
    });

    console.log(`Route search: ${points.length} sample points (distance: ${(directDist / 1000).toFixed(1)}km)`);

    const results = await Promise.all(
        points.map(p => searchNearbySpots(p.lat, p.lng, radiusMeters, { maxStage: 2 }))
    );

    const map = new Map<string, PlaceDetails>();
    results.flat().forEach(spot => {
        if (!map.has(spot.place_id)) map.set(spot.place_id, spot);
    });

    // コリドーフィルタ: ルート直線から外れたスポットを除去
    const corridorWidthM = Math.min(radiusMeters * 0.8, 1200);
    const filtered = Array.from(map.values()).filter(spot => {
        const dist = distanceToSegmentM(
            { lat: spot.lat, lng: spot.lng },
            { lat: originObj.lat, lng: originObj.lng },
            { lat: destObj.lat, lng: destObj.lng }
        );
        return dist <= corridorWidthM;
    });

    console.log(`Route corridor filter: ${map.size} → ${filtered.length} spots (corridor: ${corridorWidthM.toFixed(0)}m)`);
    return filtered.length >= 3 ? filtered : Array.from(map.values()); // フィルタ後が少なすぎたら全件返す
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

/**
 * 【24】 逆ジオコーディング: GPS座標からエリア名を取得
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ja&result_type=sublocality|locality&key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) return '';
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            const name = result.formatted_address
                ?.replace(/^日本[、,]\s*/, '')
                ?.replace(/〒\d{3}-\d{4}\s*/, '')
                ?.trim();
            return name || '';
        }
        return '';
    } catch (e) {
        console.error('Reverse geocode failed', e);
        return '';
    }
}
