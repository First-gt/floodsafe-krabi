import { NextResponse } from 'next/server';

const inSongkhlaBox = (lng: number, lat: number) => lat >= 6.2 && lat <= 8.1 && lng >= 99.9 && lng <= 101.2;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const LONGDO_KEY = process.env.NEXT_PUBLIC_LONGDO_KEY || process.env.LONGDO_KEY || 'ba9de16710bd8d1db081440317616305';

  if (LONGDO_KEY && LONGDO_KEY !== 'วาง_KEY_ตรงนี้') {
    try {
      const searchKeyword = query.includes('สงขลา') || query.includes('หาดใหญ่') ? query : `${query} สงขลา`;
      const url = `https://search.longdo.com/mapsearch/json/search?keyword=${encodeURIComponent(
        searchKeyword
      )}&limit=6&key=${LONGDO_KEY}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(4500), cache: 'no-store' });
      const data = await res.json();

      let results = [];
      if (Array.isArray(data)) {
        results = data;
      } else if (data && Array.isArray(data.data)) {
        results = data.data;
      }

      if (results.length > 0) {
        const mapped = results
          .map((item: any) => ({
            id: `longdo-${item.id || Math.random().toString(36).substring(7)}`,
            name: item.name || item.title || query,
            alias: item.address || item.description || '',
            district: 'Hat Yai',
            lng: parseFloat(item.lon || item.longitude),
            lat: parseFloat(item.lat || item.latitude),
            kind: 'town',
          }))
          .filter((m: any) => !isNaN(m.lng) && !isNaN(m.lat) && inSongkhlaBox(m.lng, m.lat));

        if (mapped.length > 0) {
          return NextResponse.json({ results: mapped, source: 'longdo' });
        }
      }
    } catch (err) {
      console.error('Longdo API Error:', err);
    }
  }

  // Fallback to OpenStreetMap Nominatim (strictly bounded to Songkhla)
  try {
    const fetchNom = async (q: string) => {
      const url =
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
        `&format=json&limit=8&countrycodes=th&viewbox=100.05,7.95,101.05,6.35&bounded=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FloodSafeSongkhla/1.0' },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      return (await res.json()) as any[];
    };

    let data = await fetchNom(query);
    if (!Array.isArray(data) || data.length === 0) {
      data = await fetchNom(`${query} สงขลา`);
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((item: any) => ({
        id: `nom-${item.place_id}`,
        name: item.name || item.display_name.split(',')[0],
        alias: item.display_name,
        district: 'Hat Yai',
        lng: parseFloat(item.lon),
        lat: parseFloat(item.lat),
        kind: item.type === 'hospital' ? 'hospital' : 'town',
      }))
      .filter((m) => !isNaN(m.lng) && !isNaN(m.lat) && inSongkhlaBox(m.lng, m.lat));
    return NextResponse.json({ results: mapped, source: 'osm' });
  } catch (err) {
    console.error('OSM Nominatim Error:', err);
    return NextResponse.json({ results: [], source: 'error' }, { status: 500 });
  }
}
