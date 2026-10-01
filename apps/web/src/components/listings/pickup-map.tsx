'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useEffect, useRef } from 'react';

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const INDIA = { lat: 20.5937, lng: 78.9629 };

/**
 * Click or drag the pin to set the pickup point (OpenStreetMap tiles, like
 * the app). Only an approximate point is ever shown to borrowers.
 */
export function PickupMap({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (point: { lat: number; lng: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return;
      const start = value ?? INDIA;
      const m = L.map(box.current, { scrollWheelZoom: false }).setView(start, value ? 15 : 4);
      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:9999px;background:var(--sj-primary);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const place = (lat: number, lng: number) => {
        if (marker.current) marker.current.setLatLng([lat, lng]);
        else {
          marker.current = L.marker([lat, lng], { draggable: true, icon }).addTo(m);
          marker.current.on('dragend', () => {
            const p = marker.current!.getLatLng();
            changed.current({ lat: p.lat, lng: p.lng });
          });
        }
      };
      if (value) place(value.lat, value.lng);
      m.on('click', (e) => {
        place(e.latlng.lat, e.latlng.lng);
        changed.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; later moves go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value || !map.current) return;
    void import('leaflet').then((L) => {
      if (!map.current) return;
      if (marker.current) marker.current.setLatLng([value.lat, value.lng]);
      else {
        marker.current = L.marker([value.lat, value.lng]).addTo(map.current);
      }
      map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 15));
    });
  }, [value]);

  return (
    <div
      ref={box}
      className="relative z-0 h-72 w-full overflow-hidden rounded-md border border-sj-border"
      role="application"
      aria-label="Pickup location map. Click to drop the pin."
    />
  );
}
