export function parseOSMData(osmData, bbox, scale) {
  const nodeMap = new Map();
  const ways = [];
  const relations = [];
  const trees = [];

  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags || {} });
      if (el.tags?.natural === 'tree') {
        trees.push({ lat: el.lat, lon: el.lon, tags: el.tags });
      }
    }
  }

  for (const el of osmData.elements) {
    if (el.type === 'way' && el.nodes && el.tags) {
      const coords = el.nodes
        .map((nid) => nodeMap.get(nid))
        .filter(Boolean);
      if (coords.length >= 2) {
        ways.push({ id: el.id, tags: el.tags, coords });
      }
    } else if (el.type === 'relation' && el.tags) {
      const members = (el.members || [])
        .filter((m) => m.type === 'way')
        .map((m) => ({ ref: m.ref, role: m.role }));
      relations.push({ id: el.id, tags: el.tags, members });
    }
  }

  // Categorize ways
  const buildings = [];
  const highways = [];
  const waterways = [];
  const waterAreas = [];
  const landuse = [];
  const natural = [];

  for (const way of ways) {
    const t = way.tags;
    if (t.building) {
      buildings.push(way);
    } else if (t.highway) {
      highways.push(way);
    } else if (t.waterway) {
      waterways.push(way);
    } else if (t.natural === 'water') {
      waterAreas.push(way);
    } else if (t.landuse) {
      landuse.push(way);
    } else if (t.natural === 'wood' || t.leisure === 'park' || t.leisure === 'garden') {
      natural.push(way);
    }
  }

  return { buildings, highways, waterways, waterAreas, landuse, natural, trees, nodeMap, ways, relations };
}

export function projectToWorld(lat, lon, bbox, scale) {
  const { minLat, minLng, maxLat, maxLng } = bbox;

  const R = 6371000;
  const midLat = (minLat + maxLat) / 2;
  const metersPerDegLat = (Math.PI / 180) * R;
  const metersPerDegLon = (Math.PI / 180) * R * Math.cos(midLat * Math.PI / 180);

  const x = (lon - minLng) * metersPerDegLon * scale;
  const z = (maxLat - lat) * metersPerDegLat * scale;

  return { x: Math.round(x), z: Math.round(z) };
}

export function getWorldDimensions(bbox, scale) {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const R = 6371000;
  const midLat = (minLat + maxLat) / 2;
  const metersPerDegLat = (Math.PI / 180) * R;
  const metersPerDegLon = (Math.PI / 180) * R * Math.cos(midLat * Math.PI / 180);

  const width = Math.round((maxLng - minLng) * metersPerDegLon * scale);
  const depth = Math.round((maxLat - minLat) * metersPerDegLat * scale);

  return { width, depth };
}
