import { getDistance } from 'geolib';
import { searchNearbySpots, searchRouteSpots, reverseGeocode } from './places';
import { geocodeWithBias } from './geocoding';
import { mapPlaceToSpot } from './placeMapper';
import { applyTravelTimes } from './travelTime';
import { fitToTimeBudget, computeTotalMinutes } from './routeAlgorithms';
import { getMinSpotCount } from './geminiPrompts';
import { buildPlacePhotoUrl } from './safeUrl';
import type { Course, Spot, SearchParams, TravelMode } from '../types';

/** AIに渡す候補スポットの上限 */
const MAX_CANDIDATES = 150;
/** 待ち画面に流す画像の枚数 */
const GENERATION_IMAGE_COUNT = 10;
/** 発着地とスポットがこれ以上離れていたら発着ピンを挿す（メートル） */
const PIN_INSERT_THRESHOLD_M = 500;
/** ルート検索で最低限必要なスポット数 */
const MIN_ROUTE_SPOTS = 3;

/** 移動手段ごとの現実的な上限速度（km/h） */
const MAX_SPEEDS: Record<string, { limit: number; label: string }> = {
    walk: { limit: 20, label: '徒歩' },
    bicycle: { limit: 40, label: '自転車' },
    transit: { limit: 200, label: '公共交通' },
    car: { limit: 200, label: '車' },
};

/** 検索方式の違いを吸収した、コース生成への入力 */
export interface SearchPlan {
    center: { lat: number; lon: number };
    radius: number;
    /** AIに渡すスポット候補 */
    candidates: Spot[];
    /** 待ち画面に流す画像URL */
    images: string[];
    /** 待ち画面や履歴に出す地名 */
    locationName: string;
    /** AIが返した生コースに移動時間や発着ピンを付ける */
    enhance: (courses: Course[]) => Course[];
}

/** 緯度経度から直線距離をメートルで概算する */
export function approxDistanceM(
    a: { lat: number; lon: number },
    b: { lat: number; lon: number }
): number {
    const midLat = (a.lat + b.lat) / 2;
    const dx = (a.lat - b.lat) * 111000;
    const dy = (a.lon - b.lon) * 111000 * Math.cos((midLat * Math.PI) / 180);
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * その移動手段・その所要時間で走破できない距離なら例外を投げる。
 * （徒歩で30分・50km などの無理な条件をAI呼び出し前に弾く）
 */
export function assertFeasible(distanceM: number, durationMin: number, travelMode: TravelMode): void {
    const spec = MAX_SPEEDS[travelMode] ?? MAX_SPEEDS.walk;
    const distKm = distanceM / 1000;
    const requiredSpeed = distKm / (durationMin / 60);
    if (requiredSpeed > spec.limit) {
        throw new Error(
            `${spec.label}では無理な距離です（直線${distKm.toFixed(1)}km、必要速度 ${requiredSpeed.toFixed(0)}km/h）。時間を増やすか、移動方法を変更してください。`
        );
    }
}

/** Fisher-Yates シャッフル。sort(() => Math.random() - 0.5) は偏るため使わない */
function shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function pickCandidates(spots: Spot[]): Spot[] {
    return shuffle(spots).slice(0, MAX_CANDIDATES);
}

function toImages(candidates: Spot[]): string[] {
    return candidates
        .map((c) => buildPlacePhotoUrl(c.photos?.[0], 1600))
        .filter((u): u is string => !!u)
        .slice(0, GENERATION_IMAGE_COUNT);
}

/**
 * AIが出したコースを時間枠に収め、合計時間を実測値で入れ直す。
 * AI側の申告値をそのまま信じると、指定時間に収まらないコースが出てくる。
 */
function finalizeCourse(course: Course, spots: Spot[], durationMin: number, mode: TravelMode): Course {
    const fitted = fitToTimeBudget(
        spots,
        durationMin,
        (s) => applyTravelTimes(s, mode),
        getMinSpotCount(durationMin)
    );
    return { ...course, travelMode: mode, spots: fitted, totalTime: computeTotalMinutes(fitted) };
}

/** 出発地・目的地のピンを作る */
function makePin(
    kind: 'start' | 'end',
    geo: { lat: number; lon: number; name?: string },
    fallbackName: string
): Spot {
    const name = geo.name || fallbackName;
    return kind === 'start'
        ? {
            id: `pin-start-${Date.now()}`, lat: geo.lat, lon: geo.lon,
            name, category: 'starting_point', tags: {}, travel_time_minutes: 0,
            aiDescription: `ここから旅が始まります。${name}を出発しましょう。`,
        }
        : {
            id: `pin-end-${Date.now()}`, lat: geo.lat, lon: geo.lon,
            name, category: 'destination', tags: {},
            aiDescription: `旅のゴール地点、${name}に到着です。`,
        };
}

/** ルート検索（出発地→目的地）の計画を立てる */
async function planRouteSearch(
    params: SearchParams,
    onStatus: (message: string) => void
): Promise<SearchPlan> {
    const { query, destination, queryPlaceId, destinationPlaceId, duration, travelMode } = params;
    const mode: TravelMode = travelMode || 'walk';

    const [startGeo, endGeo] = await Promise.all([
        geocodeWithBias(query, queryPlaceId),
        geocodeWithBias(destination!, destinationPlaceId),
    ]);
    if (!startGeo) throw new Error(`「${query}」が見つかりませんでした。`);
    if (!endGeo) throw new Error(`「${destination}」が見つかりませんでした。`);

    const directDist = approxDistanceM(startGeo, endGeo);
    assertFeasible(directDist, duration, mode);

    const center = { lat: (startGeo.lat + endGeo.lat) / 2, lon: (startGeo.lon + endGeo.lon) / 2 };
    const radius = Math.max(Math.min(directDist * 0.4, 2000), 500);

    onStatus('ルート周辺のスポットを探しています...');
    const raw = await searchRouteSpots(
        { lat: startGeo.lat, lng: startGeo.lon },
        { lat: endGeo.lat, lng: endGeo.lon },
        radius
    );
    const allSpots = raw.map(mapPlaceToSpot);
    if (allSpots.length < MIN_ROUTE_SPOTS) {
        throw new Error('ルート周辺に見どころとなるスポットがあまり見つかりませんでした。検索範囲や時間を大きくしてみてください。');
    }

    const candidates = pickCandidates(allSpots);

    // 出発地・目的地から離れていれば、その地点をコースの先頭・末尾に挿す
    const enhance = (courses: Course[]) =>
        courses.map((course) => {
            const spots = [...course.spots];
            if (spots.length > 0) {
                const firstDist = getDistance(
                    { latitude: startGeo.lat, longitude: startGeo.lon },
                    { latitude: spots[0].lat, longitude: spots[0].lon }
                );
                if (firstDist > PIN_INSERT_THRESHOLD_M) spots.unshift(makePin('start', startGeo, query));

                const last = spots[spots.length - 1];
                const lastDist = getDistance(
                    { latitude: endGeo.lat, longitude: endGeo.lon },
                    { latitude: last.lat, longitude: last.lon }
                );
                if (lastDist > PIN_INSERT_THRESHOLD_M) spots.push(makePin('end', endGeo, destination!));
            }
            return finalizeCourse(course, spots, duration, mode);
        });

    return { center, radius, candidates, images: toImages(candidates), locationName: query, enhance };
}

/** エリア検索（1地点の周辺）の計画を立てる */
async function planAreaSearch(
    params: SearchParams,
    onStatus: (message: string) => void
): Promise<SearchPlan> {
    const { query, queryPlaceId, radius, travelMode } = params;
    const mode: TravelMode = travelMode || 'walk';

    // 「今すぐ未知へ」ボタンは "35.xxx,135.xxx" 形式の座標を直接渡してくる
    const coordMatch = query.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    let startGeo: { lat: number; lon: number; name?: string } | null;
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lon = parseFloat(coordMatch[2]);
        startGeo = { lat, lon, name: (await reverseGeocode(lat, lon)) || '現在地' };
    } else {
        startGeo = await geocodeWithBias(query, queryPlaceId);
    }
    if (!startGeo) {
        throw new Error(`「${query}」が見つかりませんでした。スペルや表記を見直すか、より具体的な地名（例:「京都駅」）でお試しください。`);
    }

    onStatus('周辺スポットを見極めています...');
    const raw = await searchNearbySpots(startGeo.lat, startGeo.lon, radius);
    const allSpots = raw.map(mapPlaceToSpot);
    if (allSpots.length === 0) {
        throw new Error('周辺に見どころとなるスポットが見つかりませんでした。別の場所や、検索範囲を広くして試してみてください。');
    }

    const candidates = pickCandidates(allSpots);

    return {
        center: { lat: startGeo.lat, lon: startGeo.lon },
        radius,
        candidates,
        images: toImages(candidates),
        locationName: startGeo.name || '現在地周辺',
        enhance: (courses) =>
            courses.map((course) => finalizeCourse(course, course.spots, params.duration, mode)),
    };
}

/** 検索条件から、コース生成に必要な材料を揃える */
export function planSearch(
    params: SearchParams,
    onStatus: (message: string) => void
): Promise<SearchPlan> {
    return params.searchMode === 'route' && params.destination
        ? planRouteSearch(params, onStatus)
        : planAreaSearch(params, onStatus);
}
