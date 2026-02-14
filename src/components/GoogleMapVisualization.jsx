import React, { useEffect, useState, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap } from '@vis.gl/react-google-maps';

// Map Controller for external control (flyTo etc)
const MapController = ({ center, focusedSpot }) => {
    const map = useMap();

    useEffect(() => {
        if (!map || !center) return;
        map.panTo({ lat: center.lat, lng: center.lon });
        // map.setZoom(14);
    }, [map, center]);

    useEffect(() => {
        if (!map || !focusedSpot) return;
        map.panTo({ lat: focusedSpot.lat, lng: focusedSpot.lon });
        map.setZoom(16);
    }, [map, focusedSpot]);

    return null;
};

// Polyline Component using raw Google Maps API
const Polyline = ({ path }) => {
    const map = useMap();
    const [polyline, setPolyline] = useState(null);

    useEffect(() => {
        if (!map) return;
        const line = new google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: "#0F172A",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            icons: [{
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                offset: '0',
                repeat: '20px'
            }],
        });
        line.setMap(map);
        setPolyline(line);

        return () => {
            line.setMap(null);
        };
    }, [map]);

    useEffect(() => {
        if (polyline) {
            polyline.setPath(path);
        }
    }, [polyline, path]);

    return null;
};

const GoogleMapVisualization = ({ center, radius, spots, focusedSpot, onMapReady }) => {
    const defaultCenter = { lat: 34.9858, lng: 135.7588 };
    const [activeMarker, setActiveMarker] = useState(null);
    const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    // Convert spots to markers
    const markers = useMemo(() => spots.map((spot, index) => ({
        ...spot,
        position: { lat: spot.lat, lng: spot.lon },
        index: index + 1
    })), [spots]);

    const routePath = useMemo(() => {
        if (!center || spots.length === 0) return [];
        return [
            { lat: center.lat, lng: center.lon },
            ...spots.map(s => ({ lat: s.lat, lng: s.lon }))
        ];
    }, [center, spots]);

    return (
        <APIProvider apiKey={API_KEY} onLoad={() => console.log('Maps API Loaded')}>
            <div className="w-full h-full rounded-2xl overflow-hidden shadow-inner border border-slate-200 relative">
                <Map
                    defaultCenter={defaultCenter}
                    defaultZoom={13}
                    mapId="DEMO_MAP_ID" // Required for AdvancedMarker
                    className="w-full h-full"
                    options={{
                        disableDefaultUI: true,
                        zoomControl: true,
                    }}
                    onTilesLoaded={(evt) => onMapReady && onMapReady(evt.map)} // Expose map instance
                >
                    <MapController center={center} focusedSpot={focusedSpot} />

                    {/* User Location */}
                    {center && (
                        <AdvancedMarker position={{ lat: center.lat, lng: center.lon }}>
                            <Pin background={'#F59E0B'} borderColor={'#ffffff'} glyphColor={'#ffffff'} scale={1.2} />
                        </AdvancedMarker>
                    )}

                    {/* Spots */}
                    {markers.map((marker) => (
                        <AdvancedMarker
                            key={marker.id}
                            position={marker.position}
                            onClick={() => setActiveMarker(marker)}
                        >
                            <div className="relative group">
                                <span className={`flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold border-2 border-white shadow-md transition-transform hover:scale-110 ${focusedSpot?.id === marker.id ? 'bg-amber-500 scale-125' : 'bg-slate-900'
                                    }`}>
                                    {marker.index}
                                </span>
                                {/* Tooltip on hover */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[150px] bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    {marker.name}
                                </div>
                            </div>
                        </AdvancedMarker>
                    ))}

                    {/* Route */}
                    {routePath.length > 1 && <Polyline path={routePath} />}

                    {/* Circle (Using native API mostly better, but simplified here by not drawing it or using another component. Leaving out for now to keep clean, or update later) */}

                </Map>
            </div>
        </APIProvider>
    );
};

export default GoogleMapVisualization;
