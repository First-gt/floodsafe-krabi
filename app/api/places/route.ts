import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const LONGDO_KEY = process.env.NEXT_PUBLIC_LONGDO_KEY || process.env.LONGDO_KEY || 'ba9de16710bd8d1db081440317616305';

  if (LONGDO_KEY && LONGDO_KEY !== 'วาง_KEY_ตรงนี้') {
    try {
      // Use Longdo Map Search API (restrict search vaguely to Krabi by adding "กระบี่")
      const searchKeyword = query.includes('กระบี่') ? query : `${query} กระบี่`;
      const url = `https://search.longdo.com/mapsearch/json/search?keyword=${encodeURIComponent(
        searchKeyword
      )}&limit=6&key=${LONGDO_KEY}`;
      
      const res = await fetch(url);
      const data = await res.json(); // Longdo might return a JSON array or { data: [...] } or { meta, data }

      let results = [];
      if (Array.isArray(data)) {
        results = data;
      } else if (data && Array.isArray(data.data)) {
        results = data.data;
      }

      if (results.length > 0) {
        const mapped = results.map((item: any) => ({
          id: `longdo-${item.id || Math.random().toString(36).substring(7)}`,
          name: item.name || item.title || query,
          alias: item.address || item.description || '',
          district: 'Mueang Krabi', // fallback
          lng: parseFloat(item.lon || item.longitude),
          lat: parseFloat(item.lat || item.latitude),
          kind: 'town',
        })).filter((m: any) => !isNaN(m.lng) && !isNaN(m.lat));
        
        return NextResponse.json({ results: mapped, source: 'longdo' });
      }
    } catch (err) {
      console.error('Longdo API Error:', err);
      // Fallback to OSM
    }
  }

  // Fallback to OpenStreetMap Nominatim if no Longdo Key or Longdo fails
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}+krabi&format=json&limit=5&countrycodes=th`;
    const res = await fetch(url, { headers: { 'User-Agent': 'FloodSafeKrabi/1.0' } });
    const data = await res.json();

    const mapped = data.map((item: any) => ({
      id: `nom-${item.place_id}`,
      name: item.name || item.display_name.split(',')[0],
      alias: item.display_name,
      district: 'Mueang Krabi',
      lng: parseFloat(item.lon),
      lat: parseFloat(item.lat),
      kind: item.type === 'hospital' ? 'hospital' : 'town',
    }));
    return NextResponse.json({ results: mapped, source: 'osm' });
  } catch (err) {
    console.error('OSM Nominatim Error:', err);
    return NextResponse.json({ results: [], source: 'error' }, { status: 500 });
  }
}
