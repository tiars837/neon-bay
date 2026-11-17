// Neon Bay — the game itself. Boots the renderer, owns the player, the
// third-person camera, the frame loop, particles, damage, death and
// respawn, and wires city, traffic, pedestrians, police, missions, combat,
// HUD, sound and save together. All original: a fictional coastal city,
// its own people, cars and story.

import * as THREE from 'three';
import { clamp, lerp, damp, angleLerp, mulberry32, dist2D, collideCircleAABBs, fmtMoney } from './util.js';
import { buildCity, SEED, HALF } from './city.js';
import { Traffic, drivePlayerCar, createCar, resolveCarPair } from './vehicles.js';
import { Pedestrians } from './people.js';
import { Police, STAR_HEAT } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { readShotParams, applyShot } from './shots.js';

const DAY_LENGTH = 480; // seconds of play per full day/night cycle

class Particles {
  constructor(scene, max = 400) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.positions[i * 3 + 1] = -100;
  }

  burst(x, y, z, color, count, speed, life, gravity) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * Math.cos(e) * s;
      this.vel[i * 3 + 1] = Math.abs(Math.sin(e)) * s + speed * 0.3;
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
      this.life[i] = life * (0.6 + Math.random() * 0.7);
      this.maxLife[i] = this.life[i];
      this.grav[i] = gravity;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.colors[i * 3] *= 0.985 + f * 0.01;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0e7c7b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.8, 0.22), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), jacket);
  torso.position.y = 1.11;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.64;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0xffd23e }));
  cap.position.y = 1.8;
  g.add(cap);
  const armGeo = new THREE.BoxGeometry(0.12, 0.58, 0.14);
  const armL = new THREE.Mesh(armGeo, jacket);
  armL.position.set(-0.32, 1.12, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo, jacket);
  armR.position.set(0.32, 1.12, 0);
  g.add(armR);
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

export class Game {
  constructor() {
    // Quality is chosen up front: software renderers choke on MSAA, so
    // `?fx=low` (also the play-test's mode) renders without it.
    this.lowFx = new URLSearchParams(window.location.search).get('fx') === 'low';
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.lowFx });
    this.renderer.setPixelRatio(this.lowFx ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.clock = new THREE.Clock();
    this.rng = mulberry32(SEED);

    this.city = buildCity(this.scene);
    this.traffic = new Traffic(this.scene, mulberry32(SEED + 11));
    this.peds = new Pedestrians(this.scene, mulberry32(SEED + 23), this.city.colliders);
    this.police = new Police(this.scene, this.city.colliders);
    this.particles = new Particles(this.scene);
    this.hud = new Hud();
    this.input = new Input(this.canvas);
    this.sound = new SoundEngine();

    this.playerMesh = makePlayerMesh();
    this.scene.add(this.playerMesh);

    this.player = {
      pos: new THREE.Vector3(0, 0, 26),
      vel: new THREE.Vector3(),
      vy: 0,
      heading: Math.PI,
      health: 100,
      money: 250,
      car: null,
      lastHurtT: -100,
      walkBob: 0,
    };
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 7;
    this.timeOfDay = 0.42;
    this.elapsed = 0;
    this.state = 'menu'; // menu | playing | paused | dead | busted
    this.customObjective = '';
    this.frame = 0;
    this.menuAngle = 0;
    this.smokeT = 0;
    this.carWrecked = false;

    this.combat = new Combat(this.scene, {
      onShot: () => {
        this.sound.gunshot();
        this.police.addHeat(4, this.elapsed);
        this.peds.scare(this.player.pos.x, this.player.pos.z, 30);
      },
      onReload: () => this.sound.reload(),
      onPunch: (hit) => {
        this.sound.punch();
        if (!hit) return;
        this.peds.scare(this.player.pos.x, this.player.pos.z, 12);
      },
      onHitPed: (ped, dmg) => {
        const died = this.peds.hit(ped, dmg, this.player.pos.x, this.player.pos.z);
        this.police.addHeat(died ? 30 : 15, this.elapsed);
        if (died) this.hud.toast('You took someone down. The police saw that.');
        return died;
      },
      onHitCop: (cop, dmg) => {
        const died = this.police.hitFootCop(cop, dmg);
        this.police.addHeat(died ? 45 : 20, this.elapsed);
        return died;
      },
      onHitCar: (car, dmg, point) => {
        car.damage += dmg;
        this.particles.burst(point.x, point.y, point.z, 0xffd23e, 6, 4, 0.4, 4);
        if (car.isPolice) this.police.addHeat(8, this.elapsed);
      },
    });

    this.missions = new Missions(this.scene, this.city, {
      onToast: (t) => this.hud.toast(t),
      onStart: (m) => {
        this.hud.toast(`New mission: ${m.title} — ${m.brief}`, 6);
        this.sound.pickup();
        if (m.id === 3) this.setWanted(3); // the Heat Run starts hot
      },
      onReward: (amount, m) => {
        this.player.money += amount;
        this.hud.toast(`Mission complete: ${m.title} — earned ${fmtMoney(amount)}`, 5);
        this.hud.dialog(m.title + ' paid out. ' + fmtMoney(amount) + ' in your pocket.');
        this.sound.missionDone();
        this._save();
      },
      onFail: (m, reason) => {
        this.hud.toast(`Mission failed: ${m.title} — ${reason} Try again.`, 5);
        this.sound.missionFail();
      },
      onComplete: (m) => {
        if (m.id === 2 && this.player.car) {
          // The buyer drives the Comet away; you step out at the docks.
          this._exitCar();
        }
      },
    });

    // Headlight for night driving (one spotlight, moved between cars).
    this.headlight = new THREE.SpotLight(0xfff2c0, 0, 42, 0.62, 0.5, 1.2);
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0, 18);
    this.headlight.target = this.headlightTarget;

    this._wireMenus();
    window.addEventListener('resize', () => this._resize());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !this._shotMode) {
        this.pause();
      }
    });
    this._shotMode = false;
    this._resize();
  }

  // --- menus -------------------------------------------------------------------

  _wireMenus() {
    const $ = (id) => document.getElementById(id);
    $('btn-start').addEventListener('click', () => {
      this.sound.ensure();
      this.sound.click();
      clearSave();
      this.startGame();
    });
    $('btn-continue').addEventListener('click', () => {
      this.sound.ensure();
      this.sound.click();
      this.startGame(true);
    });
    $('btn-resume').addEventListener('click', () => {
      this.sound.click();
      this.resume();
    });
    $('btn-save').addEventListener('click', () => {
      this.sound.click();
      if (this._save()) this.hud.toast('Game saved.');
      else this.hud.toast('Could not save in this browser.');
    });
    $('btn-restart').addEventListener('click', () => location.reload());
    $('btn-quit').addEventListener('click', () => {
      this.sound.click();
      this.showMenu();
    });
    $('btn-respawn').addEventListener('click', () => {
      this.sound.click();
      this._respawn();
    });
    $('btn-mute').addEventListener('click', () => {
      this.sound.ensure();
      this.sound.setMuted(!this.sound.muted);
      $('btn-mute').textContent = this.sound.muted ? '🔇 Sound: off' : '🔊 Sound: on';
    });
    if (hasSave()) $('btn-continue').style.display = 'inline-block';
  }

  showMenu() {
    this.state = 'menu';
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  startGame(fromSave = false) {
    this.sound.ensure();
    this.state = 'playing';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    if (fromSave) {
      const s = loadGame();
      if (s) this._applySave(s);
    } else if (!this._startedOnce) {
      this._startedOnce = true;
      this.missions.startMission(0);
      this.hud.dialog('Neon Bay. You are fresh off the night bus with $250 and a name to make. Mara Voss is waiting on Pier 9.', 8);
    }
    this._lockPointer();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    document.getElementById('pause').classList.add('hidden');
    this._lockPointer();
  }

  // Pointer lock can refuse (headless browser, iframe, user gesture rules):
  // a refusal must never surface as an unhandled rejection.
  _lockPointer() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // No pointer lock available; drag-to-look still works.
    }
  }

  teleportPlayer(x, z, heading) {
    this.player.pos.set(x, 0, z);
    this.player.heading = heading;
    this.camYaw = heading;
    this.playerMesh.position.copy(this.player.pos);
    this.playerMesh.rotation.y = heading + Math.PI;
  }

  giveCar(kind, color, x, z, heading) {
    const car = createCar(kind, color, x, z, heading);
    this.scene.add(car.mesh);
    this.traffic.cars.push(car);
    this._enterCar(car, false);
    return car;
  }

  driveComet() {
    const comet = this.missions.cometCar;
    if (!comet) return null;
    comet.pos.x = 150;
    comet.pos.z = -30;
    comet.heading = Math.PI / 2;
    comet.mesh.position.set(150, 0, -30);
    this._enterCar(comet, false);
    return comet;
  }

  setPlayerCarSpeed(kmh) {
    if (this.player.car) this.player.car.speed = kmh / 3.6;
  }

  setWanted(stars) {
    this.police.heat = STAR_HEAT[clamp(stars, 0, 5)];
    this.police._updateStars();
    this.police.lastCrimeT = this.elapsed;
  }

  // Put police cars on the player's tail right now (used by the chase
  // screenshot setup; the regular spawn timer does the same over time).
  // One unit rides the tail, one comes head-on up the road, so the chase
  // reads in a still frame too.
  placePoliceChase() {
    const p = this.player;
    // When driving, player.pos only catches up with the car in the frame
    // loop, so read the car's spot directly here.
    const px = p.car ? p.car.pos.x : p.pos.x;
    const pz = p.car ? p.car.pos.z : p.pos.z;
    const back = p.car ? p.car.heading : p.heading;
    const spots = [
      { d: -18, side: -2, heading: back, speed: 20 },
      { d: 34, side: 4, heading: back + Math.PI, speed: 14 },
    ];
    for (const s of spots) {
      const bx = px + Math.sin(back) * s.d + Math.cos(back) * s.side;
      const bz = pz - Math.cos(back) * s.d + Math.sin(back) * s.side;
      const car = createCar('police', 0xf2f2f2, bx, bz, s.heading);
      car.isPolice = true;
      car.speed = s.speed;
      this.police.cars.push(car);
      this.scene.add(car.mesh);
    }
    this.police.sirenOn = true;
  }

  // The intro dialog is story text for real play; screenshots hide it so
  // the frame shows the game, not the welcome message.
  clearDialog() {
    this.hud.hideDialog();
  }

  setTimeOfDay(t) {
    this.timeOfDay = t;
  }

  setObjective(text) {
    this.customObjective = text;
  }

  startMissionTwo() {
    this.missions.startMission(1);
  }

  get debugState() {
    return {
      state: this.state,
      health: this.player.health,
      money: this.player.money,
      wanted: this.police.stars,
      heat: this.police.heat,
      inCar: !!this.player.car,
      carSpeedKmh: this.player.car ? Math.abs(this.player.car.speed) * 3.6 : 0,
      carDamage: this.player.car ? this.player.car.damage : 0,
      ammo: this.combat.ammo,
      mission: this.missions.current ? this.missions.current.title : 'none',
      missionState: this.missions.state,
      missionIndex: this.missions.index,
      missionTimer: this.missions.timer,
      playerX: this.player.pos.x,
      playerZ: this.player.pos.z,
      carX: this.player.car ? this.player.car.pos.x : null,
      carZ: this.player.car ? this.player.car.pos.z : null,
      timeOfDay: this.timeOfDay,
      policeCars: this.police.cars.length,
      footCops: this.police.footCops.length,
      traffic: this.traffic.cars.length,
      pedsAlive: this.peds.list.filter((p) => !p.dead).length,
    };
  }

  // --- driving -------------------------------------------------------------------

  _enterCar(car, steal = true) {
    if (this.player.car) return;
    if (steal) {
      const wasTraffic = !!car.ai;
      car.ai = null;
      this.police.addHeat(wasTraffic ? 22 : 8, this.elapsed);
      this.hud.toast(wasTraffic ? 'You yanked the driver out and took the car!' : 'You took the car.');
      if (car === this.missions.cometCar && this.missions.active) {
        this.police.addHeat(40, this.elapsed);
        this.hud.toast('The Comet GT is hot — the law is coming.', 4);
      }
      this.sound.pickup();
    }
    car.isPlayer = true;
    this.player.car = car;
    this.playerMesh.visible = false;
    car.mesh.add(this.headlight);
    car.mesh.add(this.headlightTarget);
  }

  _exitCar() {
    const car = this.player.car;
    if (!car) return;
    car.isPlayer = false;
    car.speed = 0;
    this.player.car = null;
    const rx = Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    this.player.pos.set(car.pos.x + rx * 2.6, 0, car.pos.z + rz * 2.6);
    this.player.heading = car.heading;
    this.camYaw = car.heading;
    this.playerMesh.visible = true;
    this.playerMesh.position.copy(this.player.pos);
    car.mesh.remove(this.headlight);
    car.mesh.remove(this.headlightTarget);
    this.scene.add(this.headlight);
    this.scene.add(this.headlightTarget);
  }

  // --- save / load ---------------------------------------------------------------

  _save() {
    const p = this.player;
    return saveGame({
      money: p.money,
      health: p.health,
      ammo: this.combat.ammo,
      reserve: this.combat.reserve,
      missionIndex: this.missions.index,
      wantedHeat: this.police.heat,
      timeOfDay: this.timeOfDay,
      player: { x: p.pos.x, z: p.pos.z, heading: p.heading },
      inCar: !!p.car,
      car: p.car ? { kind: p.car.kind, color: p.car.color, x: p.car.pos.x, z: p.car.pos.z, heading: p.car.heading } : null,
    });
  }

  _applySave(s) {
    this.player.money = s.money;
    this.player.health = s.health;
    this.combat.ammo = s.ammo;
    this.combat.reserve = s.reserve;
    this.police.heat = s.wantedHeat || 0;
    this.police._updateStars();
    this.timeOfDay = s.timeOfDay ?? 0.42;
    this.teleportPlayer(s.player.x, s.player.z, s.player.heading);
    if (s.inCar && s.car) {
      const car = createCar(s.car.kind, s.car.color, s.car.x, s.car.z, s.car.heading);
      this.scene.add(car.mesh);
      this.traffic.cars.push(car);
      this._enterCar(car, false);
    }
    if (s.missionIndex < 3) this.missions.startMission(s.missionIndex);
  }

  _respawn() {
    const lost = Math.floor(this.player.money * 0.12);
    this.player.money -= lost;
    this.player.health = 100;
    this.police.clear();
    this.combat.ammo = 12;
    this.combat.reserve = 96;
    if (this.player.car) this._exitCar();
    this.teleportPlayer(0, 26, Math.PI);
    this.state = 'playing';
    document.getElementById('end').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.hud.toast(`You wake up at Neon Bay General. Lost ${fmtMoney(lost)} in fees.`, 5);
    this._lockPointer();
  }

  _die(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.sound.busted();
    document.getElementById('end-title').textContent = cause === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('end-text').textContent =
      cause === 'busted'
        ? 'The Neon Bay PD hauled you in. Your lawyer will sort it out — for a fee.'
        : 'Neon Bay General patched you up. The city is still out there.';
    document.getElementById('end').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // --- frame loop ------------------------------------------------------------------

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _shootTargets() {
    const targets = [];
    for (const p of this.peds.list) {
      if (p.dead) continue;
      p.mesh.userData.targetRef = { kind: 'ped', ref: p };
      targets.push({ mesh: p.mesh });
    }
    for (const cop of this.police.footCops) {
      if (cop.dead) continue;
      cop.mesh.userData.targetRef = { kind: 'cop', ref: cop };
      targets.push({ mesh: cop.mesh });
    }
    const allCars = this._allCars();
    for (const car of allCars) {
      car.mesh.userData.targetRef = { kind: 'car', ref: car };
      targets.push({ mesh: car.mesh });
    }
    return targets;
  }

  _allCars() {
    const cars = [...this.traffic.cars, ...this.police.cars];
    if (this.missions.cometCar && !cars.includes(this.missions.cometCar)) cars.push(this.missions.cometCar);
    return cars;
  }

  _updatePlaying(dt) {
    const p = this.player;
    const now = this.elapsed;
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;

    // --- input: look, actions ------------------------------------------------
    const look = this.input.consumeLook();
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + look.dy * 0.0026, -0.15, 1.1);
    if (this.input.consume('KeyM')) {
      this.sound.setMuted(!this.sound.muted);
    }
    if (this.input.consume('KeyP') || this.input.consume('Escape')) this.pause();
    if (this.input.consume('KeyR')) this.combat.reload();

    const inCarAtStart = !!p.car;
    if (this.input.consume('KeyE')) {
      if (inCarAtStart) this._exitCar();
      else {
        const car = this.traffic.nearestEnterable(p.pos.x, p.pos.z)
          || (this.missions.cometCar && dist2D(p.pos.x, p.pos.z, this.missions.cometCar.pos.x, this.missions.cometCar.pos.z) < 4.5
            ? this.missions.cometCar
            : null);
        if (car) this._enterCar(car, true);
      }
    }
    if (this.input.consume('KeyF') && !p.car) {
      this.combat.punch(p.pos, this.camYaw, this.peds, this.police.footCops);
    }

    // Re-read: E may have just put the player in a car, or out of one.
    let inCar = !!p.car;

    // --- movement -------------------------------------------------------------
    if (inCar) {
      const car = p.car;
      drivePlayerCar(car, this.input, dt, this.city.colliders, (impact, x, z) => {
        this.sound.crash(clamp(impact / 25, 0.2, 1));
        this.particles.burst(x, 1, z, 0xffd23e, 14, 6, 0.6, 9);
        this.hud.flashDamage();
        if (impact > 14) {
          p.health = Math.max(0, p.health - (impact - 14) * 0.8);
          p.lastHurtT = now;
        }
      });
      // The player rides with the car: every system that reads player.pos
      // (missions, minimap, police, pedestrians) must see the car's spot.
      p.pos.set(car.pos.x, 0, car.pos.z);
      p.heading = car.heading;
      // Running over pedestrians.
      for (const ped of this.peds.list) {
        if (ped.dead) continue;
        if (Math.abs(car.speed) > 5 && dist2D(ped.pos.x, ped.pos.z, car.pos.x, car.pos.z) < 2.2) {
          this.peds.hit(ped, 200, car.pos.x, car.pos.z);
          this.police.addHeat(25, now);
          this.sound.crash(0.6);
          this.particles.burst(ped.pos.x, 1, ped.pos.z, 0xaa2222, 10, 4, 0.5, 6);
        }
      }
      // Wrecked car: smoke, then it dies.
      if (car.damage >= 100 && !this.carWrecked) {
        this.carWrecked = true;
        this.hud.toast('Your car is wrecked!', 4);
        this.sound.crash(1);
      }
      if (car.damage >= 100) {
        car.speed = lerp(car.speed, 0, 1 - Math.exp(-3 * dt));
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.12;
          this.particles.burst(car.pos.x, 1.4, car.pos.z, 0x555555, 3, 1.5, 1.2, -1.5);
        }
      } else if (car.damage > 55) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.3;
          this.particles.burst(car.pos.x, 1.4, car.pos.z, 0x777777, 2, 1.2, 1.0, -1.5);
        }
      }
      if (this.carWrecked && car.damage >= 100 && Math.abs(car.speed) < 0.5) {
        this._exitCar();
        this.carWrecked = false;
      }
      this.sound.setEngine(Math.abs(car.speed) * 3.6, true);
    } else {
      // On foot: move relative to the camera, sprint with Shift, jump with Space.
      const speed = this.input.sprint ? 8 : 4.6;
      const fx = Math.sin(this.camYaw);
      const fz = -Math.cos(this.camYaw);
      const rx = -fz;
      const rz = fx;
      let mx = 0;
      let mz = 0;
      if (this.input.forward) { mx += fx; mz += fz; }
      if (this.input.back) { mx -= fx; mz -= fz; }
      if (this.input.right) { mx += rx; mz += rz; }
      if (this.input.left) { mx -= rx; mz -= rz; }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        p.heading = Math.atan2(mx, -mz);
        const out = { x: p.pos.x + mx * speed * dt, z: p.pos.z + mz * speed * dt };
        collideCircleAABBs(out.x, out.z, 0.5, this.city.colliders, out);
        p.pos.x = clamp(out.x, -HALF - 60, HALF + 62);
        p.pos.z = clamp(out.z, -HALF - 60, HALF + 44);
        p.walkBob += dt * (this.input.sprint ? 13 : 9);
      }
      if (this.input.consume('Space') && p.pos.y <= 0.01) p.vy = 7.5;
      p.vy -= 22 * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) {
        p.pos.y = 0;
        p.vy = 0;
      }
      this.playerMesh.position.copy(p.pos);
      this.playerMesh.rotation.y = p.heading + Math.PI;
      const swing = len > 0 ? Math.sin(p.walkBob) * 0.55 : 0;
      this.playerMesh.userData.armL.rotation.x = swing;
      this.playerMesh.userData.armR.rotation.x = -swing;
      this.playerMesh.position.y = p.pos.y + (len > 0 ? Math.abs(Math.sin(p.walkBob)) * 0.05 : 0);
      this.sound.setEngine(0, false);
    }

    // Re-read again: a wrecked car ejects the player mid-frame, and the
    // rest of this frame must not read the car that is gone.
    inCar = !!p.car;

    // --- shooting ---------------------------------------------------------------
    if (!inCar && this.input.keys.has('Mouse0')) {
      this.combat.shoot(this.camera, this._shootTargets());
    }
    this.combat.update(dt);

    // --- world systems ------------------------------------------------------------
    this.traffic.update(dt, this.city.colliders, this._allCars());
    const allCars = this._allCars();
    for (let i = 0; i < allCars.length; i++) {
      for (let j = i + 1; j < allCars.length; j++) {
        if (resolveCarPair(allCars[i], allCars[j])) {
          if (allCars[i].isPlayer || allCars[j].isPlayer) {
            this.sound.crash(0.35);
          }
        }
      }
    }
    const playerSpeed = inCar ? Math.abs(p.car.speed) : 0;
    this.peds.update(dt, p.pos, playerSpeed, now);
    this.police.update(dt, now, p, () => this._die('busted'), (d) => {
      this.hud.flashDamage();
    });
    this.missions.update(dt, p, now);

    // Police cars ramming the player on foot hurts.
    if (!inCar) {
      for (const cop of this.police.cars) {
        if (dist2D(cop.pos.x, cop.pos.z, p.pos.x, p.pos.z) < 2.4 && Math.abs(cop.speed) > 3) {
          p.health = Math.max(0, p.health - 12 * dt * 3);
          p.lastHurtT = now;
          this.hud.flashDamage();
        }
      }
    }

    // Health regen when calm; death when it hits zero.
    if (now - p.lastHurtT > 8 && p.health > 0 && p.health < 100) {
      p.health = Math.min(100, p.health + 3 * dt);
    }
    if (p.health <= 0) {
      this._die('wasted');
      return;
    }

    // --- camera ---------------------------------------------------------------------
    // Re-read once more: a mission completing can eject the player (the
    // buyer takes the Comet GT), and the camera must not chase a gone car.
    inCar = !!p.car;
    const target = inCar
      ? new THREE.Vector3(p.car.pos.x, 1.6, p.car.pos.z)
      : new THREE.Vector3(p.pos.x, 1.7 + p.pos.y, p.pos.z);
    if (inCar) {
      // Chase cam: yaw eases back toward the car's heading, so the mouse can
      // orbit freely and the view settles behind the car again. The easing
      // wraps angles, so a turn across +/-PI never spins the long way round.
      this.camYaw = angleLerp(this.camYaw, p.car.heading, 1 - Math.exp(-1.6 * dt));
      this.camPitch = damp(this.camPitch, 0.3, 2, dt);
      this.camDist = damp(this.camDist, 9.5, 2, dt);
    } else {
      this.camDist = damp(this.camDist, 7, 4, dt);
    }
    const cd = Math.cos(this.camPitch);
    const camPos = new THREE.Vector3(
      target.x - Math.sin(this.camYaw) * cd * this.camDist,
      target.y + Math.sin(this.camPitch) * this.camDist + 0.6,
      target.z + Math.cos(this.camYaw) * cd * this.camDist,
    );
    camPos.y = Math.max(camPos.y, 0.7);
    this.camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
    this.camera.lookAt(target.x, target.y, target.z);
    const targetFov = inCar ? 62 + clamp(Math.abs(p.car.speed) / 40, 0, 1) * 10 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
      this.camera.updateProjectionMatrix();
    }

    // --- headlight + sound ---------------------------------------------------------
    const night = this.city.update(0, this.timeOfDay, now).nightness;
    this.headlight.intensity = inCar ? night * 90 : 0;
    this.sound.setSiren(this.police.sirenOn);

    // --- HUD --------------------------------------------------------------------------
    const mission = this.missions.current;
    this.hud.update(dt, {
      health: p.health,
      money: p.money,
      stars: this.police.stars,
      speedKmh: inCar ? Math.abs(p.car.speed) * 3.6 : 0,
      inCar,
      ammo: this.combat.ammo,
      reserve: this.combat.reserve,
      reloading: this.combat.reloading,
      objective: this.customObjective || this.missions.objectiveText(p),
      timer: this.missions.active && mission && mission.timeLimit ? this.missions.timer : 0,
      showCrosshair: !inCar,
    });
    if (this.frame % 6 === 0) {
      this.hud.drawMinimap({
        playerX: p.pos.x,
        playerZ: p.pos.z,
        playerHeading: inCar ? p.car.heading : p.heading,
        inCar,
        cars: allCars.filter((c) => !c.isPlayer),
        peds: this.peds.list,
        cops: [...this.police.cars, ...this.police.footCops],
        target: this.missions.target,
        nightness: night,
      });
    }
    this.input.endFrame();
  }

  _updateMenu(dt) {
    // Slow orbit around the plaza behind the start screen.
    this.menuAngle += dt * 0.05;
    const r = 120;
    this.camera.position.set(Math.sin(this.menuAngle) * r, 55, Math.cos(this.menuAngle) * r);
    this.camera.lookAt(0, 8, 0);
    this.city.update(dt, this.timeOfDay, this.elapsed);
    this.traffic.update(dt, this.city.colliders, this._allCars());
    this.peds.update(dt, this.player.pos, 0, this.elapsed);
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    this.frame++;
    this.particles.update(dt);
    if (this.state === 'playing') this._updatePlaying(dt);
    else if (this.state === 'menu') this._updateMenu(dt);
    else {
      // Paused / dead / busted: keep the world visible but still.
      this.city.update(0, this.timeOfDay, this.elapsed);
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  boot() {
    this.city.update(0, this.timeOfDay, 0);
    const params = readShotParams();
    if (params.fx === 'low') {
      // Weak-machine mode: no shadow maps.
      this.renderer.shadowMap.enabled = false;
      this.city.sun.castShadow = false;
    }
    this.loop();
    if (params.shot || params.autostart) {
      this._shotMode = true;
      const label = applyShot(this, params);
      window.__neonbayShot = label;
    }
    window.__neonbay = this;
    window.__neonbayReady = true;
  }
}

const game = new Game();
game.boot();
