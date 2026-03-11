import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { fetchWikipediaImage } from '../lib/wikipedia';

interface SpotHeroImageProps {
    spotName: string;
    googlePhotoRef?: string;
    label: string;
    category: string;
    rating?: number;
    userRatings?: number;
    isFirst: boolean;
    isLast: boolean;
}

export default function SpotHeroImage({
    spotName,
    googlePhotoRef,
    label,
    category,
    rating,
    userRatings,
    isFirst,
    isLast
}: SpotHeroImageProps) {
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        
        async function loadPhoto() {
            setIsLoading(true);
            
            // 1. Wikipedia から高画質・代表的な写真を取得（最も関連性が高く品質が安定している）
            const wikiUrl = await fetchWikipediaImage(spotName, 1200);
            
            if (!isMounted) return;

            if (wikiUrl) {
                setImgUrl(wikiUrl);
            } else if (googlePhotoRef) {
                // 2. Wikipedia になければ Google Places Photos にフォールバック
                setImgUrl(`https://places.googleapis.com/v1/${googlePhotoRef}/media?maxWidthPx=1200&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`);
            } else {
                // 3. どちらもなければ null
                setImgUrl(null);
            }
            
            setIsLoading(false);
        }

        loadPhoto();

        return () => {
            isMounted = false;
        };
    }, [spotName, googlePhotoRef]);

    if (!imgUrl && !isLoading) {
        // 画像がない場合の代替ヘッダー
        return (
            <div className="mb-3 px-4 pt-4">
                <div className="flex items-center justify-between mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider ${isFirst ? 'bg-amber-100 text-amber-700' : isLast ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {label}
                    </span>
                    <span className="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full">{category}</span>
                </div>
                <h4 className="font-extrabold text-lg text-slate-800 mt-1">{spotName}</h4>
                <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center text-[11px] text-amber-500 font-bold">
                        <Star size={11} className="fill-current mr-0.5" /> {rating || '-'}
                    </span>
                    <span className="text-[10px] text-slate-400">({userRatings || 0}件)</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-44 overflow-hidden bg-slate-100">
            {imgUrl && (
                <img
                    src={imgUrl}
                    alt={spotName}
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
            <div className="absolute top-3 left-3">
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider shadow-sm ${isFirst ? 'bg-amber-400 text-white' : isLast ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-700'}`}>
                    {label}
                </span>
            </div>
            
            {/* カテゴリバッジ */}
            <div className="absolute top-3 right-3">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/80 backdrop-blur-sm shadow-sm text-slate-600">{category}</span>
            </div>
            
            {/* 写真上のスポット名 */}
            <div className="absolute bottom-3 left-4 right-4 z-10">
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
