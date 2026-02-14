/**
 * Google Maps API Helper functions.
 * Note: These require the Google Maps JavaScript API to be loaded.
 * They should be called within components or functions where 'google' global is available,
 * or passed a 'maps' instance.
 */

// We will use the 'google' global variable which is available when the API is loaded.

/**
 * Geocode a location string.
 * @param {string} address - e.g. "Kyoto Station"
 * @returns {Promise<{lat: number, lon: number, formatted_address: string}>}
 */
export const geocodeLocation = async (address) => {
    return new Promise((resolve, reject) => {
        if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
            reject(new Error("Google Maps API not loaded"));
            return;
        }

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const location = results[0].geometry.location;
                resolve({
                    lat: location.lat(),
                    lon: location.lng(),
                    formatted_address: results[0].formatted_address,
                    place_id: results[0].place_id
                });
            } else {
                reject(new Error(`Geocoding failed: ${status}`));
            }
        });
    });
};

/**
 * Search for nearby places using Places Service.
 * @param {google.maps.Map | HTMLDivElement} mapInstanceOrNode - Map instance OR a hidden DIV for the service
 * @param {Object} center - { lat, lon }
 * @param {number} radius - meters
 * @returns {Promise<Array>}
 */
export const searchNearbyPlaces = async (mapInstanceOrNode, center, radius) => {
    return new Promise((resolve, reject) => {
        if (!mapInstanceOrNode) {
            reject(new Error("Map instance or DOM node required for Places Service"));
            return;
        }

        const service = new window.google.maps.places.PlacesService(mapInstanceOrNode);
        const request = {
            location: new window.google.maps.LatLng(center.lat, center.lon),
            radius: radius,
            // Use broadly inclusive types to get variety
            type: ['tourist_attraction', 'point_of_interest', 'museum', 'park', 'shrine', 'place_of_worship', 'restaurant', 'cafe', 'store']
            // Note: 'keyword' can be used for more specific things if needed, but 'type' is good for general
        };

        // We might need multiple searches to get diversity if one type dominates
        // For now, let's try a broad 'nearbySearch'
        // To get more results, we can use keywords like "tourism", "park", "food"

        // Strategy: Parallel search for different categories to ensure diversity
        const categories = [
            { type: ['museum', 'art_gallery', 'tourist_attraction'], label: 'art/history' },
            { type: ['park', 'natural_feature'], label: 'nature' },
            { type: ['shrine', 'hindu_temple', 'church', 'place_of_worship'], label: 'history' }, // 'shrine' specifically for Japan
            { type: ['restaurant', 'cafe'], label: 'gourmet' }
        ];

        const promises = categories.map(cat => {
            return new Promise((res) => {
                const req = {
                    location: new window.google.maps.LatLng(center.lat, center.lon),
                    radius: radius,
                    type: cat.type
                };
                service.nearbySearch(req, (results, status) => {
                    if (status === window.google.maps.places.PlacesServiceStatus.OK) {
                        // Map format immediately
                        const mapped = results.map(p => ({
                            id: p.place_id,
                            name: p.name,
                            lat: p.geometry.location.lat(),
                            lon: p.geometry.location.lng(),
                            category: mapGoogleTypeToCategory(p.types),
                            rating: p.rating,
                            user_ratings_total: p.user_ratings_total || 0,
                            tags: {
                                description: p.vicinity, // Address/Area
                                photo: p.photos ? p.photos[0].getUrl({ maxWidth: 400 }) : null,
                                opening_hours: p.opening_hours?.open_now ? "営業中" : null,
                                types: p.types
                            }
                        }));
                        res(mapped);
                    } else {
                        res([]);
                    }
                });
            });
        });

        Promise.all(promises).then(allResults => {
            // Flatten and deduplicate by ID
            const combined = allResults.flat();
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());

            // Filter out low rated places? Maybe > 3.0
            const filtered = unique.filter(p => p.rating && p.rating >= 3.5);
            resolve(filtered);
        }).catch(reject);

    });
};

const mapGoogleTypeToCategory = (types) => {
    if (!types) return 'other';
    if (types.includes('park') || types.includes('natural_feature')) return 'nature';
    if (types.includes('museum') || types.includes('art_gallery')) return 'art';
    if (types.includes('shrine') || types.includes('place_of_worship') || types.includes('hindu_temple')) return 'history';
    if (types.includes('restaurant') || types.includes('cafe') || types.includes('food')) return 'gourmet';
    if (types.includes('tourist_attraction')) return 'tourism';
    return 'other';
};
