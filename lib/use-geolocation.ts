'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { inKrabi, type LngLat } from './geo';

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unsupported';

export function useGeolocation() {
  const [position, setPosition] = useState<LngLat | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const watchId = useRef<number | null>(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition([p.coords.longitude, p.coords.latitude]);
        setAccuracy(p.coords.accuracy);
        setStatus('ready');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }, []);

  useEffect(
    () => () => {
      if (watchId.current !== null && typeof navigator !== 'undefined') navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );

  return { position, accuracy, status, request, insideKrabi: position ? inKrabi(position) : false };
}
