import axios from 'axios';
import type { Spot, GeoResult } from '../types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';

/**
 * Search for a station or place using Nominatim.
 */
export const searchLocation = async (query: string): Promise<GeoResult[]> => {
    try {
        const response = await axios.get<GeoResult[]>(NOMINATIM_BASE, {
            params: {
                q: query,
                format: 'json',
                addressdetails: 1,
                limit: 5,
                countrycodes: 'jp'
            }
        });
        return response.data;
    } catch (error) {
        console.error("Nominatim Search Error:", error);
        throw new Error("場所の検索に失敗しました。");
    }
};

/**
 * Fetch detailed spots around a location using Overpass API.
 */
export const fetchNearbySpots = async (lat: number, lon: number, radius: number): Promise<Spot[]> => {
    const query = `
    [out:json][timeout:90][maxsize:20000000];
    (
      node["tourism"~"attraction|museum|art_gallery|zoo|aquarium|viewpoint|theme_park|gallery|camp_site|picnic_site"](around:${radius},${lat},${lon});
      node["historic"](around:${radius},${lat},${lon});
      node["leisure"~"park|garden|stadium|water_park|amusement_arcade|bowling_alley"](around:${radius},${lat},${lon});
      node["natural"~"peak|sand|wood|water|beach"](around:${radius},${lat},${lon});
      node["religion"~"shinto|buddhist"](around:${radius},${lat},${lon});
      node["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|biergarten|public_bath|place_of_worship|library|marketplace"](around:${radius},${lat},${lon});
      node["shop"~"bakery|confectionery|pastry|chocolate|coffee|tea|gift|souvenir|department_store|mall|books|boutique|clothes|crafts|antiques|supermarket|anime|manga|anime_cafe|kiosk"](around:${radius},${lat},${lon});
      
      way["tourism"~"attraction|museum|art_gallery|zoo|aquarium|viewpoint|theme_park|gallery|camp_site|picnic_site"](around:${radius},${lat},${lon});
      way["historic"](around:${radius},${lat},${lon});
      way["leisure"~"park|garden|stadium|water_park|amusement_arcade|bowling_alley"](around:${radius},${lat},${lon});
      way["amenity"~"arts_centre|restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|biergarten|public_bath|place_of_worship|library|marketplace"](around:${radius},${lat},${lon});
      way["shop"~"bakery|confectionery|pastry|chocolate|coffee|tea|gift|souvenir|department_store|mall|books|boutique|clothes|crafts|antiques|supermarket|anime|manga|anime_cafe"](around:${radius},${lat},${lon});
      way["religion"~"shinto|buddhist"](around:${radius},${lat},${lon});
    );
    out center;
  `;

    try {
        interface OverpassElement {
            id: number;
            type: string;
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
            tags: Record<string, string>;
        }
        interface OverpassResponse {
            elements: OverpassElement[];
        }

        // 複数のOverpassサーバーを利用して負荷分散とフォールバック
        const endpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter',
            'https://z.overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter'
        ];

        let response = null;
        let lastError = null;

        // ランダムなエンドポイントから開始して順番に試す
        const startIndex = Math.floor(Math.random() * endpoints.length);
        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[(startIndex + i) % endpoints.length];
            try {
                response = await axios.post<OverpassResponse>(endpoint, `data=${encodeURIComponent(query)}`, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 25000 // 25秒タイムアウト
                });
                break; // 成功したらループを抜ける
            } catch (err: any) {
                console.warn(`Overpass API timeout/error at ${endpoint}:`, err.message);
                lastError = err;
                // 429 Too Many Requests の場合は少し待ってから次のサーバーへ
                if (err.response && err.response.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        }

        if (!response || !response.data || !response.data.elements) {
            throw lastError || new Error("All Overpass endpoints failed");
        }

        const elements = response.data.elements.filter(el =>
            el.tags &&
            (el.tags.name || el.tags['name:ja']) &&
            (el.lat || (el.center && el.center.lat))
        );

        return elements.map(el => {
            let category = 'その他';
            const amenity = el.tags.amenity;
            const shop = el.tags.shop;

            if (['restaurant', 'cafe', 'fast_food', 'food_court', 'pub', 'bar', 'ice_cream', 'biergarten'].includes(amenity)) category = 'グルメ';
            else if (['bakery', 'confectionery', 'pastry', 'chocolate', 'coffee', 'tea'].includes(shop)) category = 'グルメ';
            else if (['books', 'anime', 'manga', 'anime_cafe'].includes(shop)) category = 'カルチャー';
            else if (['boutique', 'clothes', 'crafts', 'antiques', 'supermarket', 'department_store', 'mall', 'kiosk'].includes(shop)) category = 'ショッピング';
            else if (amenity === 'marketplace') category = 'ショッピング';
            else if (['public_bath'].includes(amenity)) category = '温泉・サウナ';
            else if (['stadium', 'water_park', 'amusement_arcade', 'bowling_alley'].includes(el.tags.leisure)) category = 'エンタメ';
            else if (el.tags.historic || el.tags.religion || amenity === 'place_of_worship') category = '歴史';
            else if (['park', 'garden'].includes(el.tags.leisure) || el.tags.natural || ['camp_site', 'picnic_site'].includes(el.tags.tourism)) category = '自然';
            else if (['museum', 'art_gallery', 'gallery'].includes(el.tags.tourism) || amenity === 'arts_centre' || amenity === 'library') category = 'アート';
            else if (el.tags.tourism) category = '観光';

            let estimatedStayTime = 30;
            const tourism = el.tags.tourism;
            if (['museum', 'zoo', 'aquarium', 'theme_park'].includes(tourism) || el.tags.leisure === 'water_park') estimatedStayTime = 90;
            else if (amenity === 'public_bath') estimatedStayTime = 90;
            else if (['art_gallery', 'gallery'].includes(tourism) || amenity === 'arts_centre') estimatedStayTime = 50;
            else if (tourism === 'viewpoint') estimatedStayTime = 15;
            else if (el.tags.historic === 'castle') estimatedStayTime = 60;
            else if (el.tags.religion === 'buddhist' || amenity === 'place_of_worship') estimatedStayTime = 45;
            else if (el.tags.religion === 'shinto') estimatedStayTime = 30;
            else if (el.tags.historic) estimatedStayTime = 35;
            else if (['park', 'garden', 'camp_site', 'picnic_site'].includes(el.tags.leisure || tourism)) estimatedStayTime = 40;
            else if (amenity === 'library') estimatedStayTime = 45;
            else if (category === 'エンタメ') estimatedStayTime = 60;
            else if (amenity === 'restaurant') estimatedStayTime = 50;
            else if (amenity === 'cafe' || amenity === 'ice_cream') estimatedStayTime = 30;
            else if (amenity === 'fast_food') estimatedStayTime = 15;
            else if (amenity === 'pub' || amenity === 'bar') estimatedStayTime = 60;
            else if (['department_store', 'mall', 'marketplace'].includes(shop || amenity)) estimatedStayTime = 60;
            else if (category === 'カルチャー') estimatedStayTime = 45;
            else if (shop) estimatedStayTime = 25;

            return {
                id: el.id,
                type: el.type,
                lat: el.lat ?? el.center!.lat,
                lon: el.lon ?? el.center!.lon,
                name: el.tags['name:ja'] || el.tags.name,
                category,
                estimatedStayTime,
                tags: el.tags
            } satisfies Spot;
        });
    } catch (error) {
        console.error("Overpass API Error:", error);
        throw new Error("周辺情報の取得に失敗しました。");
    }
};
