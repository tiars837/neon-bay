// Neon Bay — shared helpers: seeded random, math, and procedural textures.
// Everything here is deterministic from a seed so the city, traffic and
// screenshots look the same on every load of the same build.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 2D circle-vs-AABB push-out. Returns the corrected position in `out` and
// whether a collision happened. Used for the player on foot and for cars
// (approximated as circles), which keeps collisions cheap and robust.
export function collideCircleAABBs(x, z, radius, boxes, out) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      x += dx * push;
      z += dz * push;
    } else {
      // Centre is inside the box: shove out along the smallest penetration.
      const pl = x - b.minX;
      const pr = b.maxX - x;
      const pt = z - b.minZ;
      const pb = b.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = b.minX - radius;
      else if (m === pr) x = b.maxX + radius;
      else if (m === pt) z = b.minZ - radius;
      else z = b.maxZ + radius;
    }
  }
  out.x = x;
  out.z = z;
  return hit;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// A canvas texture with a grid of lit/unlit windows, tinted per building.
// Generated at runtime: the game ships zero image files.
export function makeFacadeTexture(rng, base, floors, cols, litRatio) {
  const w = 64 * cols;
  const h = 48 * floors;
  const cv = document.createElement('canvas');
  cv.width = Math.max(64, w);
  cv.height = Math.max(48, h);
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, cv.width, cv.height);
  // Subtle vertical shading so big faces are not flat.
  const grad = g.createLinearGradient(0, 0, cv.width, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, 0, cv.width, cv.height);
  const cellW = cv.width / cols;
  const cellH = cv.height / floors;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < litRatio;
      const warm = rng();
      g.fillStyle = lit
        ? warm < 0.6
          ? '#ffd98a'
          : warm < 0.85
            ? '#9fd8ff'
            : '#ff9d6b'
        : '#10151f';
      g.fillRect(c * cellW + cellW * 0.22, f * cellH + cellH * 0.25, cellW * 0.56, cellH * 0.5);
    }
  }
  return cv;
}

// Asphalt with a dashed centre line running along the road (along the
// texture's u axis, so it reads correctly on both road orientations).
export function makeRoadTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#23262c';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = '#d8c25a';
  g.fillRect(0, 62, 128, 4);
  g.fillStyle = 'rgba(216,194,90,0.35)';
  g.fillRect(0, 10, 128, 2);
  g.fillRect(0, 116, 128, 2);
  return cv;
}

// Sand with a few speckles, for the beach strip.
export function makeSandTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9c08a';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(120,90,40,${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return cv;
}

// Format seconds as M:SS for the mission timer.
export function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function fmtMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
