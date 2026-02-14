import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icons in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to control map movement
const MapController = ({ center, zoom, focusedSpot }) => {
    const map = useMap();

    // Recenter on search
    useEffect(() => {
        if (center) map.flyTo(center, zoom, { duration: 1.5 });
    }, [center, zoom, map]);

    // Fly to focused spot
    useEffect(() => {
        if (focusedSpot) {
            map.flyTo([focusedSpot.lat, focusedSpot.lon], 18, { duration: 1.5 });
        }
    }, [focusedSpot, map]);

    return null;
};

const MapVisualization = ({ center, radius, spots, focusedSpot }) => {
    const mapCenter = center || { lat: 34.9858, lon: 135.7588 };
    const zoomLevel = 14;

    // Refs for markers to control popup
    const markerRefs = React.useRef({});

    // Effect to open popup when focusedSpot changes
    useEffect(() => {
        if (focusedSpot && markerRefs.current[focusedSpot.id]) {
            const marker = markerRefs.current[focusedSpot.id];
            marker.openPopup();
        }
    }, [focusedSpot]);

    // Create polyline logic
    const routePositions = spots.map(s => [s.lat, s.lon]);

    // Add start point to route for visualization if available
    const fullRoute = center ? [[center.lat, center.lon], ...routePositions] : routePositions;

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

                {/* User Location & Radius */}
                {center && (
                    <>
                        <Circle
                            center={[center.lat, center.lon]}
                            radius={radius}
                            pathOptions={{ color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.05, weight: 1, dashArray: '5, 5' }}
                        />
                        <Marker position={[center.lat, center.lon]} opacity={0.8}>
                            <Popup>Startup Location</Popup>
                        </Marker>
                        <MapController center={[center.lat, center.lon]} zoom={zoomLevel} focusedSpot={focusedSpot} />
                    </>
                )}

                {/* Route Line */}
                {fullRoute.length > 1 && (
                    <Polyline
                        positions={fullRoute}
                        pathOptions={{ color: '#0F172A', weight: 4, opacity: 0.8, dashArray: '10, 10' }}
                    />
                )}

                {/* Spots */}
                {spots.map((spot, index) => (
                    <Marker
                        key={spot.id}
                        position={[spot.lat, spot.lon]}
                        ref={el => markerRefs.current[spot.id] = el}
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

                                {/* Rich Data Display */}
                                <div className="flex items-center gap-2 mb-2">
                                    {spot.rating && (
                                        <span className="flex items-center text-xs text-amber-500 font-bold">
                                            <span>★</span> {spot.rating}
                                        </span>
                                    )}
                                    {spot.user_ratings_total > 0 && (
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
