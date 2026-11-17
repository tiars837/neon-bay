// Neon Bay — story missions. Three jobs for Mara Voss, the fixer who runs
// the pier: meet her, steal a sports car for her buyer, then outrun the
// heat to the safehouse. Each job pays cash and unlocks the next; the
// mission marker, objective line and timer are the player's guide.

import * as THREE from 'three';
import { dist2D } from './util.js';
import { createCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Light',
    brief: 'Mara Voss wants to meet you on Pier 9. Get to the marker.',
    reward: 150,
  },
  {
    id: 2,
    title: 'Comet Run',
    brief: 'Steal the orange Comet GT at the plaza and deliver it to the docks in 2:30. The law will notice.',
    reward: 500,
    timeLimit: 150,
  },
  {
    id: 3,
    title: 'Heat Run',
    brief: 'The whole department is on you. Lose the heat and reach the safehouse in the north-west.',
    reward: 800,
    timeLimit: 240,
  },
];

export class Missions {
  constructor(scene, city, callbacks) {
    this.scene = scene;
    this.city = city;
    this.cb = callbacks; // { onToast, onReward, onFail, onStart, onComplete }
    this.index = 0; // 0-based: which mission is active; 3 = story done
    this.state = 'idle'; // idle | active | done
    this.timer = 0;
    this.cometCar = null;
    this.marker = this._makeMarker();
    scene.add(this.marker.group);
    this.marker.group.visible = false;
    this.dialog = null;
    this._target = null;
  }

  _makeMarker() {
    const group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beamMat);
    beam.position.y = 30;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    diamond.position.y = 7;
    group.add(diamond);
    return { group, beam, ring, diamond };
  }

  get current() {
    return MISSIONS[this.index] ?? null;
  }

  get active() {
    return this.state === 'active';
  }

  // Where the objective marker sits right now, or null.
  get target() {
    return this._target;
  }

  startMission(i) {
    this.index = i;
    this.state = 'active';
    const m = MISSIONS[i];
    this.timer = m.timeLimit ?? 0;
    if (i === 0) {
      this._target = { ...this.city.pierPos };
    } else if (i === 1) {
      this._target = { ...this.city.cometPos };
      this._spawnComet();
    } else if (i === 2) {
      this._target = { ...this.city.safehousePos };
    }
    this._placeMarker();
    this.cb.onStart?.(m);
  }

  _spawnComet() {
    if (this.cometCar) return;
    this.cometCar = createCar('sport', 0xff6a00, this.city.cometPos.x, this.city.cometPos.z, Math.PI / 2);
    this.scene.add(this.cometCar.mesh);
  }

  _placeMarker() {
    if (!this._target) return;
    this.marker.group.position.set(this._target.x, 0, this._target.z);
    this.marker.group.visible = true;
  }

  update(dt, player, now) {
    if (this.state !== 'active' || !this.current) return;
    const m = this.current;
    // Marker animation.
    this.marker.diamond.rotation.y += dt * 2.4;
    this.marker.diamond.position.y = 7 + Math.sin(now * 2.2) * 0.5;
    this.marker.ring.scale.setScalar(1 + Math.sin(now * 3) * 0.08);
    if (m.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this._fail('Out of time.');
        return;
      }
    }
    const d = dist2D(player.pos.x, player.pos.z, this._target.x, this._target.z);
    if (m.id === 1) {
      if (d < 5) this._complete('Mara sizes you up. "You move like you mean it. I have work for you."');
    } else if (m.id === 2) {
      if (player.car === this.cometCar) {
        // Got the car: retarget to the docks, then measure against the new target.
        if (this._target.x !== this.city.docksPos.x || this._target.z !== this.city.docksPos.z) {
          this._target = { ...this.city.docksPos };
          this._placeMarker();
          this.cb.onToast?.('Deliver the Comet GT to the docks — fast.');
        }
      }
      if (this.cometCar && this.cometCar.damage >= 100) {
        this._fail('The Comet GT is wrecked. Mara is not happy.');
        return;
      }
      const dd = dist2D(player.pos.x, player.pos.z, this._target.x, this._target.z);
      if (player.car === this.cometCar && dd < 7) {
        this._complete('The buyer takes the Comet GT. Clean work.');
      }
    } else if (m.id === 3) {
      if (d < 6) {
        this._complete('You slip inside as the sirens fade. The city is yours tonight.');
      }
    }
  }

  _complete(line) {
    const m = this.current;
    this.state = 'done';
    this.marker.group.visible = false;
    this.dialog = line;
    const wasComet = this.cometCar;
    // Advance first, so a save written by the reward callback records the
    // next job, not the one just finished.
    this.index++;
    this.state = 'idle';
    this.cb.onReward?.(m.reward, m);
    this.cb.onComplete?.(m);
    if (wasComet && m.id === 2) {
      // The buyer keeps the Comet.
      this.scene.remove(wasComet.mesh);
      this.cometCar = null;
    }
    // Chain the next job after a short breather.
    if (this.index < MISSIONS.length) {
      setTimeout(() => {
        if (this.state === 'idle') this.startMission(this.index);
      }, 2500);
    } else {
      this.cb.onToast?.('Story complete — Neon Bay is yours. Keep the engine running.');
    }
  }

  _fail(reason) {
    const m = this.current;
    this.state = 'idle';
    this.marker.group.visible = false;
    this.cb.onFail?.(m, reason);
    // Retry the same job after a breather.
    setTimeout(() => {
      if (this.state === 'idle' && this.index < MISSIONS.length) this.startMission(this.index);
    }, 3000);
  }

  // The player stole the Comet outside the mission flow — nudge them to it.
  cometStolen() {
    if (this.index === 1 && this.state === 'idle') this.startMission(1);
  }

  objectiveText(player) {
    if (!this.current || this.state !== 'active') {
      return this.index >= MISSIONS.length
        ? 'Free roam — Neon Bay is yours'
        : 'Go to the marker to start: ' + MISSIONS[this.index].title;
    }
    const m = this.current;
    let line = m.title + ': ' + m.brief;
    if (m.id === 2 && player.car === this.cometCar) line = 'Comet Run: deliver the Comet GT to the docks.';
    if (m.id === 2 && !player.car) line = 'Comet Run: get to the orange Comet GT at the plaza.';
    return line;
  }

  distanceToTarget(player) {
    if (!this._target) return null;
    return Math.round(dist2D(player.pos.x, player.pos.z, this._target.x, this._target.z));
  }
}
