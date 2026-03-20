import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { initViewer, loadWorld } from './viewer.js';

let map;
let selectionRect = null;
let bbox = null;
let squareMode = true;

// ════════════════════════════════════════
//  Map initialisation
// ════════════════════════════════════════
function initMap() {
  map = L.map('map').setView([48.8566, 2.3522], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OSM contributors',
    maxZoom: 19,
  }).addTo(map);

  initDrawTool();
}

// ── Selection draw tool ──
function initDrawTool() {
  let drawing = false;
  let drawOrigin = null;

  const Toolbar = L.Control.extend({
    onAdd() {
      const wrap = L.DomUtil.create('div', 'sel-toolbar');
      wrap.innerHTML = `
        <button class="sel-btn sel-btn-draw" id="btn-draw" title="Draw selection area">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
          <span>Select Area</span>
        </button>
        <button class="sel-btn sel-btn-shape" id="btn-shape" title="Toggle square / rectangle">
          <svg id="shape-icon-sq" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
          <svg id="shape-icon-rect" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" style="display:none"><rect x="1" y="3" width="14" height="10" rx="1"/></svg>
          <span id="shape-label">Square</span>
        </button>
        <button class="sel-btn sel-btn-clear" id="btn-clear" title="Clear selection">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
          <span>Clear</span>
        </button>`;
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      return wrap;
    },
  });
  new Toolbar({ position: 'topright' }).addTo(map);

  const btnDraw  = document.getElementById('btn-draw');
  const btnShape = document.getElementById('btn-shape');
  const btnClear = document.getElementById('btn-clear');

  btnDraw.addEventListener('click', () => {
    drawing = !drawing;
    btnDraw.classList.toggle('active', drawing);
    btnDraw.querySelector('span').textContent = drawing ? 'Drawing...' : 'Select Area';
    map.dragging[drawing ? 'disable' : 'enable']();
    map.getContainer().style.cursor = drawing ? 'crosshair' : '';
  });

  btnShape.addEventListener('click', () => {
    squareMode = !squareMode;
    document.getElementById('shape-label').textContent = squareMode ? 'Square' : 'Rectangle';
    document.getElementById('shape-icon-sq').style.display  = squareMode ? '' : 'none';
    document.getElementById('shape-icon-rect').style.display = squareMode ? 'none' : '';
  });

  btnClear.addEventListener('click', clearSelection);

  map.on('mousedown', (e) => {
    if (!drawing) return;
    drawOrigin = e.latlng;
    if (selectionRect) { map.removeLayer(selectionRect); selectionRect = null; }
  });

  map.on('mousemove', (e) => {
    if (!drawing || !drawOrigin) return;
    const corner = constrainCorner(drawOrigin, e.latlng);
    const bounds = L.latLngBounds(drawOrigin, corner);
    if (selectionRect) { selectionRect.setBounds(bounds); }
    else {
      selectionRect = L.rectangle(bounds, { color: '#e94560', weight: 2, fillOpacity: 0.12, dashArray: '6 4', interactive: false }).addTo(map);
    }
    showLiveSize(bounds);
  });

  map.on('mouseup', () => {
    if (!drawing || !drawOrigin) return;
    if (selectionRect) commitSelection(selectionRect.getBounds());
    drawOrigin = null;
    drawing = false;
    btnDraw.classList.remove('active');
    btnDraw.querySelector('span').textContent = 'Select Area';
    map.dragging.enable();
    map.getContainer().style.cursor = '';
  });
}

function constrainCorner(origin, cursor) {
  if (!squareMode) return cursor;
  const dLat = cursor.lat - origin.lat;
  const dLng = cursor.lng - origin.lng;
  const cosLat = Math.cos(origin.lat * Math.PI / 180);
  const side = Math.max(Math.abs(dLat), Math.abs(dLng) * cosLat);
  return L.latLng(
    origin.lat + (dLat >= 0 ? 1 : -1) * side,
    origin.lng + (dLng >= 0 ? 1 : -1) * (side / cosLat),
  );
}

let sizeTooltip = null;
function showLiveSize(bounds) {
  const latDist = haversine(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getWest());
  const lngDist = haversine(bounds.getSouth(), bounds.getWest(), bounds.getSouth(), bounds.getEast());
  const text = `${Math.round(lngDist)}m x ${Math.round(latDist)}m`;
  if (!sizeTooltip) {
    sizeTooltip = L.tooltip({ permanent: true, direction: 'center', className: 'size-tooltip' })
      .setLatLng(bounds.getCenter()).setContent(text).addTo(map);
  } else {
    sizeTooltip.setLatLng(bounds.getCenter()).setContent(text);
  }
}

function removeSizeTooltip() {
  if (sizeTooltip) { map.removeLayer(sizeTooltip); sizeTooltip = null; }
}

function commitSelection(bounds) {
  removeSizeTooltip();
  if (selectionRect) map.removeLayer(selectionRect);
  selectionRect = L.rectangle(bounds, { color: '#e94560', weight: 2, fillOpacity: 0.10, interactive: false }).addTo(map);

  bbox = { minLat: bounds.getSouth(), minLng: bounds.getWest(), maxLat: bounds.getNorth(), maxLng: bounds.getEast() };
  document.getElementById('min-lat').value = bbox.minLat.toFixed(5);
  document.getElementById('min-lng').value = bbox.minLng.toFixed(5);
  document.getElementById('max-lat').value = bbox.maxLat.toFixed(5);
  document.getElementById('max-lng').value = bbox.maxLng.toFixed(5);
  updateBboxInfo();
  document.getElementById('btn-generate').disabled = false;
}

function clearSelection() {
  if (selectionRect) { map.removeLayer(selectionRect); selectionRect = null; }
  removeSizeTooltip();
  bbox = null;
  ['min-lat','min-lng','max-lat','max-lng'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bbox-info').classList.add('hidden');
  document.getElementById('btn-generate').disabled = true;
}

function updateBboxInfo() {
  if (!bbox) return;
  const latDist = haversine(bbox.minLat, bbox.minLng, bbox.maxLat, bbox.minLng);
  const lngDist = haversine(bbox.minLat, bbox.minLng, bbox.minLat, bbox.maxLng);
  document.getElementById('bbox-text').textContent =
    `${bbox.minLat.toFixed(4)}, ${bbox.minLng.toFixed(4)} \u2192 ${bbox.maxLat.toFixed(4)}, ${bbox.maxLng.toFixed(4)}`;
  let s = `~${Math.round(lngDist)}m \u00D7 ${Math.round(latDist)}m`;
  if (latDist > 2000 || lngDist > 2000) s += '  (large!)';
  document.getElementById('bbox-size').textContent = s;
  document.getElementById('bbox-info').classList.remove('hidden');
}

function applyManualCoords() {
  const vals = ['min-lat','min-lng','max-lat','max-lng'].map(id => parseFloat(document.getElementById(id).value));
  if (vals.some(isNaN)) { alert('Enter valid coordinates'); return; }
  const bounds = L.latLngBounds([vals[0], vals[1]], [vals[2], vals[3]]);
  map.fitBounds(bounds, { padding: [30, 30] });
  commitSelection(bounds);
}

// ════════════════════════════════════════
//  Resizable split – draggable divider
// ════════════════════════════════════════
function initDivider() {
  const divider   = document.getElementById('panel-divider');
  const app       = document.getElementById('app');
  const leftPanel = document.getElementById('left-panel');

  let dragging = false;
  let startX   = 0;
  let startW   = 0;

  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = leftPanel.getBoundingClientRect().width;
    divider.classList.add('active');
    app.classList.add('dragging');
    divider.setPointerCapture(e.pointerId);
  });

  divider.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const newW = Math.max(280, Math.min(startW + dx, window.innerWidth * 0.85));
    leftPanel.style.setProperty('--left-width', newW + 'px');
    // Invalidate Leaflet + Three.js sizing
    map.invalidateSize();
    window.dispatchEvent(new Event('resize'));
  });

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('active');
    app.classList.remove('dragging');
    // Final resize flush
    map.invalidateSize();
    window.dispatchEvent(new Event('resize'));
  };

  divider.addEventListener('pointerup',     stopDrag);
  divider.addEventListener('pointercancel', stopDrag);
}

// ════════════════════════════════════════
//  Fullscreen toggle
// ════════════════════════════════════════
let isFullscreen = false;

function toggleFullscreen() {
  isFullscreen = !isFullscreen;
  const app = document.getElementById('app');
  app.classList.toggle('fullscreen', isFullscreen);
  document.getElementById('icon-expand').style.display  = isFullscreen ? 'none' : '';
  document.getElementById('icon-shrink').style.display = isFullscreen ? '' : 'none';
  setTimeout(() => {
    map.invalidateSize();
    window.dispatchEvent(new Event('resize'));
  }, 60);
}

// ════════════════════════════════════════
//  Generation
// ════════════════════════════════════════
function startGeneration() {
  if (!bbox) return;

  const settings = {
    bbox,
    scale: parseFloat(document.getElementById('scale-select').value),
    terrain: document.getElementById('terrain-toggle').checked,
    buildings: document.getElementById('buildings-toggle').checked,
    roads: document.getElementById('roads-toggle').checked,
    vegetation: document.getElementById('vegetation-toggle').checked,
    water: document.getElementById('water-toggle').checked,
  };

  document.getElementById('viewer-placeholder').classList.add('hidden');
  loadWorld(settings);
}

// ════════════════════════════════════════
//  Utilities
// ════════════════════════════════════════
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════
//  Bootstrap
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initViewer();
  initDivider();

  document.getElementById('btn-apply-coords').addEventListener('click', applyManualCoords);
  document.getElementById('btn-generate').addEventListener('click', startGeneration);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  // Tab key also toggles fullscreen while pointer is locked
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') { e.preventDefault(); toggleFullscreen(); }
  });
});
