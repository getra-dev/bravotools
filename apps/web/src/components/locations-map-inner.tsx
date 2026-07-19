'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { tokens } from '@bravotools/theme';
import type { MapPoint } from './locations-map';

// Leaflet measures its container before hydration settles — remeasure once
// mounted or the tiles render as a single 256px square.
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

const TYPE_COLOR: Record<string, string> = {
  site: tokens.color.hi,
  warehouse: tokens.color.ok,
  service: tokens.color.steel,
  vendor: tokens.color.blue,
};

export default function LocationsMapInner({
  points,
  labels,
}: {
  points: MapPoint[];
  labels: { toolsHere: string; openList: string };
}) {
  const center: [number, number] = points.length
    ? [
        points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
        points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
      ]
    : [54.6872, 25.2797];

  return (
    <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }}>
      <InvalidateOnMount />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point) => (
        <CircleMarker
          key={point.id}
          center={[point.latitude, point.longitude]}
          radius={10 + Math.min(point.toolCount, 20)}
          pathOptions={{
            color: TYPE_COLOR[point.type] ?? tokens.color.dim,
            fillColor: TYPE_COLOR[point.type] ?? tokens.color.dim,
            fillOpacity: 0.45,
            weight: 2,
          }}
          eventHandlers={{
            click: () => {
              window.location.href = `/tools?location=${point.id}`;
            },
          }}
        >
          <Tooltip>
            <span style={{ fontWeight: 700 }}>{point.name}</span>
            <br />
            {labels.toolsHere.replace('{count}', String(point.toolCount))}
            <br />
            <span style={{ textDecoration: 'underline' }}>{labels.openList}</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
