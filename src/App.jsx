import React, { useState } from 'react';
import SearchInterface from './components/SearchInterface';
import MapVisualization from './components/MapVisualization'; // Leaflet
import { fetchNearbySpots } from './lib/osm';
import { generateSmartCourses } from './lib/gemini';
import { generateCourses as generateHeuristicCourses } from './lib/courseGenerator';
import { Loader2, Footprints, Clock, MapPin, Star, Sparkles } from 'lucide-react';

function App() {
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(1000);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [focusedSpot, setFocusedSpot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(''); // For granular loading status
  const [error, setError] = useState(null);

  const handleSearch = async ({ query, radius, duration }) => {
    setLoading(true);
    setError(null);
    setCourses([]);
    setSelectedCourse(null);
    setStatus('場所を検索中...'); // Searching location

    try {
      // 1. Geocode via OSM (Nominatim)
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const geoData = await geoRes.json();

      if (!geoData || geoData.length === 0) throw new Error("場所が見つかりませんでした。");

      const newCenter = { lat: parseFloat(geoData[0].lat), lon: parseFloat(geoData[0].lon) };
      setCenter(newCenter);
      setRadius(radius);

      // 2. Fetch Spots (Overpass)
      setStatus(`周辺スポットを探しています... (${radius / 1000}km圏内)`);
      const allSpots = await fetchNearbySpots(newCenter.lat, newCenter.lon, radius);
      if (allSpots.length < 5) throw new Error("周辺にスポットがあまり見つかりませんでした。");

      // 3. Generate Courses (Gemini)
      setStatus('AIが最適なコースを生成中...');

      // Fisher-Yates Shuffle for true randomness
      const shuffled = [...allSpots];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Select 150 candidates to ensure variety when radius changes
      // (Increased from 60 per user request)
      const candidates = shuffled.slice(0, 150);

      let generatedCourses = [];
      try {
        generatedCourses = await generateSmartCourses(candidates, newCenter, duration);
      } catch (aiError) {
        console.warn("AI Generation failed, falling back to heuristic:", aiError);
      }

      // Fallback if AI failed
      if (generatedCourses.length === 0) {
        setStatus('標準アルゴリズムでコース生成中...');
        generatedCourses = generateHeuristicCourses(newCenter, allSpots, duration);
      }

      if (generatedCourses.length === 0) {
        throw new Error("条件に合うコースが作成できませんでした。");
      }

      setCourses(generatedCourses);
      setSelectedCourse(generatedCourses[0]);

    } catch (err) {
      console.error(err);
      setError(err.message || "検索中にエラーが発生しました。");
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-50 overflow-hidden flex flex-col md:flex-row">

      {/* Sidebar Overlay */}
      <div className="absolute top-0 left-0 w-full md:w-[420px] z-[500] p-4 md:h-full pointer-events-none flex flex-col">
        <div className="pointer-events-auto flex flex-col gap-4 max-h-full">
          <SearchInterface onSearch={handleSearch} />

          {/* Status / Error */}
          {error && (
            <div className="glass-panel p-4 text-red-500 text-sm font-medium animate-fade-in border-red-100 flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {loading && (
            <div className="glass-panel p-6 flex flex-col items-center justify-center gap-3 text-slate-600 animate-slide-up">
              <Loader2 className="animate-spin text-slate-900 w-8 h-8" />
              <span className="text-sm font-medium">{status || '読み込み中...'}</span>
            </div>
          )}

          {/* Results Area */}
          {(!loading && (courses.length > 0 || selectedCourse)) && (
            <div className="glass-panel p-4 animate-slide-up flex-1 overflow-y-auto min-h-0 relative scrollbar-hide">

              {/* 1. Course List */}
              {!selectedCourse && (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur z-10 py-2">
                    <Footprints size={18} /> おすすめモデルコース ({courses.length})
                  </h3>
                  <div className="space-y-3">
                    {courses.map(course => (
                      <div
                        key={course.id}
                        onClick={() => setSelectedCourse(course)}
                        className="p-4 rounded-xl cursor-pointer transition-all duration-300 border-2 bg-white text-slate-700 border-transparent hover:border-slate-200 hover:shadow-md group"
                      >
                        {course.theme && (
                          <div className="text-[10px] font-bold text-amber-600 mb-1 flex items-center gap-1">
                            <Sparkles size={10} /> {course.theme.split(':')[0]}
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-lg leading-tight group-hover:text-slate-900 transition-colors">{course.title}</h4>
                          <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-full whitespace-nowrap">
                            {course.totalTime} min
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{course.description}</p>
                        <div className="flex items-center gap-1 overflow-hidden opacity-60">
                          {course.spots.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-[10px] truncate max-w-[60px]">
                              {s.name} {i < course.spots.length - 1 && '→'}
                            </span>
                          ))}
                          {course.spots.length > 3 && <span className="text-[10px]">+ more</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Course Detail */}
              {selectedCourse && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="sticky top-0 bg-white/95 backdrop-blur z-10 py-2 border-b border-slate-100 mb-2">
                    <button
                      onClick={() => { setSelectedCourse(null); setFocusedSpot(null); }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-2"
                    >
                      ← コース一覧に戻る
                    </button>
                    <h3 className="font-extrabold text-xl text-slate-900 leading-tight">{selectedCourse.title}</h3>
                    <div className="flex gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Clock size={12} /> {selectedCourse.totalTime}分</span>
                      <span className="flex items-center gap-1"><MapPin size={12} /> {selectedCourse.spots.length}スポット</span>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="relative pl-4 space-y-6 before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {selectedCourse.spots.map((spot, index) => (
                      <div
                        key={spot.id}
                        className="relative pl-6 cursor-pointer group"
                        onClick={() => setFocusedSpot(spot)}
                      >
                        <div className="absolute left-0 top-1.5 w-3.5 h-3.5 bg-slate-900 rounded-full border-2 border-white shadow-sm group-hover:scale-125 transition-transform z-10"></div>

                        <div className="p-3 rounded-lg border border-slate-100 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                              {index === 0 ? 'START' : index === selectedCourse.spots.length - 1 ? 'GOAL' : `SPOT ${index + 1}`}
                            </span>
                            <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded ml-2 shrink-0">
                              {spot.category}
                            </span>
                          </div>

                          <h4 className="font-bold text-slate-800 mb-1 group-hover:text-amber-600 transition-colors">{spot.name}</h4>

                          <div className="flex items-center gap-2 mb-2">
                            <span className="flex items-center text-[10px] text-amber-500 font-bold">
                              <Star size={10} className="fill-current mr-0.5" /> {spot.rating || '-'}
                            </span>
                            <span className="text-[10px] text-slate-400">({spot.user_ratings_total})</span>
                          </div>

                          {spot.tags.photo && (
                            <div className="w-full h-24 mb-2 rounded-lg overflow-hidden bg-slate-100">
                              <img src={spot.tags.photo} alt={spot.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          {/* AI Description & Rich Content */}
                          <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">

                            {/* Travel Time */}
                            {spot.travel_time_minutes > 0 && (
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold border-b border-slate-100 pb-2 mb-2">
                                <Footprints size={12} /> 前のスポットから徒歩約{spot.travel_time_minutes}分
                              </div>
                            )}

                            {/* Description */}
                            <p className="mb-2">
                              {spot.aiDescription || spot.tags.description || "詳細情報なし"}
                            </p>

                            {/* Must See */}
                            {spot.must_see && (
                              <div className="bg-amber-50 p-2 rounded border border-amber-100">
                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 mb-0.5">
                                  <Star size={10} /> 必見ポイント:
                                </span>
                                <span className="text-[10px] text-amber-900">{spot.must_see}</span>
                              </div>
                            )}

                            {/* Pro Tip */}
                            {spot.pro_tip && (
                              <div className="bg-blue-50 p-2 rounded border border-blue-100">
                                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 mb-0.5">
                                  <Sparkles size={10} /> 旅のヒント:
                                </span>
                                <span className="text-[10px] text-blue-900">{spot.pro_tip}</span>
                              </div>
                            )}
                          </div>

                          {spot.tags.opening_hours && (
                            <div className="mt-2 text-[10px] text-green-600 font-medium mb-2">
                              {spot.tags.opening_hours}
                            </div>
                          )}

                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()} // Prevent triggering spot focus
                            className="flex items-center justify-center gap-1.5 w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold py-2 rounded-lg transition-all shadow-sm hover:shadow active:scale-95"
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
          )}
        </div>
      </div>

      {/* Main Map (Leaflet) */}
      <div className="flex-1 h-full w-full">
        <MapVisualization
          center={center}
          radius={radius}
          spots={selectedCourse ? selectedCourse.spots : []}
          focusedSpot={focusedSpot}
        />
      </div>

    </div>
  );
}

export default App;
