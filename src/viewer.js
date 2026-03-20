import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { fetchOSMData } from './osm/overpass.js';
import { WorldGenerator } from './world/generator.js';

let camera, scene, renderer, controls;
let world = null;
let flyMode = false;
let viewerReady = false;

const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false, sprint: false };
let velocity = new THREE.Vector3();
let onGround = true;

const WALK_SPEED = 20;
const FLY_SPEED = 40;
const SPRINT_MULT = 2.5;
const JUMP_FORCE = 12;
const GRAVITY = 30;
const PLAYER_HEIGHT = 1.7;

// ════════════════════════════════════════
//  Public API  (called from main.js)
// ════════════════════════════════════════

export function initViewer() {
  const canvas = document.getElementById('viewer-canvas');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 200, 600);

  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(100, 200, 100);
  scene.add(dirLight);
  scene.add(new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.3));

  // Pointer-lock controls (scoped to the viewer wrapper)
  controls = new PointerLockControls(camera, document.body);

  const blocker = document.getElementById('blocker');
  blocker.addEventListener('click', () => { if (viewerReady) controls.lock(); });
  controls.addEventListener('lock',   () => blocker.classList.add('hidden'));
  controls.addEventListener('unlock', () => blocker.classList.remove('hidden'));

  // Keyboard (only acted on when pointer is locked)
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);

  // Resize handler -- fit canvas to its container
  window.addEventListener('resize', resizeViewer);
  resizeViewer();

  animate();
}

export async function loadWorld(settings) {
  const overlay = document.getElementById('loading-overlay');
  const text    = document.getElementById('loading-text');
  const blocker = document.getElementById('blocker');
  overlay.classList.remove('hidden');
  blocker.classList.add('hidden');
  viewerReady = false;

  // Clear previous world meshes
  if (world) {
    const toRemove = [];
    scene.traverse((obj) => { if (obj.isMesh) toRemove.push(obj); });
    toRemove.forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    world = null;
  }

  const progress = (msg) => { text.textContent = msg; };

  try {
    progress('Fetching OpenStreetMap data...');
    const osmData = await fetchOSMData(settings.bbox, progress);

    progress('Generating world...');
    const generator = new WorldGenerator(osmData, settings.bbox, settings);
    world = await generator.generate(progress);

    progress('Building meshes...');
    await new Promise((r) => setTimeout(r, 50));
    world.generateMeshes(scene);

    // Spawn camera at centre
    const cx = world.width / 2;
    const cz = world.depth / 2;
    let spawnY = 0;
    for (let y = world.height - 1; y >= 0; y--) {
      if (world.getVoxel(Math.round(cx), y, Math.round(cz)) !== 0) { spawnY = y + 2; break; }
    }
    camera.position.set(cx, spawnY + PLAYER_HEIGHT, cz);
    velocity.set(0, 0, 0);
    onGround = true;
    flyMode = false;
    updateModeIndicator();

    viewerReady = true;
    overlay.classList.add('hidden');
    blocker.classList.remove('hidden');
  } catch (err) {
    console.error('Generation failed:', err);
    text.textContent = `Error: ${err.message}`;
  }
}

// ════════════════════════════════════════
//  Internal
// ════════════════════════════════════════

function resizeViewer() {
  const wrapper = document.getElementById('viewer-wrapper');
  if (!wrapper || !renderer) return;
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function onKeyDown(e) {
  if (!controls.isLocked) return;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward  = true; break;
    case 'KeyS': case 'ArrowDown':  moveState.backward = true; break;
    case 'KeyA': case 'ArrowLeft':  moveState.left     = true; break;
    case 'KeyD': case 'ArrowRight': moveState.right    = true; break;
    case 'Space':        e.preventDefault(); moveState.up   = true; break;
    case 'ControlLeft': case 'ControlRight': moveState.down = true; break;
    case 'ShiftLeft': case 'ShiftRight':     moveState.sprint = true; break;
    case 'KeyF': toggleFlyMode(); break;
  }
}

function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward  = false; break;
    case 'KeyS': case 'ArrowDown':  moveState.backward = false; break;
    case 'KeyA': case 'ArrowLeft':  moveState.left     = false; break;
    case 'KeyD': case 'ArrowRight': moveState.right    = false; break;
    case 'Space':                   moveState.up       = false; break;
    case 'ControlLeft': case 'ControlRight': moveState.down   = false; break;
    case 'ShiftLeft': case 'ShiftRight':     moveState.sprint = false; break;
  }
}

function toggleFlyMode() {
  flyMode = !flyMode;
  velocity.set(0, 0, 0);
  onGround = false;
  updateModeIndicator();
}

function updateModeIndicator() {
  const el = document.getElementById('mode-indicator');
  if (!el) return;
  el.textContent = flyMode ? 'FLY' : 'WALK';
  el.className = flyMode ? 'fly' : 'walk';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0.6'; }, 1500);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked && world) {
    (flyMode ? updateFly : updateWalk)(delta);
    updateHUD();
  }

  renderer.render(scene, camera);
}

// ── Fly movement ──
function updateFly(delta) {
  const speed = FLY_SPEED * (moveState.sprint ? SPRINT_MULT : 1);
  const dir = new THREE.Vector3();
  const look = new THREE.Vector3();
  camera.getWorldDirection(look);
  const flat = new THREE.Vector3(look.x, 0, look.z).normalize();
  const right = new THREE.Vector3().crossVectors(flat, camera.up).normalize();

  if (moveState.forward)  dir.add(look);
  if (moveState.backward) dir.sub(look);
  if (moveState.right)    dir.add(right);
  if (moveState.left)     dir.sub(right);
  if (moveState.up)       dir.y += 1;
  if (moveState.down)     dir.y -= 1;

  if (dir.length() > 0) {
    dir.normalize();
    camera.position.addScaledVector(dir, speed * delta);
  }
}

// ── Walk movement ──
function updateWalk(delta) {
  const speed = WALK_SPEED * (moveState.sprint ? SPRINT_MULT : 1);
  const dir = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

  if (moveState.forward)  dir.add(fwd);
  if (moveState.backward) dir.sub(fwd);
  if (moveState.right)    dir.add(right);
  if (moveState.left)     dir.sub(right);

  if (dir.length() > 0) {
    dir.normalize();
    camera.position.x += dir.x * speed * delta;
    camera.position.z += dir.z * speed * delta;
  }

  if (moveState.up && onGround) { velocity.y = JUMP_FORCE; onGround = false; }
  velocity.y -= GRAVITY * delta;
  camera.position.y += velocity.y * delta;

  const px = Math.floor(camera.position.x);
  const pz = Math.floor(camera.position.z);
  let groundY = 0;
  for (let y = Math.min(Math.floor(camera.position.y) + 2, world.height - 1); y >= 0; y--) {
    if (world.getVoxel(px, y, pz) !== 0) { groundY = y + 1; break; }
  }
  const minY = groundY + PLAYER_HEIGHT;
  if (camera.position.y < minY) { camera.position.y = minY; velocity.y = 0; onGround = true; }
}

function updateHUD() {
  const el = document.getElementById('coords');
  if (!el) return;
  const p = camera.position;
  el.textContent = `X: ${p.x.toFixed(1)}  Y: ${p.y.toFixed(1)}  Z: ${p.z.toFixed(1)}`;
}
