import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (GOOGLE_KEY) {
    try {
      // Use Google Places API (Text Search) for the best POI match in Krabi
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        query
      )}+Krabi+Thailand&key=${GOOGLE_KEY}&language=th`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.results) {
        const mapped = data.results.slice(0, 5).map((item: any) => ({
          id: `gmap-${item.place_id}`,
          name: item.name,
          alias: item.formatted_address,
          district: 'Mueang Krabi', // fallback
          lng: item.geometry.location.lng,
          lat: item.geometry.location.lat,
          kind: item.types?.includes('hospital') ? 'hospital' : 'town',
        }));
        return NextResponse.json({ results: mapped, source: 'google' });
      }
    } catch (err) {
      console.error('Google Places API Error:', err);
      // Fallback to OSM
    }
  }

  // Fallback to OpenStreetMap Nominatim if no Google Key or Google fails
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
