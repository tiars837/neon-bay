// Neon Bay — the city. A procedural coastal grid: 7x7 blocks of towers and
// shops, a beach and sea to the south, a pier, container docks to the east,
// a plaza at the centre and a safehouse in the north-west. Every texture is
// painted on a canvas at load time; the game ships no image files.

import * as THREE from 'three';
import { mulberry32, clamp, lerp, pick, makeFacadeTexture, makeRoadTexture, makeSandTexture } from './util.js';

export const BLOCK = 44;
export const ROAD = 14;
export const N = 7;
export const SPAN = N * BLOCK + (N + 1) * ROAD; // 420
export const HALF = SPAN / 2; // 210
export const SEED = 20261117;

export const roadLines = [];
for (let i = 0; i <= N; i++) roadLines.push(-HALF + ROAD / 2 + i * (BLOCK + ROAD));
export const blockCenters = [];
for (let i = 0; i < N; i++) blockCenters.push(-HALF + ROAD + BLOCK / 2 + i * (BLOCK + ROAD));

const DAY_SKY = new THREE.Color(0x87bfe8);
const DUSK_SKY = new THREE.Color(0xff9a5c);
const NIGHT_SKY = new THREE.Color(0x0a1024);
const DAY_FOG = new THREE.Color(0x9fc6e8);
const NIGHT_FOG = new THREE.Color(0x0a1024);

function textTexture(text, fg, bg, font = 'bold 64px Arial') {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fg;
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function canvasTexture(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(SEED);
  const group = new THREE.Group();
  group.name = 'NeonBayCity';
  scene.add(group);

  const colliders = [];
  const lampHeads = [];
  const buildingMats = [];
  const neonMats = [];

  // --- ground -----------------------------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SPAN + 160, SPAN + 160), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(20, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Beach strip and sea to the south (positive z).
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN + 160, 46),
    new THREE.MeshLambertMaterial({ map: canvasTexture(makeSandTexture()) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(20, 0.02, HALF + 23);
  sand.receiveShadow = true;
  group.add(sand);

  const seaMat = new THREE.MeshPhongMaterial({ color: 0x1a6f9e, shininess: 120, specular: 0x88bbdd });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 700), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(20, -0.4, HALF + 46 + 350);
  group.add(sea);

  // Foam line where the sea meets the sand.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN + 160, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.75 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(20, 0.06, HALF + 46);
  group.add(foam);

  // --- roads ------------------------------------------------------------------
  const roadTex = canvasTexture(makeRoadTexture());
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  // Repeat along the road so the asphalt grain stays square, not stretched.
  roadTex.repeat.set(30, 1);
  const roadMatX = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadMatZ = roadMatX.clone();
  roadMatZ.map = roadTex.clone();
  roadMatZ.map.needsUpdate = true;
  for (const line of roadLines) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, ROAD), roadMatX);
    rx.rotation.x = -Math.PI / 2;
    rx.rotation.z = Math.PI / 2;
    rx.position.set(line, 0.01, 0);
    rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, ROAD), roadMatZ);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(0, 0.01, line);
    rz.receiveShadow = true;
    group.add(rz);
  }

  // --- blocks, buildings, parks ----------------------------------------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const palette = ['#5a6b7d', '#7d6a5a', '#5d7a6a', '#6d5a7d', '#8a7a5a', '#4a5a6d', '#7d5a5a'];
  const downtown = (bx, bz) => Math.max(0, 1 - Math.hypot(bx, bz) / (HALF * 0.75));
  const plazaIdx = Math.floor(N / 2);

  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const cx = blockCenters[bi];
      const cz = blockCenters[bj];
      // Plaza at the centre block: open park, no buildings.
      const isPlaza = bi === plazaIdx && bj === plazaIdx;
      // Curb slab for the whole block.
      const slab = new THREE.Mesh(
        boxGeo,
        new THREE.MeshLambertMaterial({ color: isPlaza ? 0x6f8f5f : 0x9aa0a8 }),
      );
      slab.scale.set(BLOCK + 2, 0.4, BLOCK + 2);
      slab.position.set(cx, 0.2, cz);
      slab.receiveShadow = true;
      group.add(slab);
      if (isPlaza) continue;
      // A few blocks are pocket parks instead of towers.
      if (rng() < 0.12) {
        for (let p = 0; p < 5; p++) {
          const palm = makePalm(rng);
          palm.position.set(cx + (rng() - 0.5) * 34, 0.4, cz + (rng() - 0.5) * 34);
          group.add(palm);
        }
        continue;
      }
      const count = rng() < 0.45 ? 1 : rng() < 0.8 ? 2 : 4;
      const slots = count === 1 ? [[0, 0, 34, 34]] : count === 2
        ? [[-10, 0, 18, 34], [10, 0, 18, 34]]
        : [[-10, -10, 17, 17], [10, -10, 17, 17], [-10, 10, 17, 17], [10, 10, 17, 17]];
      for (const [ox, oz, w, d] of slots) {
        const h = Math.round((8 + downtown(cx, cz) * 52 + rng() * 18) * 2) / 2;
        const floors = Math.max(2, Math.round(h / 3.4));
        const cols = Math.max(2, Math.round(w / 5));
        const base = pick(rng, palette);
        const tex = canvasTexture(makeFacadeTexture(rng, base, floors, cols, 0.28));
        const mat = new THREE.MeshLambertMaterial({
          map: tex,
          emissive: 0xffffff,
          emissiveMap: tex,
          emissiveIntensity: 0,
        });
        buildingMats.push(mat);
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox, 0.4 + h / 2, cz + oz);
        b.castShadow = true;
        b.receiveShadow = true;
        group.add(b);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
        // Roof clutter on some towers.
        if (rng() < 0.5) {
          const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3a4048 }));
          ac.scale.set(3 + rng() * 3, 1.2, 3 + rng() * 3);
          ac.position.set(cx + ox + (rng() - 0.5) * w * 0.4, 0.4 + h + 0.6, cz + oz + (rng() - 0.5) * d * 0.4);
          group.add(ac);
        }
      }
    }
  }

  // Neon signs on the plaza tower and the pier — the city's signature glow.
  const signDefs = [
    { text: 'NEON BAY', fg: '#39f5ff', bg: '#0a0a18', x: 0, y: 46, z: -23.5, ry: 0, w: 34, h: 8.5 },
    { text: 'PIER 9', fg: '#ff9de2', bg: '#120a18', x: -8, y: 9, z: 214, ry: 0, w: 16, h: 4 },
    { text: 'DOCKS', fg: '#ffd23e', bg: '#141008', x: 216, y: 12, z: -40, ry: -Math.PI / 2, w: 20, h: 5 },
  ];
  for (const s of signDefs) {
    const mat = new THREE.MeshBasicMaterial({ map: textTexture(s.text, s.fg, s.bg) });
    neonMats.push(mat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    sign.position.set(s.x, s.y, s.z);
    sign.rotation.y = s.ry;
    group.add(sign);
  }
  // A tall plaza tower to carry the NEON BAY sign.
  const towerMat = new THREE.MeshLambertMaterial({
    map: canvasTexture(makeFacadeTexture(mulberry32(7), '#3d4a5c', 16, 6, 0.4)),
    emissive: 0xffffff,
    emissiveMap: canvasTexture(makeFacadeTexture(mulberry32(7), '#3d4a5c', 16, 6, 0.4)),
    emissiveIntensity: 0,
  });
  buildingMats.push(towerMat);
  const tower = new THREE.Mesh(boxGeo, towerMat);
  tower.scale.set(30, 44, 30);
  tower.position.set(0, 0.4 + 22, -40);
  tower.castShadow = true;
  group.add(tower);
  colliders.push({ minX: -15, maxX: 15, minZ: -55, maxZ: -25 });

  // --- plaza dressing: palms, fountain, benches --------------------------------
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const palm = makePalm(rng);
    palm.position.set(Math.cos(a) * 16, 0.4, Math.sin(a) * 16);
    group.add(palm);
  }
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.6, 1.1, 20),
    new THREE.MeshLambertMaterial({ color: 0x7a8894 }),
  );
  fountain.position.set(0, 0.9, 0);
  group.add(fountain);
  colliders.push({ minX: -4.6, maxX: 4.6, minZ: -4.6, maxZ: 4.6 });
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.6, 0.3, 20),
    new THREE.MeshPhongMaterial({ color: 0x2f9fd8, shininess: 140 }),
  );
  water.position.set(0, 1.35, 0);
  group.add(water);

  // --- beach palms -------------------------------------------------------------
  for (let i = 0; i < 14; i++) {
    const palm = makePalm(rng);
    palm.position.set(-HALF + 12 + i * (SPAN / 13) + (rng() - 0.5) * 6, 0.02, HALF + 10 + rng() * 8);
    group.add(palm);
  }

  // --- the pier ------------------------------------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(boxGeo, pierMat);
  pier.scale.set(10, 1.2, 92);
  pier.position.set(0, 0.8, HALF + 46);
  pier.castShadow = true;
  group.add(pier);
  colliders.push({ minX: -5, maxX: -4, minZ: HALF, maxZ: HALF + 92 });
  colliders.push({ minX: 4, maxX: 5, minZ: HALF, maxZ: HALF + 92 });
  for (let i = 0; i < 6; i++) {
    const lamp = makeLamp();
    lamp.position.set(i % 2 === 0 ? -4.4 : 4.4, 1.4, HALF + 12 + i * 14);
    group.add(lamp);
    lampHeads.push(lamp.children[1].material);
  }
  const pierEnd = new THREE.Mesh(boxGeo, pierMat);
  pierEnd.scale.set(22, 1.2, 12);
  pierEnd.position.set(0, 0.8, HALF + 92);
  group.add(pierEnd);

  // --- docks (east edge) ---------------------------------------------------------
  const dockSlab = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6a6f75 }));
  dockSlab.scale.set(70, 0.5, 190);
  dockSlab.position.set(HALF + 35, 0.25, -30);
  group.add(dockSlab);
  const containerColors = [0xb03a2e, 0x2e6db0, 0x2e9e5b, 0xd8a020, 0x7a4a9e];
  const dockRng = mulberry32(99);
  for (let i = 0; i < 10; i++) {
    const w = 12;
    const h = 2.6 + dockRng() * 2.6;
    const c = new THREE.Mesh(
      boxGeo,
      new THREE.MeshLambertMaterial({ color: pick(dockRng, containerColors) }),
    );
    const cx = HALF + 18 + dockRng() * 34;
    const cz = -110 + i * 17 + (dockRng() - 0.5) * 4;
    c.scale.set(w, h, 2.6);
    c.position.set(cx, 0.5 + h / 2, cz);
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: cx - 6, maxX: cx + 6, minZ: cz - 1.3, maxZ: cz + 1.3 });
  }
  // Two gantry cranes, simple frames.
  for (const cz of [-90, 30]) {
    const crane = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
    for (const dx of [-8, 8]) {
      const leg = new THREE.Mesh(boxGeo, legMat);
      leg.scale.set(2, 26, 2);
      leg.position.set(dx, 13, 0);
      crane.add(leg);
    }
    const beam = new THREE.Mesh(boxGeo, legMat);
    beam.scale.set(20, 2, 3);
    beam.position.set(0, 26, 0);
    crane.add(beam);
    const hook = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x222222 }));
    hook.scale.set(2, 4, 2);
    hook.position.set(4, 22, 0);
    crane.add(hook);
    crane.position.set(HALF + 30, 0.5, cz);
    group.add(crane);
  }

  // --- street lamps along the roads ----------------------------------------------
  for (const line of roadLines) {
    for (let k = 0; k < 5; k++) {
      const t = -HALF + 30 + k * 90 + (rng() - 0.5) * 10;
      const lampA = makeLamp();
      lampA.position.set(line + 8.5, 0, t);
      group.add(lampA);
      lampHeads.push(lampA.children[1].material);
      const lampB = makeLamp();
      lampB.position.set(t, 0, line + 8.5);
      group.add(lampB);
      lampHeads.push(lampB.children[1].material);
    }
  }

  // --- lights ----------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.Fog(DAY_FOG.getHex(), 260, 900);
  scene.background = DAY_SKY.clone();

  return {
    group,
    colliders,
    lampHeads,
    buildingMats,
    neonMats,
    sun,
    hemi,
    seaMat,
    spawn: { x: 0, z: 26 },
    pierPos: { x: 0, z: HALF + 86 },
    docksPos: { x: HALF + 30, z: -30 },
    safehousePos: { x: blockCenters[0], z: blockCenters[0] },
    plazaPos: { x: 0, z: 0 },
    cometPos: { x: 24, z: 24 },
    update(dt, timeOfDay, elapsed) {
      // timeOfDay 0..1, 0 = midnight, 0.5 = noon. Sun circles overhead.
      const ang = (timeOfDay - 0.25) * Math.PI * 2;
      const elev = Math.sin(ang);
      const dayness = clamp(elev * 1.6 + 0.35, 0, 1);
      const duskness = clamp(1 - Math.abs(elev) * 3.2, 0, 1) * (elev > -0.15 ? 1 : 0);
      sun.position.set(Math.cos(ang) * 420, Math.max(40, elev * 420 + 60), 180);
      sun.intensity = 0.12 + dayness * 2.3;
      sun.color.setHSL(0.09 + dayness * 0.02, 0.55, 0.55 + dayness * 0.25);
      hemi.intensity = 0.25 + dayness * 0.7;
      const sky = NIGHT_SKY.clone().lerp(DAY_SKY, dayness).lerp(DUSK_SKY, duskness * 0.55);
      scene.background = sky;
      scene.fog.color.copy(NIGHT_FOG).lerp(DAY_FOG, dayness).lerp(DUSK_SKY, duskness * 0.4);
      const nightness = 1 - dayness;
      for (const m of buildingMats) m.emissiveIntensity = nightness * 0.85;
      for (const m of lampHeads) {
        m.emissiveIntensity = nightness * 2.2;
        m.color.setHex(nightness > 0.4 ? 0xffe9a8 : 0x888888);
      }
      for (const m of neonMats) m.color.setScalar(0.55 + nightness * 0.45);
      seaMat.color.setHSL(0.55, 0.65, 0.16 + dayness * 0.22);
      // Gentle sea shimmer.
      sea.position.y = -0.4 + Math.sin(elapsed * 0.5) * 0.08;
      return { dayness, nightness, duskness };
    },
  };
}

function makePalm(rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 5.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5a38 }),
  );
  trunk.position.y = 2.6;
  trunk.rotation.z = (rng() - 0.5) * 0.14;
  trunk.castShadow = true;
  g.add(trunk);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4a });
  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 7), crownMat);
  crown.position.y = 5.8;
  crown.scale.y = 0.55;
  g.add(crown);
  const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.4, 7), crownMat);
  crown2.position.y = 6.6;
  crown2.scale.y = 0.55;
  g.add(crown2);
  return g;
}

function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c313a }),
  );
  pole.position.y = 3.2;
  g.add(pole);
  const headMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), headMat);
  head.position.y = 6.5;
  g.add(head);
  return g;
}
