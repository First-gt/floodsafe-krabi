import { NextResponse } from 'next/server';

const OSRM_SERVERS = [
  (process.env.NEXT_PUBLIC_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  'https://routing.openstreetmap.de/routed-car',
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const coords = searchParams.get('coords');
  const alternatives = searchParams.get('alternatives') === 'true' ? 'true' : 'false';

  if (!coords || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(;-?\d+(\.\d+)?,-?\d+(\.\d+)?)+$/.test(coords)) {
    return NextResponse.json({ error: 'bad_coords' }, { status: 400 });
  }

  for (const base of OSRM_SERVERS) {
    const url = `${base}/route/v1/driving/${coords}?alternatives=${alternatives}&continue_straight=true&overview=full&geometries=geojson&steps=true`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6_500), cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.length) {
        return NextResponse.json(data);
      }
    } catch {
      /* try next server */
    }
  }

  return NextResponse.json({ error: 'osrm_unreachable' }, { status: 502 });
}
