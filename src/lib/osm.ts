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
      node["tourism"~"attraction|museum|art_gallery|zoo|aquarium|viewpoint|theme_park"](around:${radius},${lat},${lon});
      node["historic"](around:${radius},${lat},${lon});
      node["leisure"~"park|garden"](around:${radius},${lat},${lon});
      node["natural"~"peak|sand|wood|water"](around:${radius},${lat},${lon});
      node["religion"~"shinto|buddhist"](around:${radius},${lat},${lon});
      node["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|biergarten"](around:${radius},${lat},${lon});
      node["shop"~"bakery|confectionery|pastry|chocolate|coffee|tea|gift|souvenir|department_store|mall"](around:${radius},${lat},${lon});
      way["tourism"~"attraction|museum|art_gallery|zoo|aquarium|viewpoint|theme_park"](around:${radius},${lat},${lon});
      way["historic"](around:${radius},${lat},${lon});
      way["leisure"~"park|garden"](around:${radius},${lat},${lon});
      way["amenity"~"arts_centre|restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|biergarten"](around:${radius},${lat},${lon});
      way["shop"~"bakery|confectionery|pastry|chocolate|coffee|tea|gift|souvenir|department_store|mall"](around:${radius},${lat},${lon});
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

        const response = await axios.get<OverpassResponse>(OVERPASS_BASE, {
            params: { data: query }
        });

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
            else if (el.tags.historic || el.tags.religion) category = '歴史';
            else if (el.tags.leisure === 'park' || el.tags.leisure === 'garden' || el.tags.natural) category = '自然';
            else if (el.tags.tourism === 'museum' || el.tags.tourism === 'art_gallery' || el.tags.amenity === 'arts_centre') category = 'アート';
            else if (el.tags.tourism) category = '観光';

            let estimatedStayTime = 30;
            const tourism = el.tags.tourism;
            if (['museum', 'zoo', 'aquarium', 'theme_park'].includes(tourism)) estimatedStayTime = 75;
            else if (tourism === 'art_gallery' || amenity === 'arts_centre') estimatedStayTime = 50;
            else if (tourism === 'viewpoint') estimatedStayTime = 15;
            else if (el.tags.historic === 'castle') estimatedStayTime = 60;
            else if (el.tags.religion === 'buddhist') estimatedStayTime = 45;
            else if (el.tags.religion === 'shinto') estimatedStayTime = 30;
            else if (el.tags.historic) estimatedStayTime = 35;
            else if (el.tags.leisure === 'park' || el.tags.leisure === 'garden') estimatedStayTime = 35;
            else if (amenity === 'restaurant') estimatedStayTime = 50;
            else if (amenity === 'cafe' || amenity === 'ice_cream') estimatedStayTime = 25;
            else if (amenity === 'fast_food') estimatedStayTime = 15;
            else if (amenity === 'pub' || amenity === 'bar') estimatedStayTime = 45;
            else if (shop === 'department_store' || shop === 'mall') estimatedStayTime = 60;
            else if (shop) estimatedStayTime = 20;

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
