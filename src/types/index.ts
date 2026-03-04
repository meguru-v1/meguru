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
    tags: SpotTags;
}

export interface Course {
    id: string;
    title: string;
    theme?: string;
    description: string;
    totalTime: number;
    totalDistance?: number;
    spots: Spot[];
    savedAt?: string; // お気に入り保存日時 (ISO 8601)
}

export interface SearchParams {
    query: string;
    radius: number; // meters
    duration: number; // minutes
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
