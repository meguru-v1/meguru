import type { Spot, PlaceDetails } from '../types';
import { inferIsIndoor } from './places';

// Google Places の PlaceDetails を内部の Spot 型に変換
export function mapPlaceToSpot(p: PlaceDetails): Spot {
    return {
        id: p.place_id,
        place_id: p.place_id,
        lat: p.lat,
        lon: p.lng,
        name: p.name,
        category: p.types?.[0] || 'point_of_interest',
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
        tags: { types: p.types, formatted_address: p.formatted_address },
        photos: p.photo_reference ? [p.photo_reference] : [],
        editorial_summary: p.editorial_summary,
        opening_hours: p.opening_hours,
        reviews: p.reviews?.map(r => r.text) || [],
        isIndoor: inferIsIndoor(p.types),
    };
}
