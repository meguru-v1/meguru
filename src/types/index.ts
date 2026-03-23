// ===== 共通型定義 =====

export interface SpotTags {
    description?: string;
    photo?: string;
    opening_hours?: string;
    types?: string[];
    [key: string]: unknown;
}

// ===== ペルソナ（AIガイド）型定義 =====
export type PersonaId = 'miyabi' | 'shiki' | 'ei' | 'aji' | 'sei' | 'un';

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
    cultural_property?: string | null; // 国宝・世界遺産等のラベル
    tags: SpotTags;
    // Google Places API Specific
    place_id?: string;
    photos?: string[];
    price_level?: number;
    formatted_address?: string;
    // 拡張情報
    editorial_summary?: string;
    opening_hours?: string[];
    reviews?: string[];
    business_status?: string;
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
    editorial_summary?: string;
    opening_hours?: string[];
    reviews?: { text: string; rating: number }[];
    price_level?: number;
    business_status?: string;
}

export interface Course {
    id: string;
    title: string;
    theme?: string;
    description: string;
    totalTime: number;
    totalDistance?: number;
    spots: Spot[];
    travelMode?: TravelMode;
    savedAt?: string; // お気に入り保存日時 (ISO 8601)
    persona?: PersonaId; // どのガイドが案内したコースか
    dayIndex?: number;   // 連泊プランの何日目か (0-based)
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
    mood?: string;
    budget?: string;
    groupSize?: string;
    queryPlaceId?: string;
    destinationPlaceId?: string;
    persona?: PersonaId; // 選択されたAIガイド
    daysCount?: number;  // 連泊プランの日数 (1=当日, 2-3=連泊)
}

export interface AutocompleteResult {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText?: string;
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
