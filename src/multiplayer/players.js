import * as THREE from 'three';

const remotePlayers = new Map();

function createNameSprite(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 128);

  const pad = 16;
  ctx.font = 'bold 48px sans-serif';
  const textW = Math.min(ctx.measureText(name).width + pad * 2, 512);
  const boxX = (512 - textW) / 2;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.roundRect(boxX, 16, textW, 72, 12);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(boxX, 16, textW, 72, 12);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.5, 0.9, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function createPlayerMesh(color) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.8, 1.4, 0.5);
  const bodyMat = new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.7;
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const skinColor = c.clone().lerp(new THREE.Color(0xffdab9), 0.5);
  const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.7;
  group.add(head);

  // Left arm
  const armGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
  const armMat = new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(0.8) });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.55, 0.7, 0);
  group.add(leftArm);

  // Right arm
  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(0.55, 0.7, 0);
  group.add(rightArm);

  // Left leg
  const legGeo = new THREE.BoxGeometry(0.35, 1.0, 0.35);
  const legMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x333344) });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.2, -0.5, 0);
  group.add(leftLeg);

  // Right leg
  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(0.2, -0.5, 0);
  group.add(rightLeg);

  return group;
}

export function addRemotePlayer(id, name, color, scene) {
  if (remotePlayers.has(id)) return;

  const group = new THREE.Group();
  const playerMesh = createPlayerMesh(color);
  group.add(playerMesh);

  const nameSprite = createNameSprite(name, color);
  nameSprite.position.y = 2.3;
  group.add(nameSprite);

  scene.add(group);
  remotePlayers.set(id, {
    group,
    name,
    color,
    targetPos: new THREE.Vector3(),
    targetRotY: 0,
    initialized: false,
  });
}

export function removeRemotePlayer(id, scene) {
  const player = remotePlayers.get(id);
  if (!player) return;
  scene.remove(player.group);
  player.group.traverse((obj) => {
    if (obj.isMesh) { obj.geometry.dispose(); obj.material.dispose(); }
    if (obj.isSprite) { obj.material.map?.dispose(); obj.material.dispose(); }
  });
  remotePlayers.delete(id);
}

export function updateRemotePositions(positions, myId, scene) {
  for (const [id, pos] of Object.entries(positions)) {
    if (id === myId) continue;

    if (!remotePlayers.has(id) && pos.name && scene) {
      addRemotePlayer(id, pos.name, pos.color, scene);
    }

    const player = remotePlayers.get(id);
    if (!player) continue;

    const feetY = pos.y - 1.7;
    if (!player.initialized) {
      player.group.position.set(pos.x, feetY, pos.z);
      player.initialized = true;
    }
    player.targetPos.set(pos.x, feetY, pos.z);
    player.targetRotY = pos.rotY;
  }
}

export function interpolateRemotePlayers(delta) {
  const lerpFactor = 1 - Math.pow(0.001, delta);
  remotePlayers.forEach((player) => {
    player.group.position.lerp(player.targetPos, lerpFactor);
    player.group.rotation.y += (player.targetRotY - player.group.rotation.y) * lerpFactor;
  });
}

export function clearAllRemotePlayers(scene) {
  remotePlayers.forEach((_p, id) => removeRemotePlayer(id, scene));
}

export function getRemotePlayerCount() {
  return remotePlayers.size;
}
