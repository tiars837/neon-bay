// Neon Bay — vehicles. Car meshes built from boxes and cylinders, arcade
// driving physics for the player, and traffic cars that loop the blocks on
// the right-hand lane. No imported models: every car is assembled here.

import * as THREE from 'three';
import { clamp, lerp, wrapAngle, angleLerp, dist2D, collideCircleAABBs } from './util.js';
import { roadLines, blockCenters, BLOCK, ROAD, HALF } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e6db0, 0xd8d8d8, 0x222831, 0xd8a020, 0x2e9e5b, 0x8e44ad, 0xe67e22, 0x7fb3d5, 0xb03a5b];

export function makeCarMesh(kind, color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18222e, shininess: 90 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181d });

  const isSport = kind === 'sport';
  const isVan = kind === 'van';
  const len = isVan ? 5.4 : isSport ? 4.6 : 4.4;
  const wid = isVan ? 2.1 : 1.9;
  const bodyH = isVan ? 1.15 : 0.72;

  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(wid * 0.86, isVan ? 0.85 : 0.6, len * (isVan ? 0.72 : 0.5)),
    isVan ? bodyMat : glassMat,
  );
  cabin.position.set(0, 0.62 + bodyH / 2 + (isVan ? 0.42 : 0.28), isVan ? -0.2 : -0.15);
  cabin.castShadow = true;
  g.add(cabin);

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wx = wid / 2;
  const wz = len / 2 - 0.75;
  for (const [x, z, front] of [[-wx, wz, true], [wx, wz, true], [-wx, -wz, false], [wx, -wz, false]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, 0.36, z);
    w.userData.front = front;
    g.add(w);
    wheels.push(w);
  }

  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const x of [-wid * 0.32, wid * 0.32]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    h.position.set(x, 0.66, len / 2 + 0.01);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    t.position.set(x, 0.66, -len / 2 - 0.01);
    g.add(t);
  }

  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), darkMat);
    bar.position.set(0, 1.62, -0.1);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.28, 1.62, -0.1);
    red.name = 'sirenRed';
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.28, 1.62, -0.1);
    blue.name = 'sirenBlue';
    g.add(blue);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    door.position.set(0, 0.62, wid / 2 + 0.01);
    door.rotation.y = Math.PI / 2;
    g.add(door);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    sign.position.set(0, 1.45, -0.15);
    g.add(sign);
  }

  g.userData.wheels = wheels;
  g.userData.len = len;
  g.userData.wid = wid;
  return g;
}

// One car's live state. `pos` is the ground point; heading 0 faces -z (north).
export function createCar(kind, color, x, z, heading = 0) {
  const mesh = makeCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  // The mesh's front (+z local) must point along the driving direction
  // (sin h, -cos h), so the mesh is rotated half a turn from the heading.
  mesh.rotation.y = heading + Math.PI;
  return {
    kind,
    color,
    mesh,
    pos: mesh.position,
    heading,
    speed: 0,
    steer: 0,
    damage: 0,
    isPlayer: false,
    isPolice: kind === 'police',
    ai: null,
    stuck: 0,
    sirenPhase: Math.random() * 2,
  };
}

export function carTopSpeed(car) {
  if (car.kind === 'sport') return 40;
  if (car.kind === 'police') return 36;
  if (car.kind === 'van') return 26;
  return 31;
}

// Arcade driving: accelerate, brake/reverse, steer scaled by speed, simple
// drag. Collisions push the car out of building AABBs and cost speed.
export function drivePlayerCar(car, input, dt, colliders, onCrash) {
  const top = carTopSpeed(car);
  const accel = car.kind === 'sport' ? 26 : 20;
  if (input.forward) car.speed += accel * dt;
  if (input.back) car.speed -= (car.speed > 0.5 ? 30 : 12) * dt;
  if (!input.forward && !input.back) car.speed -= car.speed * 0.55 * dt;
  car.speed -= car.speed * 0.12 * dt; // rolling drag
  car.speed = clamp(car.speed, -12, top);

  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const spd = Math.abs(car.speed);
  const steerRate = 1.9 * clamp(spd / 9, 0, 1) * (car.speed >= 0 ? 1 : -1);
  car.heading += steerInput * steerRate * dt;
  car.steer = lerp(car.steer, steerInput * 0.42, 1 - Math.exp(-10 * dt));

  const fx = Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const px = car.pos.x + fx * car.speed * dt;
  const pz = car.pos.z + fz * car.speed * dt;
  const out = { x: px, z: pz };
  const hit = collideCircleAABBs(px, pz, 1.9, colliders, out);
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 6 && onCrash) onCrash(impact, out.x, out.z);
    car.speed *= impact > 10 ? -0.25 : 0.2;
    car.damage += impact * 0.35;
  }
  // Soft world bounds: the sea and the far east/west edges stop cars.
  out.x = clamp(out.x, -HALF - 60, HALF + 62);
  out.z = clamp(out.z, -HALF - 60, HALF + 44);
  car.pos.x = out.x;
  car.pos.z = out.z;
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading + Math.PI;
  // Spin wheels, steer the front pair.
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.mesh.userData.wheels) {
    w.rotation.x += spin;
    if (w.userData.front) w.rotation.y = car.steer;
  }
  return hit;
}

// Keep two cars from overlapping: push both apart on the ground plane.
export function resolveCarPair(a, b) {
  const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
  const min = 3.4;
  if (d >= min || d < 0.001) return false;
  const push = (min - d) / 2;
  const nx = (a.pos.x - b.pos.x) / d;
  const nz = (a.pos.z - b.pos.z) / d;
  a.pos.x += nx * push;
  a.pos.z += nz * push;
  b.pos.x -= nx * push;
  b.pos.z -= nz * push;
  a.speed *= 0.7;
  b.speed *= 0.7;
  return true;
}

// --- traffic ------------------------------------------------------------------

export class Traffic {
  constructor(scene, rng) {
    this.scene = scene;
    this.cars = [];
    this.rng = rng;
    const kinds = ['sedan', 'sedan', 'taxi', 'van', 'sedan', 'sport'];
    for (let i = 0; i < 11; i++) {
      const kind = kinds[i % kinds.length];
      const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      const car = createCar(kind, color, 0, 0, 0);
      car.ai = this._newLoop(car);
      this.cars.push(car);
      scene.add(car.mesh);
    }
    // Parked cars along the streets, parallel to their road; the player can
    // steal any of them. Heading 0 faces north (-z), PI/2 faces east (+x).
    this.parked = [];
    const spots = [
      [roadLines[1] + 5.5, -60, 0, 'sedan', 0x2e6db0],
      [roadLines[5] - 5.5, 116, Math.PI, 'van', 0xd8d8d8],
      [58, roadLines[2] + 5.5, Math.PI / 2, 'sedan', 0xc0392b],
      [-116, roadLines[6] - 5.5, -Math.PI / 2, 'taxi', 0xd8a020],
      [roadLines[3] + 5.5, 174, 0, 'sedan', 0x2e9e5b],
      [-58, roadLines[4] - 5.5, Math.PI / 2, 'sedan', 0x8e44ad],
    ];
    for (const [x, z, h, kind, color] of spots) {
      const car = createCar(kind, color, x, z, h);
      this.parked.push(car);
      this.cars.push(car);
      scene.add(car.mesh);
    }
  }

  // A rectangular loop around one block, on the right-hand lane.
  _newLoop(car) {
    const bi = Math.floor(this.rng() * blockCenters.length);
    const bj = Math.floor(this.rng() * blockCenters.length);
    const cx = blockCenters[bi];
    const cz = blockCenters[bj];
    const wx = cx - BLOCK / 2 - ROAD / 2;
    const ex = cx + BLOCK / 2 + ROAD / 2;
    const nz = cz - BLOCK / 2 - ROAD / 2;
    const sz = cz + BLOCK / 2 + ROAD / 2;
    const o = 3.5;
    const pts = [
      { x: wx + o, z: nz + o },
      { x: ex - o, z: nz + o },
      { x: ex - o, z: sz - o },
      { x: wx + o, z: sz - o },
    ];
    const start = Math.floor(this.rng() * 4);
    car.pos.x = pts[start].x;
    car.pos.z = pts[start].z;
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    return { pts, idx: (start + 1) % 4, cruise: 9 + this.rng() * 5 };
  }

  update(dt, colliders, allCars) {
    for (const car of this.cars) {
      if (!car.ai || car.isPlayer) continue;
      const target = car.ai.pts[car.ai.idx];
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.ai.idx = (car.ai.idx + 1) % car.ai.pts.length;
        continue;
      }
      // Desired heading: forward is (sin h, -cos h), so h = atan2(dx, -dz).
      const desired = Math.atan2(dx, -dz);
      car.heading = angleLerp(car.heading, desired, 1 - Math.exp(-3.2 * dt));
      // Brake for the car ahead.
      let want = car.ai.cruise;
      const fx = Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      for (const other of allCars) {
        if (other === car || other.isPlayer) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const along = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (along > 0 && along < 9 && side < 2.6) want = Math.min(want, 2.5);
      }
      car.speed = lerp(car.speed, want, 1 - Math.exp(-1.6 * dt));
      car.pos.x += fx * car.speed * dt;
      car.pos.z += fz * car.speed * dt;
      const out = { x: car.pos.x, z: car.pos.z };
      if (collideCircleAABBs(car.pos.x, car.pos.z, 1.9, colliders, out)) {
        car.pos.x = out.x;
        car.pos.z = out.z;
        car.speed *= 0.4;
      }
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.heading + Math.PI;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    }
  }

  // The nearest car the player could enter, within 4.5 m. Police cars refuse.
  nearestEnterable(x, z) {
    let best = null;
    let bestD = 4.5;
    for (const car of this.cars) {
      if (car.isPlayer || car.isPolice) continue;
      const d = dist2D(x, z, car.pos.x, car.pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }
}
