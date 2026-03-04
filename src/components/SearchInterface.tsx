import React, { useState } from 'react';
import { Search, MapPin, Clock, Compass, Navigation, ArrowRight, Car, Footprints, Bike, Train } from 'lucide-react';
import type { SearchParams, SearchMode, TravelMode } from '../types';

interface SearchInterfaceProps {
    onSearch: (params: SearchParams) => void;
}

const TRAVEL_MODES: { id: TravelMode; label: string; icon: React.ElementType; speed: string }[] = [
    { id: 'walk', label: '徒歩', icon: Footprints, speed: '~5km/h' },
    { id: 'bicycle', label: '自転車', icon: Bike, speed: '~15km/h' },
    { id: 'transit', label: '公共交通', icon: Train, speed: '' },
    { id: 'car', label: '車', icon: Car, speed: '~40km/h' },
];

const SearchInterface: React.FC<SearchInterfaceProps> = ({ onSearch }) => {
    const [searchMode, setSearchMode] = useState<SearchMode>('area');
    const [query, setQuery] = useState('');
    const [destination, setDestination] = useState('');
    const [radius, setRadius] = useState(1);
    const [duration, setDuration] = useState(180);
    const [travelMode, setTravelMode] = useState<TravelMode>('walk');
    const [isSearching, setIsSearching] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        if (searchMode === 'route' && !destination.trim()) return;

        setIsSearching(true);
        onSearch({
            searchMode,
            query,
            radius: radius * 1000,
            duration,
            destination: searchMode === 'route' ? destination : undefined,
            travelMode: searchMode === 'route' ? travelMode : undefined,
        });
        setTimeout(() => setIsSearching(false), 1000);
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* ヘッダー */}
            <div className="text-center pt-10 pb-4 px-6">
                <h1 className="text-4xl font-serif font-bold text-slate-800 mb-1">Meguru</h1>
                <p className="text-slate-400 text-sm">あなたのための、特別なよりみち。</p>
            </div>

            {/* モード切り替えタブ */}
            <div className="px-6 mb-4">
                <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                    <button
                        type="button"
                        onClick={() => setSearchMode('area')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200
                            ${searchMode === 'area'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        <Compass size={14} className="inline mr-1.5 -mt-0.5" />
                        エリア検索
                    </button>
                    <button
                        type="button"
                        onClick={() => setSearchMode('route')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200
                            ${searchMode === 'route'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        <ArrowRight size={14} className="inline mr-1.5 -mt-0.5" />
                        ルート検索
                    </button>
                </div>
            </div>

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-6 pb-4">
                <div className="flex-1 flex flex-col justify-center space-y-5">

                    {/* === エリア検索モード === */}
                    {searchMode === 'area' && (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <MapPin size={14} /> 出発地点
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="例: 京都駅、浅草寺..."
                                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3.5 pl-11 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 placeholder-slate-400 text-base shadow-sm"
                                    />
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Compass size={14} /> 範囲: {radius}km
                                </label>
                                <input
                                    type="range" min="0.5" max="7" step="0.5"
                                    value={radius}
                                    onChange={(e) => setRadius(parseFloat(e.target.value))}
                                    className="w-full accent-amber-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                    <span>0.5km</span><span>7.0km</span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock size={14} /> 時間 (分)
                                </label>
                                <input
                                    type="number" min="30" max="720" step="30"
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value))}
                                    className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 text-base shadow-sm"
                                />
                            </div>
                        </>
                    )}

                    {/* === ルート検索モード === */}
                    {searchMode === 'route' && (
                        <>
                            {/* 出発地 → 目的地 */}
                            <div className="space-y-3">
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 flex flex-col items-center justify-center gap-0 pointer-events-none z-10">
                                        <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow"></div>
                                        <div className="w-0.5 h-6 bg-slate-200"></div>
                                        <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow"></div>
                                    </div>
                                    <div className="space-y-2 pl-10">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">出発地</label>
                                            <input
                                                type="text"
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                placeholder="例: 東京駅"
                                                className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 placeholder-slate-400 text-sm shadow-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">目的地</label>
                                            <input
                                                type="text"
                                                value={destination}
                                                onChange={(e) => setDestination(e.target.value)}
                                                placeholder="例: 渋谷駅"
                                                className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 placeholder-slate-400 text-sm shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 移動方法 */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    移動方法
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {TRAVEL_MODES.map(mode => {
                                        const isActive = travelMode === mode.id;
                                        return (
                                            <button
                                                key={mode.id}
                                                type="button"
                                                onClick={() => setTravelMode(mode.id)}
                                                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all duration-200 active:scale-95
                                                    ${isActive
                                                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                                                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                                                    }`}
                                            >
                                                <mode.icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                                                <span className="text-[10px] font-bold">{mode.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 時間 */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock size={14} /> よりみち時間 (分)
                                </label>
                                <input
                                    type="number" min="30" max="720" step="30"
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value))}
                                    className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 text-base shadow-sm"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={isSearching}
                    className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base font-bold rounded-2xl mt-4"
                >
                    {isSearching ? (
                        <span className="animate-pulse">作成中...</span>
                    ) : (
                        <>
                            <span>{searchMode === 'area' ? '旅を始める' : 'ルートを作成'}</span>
                            <Navigation size={18} />
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SearchInterface;
