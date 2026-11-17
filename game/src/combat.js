// Neon Bay — combat. A pistol with a 12-round magazine (R reloads), a
// punch for close work, hitscan shots from the camera, muzzle flash and
// tracers. Shooting people and police is a crime: the wanted system hears
// it through the callbacks.

import * as THREE from 'three';

export class Combat {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.cb = callbacks; // { onShot, onKill, onPunch, onHitCar }
    this.ammo = 12;
    this.magSize = 12;
    this.reserve = 96;
    this.reloading = false;
    this.reloadT = 0;
    this.cooldown = 0;
    this.punchCooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 90;
    this.flash = new THREE.PointLight(0xffc861, 0, 14, 1.6);
    this.scene.add(this.flash);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
    this.tracer = null;
    this.tracerT = 0;
  }

  get canShoot() {
    return this.cooldown <= 0 && !this.reloading && this.ammo > 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        const take = Math.min(this.magSize - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
    if (this.tracer) {
      this.tracerT -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerT / 0.08) * 0.9;
      if (this.tracerT <= 0) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
  }

  reload() {
    if (this.reloading || this.ammo === this.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = 1.1;
    this.cb.onReload?.();
  }

  // Fire from the camera through the crosshair. `targets` is a list of
  // { mesh, pos, kind: 'ped'|'cop'|'car', ref } the ray can hit.
  shoot(camera, targets) {
    if (!this.canShoot) return false;
    this.ammo--;
    this.cooldown = 0.22;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const meshes = targets.map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    const from = camera.position.clone();
    let end = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(90));
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let obj = hit.object;
      while (obj && !obj.userData.targetRef) obj = obj.parent;
      if (obj && obj.userData.targetRef) {
        const t = obj.userData.targetRef;
        if (t.kind === 'ped') this.cb.onHitPed?.(t.ref, 34);
        else if (t.kind === 'cop') this.cb.onHitCop?.(t.ref, 34);
        else if (t.kind === 'car') this.cb.onHitCar?.(t.ref, 12, hit.point);
      }
    }
    // Muzzle flash at the camera, tracer to the impact point.
    this.flash.position.copy(from).add(this.raycaster.ray.direction.clone().multiplyScalar(1.2));
    this.flash.intensity = 9;
    if (this.tracer) {
      this.scene.remove(this.tracer);
      this.tracer.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
    this.tracer = new THREE.Line(geo, this.tracerMat);
    this.tracerT = 0.08;
    this.scene.add(this.tracer);
    this.cb.onShot?.();
    return true;
  }

  // A short-range swing. Hits the nearest person in front of the player.
  punch(playerPos, heading, people, cops) {
    if (this.punchCooldown > 0) return false;
    this.punchCooldown = 0.45;
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const range = 2.4;
    let best = null;
    let bestD = range;
    for (const p of people.list) {
      if (p.dead) continue;
      const dx = p.pos.x - playerPos.x;
      const dz = p.pos.z - playerPos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bestD && side < 1.1) {
        bestD = along;
        best = { kind: 'ped', ref: p };
      }
    }
    for (const cop of cops) {
      if (cop.dead) continue;
      const dx = cop.pos.x - playerPos.x;
      const dz = cop.pos.z - playerPos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bestD && side < 1.1) {
        bestD = along;
        best = { kind: 'cop', ref: cop };
      }
    }
    if (best) {
      if (best.kind === 'ped') this.cb.onHitPed?.(best.ref, 22);
      else this.cb.onHitCop?.(best.ref, 22);
    }
    this.cb.onPunch?.(!!best);
    return true;
  }
}
