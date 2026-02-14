import axios from 'axios';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';

/**
 * Search for a station or place using Nominatim.
 * @param {string} query - The search query (e.g. "Kyoto Station").
 * @returns {Promise<Array>} - List of results with lat/lon.
 */
export const searchLocation = async (query) => {
    try {
        const response = await axios.get(NOMINATIM_BASE, {
            params: {
                q: query,
                format: 'json',
                addressdetails: 1,
                limit: 5,
                countrycodes: 'jp' // Focused on Japan for this usecase
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
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radius - Radius in meters
 * @returns {Promise<Array>} - List of POIs.
 */
export const fetchNearbySpots = async (lat, lon, radius) => {
    // Increased timeout to 90s for larger areas
    // added leisure (parks), natural (nature), and specific tourism tags
    const query = `
    [out:json][timeout:90][maxsize:20000000];
    (
      node["tourism"~"attraction|museum|art_gallery|zoo|aquarium|viewpoint|theme_park"](around:${radius},${lat},${lon});
      node["historic"](around:${radius},${lat},${lon});
      node["leisure"~"park|garden"](around:${radius},${lat},${lon});
      node["natural"~"peak|sand|wood|water"](around:${radius},${lat},${lon});
      node["religion"~"shinto|buddhist"](around:${radius},${lat},${lon});
      
      // Expanded Gourmet Tags
      node["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|biergarten"](around:${radius},${lat},${lon});
      // Expanded Shopping Tags (Food/Souvenirs)
      node["shop"~"bakery|confectionery|pastry|chocolate|coffee|tea|gift|souvenir|department_store|mall"](around:${radius},${lat},${lon});
      
      way["tourism"~"attraction|museum|art_gallery|zoo|aquarium|viewpoint|theme_park"](around:${radius},${lat},${lon});
      way["historic"](around:${radius},${lat},${lon});
      way["leisure"~"park|garden"](around:${radius},${lat},${lon});
      way["amenity"~"arts_centre|restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|biergarten"](around:${radius},${lat},${lon}); // Added gourmet ways too
      way["shop"~"bakery|confectionery|pastry|chocolate|coffee|tea|gift|souvenir|department_store|mall"](around:${radius},${lat},${lon});
      way["religion"~"shinto|buddhist"](around:${radius},${lat},${lon});
    );
    out center;
  `;

    try {
        const response = await axios.get(OVERPASS_BASE, {
            params: { data: query }
        });

        // Process results to a simpler format
        // Filter to ensure we have name and coordinates
        const elements = response.data.elements.filter(el =>
            el.tags &&
            (el.tags.name || el.tags['name:ja']) &&
            (el.lat || (el.center && el.center.lat))
        );

        return elements.map(el => {
            let category = 'other';
            const amenity = el.tags.amenity;
            const shop = el.tags.shop;

            if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food' || amenity === 'food_court' || amenity === 'pub' || amenity === 'bar' || amenity === 'ice_cream' || amenity === 'biergarten') category = 'gourmet';
            else if (shop === 'bakery' || shop === 'confectionery' || shop === 'pastry' || shop === 'chocolate' || shop === 'coffee' || shop === 'tea') category = 'gourmet';
            else if (el.tags.historic || el.tags.religion) category = 'history';
            else if (el.tags.leisure === 'park' || el.tags.leisure === 'garden' || el.tags.natural) category = 'nature';
            else if (el.tags.tourism === 'museum' || el.tags.tourism === 'art_gallery' || el.tags.amenity === 'arts_centre') category = 'art';
            else if (el.tags.tourism) category = 'tourism';

            return {
                id: el.id,
                type: el.type,
                lat: el.lat || el.center.lat,
                lon: el.lon || el.center.lon,
                name: el.tags['name:ja'] || el.tags.name,
                category,
                tags: el.tags
            };
        });
    } catch (error) {
        console.error("Overpass API Error:", error);
        throw new Error("周辺情報の取得に失敗しました。");
    }
};
