// Neon Bay — pedestrians. Simple low-poly walkers who stroll the sidewalks,
// chat in place, and run away from gunfire, speeding cars and the player
// when the heat is on. They are the city's life, and its witnesses: hurting
// one is a crime the police notice.

import * as THREE from 'three';
import { clamp, lerp, wrapAngle, angleLerp, dist2D, collideCircleAABBs, pick } from './util.js';
import { blockCenters, BLOCK, ROAD, HALF } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00cec9];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a1a, 0x4a6741];

function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.78, 0.2), pantsMat);
  legs.position.y = 0.39;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirtMat);
  torso.position.y = 1.09;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x2a1a0e }));
  hair.position.y = 1.66;
  g.add(hair);
  // Arms swing while walking (animated from the update loop). Each arm gets
  // its own geometry: the pivot is translated to the shoulder.
  const armGeoL = new THREE.BoxGeometry(0.11, 0.58, 0.13);
  armGeoL.translate(0, -0.2, 0);
  const armL = new THREE.Mesh(armGeoL, shirtMat);
  armL.position.set(-0.29, 1.12, 0);
  g.add(armL);
  const armGeoR = new THREE.BoxGeometry(0.11, 0.58, 0.13);
  armGeoR.translate(0, -0.2, 0);
  const armR = new THREE.Mesh(armGeoR, shirtMat);
  armR.position.set(0.29, 1.12, 0);
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legs = legs;
  return g;
}

export class Pedestrians {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.list = [];
    for (let i = 0; i < 26; i++) {
      const mesh = makePersonMesh(
        pick(rng, SHIRTS),
        pick(rng, PANTS),
        pick(rng, [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac]),
      );
      const x = (rng() - 0.5) * (HALF * 2 - 40);
      const z = (rng() - 0.5) * (HALF * 2 - 40);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.list.push({
        mesh,
        pos: mesh.position,
        heading: rng() * Math.PI * 2,
        speed: 0,
        walkSpeed: 1.1 + rng() * 0.9,
        target: this._newTarget(x, z),
        state: 'walk', // walk | idle | flee
        fleeFrom: null,
        fleeT: 0,
        health: 100,
        dead: false,
        bob: rng() * 10,
        panic: 0,
      });
    }
  }

  _newTarget(x, z) {
    // A point on a nearby sidewalk: snap to the edge of a block.
    const bi = Math.floor(this.rng() * blockCenters.length);
    const bj = Math.floor(this.rng() * blockCenters.length);
    const cx = blockCenters[bi];
    const cz = blockCenters[bj];
    const side = Math.floor(this.rng() * 4);
    const half = BLOCK / 2 + ROAD / 2 - 1.5;
    if (side === 0) return { x: cx + (this.rng() - 0.5) * BLOCK, z: cz - half };
    if (side === 1) return { x: cx + (this.rng() - 0.5) * BLOCK, z: cz + half };
    if (side === 2) return { x: cx - half, z: cz + (this.rng() - 0.5) * BLOCK };
    return { x: cx + half, z: cz + (this.rng() - 0.5) * BLOCK };
  }

  // Something scary happened at (x, z): everyone nearby runs from it.
  scare(x, z, radius) {
    for (const p of this.list) {
      if (p.dead) continue;
      if (dist2D(p.pos.x, p.pos.z, x, z) < radius) {
        p.state = 'flee';
        p.fleeFrom = { x, z };
        p.fleeT = 3 + this.rng() * 2;
        p.panic = 1;
      }
    }
  }

  update(dt, playerPos, playerSpeed, time) {
    for (const p of this.list) {
      if (p.dead) continue;
      p.bob += dt * (p.state === 'flee' ? 11 : 7);
      let targetSpeed = 0;
      let tx = p.target.x;
      let tz = p.target.z;
      if (p.state === 'flee') {
        p.fleeT -= dt;
        const dx = p.pos.x - p.fleeFrom.x;
        const dz = p.pos.z - p.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = p.pos.x + (dx / d) * 20;
        tz = p.pos.z + (dz / d) * 20;
        targetSpeed = 4.2;
        if (p.fleeT <= 0) {
          p.state = 'walk';
          p.target = this._newTarget(p.pos.x, p.pos.z);
        }
      } else if (p.state === 'walk') {
        if (dist2D(p.pos.x, p.pos.z, tx, tz) < 1.5) {
          if (this.rng() < 0.35) {
            p.state = 'idle';
            p.idleT = 2 + this.rng() * 5;
          } else {
            p.target = this._newTarget(p.pos.x, p.pos.z);
          }
        }
        targetSpeed = p.walkSpeed;
      } else if (p.state === 'idle') {
        p.idleT -= dt;
        if (p.idleT <= 0) {
          p.state = 'walk';
          p.target = this._newTarget(p.pos.x, p.pos.z);
        }
      }
      // A fast car bearing down scares walkers out of the road.
      if (playerSpeed > 12 && dist2D(p.pos.x, p.pos.z, playerPos.x, playerPos.z) < 9 && p.state !== 'flee') {
        p.state = 'flee';
        p.fleeFrom = { x: playerPos.x, z: playerPos.z };
        p.fleeT = 2;
      }
      p.speed = lerp(p.speed, targetSpeed, 1 - Math.exp(-4 * dt));
      if (p.speed > 0.1) {
        const desired = Math.atan2(tx - p.pos.x, -(tz - p.pos.z));
        p.heading = angleLerp(p.heading, desired, 1 - Math.exp(-6 * dt));
        const fx = Math.sin(p.heading);
        const fz = -Math.cos(p.heading);
        const out = { x: p.pos.x + fx * p.speed * dt, z: p.pos.z + fz * p.speed * dt };
        collideCircleAABBs(out.x, out.z, 0.4, this.colliders, out);
        p.pos.x = clamp(out.x, -HALF - 20, HALF + 20);
        p.pos.z = clamp(out.z, -HALF - 20, HALF + 44);
      }
      p.mesh.position.set(p.pos.x, Math.abs(Math.sin(p.bob)) * 0.05 * (p.speed / 4), p.pos.z);
      p.mesh.rotation.y = p.heading + Math.PI;
      const swing = Math.sin(p.bob) * 0.5 * clamp(p.speed / 3, 0, 1);
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
      p.panic = Math.max(0, p.panic - dt * 0.4);
    }
  }

  // Damage one pedestrian; returns true if they went down.
  hit(p, damage, fromX, fromZ) {
    if (p.dead) return false;
    p.health -= damage;
    this.scare(fromX, fromZ, 26);
    if (p.health <= 0) {
      p.dead = true;
      p.mesh.rotation.x = -Math.PI / 2;
      p.mesh.position.y = 0.25;
      return true;
    }
    return false;
  }

  nearest(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const p of this.list) {
      if (p.dead) continue;
      const d = dist2D(x, z, p.pos.x, p.pos.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
}
