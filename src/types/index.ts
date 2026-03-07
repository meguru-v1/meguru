// ===== 共通型定義 =====

export interface SpotTags {
    description?: string;
    photo?: string;
    opening_hours?: string;
    types?: string[];
    [key: string]: unknown;
}

export interface Spot {
    id: string | number;
    type?: string;
    lat: number;
    lon: number;
    name: string;
    category: string;
    estimatedStayTime?: number;
    stayTime?: number;
    travel_time_minutes?: number;
    rating?: number;
    user_ratings_total?: number;
    aiDescription?: string;
    must_see?: string | null;
    pro_tip?: string | null;
    trivia?: string; // Phase 11: うんちく・小ネタ
    tags: SpotTags;
    // Google Places API Specific
    place_id?: string;
    photos?: string[];
    price_level?: number;
    formatted_address?: string;
}

export interface PlaceDetails {
    place_id: string;
    name: string;
    lat: number;
    lng: number;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    formatted_address?: string;
    photo_reference?: string;
}

export interface Course {
    id: string;
    title: string;
    theme?: string;
    description: string;
    totalTime: number;
    totalDistance?: number;
    spots: Spot[];
    travelMode?: TravelMode; // 追加: 移動手段
    savedAt?: string; // お気に入り保存日時 (ISO 8601)
}

export type SearchMode = 'area' | 'route';
export type TravelMode = 'walk' | 'bicycle' | 'car' | 'transit';

export interface SearchParams {
    searchMode: SearchMode;
    query: string;
    radius: number; // meters
    duration: number; // minutes
    destination?: string; // ルート検索時の目的地
    travelMode?: TravelMode; // 移動方法
}

export interface GeoResult {
    lat: string;
    lon: string;
    display_name: string;
}

// タブID
export type TabId = 'search' | 'courses' | 'map' | 'favorites';

export interface TabItem {
    id: TabId;
    label: string;
    icon: string; // lucide icon name
}
