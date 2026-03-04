import React, { useState } from 'react';
import SearchInterface from './components/SearchInterface';
import MapVisualization from './components/MapVisualization';
import TabBar from './components/TabBar';
import { useFavorites } from './hooks/useFavorites';
import { fetchNearbySpots, searchLocation } from './lib/osm';
import { generateSmartCourses } from './lib/gemini';
import { generateCourses as generateHeuristicCourses } from './lib/courseGenerator';
import {
    Loader2, Footprints, Clock, MapPin, Star, Sparkles, Heart, Trash2, Search,
    Navigation, AlertCircle
} from 'lucide-react';
import type { Course, Spot, SearchParams, TabId } from './types';

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

    const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

    // ===== ジオコード関数 =====
    const geocode = async (q: string): Promise<{ lat: number; lon: number; name: string } | null> => {
        try {
            const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=3`);
            const photonData = await photonRes.json();
            if (photonData.features && photonData.features.length > 0) {
                const f = photonData.features[0];
                return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: f.properties.name || q };
            }
        } catch { /* fallback below */ }

        try {
            const geoData = await searchLocation(q);
            if (geoData && geoData.length > 0) {
                return { lat: parseFloat(geoData[0].lat), lon: parseFloat(geoData[0].lon), name: geoData[0].display_name || q };
            }
        } catch { /* ignore */ }

        return null;
    };

    // ===== 検索ハンドラ =====
    const handleSearch = async ({ searchMode, query, radius: r, duration, destination, travelMode }: SearchParams) => {
        setLoading(true);
        setError(null);
        setCourses([]);
        setSelectedCourse(null);
        setStatus('場所を検索中...');

        try {
            if (searchMode === 'route' && destination) {
                // ===== ルート検索 =====
                const [startGeo, endGeo] = await Promise.all([geocode(query), geocode(destination)]);
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
                const mode = travelMode || 'walk';
                const distKm = directDist / 1000;
                const timeHours = duration / 60;
                const requiredSpeed = distKm / timeHours;

                if (requiredSpeed > maxSpeeds[mode].limit) {
                    throw new Error(
                        `${maxSpeeds[mode].label}では無理な距離です（直線${distKm.toFixed(1)}km、必要速度 ${requiredSpeed.toFixed(0)}km/h）。時間を増やすか、移動方法を変更してください。`
                    );
                }

                setCenter({ lat: midLat, lon: midLon });
                const searchRadius = Math.max(Math.min(directDist * 0.4, 2000), 500);
                setRadius(searchRadius);

                setStatus(`ルート周辺のスポットを探しています...`);
                // リクエスト数を最大3に制限し、順次実行でAPI制限を回避
                const numPoints = Math.min(3, Math.max(2, Math.ceil(directDist / 3000)));
                const seen = new Set<string | number>();
                const allSpots: Spot[] = [];

                for (let i = 0; i < numPoints; i++) {
                    const t = numPoints === 1 ? 0.5 : i / (numPoints - 1);
                    const lat = startGeo.lat + (endGeo.lat - startGeo.lat) * t;
                    const lon = startGeo.lon + (endGeo.lon - startGeo.lon) * t;
                    try {
                        const spots = await fetchNearbySpots(lat, lon, Math.min(searchRadius, 1500));
                        for (const spot of spots) {
                            if (!seen.has(spot.id)) {
                                seen.add(spot.id);
                                allSpots.push(spot);
                            }
                        }
                    } catch (e) {
                        console.warn(`スポット取得エラー (point ${i}):`, e);
                    }
                    // Overpass API レート制限を回避するためディレイ
                    if (i < numPoints - 1) await new Promise(r => setTimeout(r, 1200));
                }

                if (allSpots.length < 3) throw new Error("ルート周辺にスポットがあまり見つかりませんでした。検索範囲を短くしてみてください。");

                setStatus('AIが最適なルートコースを生成中...');
                const shuffled = [...allSpots].sort(() => Math.random() - 0.5);
                const candidates = shuffled.slice(0, 150);

                let generatedCourses: Course[] = [];
                try { generatedCourses = await generateSmartCourses(candidates, { lat: midLat, lon: midLon }, duration); }
                catch { /* fallback below */ }

                if (generatedCourses.length === 0) {
                    setStatus('標準アルゴリズムでコース生成中...');
                    generatedCourses = generateHeuristicCourses({ lat: midLat, lon: midLon }, allSpots, duration);
                }

                if (generatedCourses.length === 0) throw new Error("条件に合うルートコースが作成できませんでした。");

                setCourses(generatedCourses);
                setActiveTab('courses');

            } else {
                // ===== エリア検索 (従来) =====
                const startGeo = await geocode(query);
                if (!startGeo) throw new Error("場所が見つかりませんでした。");

                setCenter({ lat: startGeo.lat, lon: startGeo.lon });
                setRadius(r);

                setStatus(`周辺スポットを探しています... (${r / 1000}km圏内)`);
                const allSpots = await fetchNearbySpots(startGeo.lat, startGeo.lon, r);
                if (allSpots.length < 5) throw new Error("周辺にスポットがあまり見つかりませんでした。");

                setStatus('AIが最適なコースを生成中...');
                const shuffled = [...allSpots].sort(() => Math.random() - 0.5);
                const candidates = shuffled.slice(0, 150);

                let generatedCourses: Course[] = [];
                try { generatedCourses = await generateSmartCourses(candidates, { lat: startGeo.lat, lon: startGeo.lon }, duration); }
                catch { /* fallback below */ }

                if (generatedCourses.length === 0) {
                    setStatus('標準アルゴリズムでコース生成中...');
                    generatedCourses = generateHeuristicCourses({ lat: startGeo.lat, lon: startGeo.lon }, allSpots, duration);
                }

                if (generatedCourses.length === 0) throw new Error("条件に合うコースが作成できませんでした。");

                setCourses(generatedCourses);
                setActiveTab('courses');
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "検索中にエラーが発生しました。");
        } finally {
            setLoading(false);
            setStatus('');
        }
    };

    const handleTabChange = (tab: TabId) => {
        setActiveTab(tab);
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
        <div className="flex flex-col items-center justify-center gap-5 py-24 animate-fade-in">
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-glow-pulse"
                    style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}>
                    <Loader2 className="animate-spin text-accent w-8 h-8" />
                </div>
            </div>
            <span className="text-sm font-medium text-slate-400">{status || '読み込み中...'}</span>
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
                    <h4 className="font-bold text-base leading-tight text-primary group-hover:text-accent transition-colors">{course.title}</h4>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full whitespace-nowrap ml-2 shrink-0"
                        style={{ background: 'rgba(226,176,64,0.1)', color: '#b8860b' }}>
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
                    className={`absolute bottom-4 right-4 w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300 active:scale-90
                        ${fav ? 'text-rose-500' : 'text-slate-200 hover:text-rose-400'}`}
                    style={fav ? { background: 'rgba(244,63,94,0.08)' } : { background: 'rgba(0,0,0,0.02)' }}>
                    <Heart size={16} className={fav ? 'fill-current' : ''} />
                </button>
            </div>
        );
    };

    // ==========================
    //  検索タブ
    // ==========================
    const searchView = (
        <div className="w-full h-full flex flex-col">
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
                            <div className="flex items-center gap-3 mb-5 animate-fade-in">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}>
                                    <Footprints size={18} className="text-accent" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-primary text-lg leading-tight">おすすめコース</h2>
                                    <p className="text-[11px] text-slate-300 font-medium">{courses.length}件のプラン</p>
                                </div>
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
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary transition-colors mb-4 py-1 font-medium">
                        ← コース一覧に戻る
                    </button>

                    {/* コースヘッダー */}
                    <div className="mb-6 animate-fade-in">
                        {selectedCourse.theme && (
                            <div className="tag-badge mb-3">
                                <Sparkles size={10} /> {selectedCourse.theme.split(':')[0]}
                            </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="font-extrabold text-xl text-primary leading-tight flex-1">{selectedCourse.title}</h2>
                            <button onClick={() => isFavorite(selectedCourse.id) ? removeFavorite(selectedCourse.id) : addFavorite(selectedCourse)}
                                className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-300 active:scale-90 shrink-0
                                    ${isFavorite(selectedCourse.id) ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400'}`}
                                style={isFavorite(selectedCourse.id) ? { background: 'rgba(244,63,94,0.08)' } : { background: 'rgba(0,0,0,0.03)' }}>
                                <Heart size={20} className={isFavorite(selectedCourse.id) ? 'fill-current' : ''} />
                            </button>
                        </div>
                        <div className="flex gap-3 mt-2.5">
                            <span className="tag-badge"><Clock size={10} /> {selectedCourse.totalTime}分</span>
                            <span className="tag-badge"><MapPin size={10} /> {selectedCourse.spots.length}スポット</span>
                        </div>
                        {selectedCourse.description && (
                            <p className="text-sm text-slate-400 mt-3 leading-relaxed">{selectedCourse.description}</p>
                        )}
                    </div>

                    {/* タイムライン */}
                    <div className="relative pl-5 space-y-4">
                        <div className="absolute left-[7px] top-4 bottom-4 w-[2px] rounded-full"
                            style={{ background: 'linear-gradient(180deg, #e2b040, rgba(226,176,64,0.1))' }}></div>
                        {selectedCourse.spots.map((spot, index) => (
                            <div key={spot.id} className="relative pl-7 animate-slide-up"
                                style={{ animationDelay: `${index * 0.08}s`, animationFillMode: 'backwards' }}>
                                <div className="absolute left-0 top-5 w-4 h-4 rounded-full border-[3px] border-paper z-10 transition-transform group-hover:scale-125"
                                    style={{
                                        background: index === 0 ? 'linear-gradient(135deg, #e2b040, #f5d98b)'
                                            : index === selectedCourse.spots.length - 1 ? 'linear-gradient(135deg, #ef4444, #f87171)'
                                                : 'linear-gradient(135deg, #1a1a2e, #16213e)',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                    }}></div>

                                <div className="card-premium p-4 group">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-extrabold uppercase tracking-widest"
                                            style={{ color: index === 0 ? '#e2b040' : index === selectedCourse.spots.length - 1 ? '#ef4444' : '#94a3b8' }}>
                                            {index === 0 ? '✦ START' : index === selectedCourse.spots.length - 1 ? '✦ GOAL' : `SPOT ${index + 1}`}
                                        </span>
                                        <span className="tag-badge text-[9px]">{spot.category}</span>
                                    </div>

                                    <h4 className="font-bold text-base text-primary mb-1 group-hover:text-accent transition-colors">{spot.name}</h4>

                                    <div className="flex items-center gap-2 mb-2.5">
                                        <span className="flex items-center text-[10px] text-accent font-bold">
                                            <Star size={10} className="fill-current mr-0.5" /> {spot.rating || '-'}
                                        </span>
                                        <span className="text-[10px] text-slate-300">({spot.user_ratings_total || 0})</span>
                                    </div>

                                    {spot.tags.photo && (
                                        <div className="w-full h-32 mb-3 rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.03)' }}>
                                            <img src={spot.tags.photo} alt={spot.name} className="w-full h-full object-cover" />
                                        </div>
                                    )}

                                    <div className="text-xs text-slate-500 leading-relaxed rounded-2xl p-3.5 space-y-2.5"
                                        style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}>
                                        {(spot.travel_time_minutes ?? 0) > 0 && (
                                            <div className="flex items-center gap-2 text-[10px] text-slate-300 font-bold pb-2 mb-2"
                                                style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                                <Footprints size={12} /> 前のスポットから徒歩約{spot.travel_time_minutes}分
                                            </div>
                                        )}
                                        <p className="mb-2">{spot.aiDescription || spot.tags.description || "詳細情報なし"}</p>
                                        {spot.must_see && (
                                            <div className="p-3 rounded-xl" style={{ background: 'rgba(226,176,64,0.06)', border: '1px solid rgba(226,176,64,0.12)' }}>
                                                <span className="flex items-center gap-1 text-[10px] font-bold mb-0.5" style={{ color: '#b8860b' }}>
                                                    <Star size={10} /> 必見ポイント:
                                                </span>
                                                <span className="text-[10px] text-slate-600">{spot.must_see}</span>
                                            </div>
                                        )}
                                        {spot.pro_tip && (
                                            <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 mb-0.5">
                                                    <Sparkles size={10} /> 旅のヒント:
                                                </span>
                                                <span className="text-[10px] text-slate-600">{spot.pro_tip}</span>
                                            </div>
                                        )}
                                    </div>

                                    {spot.tags.opening_hours && (
                                        <div className="mt-2 text-[10px] text-emerald-500 font-medium">{spot.tags.opening_hours}</div>
                                    )}

                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 w-full text-[11px] font-bold py-2.5 rounded-xl transition-all active:scale-95 mt-3"
                                        style={{ background: 'rgba(0,0,0,0.03)', color: '#64748b', border: '1px solid rgba(0,0,0,0.04)' }}>
                                        <span className="text-blue-500 font-extrabold">G</span> Googleマップで見る
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    // ==========================
    //  地図タブ
    // ==========================
    const mapView = (
        <div className="w-full h-full">
            <MapVisualization center={center} radius={radius} spots={selectedCourse ? selectedCourse.spots : []} focusedSpot={focusedSpot} />
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
        <div className="relative w-full h-[100dvh] overflow-hidden flex flex-col" style={{ background: '#f5f0e8' }}>
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
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} coursesCount={courses.length} favoritesCount={favorites.length} />
        </div>
    );
}

export default App;
