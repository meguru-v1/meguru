import React, { useState, useEffect } from 'react';
import { Star, Camera, Building, Crown, Globe, Landmark } from 'lucide-react';
import { buildPlacePhotoUrl, buildStreetViewUrl } from '../lib/safeUrl';

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
    const [hasError, setHasError] = useState(false);
    const [triedFallback, setTriedFallback] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        setHasError(false);
        // photo参照が不正な形式なら外観モードにフォールバック
        const photoUrl = viewMode === 'photo' ? buildPlacePhotoUrl(googlePhotoRef, 1200) : undefined;
        if (photoUrl) {
            setImgUrl(photoUrl);
        } else {
            // 外観モード（ストリートビュー API）
            setImgUrl(buildStreetViewUrl(lat, lng) ?? null);
        }
    }, [viewMode, googlePhotoRef, lat, lng]);

    // 画像エラー時: 写真モードならストリートビューにフォールバック → それも失敗なら和柄プレースホルダ
    const handleError = () => {
        if (viewMode === 'photo' && !triedFallback) {
            setTriedFallback(true);
            setViewMode('exterior');
        } else {
            setHasError(true);
            setIsLoading(false);
        }
    };

    return (
        <div className="relative w-full h-44 overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
            {imgUrl && !hasError && (
                <img
                    key={imgUrl}
                    src={imgUrl}
                    alt={viewMode === 'exterior' ? `${spotName}の外観` : spotName}
                    className={`w-full h-full object-cover transition-all duration-700 ${isLoading ? 'opacity-0 scale-105' : 'opacity-100 group-hover:scale-105'}`}
                    loading="lazy"
                    onLoad={() => setIsLoading(false)}
                    onError={handleError}
                />
            )}

            {/* 和柄プレースホルダ（画像取得失敗時） */}
            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center"
                    style={{
                        background: `linear-gradient(135deg, #f7f3eb 0%, #e8dcc4 50%, #d4c19c 100%)`,
                        backgroundImage: `radial-gradient(circle at 20% 30%, rgba(196,151,47,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(166,121,75,0.12) 0%, transparent 50%)`
                    }}>
                    <div className="text-center">
                        <div className="text-5xl mb-1 opacity-30 font-serif" style={{ color: 'var(--wa-sumi)' }}>◯</div>
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50" style={{ color: 'var(--wa-sumi)' }}>侘 寂</p>
                    </div>
                </div>
            )}

            {/* 読み込み中のスケルトン */}
            {isLoading && !hasError && (
                <div className="absolute inset-0 animate-pulse flex items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--wa-accent)' }}></div>
                </div>
            )}

            {/* グラデーションオーバーレイ */}
            <div className="absolute inset-0" style={{
                background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6) 100%)'
            }} />
            
            {/* ラベルバッジ */}
            <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider shadow-sm text-white`}
                    style={{ background: isFirst ? 'var(--wa-accent)' : isLast ? 'var(--wa-sumi)' : 'rgba(255,255,255,0.9)', color: (!isFirst && !isLast) ? 'var(--text-primary)' : 'white' }}>
                    {label}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-sm shadow-sm"
                    style={{ background: 'rgba(255,255,255,0.8)', color: 'var(--text-secondary)' }}>
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
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewMode === 'photo' ? 'shadow-sm' : 'text-white/70 hover:text-white'}`}
                        style={viewMode === 'photo' ? { background: 'var(--bg-card)', color: 'var(--text-primary)' } : {}}
                    >
                        <Camera size={12} /> 写真
                    </button>
                )}
                <button
                    onClick={(e) => { e.preventDefault(); setViewMode('exterior'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${viewMode === 'exterior' ? 'shadow-sm' : 'text-white/70 hover:text-white'}`}
                    style={viewMode === 'exterior' ? { background: 'var(--bg-card)', color: 'var(--text-primary)' } : {}}
                >
                    <Building size={12} /> 外観
                </button>
            </div>
            
            {/* 写真上のスポット名 */}
            <div className="absolute bottom-3 left-4 right-4 z-10 pointer-events-none">
                <h4 className="text-lg font-bold font-serif text-white leading-tight drop-shadow-md">{spotName}</h4>
                <div className="flex items-center gap-2 mt-1 drop-shadow">
                    <span className="flex items-center text-[11px] font-bold" style={{ color: '#F59E0B' }}>
                        <Star size={11} className="fill-current mr-0.5" /> {rating || '-'}
                    </span>
                    <span className="text-[10px] text-white/80">({userRatings || 0}件)</span>
                </div>
            </div>
        </div>
    );
}
