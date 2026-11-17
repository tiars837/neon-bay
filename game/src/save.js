// Neon Bay — save and load through localStorage. One slot: cash, health,
// ammo, position, mission progress, wanted heat and time of day. Saving
// never touches the network and never leaves the browser.

const KEY = 'neon-bay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: Math.floor(state.money),
      health: state.health,
      ammo: state.ammo,
      reserve: state.reserve,
      missionIndex: state.missionIndex,
      wantedHeat: state.wantedHeat,
      timeOfDay: state.timeOfDay,
      player: { x: state.player.x, z: state.player.z, heading: state.heading },
      inCar: !!state.inCar,
      car: state.car ? { kind: state.car.kind, color: state.car.color, x: state.car.x, z: state.car.z, heading: state.car.heading } : null,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
