// Neon Bay — the wanted system and the Neon Bay Police Department.
// Crimes add heat; heat sets the star level; stars decide how many police
// units hunt the player. Police cars chase and ram; on foot, officers close
// in and arrest. Lay low and the heat bleeds off.

import * as THREE from 'three';
import { clamp, lerp, angleLerp, dist2D, collideCircleAABBs, mulberry32 } from './util.js';
import { createCar, carTopSpeed } from './vehicles.js';
import { roadLines, HALF } from './city.js';

export const STAR_HEAT = [0, 20, 40, 60, 80, 100]; // heat needed per star
export const MAX_COPS = [0, 1, 2, 3, 4, 5];

export class Police {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(4242);
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeT = -100;
    this.cars = [];
    this.footCops = [];
    this.bustedT = 0; // fills while an officer holds the player on foot
    this.sirenOn = false;
    this.spawnT = 0;
  }

  addHeat(amount, now) {
    this.heat = clamp(this.heat + amount, 0, 120);
    this.lastCrimeT = now;
    this._updateStars();
  }

  _updateStars() {
    let s = 0;
    for (let i = 1; i <= 5; i++) if (this.heat >= STAR_HEAT[i]) s = i;
    this.stars = s;
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
    this.bustedT = 0;
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const c of this.footCops) this.scene.remove(c.mesh);
    this.cars = [];
    this.footCops = [];
  }

  update(dt, now, player, onBusted, onRam) {
    // Heat bleeds off when the player has been clean for a while.
    if (now - this.lastCrimeT > 9 && this.stars > 0) {
      this.heat = Math.max(0, this.heat - dt * 2.2);
      this._updateStars();
    }
    const want = MAX_COPS[this.stars];
    this.spawnT -= dt;
    if (this.cars.length + this.footCops.length < want && this.spawnT <= 0) {
      this.spawnT = 1.2;
      this._spawnUnit(player);
    }
    if (this.stars === 0 && this.cars.length === 0 && this.footCops.length === 0) {
      this.sirenOn = false;
      return;
    }
    if (this.stars === 0) {
      // Wanted cleared: the remaining units give up and drive off.
      for (const c of this.cars) this.scene.remove(c.mesh);
      for (const c of this.footCops) this.scene.remove(c.mesh);
      this.cars = [];
      this.footCops = [];
      this.sirenOn = false;
      this.bustedT = 0;
      return;
    }
    this.sirenOn = true;

    // --- police cars: chase the player and ram --------------------------------
    const px = player.pos.x;
    const pz = player.pos.z;
    for (const car of this.cars) {
      const dx = px - car.pos.x;
      const dz = pz - car.pos.z;
      const d = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, -dz);
      car.heading = angleLerp(car.heading, desired, 1 - Math.exp(-2.6 * dt));
      const targetSpeed = d > 26 ? carTopSpeed(car) : d > 8 ? 22 : 13;
      car.speed = lerp(car.speed, targetSpeed, 1 - Math.exp(-1.8 * dt));
      const fx = Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const out = { x: car.pos.x + fx * car.speed * dt, z: car.pos.z + fz * car.speed * dt };
      collideCircleAABBs(out.x, out.z, 1.9, this.colliders, out);
      car.pos.x = out.x;
      car.pos.z = out.z;
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.heading + Math.PI;
      const spin = (car.speed * dt) / 0.36;
      for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
      // Siren light bar flashes.
      car.sirenPhase += dt * 9;
      const red = car.mesh.getObjectByName('sirenRed');
      const blue = car.mesh.getObjectByName('sirenBlue');
      if (red && blue) {
        const on = Math.sin(car.sirenPhase) > 0;
        red.material.color.setHex(on ? 0xff2020 : 0x550000);
        blue.material.color.setHex(on ? 0x101050 : 0x2040ff);
      }
      // Ramming the player's car.
      if (player.car && d < 3.6) {
        player.car.speed *= 0.82;
        player.car.damage += dt * 6;
        if (onRam) onRam(d);
      }
    }

    // --- officers on foot: close in and arrest ---------------------------------
    let copNear = false;
    for (const cop of this.footCops) {
      const dx = px - cop.pos.x;
      const dz = pz - cop.pos.z;
      const d = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, -dz);
      cop.heading = angleLerp(cop.heading, desired, 1 - Math.exp(-5 * dt));
      const speed = d > 3 ? 4.6 : 0;
      cop.pos.x += Math.sin(cop.heading) * speed * dt;
      cop.pos.z += -Math.cos(cop.heading) * speed * dt;
      cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
      cop.mesh.rotation.y = cop.heading + Math.PI;
      if (!player.car && d < 2.4) copNear = true;
      // An officer who catches the player on foot holds them.
      if (!player.car && d < 1.8) {
        this.bustedT += dt;
      }
    }
    if (!copNear) this.bustedT = Math.max(0, this.bustedT - dt * 0.7);
    if (this.bustedT > 1.6) {
      this.bustedT = 0;
      if (onBusted) onBusted();
    }
  }

  _spawnUnit(player) {
    // Spawn on a road 40-70 m from the player, roughly behind the action.
    const road = roadLines[Math.floor(this.rng() * roadLines.length)];
    let x;
    let z;
    if (this.rng() < 0.5) {
      x = road;
      z = clamp(player.pos.z + (this.rng() < 0.5 ? -1 : 1) * (45 + this.rng() * 25), -HALF + 10, HALF + 10);
    } else {
      x = clamp(player.pos.x + (this.rng() < 0.5 ? -1 : 1) * (45 + this.rng() * 25), -HALF + 10, HALF + 10);
      z = road;
    }
    if (this.stars >= 2 && this.footCops.length < 2 && this.rng() < 0.45) {
      const cop = this._makeFootCop(x, z);
      this.footCops.push(cop);
      this.scene.add(cop.mesh);
      return;
    }
    const car = createCar('police', 0xf2f2f2, x, z, Math.atan2(player.pos.x - x, -(player.pos.z - z)));
    car.isPolice = true;
    car.speed = 8;
    this.cars.push(car);
    this.scene.add(car.mesh);
  }

  _makeFootCop(x, z) {
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.22), new THREE.MeshLambertMaterial({ color: 0x14181d }));
    legs.position.y = 0.4;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), navy);
    torso.position.y = 1.1;
    g.add(torso);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    badge.position.set(0.12, 1.2, 0.15);
    g.add(badge);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    head.position.y = 1.62;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.1, 10), navy);
    cap.position.y = 1.78;
    g.add(cap);
    g.position.set(x, 0, z);
    return { mesh: g, pos: g.position, heading: 0, health: 100, dead: false };
  }

  // A foot cop was shot. Returns true if that cop went down.
  hitFootCop(cop, damage) {
    cop.health -= damage;
    if (cop.health <= 0 && !cop.dead) {
      cop.dead = true;
      cop.mesh.rotation.x = -Math.PI / 2;
      cop.mesh.position.y = 0.25;
      const i = this.footCops.indexOf(cop);
      if (i >= 0) this.footCops.splice(i, 1);
      return true;
    }
    return false;
  }
}
