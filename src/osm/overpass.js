const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export async function fetchOSMData(bbox, onProgress) {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;

  const query = `
    [out:json][timeout:180][bbox:${bboxStr}];
    (
      way["building"];
      way["highway"];
      way["waterway"];
      way["natural"="water"];
      way["natural"="wood"];
      way["natural"="tree_row"];
      way["landuse"];
      way["leisure"="park"];
      way["leisure"="garden"];
      way["amenity"="parking"];
      relation["building"];
      relation["natural"="water"];
      relation["waterway"="riverbank"];
      node["natural"="tree"];
    );
    out body;
    >;
    out skel qt;
  `;

  onProgress?.('Fetching OSM data...');

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.remark) {
        console.warn('Overpass remark:', data.remark);
      }

      onProgress?.(`Received ${data.elements.length} elements`);
      return data;
    } catch (err) {
      console.warn(`Endpoint ${endpoint} failed:`, err.message);
      continue;
    }
  }

  throw new Error('All Overpass API endpoints failed. Check your internet connection or try a smaller area.');
}
