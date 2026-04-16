export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { city } = req.query;
  if (!city) return res.status(400).json({ error: 'City is required' });

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'kundalimatching.ai/1.0' }
    });
    const data = await r.json();

    if (!data || data.length === 0) {
      return res.status(404).json({ error: `City not found: "${city}". Try adding the country, e.g. "Mumbai, India"` });
    }

    res.status(200).json({
      lat: parseFloat(data[0].lat).toFixed(6),
      lon: parseFloat(data[0].lon).toFixed(6),
      display_name: data[0].display_name
    });
  } catch (e) {
    res.status(500).json({ error: 'Geocoding failed', details: e.message });
  }
}
