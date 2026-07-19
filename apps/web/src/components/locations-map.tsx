'use client';

import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

export type MapPoint = {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  toolCount: number;
};

// Leaflet touches `window` — render client-side only.
const MapInner = dynamic(() => import('./locations-map-inner'), { ssr: false });

export function LocationsMap({
  points,
  labels,
}: {
  points: MapPoint[];
  labels: { toolsHere: string; openList: string };
}) {
  return (
    <div className="h-[70vh] overflow-hidden rounded-card border border-line/30">
      <MapInner points={points} labels={labels} />
    </div>
  );
}
