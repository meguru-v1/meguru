import type { Course } from '../types';

// コースの全スポットを Googleマップの経路URLに変換
export function getGoogleMapsUrl(course: Course): string {
    if (!course.spots || course.spots.length === 0) return '#';
    const cleanName = (name: string) => name.split('(')[0].split('（')[0];
    const origin = encodeURIComponent(cleanName(course.spots[0].name));
    const dest = encodeURIComponent(cleanName(course.spots[course.spots.length - 1].name));
    const waypoints = course.spots.slice(1, -1).map(s => encodeURIComponent(cleanName(s.name))).join('|');

    let tmap = 'walking';
    if (course.travelMode === 'bicycle') tmap = 'bicycling';
    if (course.travelMode === 'car') tmap = 'driving';
    if (course.travelMode === 'transit') tmap = 'transit';

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}&travelmode=${tmap}`;
}
