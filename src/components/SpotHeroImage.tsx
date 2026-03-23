import React, { useState, useEffect } from 'react';
import { Star, Camera, Building, Crown, Globe, Landmark } from 'lucide-react';

interface SpotHeroImageProps {
    spotName: string;
    googlePhotoRef?: string;
    lat: number;
    lng: number;
    label: string;
    category: string;
    rating?: number;
    userRatings?: number;
    isFirst: boolean;
    isLast: boolean;
    culturalProperty?: string | null;
}

export default function SpotHeroImage({
    spotName,
    googlePhotoRef,
    lat,
    lng,
    label,
    category,
    rating,
    userRatings,
    isFirst,
    isLast,
    culturalProperty
}: SpotHeroImageProps) {
    // googlePhotoRefがない場合は最初から外観モードにする
    const [viewMode, setViewMode] = useState<'photo' | 'exterior'>(googlePhotoRef ? 'photo' : 'exterior');
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        if (viewMode === 'photo' && googlePhotoRef) {
            setImgUrl(`https://places.googleapis.com/v1/${googlePhotoRef}/media?maxWidthPx=1200&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`);
        } else {
            // 外観モード（ストリートビュー API）
            setImgUrl(`https://maps.googleapis.com/maps/api/streetview?size=1200x800&location=${lat},${lng}&fov=90&heading=235&pitch=10&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`);
        }
    }, [viewMode, googlePhotoRef, lat, lng]);

    return (
        <div className="relative w-full h-44 overflow-hidden bg-slate-100">
            {imgUrl && (
                <img
                    key={imgUrl}
                    src={imgUrl}
                    alt={viewMode === 'exterior' ? `${spotName}の外観` : spotName}
                    className={`w-full h-full object-cover transition-all duration-700 ${isLoading ? 'opacity-0 scale-105' : 'opacity-100 group-hover:scale-105'}`}
                    loading="lazy"
                    onLoad={() => setIsLoading(false)}
                />
            )}
            
            {/* 読み込み中のスケルトン */}
            {isLoading && (
                <div className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-amber-400 rounded-full animate-spin"></div>
                </div>
            )}

            {/* グラデーションオーバーレイ */}
            <div className="absolute inset-0" style={{
                background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6) 100%)'
            }} />
            
            {/* ラベルバッジ */}
            <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider shadow-sm ${isFirst ? 'bg-amber-400 text-white' : isLast ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-700'}`}>
                    {label}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/80 backdrop-blur-sm shadow-sm text-slate-600">
                    {category}
                </span>
                {culturalProperty && (
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider shadow-lg flex items-center gap-1 backdrop-blur-sm
                        ${culturalProperty.includes('国宝') ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-white' 
                        : culturalProperty.includes('世界遺産') ? 'bg-gradient-to-r from-blue-800 to-indigo-900 text-white'
                        : culturalProperty.includes('重要文化財') ? 'bg-gradient-to-r from-red-700 to-rose-800 text-white'
                        : 'bg-gradient-to-r from-teal-600 to-emerald-700 text-white'}`}>
                        {culturalProperty.includes('国宝') && <Crown size={10} />}
                        {culturalProperty.includes('世界遺産') && <Globe size={10} />}
                        {(culturalProperty.includes('重要文化財') || culturalProperty.includes('日本遺産')) && <Landmark size={10} />}
                        {culturalProperty}
                    </span>
                )}
            </div>
            
            {/* モード切替トグル */}
            <div className="absolute top-2 right-2 flex bg-black/40 backdrop-blur-md rounded-lg p-0.5 z-20">
                {googlePhotoRef && (
                    <button
                        onClick={(e) => { e.preventDefault(); setViewMode('photo'); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewMode === 'photo' ? 'bg-white text-slate-800 shadow-sm' : 'text-white/70 hover:text-white'}`}
                    >
                        <Camera size={12} /> 写真
                    </button>
                )}
                <button
                    onClick={(e) => { e.preventDefault(); setViewMode('exterior'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewMode === 'exterior' ? 'bg-white text-slate-800 shadow-sm' : 'text-white/70 hover:text-white'}`}
                >
                    <Building size={12} /> 外観
                </button>
            </div>
            
            {/* 写真上のスポット名 */}
            <div className="absolute bottom-3 left-4 right-4 z-10 pointer-events-none">
                <h4 className="text-lg font-extrabold text-white leading-tight drop-shadow-md">{spotName}</h4>
                <div className="flex items-center gap-2 mt-1 drop-shadow">
                    <span className="flex items-center text-[11px] text-amber-300 font-bold">
                        <Star size={11} className="fill-current mr-0.5" /> {rating || '-'}
                    </span>
                    <span className="text-[10px] text-white/80">({userRatings || 0}件)</span>
                </div>
            </div>
        </div>
    );
}
