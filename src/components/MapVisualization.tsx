import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Spot } from '../types';

// Fix Leaflet marker icons in React
// @ts-expect-error Leaflet internal
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createNumberedIcon = (number: number, isStart: boolean, isEnd: boolean, isFocused: boolean) => {
    const bgColor = isStart ? '#F59E0B' : isEnd ? '#EF4444' : '#0F172A';
    const size = isFocused ? 32 : 26;
    const fontSize = isFocused ? 14 : 11;
    const border = isFocused ? '3px solid white' : '2px solid white';
    const shadow = isFocused ? '0 0 12px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.3)';

    return L.divIcon({
        className: 'custom-numbered-marker',
        html: `<div style="
            width:${size}px;height:${size}px;
            background:${bgColor};
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:800;font-size:${fontSize}px;
            border:${border};
            box-shadow:${shadow};
            transition:transform 0.2s;
            font-family:'Noto Sans JP',sans-serif;
        ">${number}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 4],
    });
};

const startIcon = L.divIcon({
    className: 'custom-start-marker',
    html: `<div style="
        width:20px;height:20px;
        background:#6366F1;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        border:2px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "><div style="width:6px;height:6px;background:white;border-radius:50%;"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14],
});

interface MapControllerProps {
    center: [number, number];
    zoom: number;
    focusedSpot: Spot | null;
}

const MapController: React.FC<MapControllerProps> = ({ center, zoom, focusedSpot }) => {
    const map = useMap();

    useEffect(() => {
        if (center) map.flyTo(center, zoom, { duration: 1.5 });
    }, [center, zoom, map]);

    useEffect(() => {
        if (focusedSpot) {
            map.flyTo([focusedSpot.lat, focusedSpot.lon], 17, { duration: 1.5 });
        }
    }, [focusedSpot, map]);

    return null;
};

interface MapVisualizationProps {
    center: { lat: number; lon: number } | null;
    radius: number;
    spots: Spot[];
    focusedSpot: Spot | null;
}

const MapVisualization: React.FC<MapVisualizationProps> = ({ center, radius, spots, focusedSpot }) => {
    const mapCenter = center || { lat: 34.9858, lon: 135.7588 };
    const zoomLevel = 14;

    const markerRefs = React.useRef<Record<string | number, L.Marker>>({});

    useEffect(() => {
        if (focusedSpot && markerRefs.current[focusedSpot.id]) {
            markerRefs.current[focusedSpot.id].openPopup();
        }
    }, [focusedSpot]);

    const routePositions = spots.map(s => [s.lat, s.lon] as [number, number]);
    const fullRoute: [number, number][] = center
        ? [[center.lat, center.lon], ...routePositions]
        : routePositions;

    const spotIcons = useMemo(() => {
        return spots.map((spot, index) =>
            createNumberedIcon(
                index + 1,
                index === 0,
                index === spots.length - 1,
                !!(focusedSpot && focusedSpot.id === spot.id)
            )
        );
    }, [spots, focusedSpot]);

    return (
        <div className="w-full h-full relative rounded-2xl overflow-hidden shadow-inner border border-slate-200">
            <MapContainer
                center={[mapCenter.lat, mapCenter.lon]}
                zoom={zoomLevel}
                scrollWheelZoom={true}
                className="w-full h-full z-0"
                style={{ background: '#f8fafc' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />

                {center && (
                    <>
                        <Circle
                            center={[center.lat, center.lon]}
                            radius={radius}
                            pathOptions={{ color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.05, weight: 1, dashArray: '5, 5' }}
                        />
                        <Marker position={[center.lat, center.lon]} icon={startIcon}>
                            <Popup>出発地点</Popup>
                        </Marker>
                        <MapController center={[center.lat, center.lon]} zoom={zoomLevel} focusedSpot={focusedSpot} />
                    </>
                )}

                {fullRoute.length > 1 && (
                    <Polyline
                        positions={fullRoute}
                        pathOptions={{ color: '#0F172A', weight: 3, opacity: 0.6, dashArray: '8, 8' }}
                    />
                )}

                {spots.map((spot, index) => (
                    <Marker
                        key={spot.id}
                        position={[spot.lat, spot.lon]}
                        icon={spotIcons[index]}
                        ref={el => {
                            if (el) markerRefs.current[spot.id] = el;
                        }}
                        zIndexOffset={focusedSpot && focusedSpot.id === spot.id ? 1000 : index * 10}
                    >
                        <Popup>
                            <div className="p-1 min-w-[200px]">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                        #{index + 1}
                                    </span>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">{spot.category}</span>
                                </div>
                                <h3 className="font-bold text-slate-800 text-sm mb-1">{spot.name}</h3>

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

                                {spot.tags.photo && (
                                    <div className="w-full h-24 mb-2 rounded-lg overflow-hidden bg-slate-100">
                                        <img src={spot.tags.photo} alt={spot.name} className="w-full h-full object-cover" />
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
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1.5 w-full mt-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-bold py-2 rounded-lg transition-all shadow-sm hover:shadow active:scale-95"
                                >
                                    <span className="text-blue-500 font-extrabold">G</span> Googleマップで見る
                                </a>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};

export default MapVisualization;
