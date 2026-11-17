import { NextResponse } from 'next/server';

const OSRM_URL = (process.env.NEXT_PUBLIC_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const coords = searchParams.get('coords');
  const alternatives = searchParams.get('alternatives') === 'true' ? 'true' : 'false';

  if (!coords || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(;-?\d+(\.\d+)?,-?\d+(\.\d+)?)+$/.test(coords)) {
    return NextResponse.json({ error: 'bad_coords' }, { status: 400 });
  }

  const url = `${OSRM_URL}/route/v1/driving/${coords}?alternatives=${alternatives}&overview=full&geometries=geojson&steps=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: `osrm_${res.status}` }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'osrm_unreachable' }, { status: 502 });
  }
}
