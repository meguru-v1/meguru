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

    // ===== 検索ハンドラ =====
    const handleSearch = async ({ query, radius: r, duration }: SearchParams) => {
        setLoading(true);
        setError(null);
        setCourses([]);
        setSelectedCourse(null);
        setStatus('場所を検索中...');

        try {
            let geoData;
            try {
                const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
                const photonData = await photonRes.json();
                if (photonData.features && photonData.features.length > 0) {
                    geoData = photonData.features.map((f: { geometry: { coordinates: number[] }; properties: { name?: string } }) => ({
                        lat: f.geometry.coordinates[1].toString(),
                        lon: f.geometry.coordinates[0].toString(),
                        display_name: f.properties.name || query
                    }));
                }
            } catch (photonError) {
                console.warn("Photon failed, trying Nominatim fallback:", photonError);
            }

            if (!geoData || geoData.length === 0) {
                try { geoData = await searchLocation(query); } catch (nomError) { console.warn("Nominatim also failed:", nomError); }
            }

            if (!geoData || geoData.length === 0) throw new Error("場所が見つかりませんでした。");

            const newCenter = { lat: parseFloat(geoData[0].lat), lon: parseFloat(geoData[0].lon) };
            setCenter(newCenter);
            setRadius(r);

            setStatus(`周辺スポットを探しています... (${r / 1000}km圏内)`);
            const allSpots = await fetchNearbySpots(newCenter.lat, newCenter.lon, r);
            if (allSpots.length < 5) throw new Error("周辺にスポットがあまり見つかりませんでした。");

            setStatus('AIが最適なコースを生成中...');
            const shuffled = [...allSpots];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const candidates = shuffled.slice(0, 150);

            let generatedCourses: Course[] = [];
            try { generatedCourses = await generateSmartCourses(candidates, newCenter, duration); }
            catch (aiError) { console.warn("AI Generation failed, falling back to heuristic:", aiError); }

            if (generatedCourses.length === 0) {
                setStatus('標準アルゴリズムでコース生成中...');
                generatedCourses = generateHeuristicCourses(newCenter, allSpots, duration);
            }

            if (generatedCourses.length === 0) throw new Error("条件に合うコースが作成できませんでした。");

            setCourses(generatedCourses);
            setActiveTab('courses'); // 検索完了後→モデルコースタブへ
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
        <div className="glass-panel p-4 text-red-500 text-sm font-medium animate-fade-in flex items-center gap-2 mx-4 mt-4">
            <AlertCircle size={16} /> {error}
        </div>
    ) : loading ? (
        <div className="flex flex-col items-center justify-center gap-4 text-slate-500 py-20 animate-slide-up">
            <Loader2 className="animate-spin text-slate-900 w-10 h-10" />
            <span className="text-sm font-medium">{status || '読み込み中...'}</span>
        </div>
    ) : null;

    // ===== コースカード =====
    const CourseCard = ({ course, onClick }: { course: Course; onClick: () => void }) => {
        const fav = isFavorite(course.id);
        return (
            <div
                onClick={onClick}
                className="relative p-4 rounded-2xl cursor-pointer transition-all duration-300 border border-slate-100 bg-white hover:shadow-lg group active:scale-[0.98]"
            >
                {course.theme && (
                    <div className="text-[10px] font-bold text-amber-600 mb-1.5 flex items-center gap-1">
                        <Sparkles size={10} /> {course.theme.split(':')[0]}
                    </div>
                )}
                <div className="flex justify-between items-start mb-2 pr-8">
                    <h4 className="font-bold text-base leading-tight group-hover:text-slate-900 transition-colors">{course.title}</h4>
                    <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-full whitespace-nowrap ml-2 shrink-0">
                        {course.totalTime} min
                    </span>
                </div>
                <p className="text-xs text-slate-500 mb-3 line-clamp-2">{course.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><MapPin size={10} /> {course.spots.length}スポット</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {course.totalTime}分</span>
                </div>
                {/* お気に入りボタン (右下) */}
                <button
                    onClick={(e) => { e.stopPropagation(); fav ? removeFavorite(course.id) : addFavorite(course); }}
                    aria-label={fav ? 'お気に入りから削除' : 'お気に入りに追加'}
                    className={`absolute bottom-4 right-4 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90
            ${fav ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-slate-50 text-slate-300 hover:text-rose-400 hover:bg-rose-50'}`}
                >
                    <Heart size={16} className={fav ? 'fill-current' : ''} />
                </button>
            </div>
        );
    };

    // ==========================
    //  検索タブ (全画面)
    // ==========================
    const searchView = (
        <div className="flex flex-col items-center justify-center min-h-full px-4 py-8">
            <SearchInterface onSearch={handleSearch} />
            {statusPanel}
        </div>
    );

    // ==========================
    //  モデルコースタブ (全画面)
    // ==========================
    const coursesView = (
        <div className="flex flex-col min-h-full">
            {/* コース一覧 */}
            {!selectedCourse && (
                <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 pb-20">
                    {courses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4 text-slate-400 py-20">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                                <Footprints size={36} className="text-slate-300" />
                            </div>
                            <div className="text-center">
                                <p className="font-medium text-slate-500 mb-1">まだコースがありません</p>
                                <p className="text-xs text-slate-400">「検索」タブから場所を検索してコースを生成しましょう</p>
                            </div>
                            <button onClick={() => setActiveTab('search')} className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm">
                                <Search size={16} /> 検索する
                            </button>
                        </div>
                    ) : (
                        <>
                            <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-lg">
                                <Footprints size={20} /> おすすめモデルコース ({courses.length})
                            </h2>
                            {loading && statusPanel}
                            <div className="space-y-3">
                                {courses.map(course => (
                                    <CourseCard key={course.id} course={course} onClick={() => handleSelectCourse(course)} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* コース詳細 */}
            {selectedCourse && (
                <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 pb-20">
                    {/* ヘッダー */}
                    <div className="mb-4">
                        <button
                            onClick={() => { setSelectedCourse(null); setFocusedSpot(null); }}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-3 py-1"
                        >
                            ← コース一覧に戻る
                        </button>
                        <div className="flex items-start justify-between gap-2">
                            <h2 className="font-extrabold text-xl text-slate-900 leading-tight flex-1">{selectedCourse.title}</h2>
                            <button
                                onClick={() => isFavorite(selectedCourse.id) ? removeFavorite(selectedCourse.id) : addFavorite(selectedCourse)}
                                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 shrink-0
                  ${isFavorite(selectedCourse.id) ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-slate-100 text-slate-400 hover:text-rose-400 hover:bg-rose-50'}`}
                            >
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
                    </div>

                    {/* タイムライン */}
                    <div className="relative pl-4 space-y-4 before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {selectedCourse.spots.map((spot, index) => (
                            <div key={spot.id} className="relative pl-6 group">
                                <div className="absolute left-0 top-1.5 w-3.5 h-3.5 bg-slate-900 rounded-full border-2 border-white shadow-sm group-hover:scale-125 transition-transform z-10"></div>

                                <div className="p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md hover:border-slate-200 transition-all">
                                    <div className="flex justify-between items-start">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                                            {index === 0 ? 'START' : index === selectedCourse.spots.length - 1 ? 'GOAL' : `SPOT ${index + 1}`}
                                        </span>
                                        <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded ml-2 shrink-0">
                                            {spot.category}
                                        </span>
                                    </div>

                                    <h4 className="font-bold text-base text-slate-800 mb-1 group-hover:text-amber-600 transition-colors">{spot.name}</h4>

                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="flex items-center text-[10px] text-amber-500 font-bold">
                                            <Star size={10} className="fill-current mr-0.5" /> {spot.rating || '-'}
                                        </span>
                                        <span className="text-[10px] text-slate-400">({spot.user_ratings_total})</span>
                                    </div>

                                    {spot.tags.photo && (
                                        <div className="w-full h-28 mb-3 rounded-lg overflow-hidden bg-slate-100">
                                            <img src={spot.tags.photo} alt={spot.name} className="w-full h-full object-cover" />
                                        </div>
                                    )}

                                    <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                                        {(spot.travel_time_minutes ?? 0) > 0 && (
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold border-b border-slate-100 pb-2 mb-2">
                                                <Footprints size={12} /> 前のスポットから徒歩約{spot.travel_time_minutes}分
                                            </div>
                                        )}
                                        <p className="mb-2">{spot.aiDescription || spot.tags.description || "詳細情報なし"}</p>
                                        {spot.must_see && (
                                            <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-100">
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 mb-0.5">
                                                    <Star size={10} /> 必見ポイント:
                                                </span>
                                                <span className="text-[10px] text-amber-900">{spot.must_see}</span>
                                            </div>
                                        )}
                                        {spot.pro_tip && (
                                            <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 mb-0.5">
                                                    <Sparkles size={10} /> 旅のヒント:
                                                </span>
                                                <span className="text-[10px] text-blue-900">{spot.pro_tip}</span>
                                            </div>
                                        )}
                                    </div>

                                    {spot.tags.opening_hours && (
                                        <div className="mt-2 text-[10px] text-green-600 font-medium">{spot.tags.opening_hours}</div>
                                    )}

                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-1.5 w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold py-2.5 rounded-lg transition-all shadow-sm hover:shadow active:scale-95 mt-3"
                                    >
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
    //  地図タブ (全画面)
    // ==========================
    const mapView = (
        <div className="w-full h-full">
            <MapVisualization
                center={center}
                radius={radius}
                spots={selectedCourse ? selectedCourse.spots : []}
                focusedSpot={focusedSpot}
            />
        </div>
    );

    // ==========================
    //  履歴タブ (全画面)
    // ==========================
    const favoritesView = (
        <div className="flex flex-col min-h-full px-4 py-4 pb-20">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                    <Heart size={20} className="text-rose-400 fill-current" /> お気に入りコース
                </h2>
                <span className="text-sm text-slate-400 font-medium">{favorites.length}件</span>
            </div>

            {favorites.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400 py-20">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                        <Heart size={36} className="text-slate-300" />
                    </div>
                    <div className="text-center">
                        <p className="font-medium text-slate-500 mb-1">まだお気に入りがありません</p>
                        <p className="text-xs text-slate-400">コース一覧の ♡ ボタンでお気に入り登録できます</p>
                    </div>
                    <button onClick={() => setActiveTab('search')} className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm">
                        <Search size={16} /> コースを探す
                    </button>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3">
                    {favorites.map(course => (
                        <div
                            key={course.id}
                            className="relative p-4 rounded-2xl bg-white border border-slate-100 hover:shadow-lg transition-all duration-200 group"
                        >
                            <div className="flex items-start justify-between mb-1">
                                {course.theme ? (
                                    <div className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                        <Sparkles size={10} /> {course.theme.split(':')[0]}
                                    </div>
                                ) : <div />}
                                <button
                                    onClick={() => removeFavorite(course.id)}
                                    aria-label="お気に入りから削除"
                                    className="text-slate-300 hover:text-rose-400 transition-colors p-1 rounded-full hover:bg-rose-50 active:scale-90"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <button onClick={() => handleSelectCourse(course, true)} className="w-full text-left">
                                <h3 className="font-bold text-slate-800 leading-tight mb-1 group-hover:text-amber-600 transition-colors pr-2">
                                    {course.title}
                                </h3>
                                <p className="text-xs text-slate-500 line-clamp-2 mb-2">{course.description}</p>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-2">
                                    <span className="flex items-center gap-1"><Clock size={10} /> {course.totalTime}分</span>
                                    <span className="flex items-center gap-1"><MapPin size={10} /> {course.spots.length}スポット</span>
                                </div>
                                <div className="flex items-center gap-1 overflow-hidden opacity-50">
                                    {course.spots.slice(0, 3).map((s, i) => (
                                        <span key={i} className="text-[10px] truncate max-w-[70px]">
                                            {s.name}{i < Math.min(course.spots.length, 3) - 1 ? ' →' : ''}
                                        </span>
                                    ))}
                                    {course.spots.length > 3 && <span className="text-[10px]">+{course.spots.length - 3}</span>}
                                </div>
                                {course.savedAt && (
                                    <div className="mt-2 text-[10px] text-slate-300">
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
        <div className="relative w-full h-[100dvh] bg-slate-50 overflow-hidden flex flex-col">

            {/* ===== メインコンテンツ: タブごとに全画面切り替え ===== */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'search' && (
                    <div className="w-full h-full overflow-y-auto scrollbar-hide bg-gradient-to-b from-slate-50 to-white">
                        {searchView}
                    </div>
                )}
                {activeTab === 'courses' && (
                    <div className="w-full h-full overflow-y-auto scrollbar-hide bg-white">
                        {coursesView}
                    </div>
                )}
                {activeTab === 'map' && (
                    <div className="w-full h-full">
                        {mapView}
                    </div>
                )}
                {activeTab === 'favorites' && (
                    <div className="w-full h-full overflow-y-auto scrollbar-hide bg-white">
                        {favoritesView}
                    </div>
                )}
            </div>

            {/* ===== タブバー ===== */}
            <TabBar
                activeTab={activeTab}
                onTabChange={handleTabChange}
                coursesCount={courses.length}
                favoritesCount={favorites.length}
            />

        </div>
    );
}

export default App;
