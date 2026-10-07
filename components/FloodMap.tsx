'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MLMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LngLat } from '@/lib/geo';
import { DISTRICT_TH, SOURCE_LABEL, STATUS_LABEL } from '@/lib/labels';
import { DISTRICTS } from '@/lib/mock-data';
import { PLACE_META } from '@/lib/place-meta';
import type { RouteResult } from '@/lib/routing';
import type { Checkpoint, District, FloodZone, Incident, Place } from '@/lib/types';
import { DEPTH_COLORS, DEPTH_META, PRIORITY_META, depthLevel, escapeHtml, timeAgo } from '@/lib/utils';

export interface FloodMapProps {
  checkpoints: Checkpoint[];
  zones: FloodZone[];
  incidents?: Incident[];
  route?: RouteResult | null;
  origin?: LngLat | null;
  destination?: LngLat | null;
  userLocation?: LngLat | null;
  showZones?: boolean;
  showHeatmap?: boolean;
  compactCheckpoints?: boolean;
  selectedIncidentId?: string | null;
  pickMode?: boolean;
  onSelectIncident?: (id: string) => void;
  onMapClick?: (p: LngLat) => void;
  flyTo?: { center: LngLat; zoom?: number; key: number } | null;
  fitTo?: { coords: LngLat[]; key: number } | null;
  /** extra padding (px) so fitted routes aren't hidden under floating panels */
  padding?: { top: number; bottom: number; left: number; right: number };
  initialCenter?: LngLat;
  initialZoom?: number;
  /** สถานที่สำคัญ (โรงพยาบาล ศูนย์พักพิง ฯลฯ) แสดงเป็นหมุดพร้อมชื่อ */
  places?: Place[];
  onPlaceClick?: (p: Place) => void;
  /** แสดงชื่ออำเภอบนแผนที่เมื่อซูมออก */
  showDistrictLabels?: boolean;
}

/**
 * แผนที่พื้นหลังแบบ vector (คมทุกระดับซูม หน้าตาใกล้เคียง Google Maps):
 * - ค่าเริ่มต้น: OpenFreeMap "Liberty" (ฟรี ไม่ต้องใช้ API key)
 * - ถ้าตั้ง NEXT_PUBLIC_MAPTILER_KEY จะใช้ MapTiler Streets (เสถียรกว่าสำหรับใช้งานจริง)
 * - ถ้าโหลด vector style ไม่ได้ จะ fallback เป็น raster OpenStreetMap
 * หมายเหตุ: ไม่สามารถใช้ tile ของ Google Maps กับ MapLibre ได้ (ผิดข้อกำหนดและต้องมี key)
 */
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const LONGDO_KEY = process.env.NEXT_PUBLIC_LONGDO_KEY;

const VECTOR_STYLE_URL: maplibregl.StyleSpecification | string = LONGDO_KEY && LONGDO_KEY !== 'วาง_KEY_ตรงนี้'
  ? {
      version: 8,
      sources: {
        longdo: {
          type: 'raster',
          tiles: [`https://ms.longdo.com/mmmap/tile.php?zoom={z}&x={x}&y={y}&key=${LONGDO_KEY}&proj=epsg3857&mode=icons`],
          tileSize: 256,
          attribution: '© <a href="https://map.longdo.com/">Longdo Map</a>'
        }
      },
      layers: [
        {
          id: 'longdo-raster',
          type: 'raster',
          source: 'longdo',
          minzoom: 0,
          maxzoom: 20
        }
      ]
    }
  : MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
    : 'https://tiles.openfreemap.org/styles/liberty';
const BASE_TILES = ['a', 'b', 'c'].map((s) => `https://${s}.tile.openstreetmap.org/{z}/{x}/{y}.png`);

const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: BASE_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: MAPTILER_KEY
        ? '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1120' } },
    { id: 'base', type: 'raster', source: 'base' },
  ],
};

const EMPTY = { type: 'FeatureCollection', features: [] } as const;

const ICON = {
  siren:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  check:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  truck:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
};

function checkpointPopup(c: Checkpoint): string {
  const lvl = depthLevel(c.depthCm);
  const meta = DEPTH_META[lvl];
  return `<div style="font-size:13px">
    <div style="font-weight:600;font-size:14px;margin-bottom:2px;padding-right:14px">${escapeHtml(c.name)}</div>
    <div style="color:#94a3b8;font-size:11px;margin-bottom:8px">อ.${escapeHtml(DISTRICT_TH[c.district])} · ${SOURCE_LABEL[c.source]} · ${timeAgo(c.updatedAt, Date.now())}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="background:${DEPTH_COLORS[lvl]};color:#0b1120;border-radius:999px;padding:2px 10px;font-weight:700">${Math.round(c.depthCm)} ซม.</span>
      <span style="color:${DEPTH_COLORS[lvl]};font-weight:600">${meta.label}</span>
    </div>
    <div style="color:#cbd5e1;font-size:12px">${meta.vehicle}</div>
  </div>`;
}

export default function FloodMap(props: FloodMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const cpMarkers = useRef<Marker[]>([]);
  const incMarkers = useRef<Marker[]>([]);
  const pointMarkers = useRef<Marker[]>([]);
  const placeMarkers = useRef<Marker[]>([]);
  const districtMarkers = useRef<Marker[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;

  // ---- init ----
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: VECTOR_STYLE_URL,
      center: props.initialCenter ?? [98.93, 8.2],
      zoom: props.initialZoom ?? 8.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // ถ้าโหลด vector style ไม่ได้ (เช่น เครือข่ายบล็อก) ให้ fallback เป็น raster OSM
    let fellBack = false;
    map.on('error', (e) => {
      const sourceId = (e as { sourceId?: string }).sourceId;
      if (!fellBack && !sourceId && !map.getSource('zones')) {
        fellBack = true;
        map.setStyle(FALLBACK_STYLE);
      }
    });

    map.on('style.load', () => {
      if (map.getSource('zones')) return;
      map.addSource('zones', { type: 'geojson', data: EMPTY as never });
      map.addSource('heat', { type: 'geojson', data: EMPTY as never });
      map.addSource('baseline', { type: 'geojson', data: EMPTY as never });
      map.addSource('route', { type: 'geojson', data: EMPTY as never });

      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': ['match', ['get', 'severity'], 'high', '#0ea5e9', '#38bdf8'],
          'fill-opacity': ['match', ['get', 'severity'], 'high', 0.38, 0.22],
        },
      });
      map.addLayer({
        id: 'zones-line',
        type: 'line',
        source: 'zones',
        paint: { 'line-color': '#67e8f9', 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'heat',
        type: 'heatmap',
        source: 'heat',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'depthCm'], 0, 0, 20, 0.3, 40, 0.6, 100, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 13, 2.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 28, 13, 80],
          'heatmap-opacity': 0.85,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(34,211,238,0)',
            0.2, 'rgba(34,211,238,0.55)',
            0.45, 'rgba(34,197,94,0.75)',
            0.65, 'rgba(250,204,21,0.85)',
            0.85, 'rgba(249,115,22,0.9)',
            1, 'rgba(239,68,68,0.95)',
          ],
        },
      });
      map.addLayer({
        id: 'baseline-line',
        type: 'line',
        source: 'baseline',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-dasharray': [1.5, 2], 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b1120', 'line-width': 11, 'line-opacity': 0.8 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'status'], 'safe', '#22d3ee', '#f59e0b'], 'line-width': 6 },
      });
      setReady(true);
    });

    map.on('click', (e) => propsRef.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]));

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setData = (id: string, data: unknown) => {
    const src = mapRef.current?.getSource(id) as GeoJSONSource | undefined;
    src?.setData(data as never);
  };

  // ---- layers data ----
  useEffect(() => {
    if (!ready) return;
    setData('zones', { type: 'FeatureCollection', features: props.zones });
  }, [ready, props.zones]);

  useEffect(() => {
    if (!ready) return;
    setData('heat', {
      type: 'FeatureCollection',
      features: props.checkpoints.map((c) => ({
        type: 'Feature',
        properties: { depthCm: c.depthCm },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      })),
    });
  }, [ready, props.checkpoints]);

  useEffect(() => {
    if (!ready) return;
    const r = props.route;
    setData(
      'route',
      r && r.coords.length > 1
        ? { type: 'Feature', properties: { status: r.status }, geometry: { type: 'LineString', coordinates: r.coords } }
        : EMPTY,
    );
    setData(
      'baseline',
      r?.baseline ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.baseline.coords } } : EMPTY,
    );
  }, [ready, props.route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty('zones-fill', 'visibility', props.showZones === false ? 'none' : 'visible');
    map.setLayoutProperty('zones-line', 'visibility', props.showZones === false ? 'none' : 'visible');
    map.setLayoutProperty('heat', 'visibility', props.showHeatmap ? 'visible' : 'none');
  }, [ready, props.showZones, props.showHeatmap]);

  // ---- checkpoint markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    cpMarkers.current.forEach((m) => m.remove());
    cpMarkers.current = props.checkpoints.map((c) => {
      const el = document.createElement('div');
      el.className = props.compactCheckpoints ? 'fs-cp fs-cp-dot' : 'fs-cp';
      el.style.background = DEPTH_COLORS[depthLevel(c.depthCm)];
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${c.name}: ${Math.round(c.depthCm)} เซนติเมตร`);
      if (!props.compactCheckpoints) el.textContent = `${Math.round(c.depthCm)}`;
      el.addEventListener('click', (ev) => ev.stopPropagation());
      return new maplibregl.Marker({ element: el })
        .setLngLat([c.lng, c.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: '280px' }).setHTML(checkpointPopup(c)))
        .addTo(map);
    });
  }, [ready, props.checkpoints, props.compactCheckpoints]);

  // ---- incident markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    incMarkers.current.forEach((m) => m.remove());
    incMarkers.current = (props.incidents ?? []).map((i) => {
      const el = document.createElement('div');
      const color = i.status === 'rescued' ? '#22c55e' : i.status === 'dispatched' ? '#38bdf8' : PRIORITY_META[i.recommendation.priority].color;
      el.className = `fs-inc${props.selectedIncidentId === i.id ? ' sel' : ''}${i.status === 'pending' && i.recommendation.priority === 'critical' ? ' pulse' : ''}`;
      el.style.background = color;
      el.style.color = color;
      el.innerHTML = `<span style="color:#0b1120;display:flex">${i.status === 'rescued' ? ICON.check : i.status === 'dispatched' ? ICON.truck : ICON.siren}</span>`;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `เหตุการณ์ที่ ${i.locationName} สถานะ ${STATUS_LABEL[i.status]}`);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        propsRef.current.onSelectIncident?.(i.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([i.lng, i.lat]).addTo(map);
    });
  }, [ready, props.incidents, props.selectedIncidentId]);

  // ---- origin / destination / user markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    pointMarkers.current.forEach((m) => m.remove());
    pointMarkers.current = [];
    const addPin = (p: LngLat, label: string, color: string) => {
      const el = document.createElement('div');
      el.className = 'fs-pin';
      el.style.background = color;
      el.innerHTML = `<span>${label}</span>`;
      pointMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [-4, -2] }).setLngLat(p).addTo(map));
    };
    if (props.userLocation) {
      const el = document.createElement('div');
      el.className = 'fs-user';
      pointMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat(props.userLocation).addTo(map));
    }
    if (props.origin) addPin(props.origin, 'A', '#22d3ee');
    if (props.destination) addPin(props.destination, 'B', '#facc15');
  }, [ready, props.userLocation, props.origin, props.destination]);

  // ---- zoom-dependent label visibility ----
  useEffect(() => {
    const map = mapRef.current;
    const box = containerRef.current;
    if (!ready || !map || !box) return;
    const upd = () => box.classList.toggle('fs-zoom-low', map.getZoom() < 10.6);
    upd();
    map.on('zoom', upd);
    return () => {
      map.off('zoom', upd);
    };
  }, [ready]);

  // ---- สถานที่สำคัญ ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    placeMarkers.current.forEach((m) => m.remove());
    placeMarkers.current = (props.places ?? []).map((pl) => {
      const meta = PLACE_META[pl.kind];
      const el = document.createElement('div');
      el.className = 'fs-place';
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${meta.label}: ${pl.name}`);
      el.title = `${pl.name} (${meta.label}) – แตะเพื่อนำทางไปที่นี่`;
      el.innerHTML = `<span class="fs-place-ic" style="background:${meta.color}">${meta.icon}</span><span class="fs-place-label">${escapeHtml(pl.name)}</span>`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        propsRef.current.onPlaceClick?.(pl);
      });
      return new maplibregl.Marker({ element: el, anchor: 'left', offset: [-11, 0] }).setLngLat([pl.lng, pl.lat]).addTo(map);
    });
  }, [ready, props.places]);

  // ---- ป้ายชื่ออำเภอ ----
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    districtMarkers.current.forEach((m) => m.remove());
    districtMarkers.current = [];
    if (!props.showDistrictLabels) return;
    (Object.keys(DISTRICTS) as District[]).forEach((d) => {
      const el = document.createElement('div');
      el.className = 'fs-district';
      el.textContent = `อ.${DISTRICT_TH[d]}`;
      districtMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat(DISTRICTS[d].center).addTo(map));
    });
  }, [ready, props.showDistrictLabels]);

  // ---- camera ----
  useEffect(() => {
    if (!ready || !props.flyTo || !mapRef.current) return;
    mapRef.current.flyTo({ center: props.flyTo.center, zoom: props.flyTo.zoom ?? 13, speed: 1.4, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.flyTo?.key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.fitTo || props.fitTo.coords.length === 0) return;
    const b = new maplibregl.LngLatBounds(props.fitTo.coords[0], props.fitTo.coords[0]);
    props.fitTo.coords.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: propsRef.current.padding ?? 60, maxZoom: 14, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.fitTo?.key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getCanvas().style.cursor = props.pickMode ? 'crosshair' : '';
  }, [ready, props.pickMode]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="แผนที่น้ำท่วม" />
    </div>
  );
}
