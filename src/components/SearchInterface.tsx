import React, { useState } from 'react';
import { Search, MapPin, Clock, Compass, Navigation } from 'lucide-react';
import type { SearchParams } from '../types';

interface SearchInterfaceProps {
    onSearch: (params: SearchParams) => void;
}

const SearchInterface: React.FC<SearchInterfaceProps> = ({ onSearch }) => {
    const [query, setQuery] = useState('');
    const [radius, setRadius] = useState(1); // km
    const [duration, setDuration] = useState(180); // minutes (default 3h)
    const [isSearching, setIsSearching] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        onSearch({ query, radius: radius * 1000, duration });
        setTimeout(() => setIsSearching(false), 1000);
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* ヘッダー */}
            <div className="text-center pt-12 pb-6 px-6">
                <h1 className="text-4xl font-serif font-bold text-slate-800 mb-2">Meguru</h1>
                <p className="text-slate-400 text-sm">あなたのための、特別なよりみち。</p>
            </div>

            {/* フォーム */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-6 pb-6">
                <div className="flex-1 flex flex-col justify-center space-y-6">
                    {/* Location Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin size={14} /> 出発地点
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="例: 京都駅、浅草寺..."
                                className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-4 pl-11 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 placeholder-slate-400 text-base shadow-sm"
                            />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        </div>
                    </div>

                    {/* Radius Slider */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Compass size={14} /> 範囲: {radius}km
                        </label>
                        <input
                            type="range"
                            min="0.5"
                            max="7"
                            step="0.5"
                            value={radius}
                            onChange={(e) => setRadius(parseFloat(e.target.value))}
                            className="w-full accent-amber-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                            <span>0.5km</span>
                            <span>7.0km</span>
                        </div>
                    </div>

                    {/* Duration Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock size={14} /> 時間 (分)
                        </label>
                        <input
                            type="number"
                            min="30"
                            max="720"
                            step="30"
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value))}
                            className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-slate-700 text-base shadow-sm"
                        />
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={isSearching}
                    className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base font-bold rounded-2xl mt-6"
                >
                    {isSearching ? (
                        <span className="animate-pulse">作成中...</span>
                    ) : (
                        <>
                            <span>旅を始める</span>
                            <Navigation size={18} />
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SearchInterface;
