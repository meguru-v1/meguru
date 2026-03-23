import React, { useState } from 'react';
import SearchInterface from './components/SearchInterface';
import MapVisualization from './components/MapVisualization';
import TabBar from './components/TabBar';
import GenerationScreen from './components/GenerationScreen';
import SpotHeroImage from './components/SpotHeroImage';
import { useFavorites } from './hooks/useFavorites';
import { searchAreaCenter, searchNearbySpots, searchRouteSpots, getPlaceLatLng } from './lib/places';
import { generateSmartCourses, remixCourse, generateWaitingScreenContent } from './lib/gemini';
import type { WaitingScreenContent } from './lib/gemini';
import { generateCourses as generateHeuristicCourses } from './lib/courseGenerator';
import { getCurrentWeather } from './lib/weather';
import { getDistance } from 'geolib';
import {
    Loader2, Footprints, Clock, MapPin, Star, Sparkles, Heart, Trash2, Search,
    Navigation, AlertCircle, Map as MapIcon, ArrowLeft, Bike, Train, Car, Lightbulb, RefreshCw, Smile, Zap, Send
} from 'lucide-react';
import type { Course, Spot, SearchParams, TabId, TravelMode } from './types';

function App() {
    const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
    const [radius, setRadius] = useState(1000);
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [focusedSpot, setFocusedSpot] = useState<Spot | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('search');
    const [searchCandidates, setSearchCandidates] = useState<Spot[]>([]);
    const [isRemixing, setIsRemixing] = useState(false);
    const [customRemixInput, setCustomRemixInput] = useState('');
    const [showGenScreen, setShowGenScreen] = useState(false);
    const [searchLocationName, setSearchLocationName] = useState('');
    const [subAiContent, setSubAiContent] = useState<WaitingScreenContent | null>(null);
    const [generationImages, setGenerationImages] = useState<string[]>([]);

    // リミックス用に検索条件を保持
    const [lastSearchDuration, setLastSearchDuration] = useState(120);
    const [lastSearchMood, setLastSearchMood] = useState('不明');
    const [lastSearchBudget, setLastSearchBudget] = useState('不明');
    const [lastSearchGroupSize, setLastSearchGroupSize] = useState('不明');

    const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

    const getPreferenceContext = (): string => {
        if (!favorites || favorites.length === 0) return '';
        const recentFavorites = favorites.slice(0, 5); // 直近5件を分析
        const favoriteTypes = new Set<string>();
        const favoriteDescriptions: string[] = [];

        recentFavorites.forEach(course => {
            course.spots.forEach(spot => {
                const s = spot as any;
                if (s.types) s.types.forEach((t: string) => favoriteTypes.add(t));
                if (s.editorial_summary) favoriteDescriptions.push(s.editorial_summary);
            });
        });

        const typesStr = Array.from(favoriteTypes).slice(0, 15).join(', ');
        return `よく好むカテゴリ: ${typesStr}\n好みの場所の説明例: ${favoriteDescriptions.slice(0, 3).join(' / ')}`;
    };

    // ===== ジオコード関数 =====
    const geocode = async (q: string, placeId?: string): Promise<{ lat: number; lon: number; name: string } | null> => {
        try {
            // Place ID があれば優先的に詳細座標を取得 (高精度)
            if (placeId) {
                const res = await getPlaceLatLng(placeId);
                if (res) return { lat: res.lat, lon: res.lng, name: res.name };
            }
            // なければ従来のテキスト検索
            const res = await searchAreaCenter(q);
            if (res) return { lat: res.lat, lon: res.lng, name: res.name };
        } catch { /* ignore */ }
        return null;
    };

    // ===== 検索ハンドラ =====
    const handleSearch = async (params: SearchParams) => {
        setLoading(true);
        let hasError = false; // クロージャ問題を避けるためのローカルフラグ
        setError(null);
        setSubAiContent(null);
        setCourses([]);
        setSelectedCourse(null);
        setStatus('場所を検索中...');

        try {
            const { searchMode, query, destination, radius: r, duration, travelMode, mood, budget, groupSize, queryPlaceId, destinationPlaceId, persona } = params;
            
            // リミックス用に条件を保存
            setLastSearchDuration(duration);
            setLastSearchMood(mood || '不明');
            setLastSearchBudget(budget || '不明');
            setLastSearchGroupSize(groupSize || '不明');

            if (searchMode === 'route' && destination) {
                // ===== ルート検索 =====
                const [startGeo, endGeo] = await Promise.all([
                    geocode(query, queryPlaceId), 
                    geocode(destination, destinationPlaceId)
                ]);
                if (!startGeo) throw new Error(`「${query}」が見つかりませんでした。`);
                if (!endGeo) throw new Error(`「${destination}」が見つかりませんでした。`);

                // 2点間の距離を算出 (メートル)
                const midLat = (startGeo.lat + endGeo.lat) / 2;
                const midLon = (startGeo.lon + endGeo.lon) / 2;
                const dx = (startGeo.lat - endGeo.lat) * 111000;
                const dy = (startGeo.lon - endGeo.lon) * 111000 * Math.cos(midLat * Math.PI / 180);
                const directDist = Math.sqrt(dx * dx + dy * dy);

                // 移動方法ごとの速度制限チェック (km/h)
                const maxSpeeds: Record<string, { limit: number; label: string }> = {
                    walk: { limit: 20, label: '徒歩' },
                    bicycle: { limit: 40, label: '自転車' },
                    transit: { limit: 200, label: '公共交通' },
                    car: { limit: 200, label: '車' },
                };
                const routeMode = travelMode || 'walk';
                const distKm = directDist / 1000;
                const timeHours = duration / 60;
                const requiredSpeed = distKm / timeHours;

                if (requiredSpeed > maxSpeeds[routeMode].limit) {
                    throw new Error(
                        `${maxSpeeds[routeMode].label}では無理な距離です（直線${distKm.toFixed(1)}km、必要速度 ${requiredSpeed.toFixed(0)}km/h）。時間を増やすか、移動方法を変更してください。`
                    );
                }

                setCenter({ lat: midLat, lon: midLon });
                const searchRadius = Math.max(Math.min(directDist * 0.4, 2000), 500);
                setRadius(searchRadius);

                setStatus(`ルート周辺のスポットを探しています...`);
                const allSpotsRaw = await searchRouteSpots(
                    { lat: startGeo.lat, lng: startGeo.lon },
                    { lat: endGeo.lat, lng: endGeo.lon },
                    searchRadius
                );

                // Spot型にマッピング
                const allSpots: Spot[] = allSpotsRaw.map(p => ({
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
                    reviews: p.reviews?.map(r => r.text) || []
                }));

                if (allSpots.length < 3) throw new Error("ルート周辺に見どころとなるスポットがあまり見つかりませんでした。検索範囲や時間を大きくしてみてください。");

                setStatus('AIが最適なルートコースを生成中...');
                setShowGenScreen(true);
                setSearchLocationName(query);
                const shuffled = [...allSpots].sort(() => Math.random() - 0.5);
                const candidates = shuffled.slice(0, 150);
                setSearchCandidates(candidates);

                // --- 待ち画面（GenerationScreen）用画像の取得 ---
                const googleUrls = candidates
                    .map(c => c.photos?.[0])
                    .filter(Boolean)
                    .map(ref => `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=1600&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`);
                
                setGenerationImages(googleUrls.slice(0, 10));

                const now = new Date();
                const timeContext = `${now.getHours()}:${now.getMinutes() < 10 ? '0' : ''}${now.getMinutes()}`;
                const weatherContext = await getCurrentWeather(midLat, midLon);

                console.log("AI Generation Context:", { time: timeContext, weather: weatherContext, center: { midLat, midLon } });

                // メインAIとサブAIを並列で呼び出し
                const mainPromise = generateSmartCourses(
                    candidates,
                    { lat: midLat, lon: midLon },
                    duration,
                    timeContext,
                    weatherContext,
                    mood,
                    budget,
                    groupSize,
                    getPreferenceContext(),
                    persona
                );

                // サブAI: 待ち画面コンテンツを並列生成（メインより少し遅らせて負荷分散 - Paid Tier Optimized）
                setTimeout(() => {
                    generateWaitingScreenContent(query, weatherContext, persona)
                        .then(content => { if (content) setSubAiContent(content); })
                        .catch(() => { /* フォールバックで対応 */ });
                }, 200);

                let generatedCourses: Course[] = [];
                try {
                    console.log("App: Awaiting mainPromise (generateSmartCourses)...");
                    generatedCourses = await mainPromise;
                    if (!generatedCourses || generatedCourses.length === 0) {
                        throw new Error("AIがコース案を作成できませんでした。別の条件で試してみてください。");
                    }
                }
                catch (e) {
                    console.error("App: generateSmartCourses failed:", e);
                    setError(e instanceof Error ? e.message : "AIコース生成中にエラーが発生しました。");
                    throw e; 
                }

                const routeTravelMode = travelMode || 'walk';
                const enhancedCourses = generatedCourses.map(course => ({
                    ...course,
                    travelMode: routeTravelMode,
                    spots: course.spots.map((spot, index, arr) => {
                        if (index === 0) return { ...spot, travel_time_minutes: 0 };
                        const prev = arr[index - 1];
                        const dist = getDistance(
                            { latitude: prev.lat, longitude: prev.lon },
                            { latitude: spot.lat, longitude: spot.lon }
                        );
                        // speed: walk 80m/min, bike 200m/min, transit 400m/min, car 400m/min
                        const speed = routeTravelMode === 'walk' ? 80 : (routeTravelMode === 'bicycle' ? 200 : 400);
                        return { ...spot, travel_time_minutes: Math.max(1, Math.ceil(dist / speed)) };
                    })
                }));

                setCourses(enhancedCourses);
                setActiveTab('courses');

            } else {
                // ===== エリア検索 (従来) =====
                const { query, queryPlaceId, radius: r, duration, travelMode, mood, budget, groupSize } = params;
                const startGeo = await geocode(query, queryPlaceId);
                if (!startGeo) throw new Error("場所が見つかりませんでした。");

                setCenter({ lat: startGeo.lat, lon: startGeo.lon });
                setRadius(r);

                setStatus(`周辺スポットを見極めています...`);
                const allSpotsRaw = await searchNearbySpots(startGeo.lat, startGeo.lon, r);
                console.log(`Spots found: ${allSpotsRaw.length}.`);

                // Spot型にマッピング
                const allSpots: Spot[] = allSpotsRaw.map(p => ({
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
                    reviews: p.reviews?.map(r => r.text) || []
                }));

                if (allSpots.length === 0) throw new Error("周辺に見どころとなるスポットが見つかりませんでした。別の場所や、検索範囲を広くして試してみてください。");

                setStatus('AIが最適なコースを生成中...');
                setShowGenScreen(true);
                setSearchLocationName(query);
                const shuffled = [...allSpots].sort(() => Math.random() - 0.5);
                const candidates = shuffled.slice(0, 150);
                setSearchCandidates(candidates);

                // --- 待ち画面（GenerationScreen）用画像の取得 ---
                const googleUrls = candidates
                    .map(c => c.photos?.[0])
                    .filter(Boolean)
                    .map(ref => `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=1600&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`);
                
                setGenerationImages(googleUrls.slice(0, 10));

                const now = new Date();
                const timeContext = `${now.getHours()}:${now.getMinutes() < 10 ? '0' : ''}${now.getMinutes()}`;
                const weatherContext = await getCurrentWeather(startGeo.lat, startGeo.lon);

                // メインAIとサブAIを並列で呼び出し
                const mainPromise = generateSmartCourses(
                    candidates,
                    { lat: startGeo.lat, lon: startGeo.lon },
                    duration,
                    timeContext,
                    weatherContext,
                    mood,
                    budget,
                    groupSize,
                    getPreferenceContext(),
                    persona
                );

                // サブAI: 待ち画面コンテンツを並列生成（メインより少し遅らせて負荷分散 - Paid Tier Optimized）
                setTimeout(() => {
                    generateWaitingScreenContent(query, weatherContext, persona)
                        .then(content => { if (content) setSubAiContent(content); })
                        .catch(() => { /* フォールバックで対応 */ });
                }, 300);

                let generatedCourses: Course[] = [];
                try {
                    console.log("App: Awaiting mainPromise (generateSmartCourses) for Area Search...");
                    generatedCourses = await mainPromise;
                    if (!generatedCourses || generatedCourses.length === 0) {
                        throw new Error("AIがコース案を作成できませんでした。別の条件で試してみてください。");
                    }
                }
                catch (e) {
                    console.error("App: generateSmartCourses failed (Area):", e);
                    setError(e instanceof Error ? e.message : "AIコース生成中にエラーが発生しました。");
                    // エラーを画面で見せるために10秒間待機してから閉じる
                    await new Promise(r => setTimeout(r, 10000));
                    throw e; 
                }

                const areaTravelMode = travelMode || 'walk';
                const enhancedCourses = generatedCourses.map(course => ({
                    ...course,
                    travelMode: areaTravelMode,
                    spots: course.spots.map((spot, index, arr) => {
                        if (index === 0) return { ...spot, travel_time_minutes: 0 };
                        const prev = arr[index - 1];
                        const dist = getDistance(
                            { latitude: prev.lat, longitude: prev.lon },
                            { latitude: spot.lat, longitude: spot.lon }
                        );
                        // speed: walk 80m/min, bike 200m/min, transit 400m/min, car 400m/min
                        const speed = areaTravelMode === 'walk' ? 80 : (areaTravelMode === 'bicycle' ? 200 : 400);
                        return { ...spot, travel_time_minutes: Math.max(1, Math.ceil(dist / speed)) };
                    })
                }));

                setCourses(enhancedCourses);
                setActiveTab('courses');
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "検索中にエラーが発生しました。");
            hasError = true;
        } finally {
            setLoading(false);
            // エラーが発生しなかった場合のみ画面を閉じる
            if (!hasError) {
                setShowGenScreen(false);
                setSubAiContent(null);
                setStatus('');
            }
        }
    };

    const handleTabChange = (tab: TabId) => {
        setActiveTab(tab);
    };

    const handleRemix = async (instruction: string) => {
        if (!selectedCourse || searchCandidates.length === 0) return;
        setIsRemixing(true);
        setCustomRemixInput(''); // 自由入力をクリア
        try {
            const now = new Date();
            const timeContext = `${now.getHours()}:${now.getMinutes() < 10 ? '0' : ''}${now.getMinutes()}`;
            // 天気は元の位置を使って再取得（簡易化のため center を使用）
            const weatherContext = center ? await getCurrentWeather(center.lat, center.lon) : "不明";

            const remixed = await remixCourse(
                selectedCourse,
                searchCandidates,
                instruction,
                center || { lat: 0, lon: 0 },
                lastSearchDuration,
                timeContext,
                weatherContext,
                lastSearchMood,
                lastSearchBudget,
                lastSearchGroupSize,
                getPreferenceContext()
            );

            if (remixed) {
                setSelectedCourse(remixed);
                // courses 配列内も更新する
                setCourses(prev => prev.map(c => c.id === selectedCourse.id ? remixed : c));
            }
        } catch (err) {
            console.error("Remix failed:", err);
            alert("リミックスに失敗しました。時間をおいて、別の指示でもう一度お試しください。");
        } finally {
            setIsRemixing(false);
        }
    };

    const handleSelectCourse = (course: Course, fromFavorites = false) => {
        setSelectedCourse(course);
        setFocusedSpot(null);
        if (fromFavorites && course.spots.length > 0) {
            setCenter({ lat: course.spots[0].lat, lon: course.spots[0].lon });
        }
        if (fromFavorites) {
            setActiveTab('courses');
        }
    };

    // ===== ステータスパネル =====
    const statusPanel = error ? (
        <div className="mx-4 mt-4 p-4 rounded-2xl animate-scale-in flex items-center gap-3 text-sm font-medium"
            style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '1px solid #fecaca' }}>
            <AlertCircle size={18} className="text-red-400 shrink-0" /> <span className="text-red-600">{error}</span>
        </div>
    ) : loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 animate-fade-in">
            <Loader2 className="animate-spin text-slate-900 w-10 h-10" />
            <span className="text-sm font-medium text-slate-500">{status || '読み込み中...'}</span>
        </div>
    ) : null;

    // ===== コースカード =====
    const CourseCard = ({ course, onClick, index }: { course: Course; onClick: () => void; index?: number }) => {
        const fav = isFavorite(course.id);
        return (
            <div onClick={onClick}
                className="card-premium relative p-5 cursor-pointer group active:scale-[0.98] animate-slide-up"
                style={{ animationDelay: `${(index || 0) * 0.06}s`, animationFillMode: 'backwards' }}>
                {course.theme && (
                    <div className="tag-badge mb-2.5">
                        <Sparkles size={10} /> {course.theme.split(':')[0]}
                    </div>
                )}
                <div className="flex justify-between items-start mb-2 pr-10">
                    <h4 className="font-bold text-base leading-tight text-slate-800 group-hover:text-amber-600 transition-colors">{course.title}</h4>
                    <span className="text-[11px] font-mono bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap ml-2 shrink-0 text-slate-500">
                        {course.totalTime}分
                    </span>
                </div>
                <p className="text-xs text-slate-400 mb-3.5 line-clamp-2 leading-relaxed">{course.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-300 font-medium">
                    <span className="flex items-center gap-1"><MapPin size={10} /> {course.spots.length}スポット</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {course.totalTime}分</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); fav ? removeFavorite(course.id) : addFavorite(course); }}
                    aria-label={fav ? 'お気に入りから削除' : 'お気に入りに追加'}
                    className={`absolute bottom-4 right-4 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90
                        ${fav ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-slate-50 text-slate-300 hover:text-rose-400 hover:bg-rose-50'}`}>
                    <Heart size={16} className={fav ? 'fill-current' : ''} />
                </button>
            </div>
        );
    };

    const getGoogleMapsUrl = (course: Course) => {
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
    };

    // ==========================
    //  検索タブ
    // ==========================
    const searchView = (
        <div className="w-full flex flex-col">
            <SearchInterface onSearch={handleSearch} />
            {statusPanel}
        </div>
    );

    // ==========================
    //  モデルコースタブ
    // ==========================
    const coursesView = (
        <div className="flex flex-col min-h-full">
            {!selectedCourse && (
                <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-5 pb-20">
                    {courses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-5 py-24 animate-fade-in">
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.03)' }}>
                                <Footprints size={36} className="text-slate-200" />
                            </div>
                            <div className="text-center">
                                <p className="font-semibold text-slate-600 mb-1 text-base">まだコースがありません</p>
                                <p className="text-sm text-slate-300">検索タブから場所を検索して<br />モデルコースを生成しましょう</p>
                            </div>
                            <button onClick={() => setActiveTab('search')} className="btn-primary flex items-center gap-2 py-3 px-6 text-sm">
                                <Search size={16} /> 検索する
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mb-5 animate-fade-in">
                                <Footprints size={20} className="text-slate-700" />
                                <h2 className="font-bold text-slate-800 text-lg">おすすめコース ({courses.length})</h2>
                            </div>
                            {loading && statusPanel}
                            <div className="space-y-3">
                                {courses.map((course, i) => (
                                    <CourseCard key={course.id} course={course} onClick={() => handleSelectCourse(course)} index={i} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {selectedCourse && (
                <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-5 pb-20">
                    {/* 戻るボタン */}
                    <button onClick={() => { setSelectedCourse(null); setFocusedSpot(null); }}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-90 mb-3"
                        aria-label="コース一覧に戻る">
                        <ArrowLeft size={20} />
                    </button>

                    {/* コースヘッダー */}
                    <div className="mb-6 animate-fade-in">
                        {selectedCourse.theme && (
                            <div className="tag-badge mb-3">
                                <Sparkles size={10} /> {selectedCourse.theme.split(':')[0]}
                            </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                            <h2 className="font-extrabold text-xl text-slate-900 leading-tight flex-1">{selectedCourse.title}</h2>
                            <button onClick={() => isFavorite(selectedCourse.id) ? removeFavorite(selectedCourse.id) : addFavorite(selectedCourse)}
                                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 shrink-0
                                    ${isFavorite(selectedCourse.id) ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-slate-100 text-slate-400 hover:text-rose-400 hover:bg-rose-50'}`}>
                                <Heart size={20} className={isFavorite(selectedCourse.id) ? 'fill-current' : ''} />
                            </button>
                        </div>
                        <div className="flex gap-3 text-xs text-slate-500 mt-2">
                            <span className="flex items-center gap-1"><Clock size={12} /> {selectedCourse.totalTime}分</span>
                            <span className="flex items-center gap-1"><MapPin size={12} /> {selectedCourse.spots.length}スポット</span>
                        </div>
                        {selectedCourse.description && (
                            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{selectedCourse.description}</p>
                        )}
                        {/* 地図で見るボタン */}
                        <button onClick={() => setActiveTab('map')}
                            className="flex items-center justify-center gap-2 w-full mt-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-all active:scale-95">
                            <MapIcon size={16} /> 地図で全体を見る
                        </button>
                    </div>

                    {/* リミックスセクション */}
                    <div className="mb-6 animate-fade-in stagger-1">
                        <div className="flex items-center gap-2 mb-3">
                            <RefreshCw size={14} className={`text-indigo-500 ${isRemixing ? 'animate-spin' : ''}`} />
                            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">リミックス案</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { id: 'quiet', label: '🤫 もっと静かに', color: 'bg-slate-100 hover:bg-slate-200 text-slate-700' },
                                { id: 'active', label: '🏃 もっとアクティブに', color: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700' },
                                { id: 'cafe', label: '☕ カフェ多めで休憩', color: 'bg-amber-50 hover:bg-amber-100 text-amber-700' },
                                { id: 'rich', label: '✨ ちょっぴりリッチに', color: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700' }
                            ].map(btn => (
                                <button key={btn.id} onClick={() => handleRemix(btn.label)} disabled={isRemixing}
                                    className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all active:scale-95 flex items-center gap-1.5 ${btn.color} ${isRemixing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    {isRemixing && btn.label.includes(btn.label) ? <Loader2 size={10} className="animate-spin" /> : null}
                                    {btn.label}
                                </button>
                            ))}
                            
                            {/* 自由入力リミックス */}
                            <form 
                                onSubmit={(e) => { e.preventDefault(); if (customRemixInput.trim()) handleRemix(customRemixInput.trim()); }} 
                                className="flex items-center relative flex-1 min-w-[200px]"
                            >
                                <input
                                    type="text"
                                    placeholder="わがままを自由に指示..."
                                    value={customRemixInput}
                                    onChange={(e) => setCustomRemixInput(e.target.value)}
                                    disabled={isRemixing}
                                    className="w-full pl-3 pr-9 py-1.5 text-xs bg-slate-50 border border-slate-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all disabled:opacity-50"
                                    aria-label="カスタムリミックス入力"
                                />
                                <button
                                    type="submit"
                                    disabled={!customRemixInput.trim() || isRemixing}
                                    className="absolute right-1 w-6 h-6 flex items-center justify-center bg-indigo-500 text-white rounded-full disabled:opacity-50 disabled:bg-slate-300 transition-colors"
                                >
                                    {isRemixing ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                                </button>
                            </form>
                        </div>
                        {isRemixing && (
                            <p className="text-[10px] text-indigo-400 mt-2 font-medium animate-pulse">AIがコースを再構成しています...</p>
                        )}
                    </div>

                    {/* 雑誌風タイムライン */}
                    <div className="space-y-6">
                        {selectedCourse.spots.map((spot, index) => {
                            const isFirst = index === 0;
                            const isLast = index === selectedCourse.spots.length - 1;
                            const label = isFirst ? 'START' : isLast ? 'GOAL' : `SPOT ${index + 1}`;

                            return (
                                <div key={spot.id} className="animate-slide-up" style={{ animationDelay: `${index * 0.08}s`, animationFillMode: 'backwards' }}>
                                    {/* 移動情報（2番目以降に表示）*/}
                                    {(spot.travel_time_minutes ?? 0) > 0 && (
                                        <div className="flex items-center gap-2 py-2 px-3 mb-2">
                                            <div className="flex-1 h-px bg-slate-200" />
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                {selectedCourse.travelMode === 'car' ? <Car size={12} /> :
                                                    selectedCourse.travelMode === 'transit' ? <Train size={12} /> :
                                                        selectedCourse.travelMode === 'bicycle' ? <Bike size={12} /> :
                                                            <Footprints size={12} />}
                                                {selectedCourse.travelMode === 'car' ? '車' : selectedCourse.travelMode === 'transit' ? '公共交通' : selectedCourse.travelMode === 'bicycle' ? '自転車' : '徒歩'}約{spot.travel_time_minutes}分
                                            </div>
                                            <div className="flex-1 h-px bg-slate-200" />
                                        </div>
                                    )}

                                    {/* 雑誌風カード */}
                                    <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white shadow-sm hover:shadow-lg transition-all duration-300 group">
                                        <SpotHeroImage
                                            spotName={spot.name}
                                            googlePhotoRef={spot.photos?.[0]}
                                            lat={spot.lat}
                                            lng={spot.lon}
                                            label={label}
                                            category={spot.category}
                                            rating={spot.rating}
                                            userRatings={spot.user_ratings_total}
                                            isFirst={isFirst}
                                            isLast={isLast}
                                            culturalProperty={spot.cultural_property}
                                        />

                                        {/* テキストコンテンツ */}
                                        <div className="p-4 pt-2">
                                            {/* AI説明文 */}
                                            <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
                                                {spot.aiDescription || spot.tags.description || "詳細情報なし"}
                                            </p>

                                            {/* 情報カード群 */}
                                            <div className="space-y-2">
                                                {spot.must_see && (
                                                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 mb-0.5">
                                                            <Star size={10} /> 必見ポイント
                                                        </span>
                                                        <span className="text-[11px] text-amber-900 leading-relaxed">{spot.must_see}</span>
                                                    </div>
                                                )}
                                                {spot.pro_tip && (
                                                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 mb-0.5">
                                                            <Sparkles size={10} /> 旅のヒント
                                                        </span>
                                                        <span className="text-[11px] text-blue-900 leading-relaxed">{spot.pro_tip}</span>
                                                    </div>
                                                )}
                                                {spot.trivia && (
                                                    <div className="bg-fuchsia-50 p-3 rounded-xl border border-fuchsia-100">
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-fuchsia-600 mb-0.5">
                                                            <Lightbulb size={10} /> 賢者の小ネタ
                                                        </span>
                                                        <span className="text-[11px] text-fuchsia-900 leading-relaxed">{spot.trivia}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {spot.tags.opening_hours && (
                                                <div className="mt-2 text-[10px] text-green-600 font-medium">{spot.tags.opening_hours}</div>
                                            )}

                                            {/* Googleマップボタン */}
                                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold py-2.5 rounded-xl transition-all active:scale-95 mt-3 border border-slate-100">
                                                <span className="text-blue-500 font-extrabold">G</span> Googleマップで見る
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Googleマップ 全ルート一括転送ボタン */}
                    <a href={getGoogleMapsUrl(selectedCourse)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 mt-6 mb-2">
                        <Navigation size={18} className="text-amber-400" />
                        全ルートをGoogleマップでナビ
                    </a>
                </div>
            )}
        </div>
    );

    // ==========================
    //  地図タブ
    // ==========================
    const mapView = (
        <div className="w-full h-full">
            <MapVisualization center={center} radius={radius} spots={selectedCourse ? selectedCourse.spots : []} focusedSpot={focusedSpot} travelMode={selectedCourse?.travelMode} />
        </div>
    );

    // ==========================
    //  履歴タブ
    // ==========================
    const favoritesView = (
        <div className="flex flex-col min-h-full px-5 py-5 pb-20">
            <div className="flex items-center justify-between mb-5 animate-fade-in">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'rgba(244,63,94,0.08)' }}>
                        <Heart size={18} className="text-rose-400 fill-current" />
                    </div>
                    <h2 className="font-bold text-primary text-lg">お気に入り</h2>
                </div>
                <span className="tag-badge">{favorites.length}件</span>
            </div>

            {favorites.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-5 py-20 animate-fade-in">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.03)' }}>
                        <Heart size={36} className="text-slate-200" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-slate-600 mb-1 text-base">まだお気に入りがありません</p>
                        <p className="text-sm text-slate-300">コースの ♡ ボタンでお気に入り登録</p>
                    </div>
                    <button onClick={() => setActiveTab('search')} className="btn-primary flex items-center gap-2 py-3 px-6 text-sm">
                        <Search size={16} /> コースを探す
                    </button>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3">
                    {favorites.map((course, i) => (
                        <div key={course.id}
                            className="card-premium relative p-5 group animate-slide-up"
                            style={{ animationDelay: `${i * 0.06}s`, animationFillMode: 'backwards' }}>
                            <div className="flex items-start justify-between mb-1">
                                {course.theme ? (
                                    <span className="tag-badge"><Sparkles size={10} /> {course.theme.split(':')[0]}</span>
                                ) : <div />}
                                <button onClick={() => removeFavorite(course.id)} aria-label="お気に入りから削除"
                                    className="text-slate-200 hover:text-rose-400 transition-colors p-1.5 rounded-xl hover:bg-rose-50 active:scale-90">
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <button onClick={() => handleSelectCourse(course, true)} className="w-full text-left">
                                <h3 className="font-bold text-primary leading-tight mb-1 group-hover:text-accent transition-colors pr-2">{course.title}</h3>
                                <p className="text-xs text-slate-400 line-clamp-2 mb-2.5 leading-relaxed">{course.description}</p>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="tag-badge"><Clock size={10} /> {course.totalTime}分</span>
                                    <span className="tag-badge"><MapPin size={10} /> {course.spots.length}スポット</span>
                                </div>
                                <div className="flex items-center gap-1 overflow-hidden opacity-40">
                                    {course.spots.slice(0, 3).map((s, idx) => (
                                        <span key={idx} className="text-[10px] truncate max-w-[70px] font-medium">
                                            {s.name}{idx < Math.min(course.spots.length, 3) - 1 ? ' →' : ''}
                                        </span>
                                    ))}
                                    {course.spots.length > 3 && <span className="text-[10px]">+{course.spots.length - 3}</span>}
                                </div>
                                {course.savedAt && (
                                    <div className="mt-2.5 text-[10px] text-slate-200 font-medium">
                                        {new Date(course.savedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}に保存
                                    </div>
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="relative w-full h-[100dvh] bg-white overflow-hidden flex flex-col">
            {/* 生成待ち画面（全画面オーバーレイ）*/}
            {showGenScreen && (
                <GenerationScreen
                    statusText={status}
                    isFinished={courses.length > 0}
                    locationName={searchLocationName}
                    subAiContent={subAiContent}
                    imageUrls={generationImages}
                    onTransitionComplete={() => setShowGenScreen(false)}
                    error={error}
                />
            )}

            <div className="flex-1 overflow-hidden">
                {activeTab === 'search' && (
                    <div className="w-full h-full overflow-y-auto scrollbar-hide bg-paper">{searchView}</div>
                )}
                {activeTab === 'courses' && (
                    <div className="w-full h-full overflow-y-auto scrollbar-hide bg-paper">{coursesView}</div>
                )}
                {activeTab === 'map' && (
                    <div className="w-full h-full">{mapView}</div>
                )}
                {activeTab === 'favorites' && (
                    <div className="w-full h-full overflow-y-auto scrollbar-hide bg-paper">{favoritesView}</div>
                )}
            </div>
            {!showGenScreen && (
                <TabBar activeTab={activeTab} onTabChange={handleTabChange} coursesCount={courses.length} favoritesCount={favorites.length} />
            )}
        </div>
    );
}

export default App;
