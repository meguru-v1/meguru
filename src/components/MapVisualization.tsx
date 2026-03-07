import React, { useEffect, useState, useRef } from 'react';
import { Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { Spot } from '../types';

const CATEGORY_STYLES: Record<string, { icon: string, color: string, background: string }> = {
    'グルメ': { icon: '🍽️', color: '#fff', background: '#F59E0B' }, // amber-500
    'カフェ': { icon: '☕', color: '#fff', background: '#D97706' }, // amber-600
    'スイーツ': { icon: '🍰', color: '#fff', background: '#D97706' }, // amber-600
    '寺社仏閣': { icon: '⛩️', color: '#fff', background: '#10B981' }, // emerald-500
    '神社': { icon: '⛩️', color: '#fff', background: '#10B981' }, // emerald-500
    '歴史': { icon: '🏯', color: '#fff', background: '#8B5CF6' }, // violet-500
    '文化': { icon: '🏺', color: '#fff', background: '#8B5CF6' }, // violet-500
    '自然': { icon: '🌳', color: '#fff', background: '#84CC16' }, // lime-500
    '公園': { icon: '⛲', color: '#fff', background: '#84CC16' }, // lime-500
    'ショッピング': { icon: '🛍️', color: '#fff', background: '#EC4899' }, // pink-500
    'エンタメ': { icon: '🎢', color: '#fff', background: '#F43F5E' }, // rose-500
    'レジャー': { icon: '🎡', color: '#fff', background: '#F43F5E' }, // rose-500
    '観光': { icon: '📸', color: '#fff', background: '#0EA5E9' }, // sky-500
    '温泉': { icon: '♨️', color: '#fff', background: '#06B6D4' }, // cyan-500
    '宿泊': { icon: '🏨', color: '#fff', background: '#6366F1' }, // indigo-500
    'default': { icon: '📍', color: '#fff', background: '#64748B' } // slate-500
};

const getCategoryStyle = (category: string) => {
    let style = CATEGORY_STYLES['default'];
    for (const [key, value] of Object.entries(CATEGORY_STYLES)) {
        if (category && category.includes(key)) {
            style = value;
            break;
        }
    }
    return style;
};

// Route component connecting points via Directions API
const DirectionsComponent = ({ spots, travelMode }: { spots: Spot[], travelMode: string }) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService>();
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer>();
    const [routes, setRoutes] = useState<google.maps.DirectionsRoute[]>([]);

    // Initialize service and renderer
    useEffect(() => {
        if (!routesLibrary || !map) return;
        setDirectionsService(new routesLibrary.DirectionsService());
        setDirectionsRenderer(new routesLibrary.DirectionsRenderer({
            map,
            suppressMarkers: true, // We draw our own AdvancedMarkers
            polylineOptions: {
                strokeColor: '#0F172A',
                strokeWeight: 4,
                strokeOpacity: 0.8,
            }
        }));
    }, [routesLibrary, map]);

    // Request directions
    useEffect(() => {
        if (!directionsService || !directionsRenderer || spots.length < 2) return;

        let googleTravelMode = google.maps.TravelMode.WALKING;
        if (travelMode === 'bicycle') googleTravelMode = google.maps.TravelMode.BICYCLING;
        if (travelMode === 'car') googleTravelMode = google.maps.TravelMode.DRIVING;
        if (travelMode === 'transit') googleTravelMode = google.maps.TravelMode.TRANSIT;

        const origin = { lat: spots[0].lat, lng: spots[0].lon };
        const destination = { lat: spots[spots.length - 1].lat, lng: spots[spots.length - 1].lon };
        const waypoints = spots.slice(1, -1).map(spot => ({
            location: { lat: spot.lat, lng: spot.lon },
            stopover: true
        }));

        directionsService.route({
            origin,
            destination,
            waypoints,
            travelMode: googleTravelMode,
        }).then(response => {
            directionsRenderer.setDirections(response);
            setRoutes(response.routes);
        }).catch(e => {
            console.error('Directions routing failed:', e);
            // Fallback clear
            directionsRenderer.setDirections({ routes: [] } as any);
        });

        return () => { directionsRenderer.setDirections({ routes: [] } as any); }
    }, [directionsService, directionsRenderer, spots, travelMode]);

    return null;
};

interface MapVisualizationProps {
    center: { lat: number; lon: number } | null;
    radius: number; // For circle around center
    spots: Spot[];
    focusedSpot: Spot | null;
    travelMode?: string;
}

const MapVisualization: React.FC<MapVisualizationProps> = ({ center, radius, spots, focusedSpot, travelMode = "walk" }) => {
    const defaultCenter = { lat: 34.9858, lng: 135.7588 }; // Kyoto default
    const mapCenter = center ? { lat: center.lat, lng: center.lon } : defaultCenter;

    // We keep track of popup state internally for custom markers
    const [openPopupId, setOpenPopupId] = useState<string | number | null>(null);

    // Sync focusedSpot from parent
    useEffect(() => {
        if (focusedSpot) setOpenPopupId(focusedSpot.id);
    }, [focusedSpot]);

    return (
        <div className="w-full h-full relative rounded-2xl overflow-hidden shadow-inner border border-slate-200">
            <Map
                defaultZoom={14}
                defaultCenter={mapCenter}
                center={focusedSpot ? { lat: focusedSpot.lat, lng: focusedSpot.lon } : mapCenter}
                mapId="DEMO_MAP_ID" // Must have Map ID for AdvancedMarker!
                gestureHandling={'greedy'}
                disableDefaultUI={true}
                className="w-full h-full z-0 bg-slate-50"
            >
                {/* AdvancedMarkers for each Spot */}
                {spots.map((spot, index) => {
                    const style = getCategoryStyle(spot.category);
                    const isFocused = openPopupId === spot.id;

                    return (
                        <AdvancedMarker
                            key={spot.id}
                            position={{ lat: spot.lat, lng: spot.lon }}
                            onClick={() => setOpenPopupId(spot.id)}
                            zIndex={isFocused ? 100 : index + 1}
                        >
                            {/* Custom HTML Marker using Pin or Div */}
                            <div className="relative group cursor-pointer" style={{ transform: isFocused ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }}>
                                <Pin
                                    background={style.background}
                                    borderColor={'#ffffff'}
                                    glyphColor={'#ffffff'}
                                    scale={isFocused ? 1.2 : 1.0}
                                >
                                    <span style={{ fontSize: isFocused ? '18px' : '14px', lineHeight: 1 }}>{style.icon}</span>
                                </Pin>
                                <div className="absolute -top-2 -right-2 bg-slate-900 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10">
                                    {index + 1}
                                </div>

                                {/* Info Popup Rendered as sibling in DOM over the marker */}
                                {isFocused && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 p-3 z-50 pointer-events-auto">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                #{index + 1}
                                            </span>
                                            <span className="text-[10px] uppercase font-bold text-slate-400">{spot.category}</span>
                                        </div>
                                        <h3 className="font-bold text-slate-800 text-sm mb-1 leading-tight">{spot.name}</h3>

                                        <div className="flex items-center gap-2 mb-2">
                                            {spot.rating && (
                                                <span className="flex items-center text-xs text-amber-500 font-bold">
                                                    <span>★</span> {spot.rating}
                                                </span>
                                            )}
                                            {spot.user_ratings_total != null && spot.user_ratings_total > 0 && (
                                                <span className="text-[10px] text-slate-400">({spot.user_ratings_total})</span>
                                            )}
                                        </div>

                                        {(spot.tags.photo || (spot.photos && spot.photos.length > 0)) && (
                                            <div className="w-full h-24 mb-2 rounded-lg overflow-hidden bg-slate-100">
                                                <img
                                                    src={spot.photos?.[0] ? `https://places.googleapis.com/v1/${spot.photos[0]}/media?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&maxWidthPx=400` : spot.tags.photo}
                                                    alt={spot.name}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                            </div>
                                        )}
                                        {spot.tags.description && (
                                            <p className="text-[10px] text-slate-500 line-clamp-2 mb-1">{spot.tags.description}</p>
                                        )}
                                        {spot.tags.opening_hours && (
                                            <div className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-1 rounded inline-block">
                                                {spot.tags.opening_hours}
                                            </div>
                                        )}

                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-1.5 w-full mt-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold py-2 rounded-lg transition-all shadow-sm active:scale-95"
                                        >
                                            <span className="text-blue-500 font-extrabold">G</span> Googleマップで開く
                                        </a>
                                        {/* Popup closing arrow */}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-solid border-t-white border-t-8 border-x-transparent border-x-8 border-b-0" />
                                    </div>
                                )}
                            </div>
                        </AdvancedMarker>
                    );
                })}

                <DirectionsComponent spots={spots} travelMode={travelMode} />
            </Map>
        </div>
    );
};

export default MapVisualization;
