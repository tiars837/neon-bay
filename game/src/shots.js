// Neon Bay — scripted setups for screenshots and automated play-tests.
// `?shot=<name>` skips the start screen and places the game in a chosen
// moment: a wanted chase, a city street, a mission delivery, a night drive.
// The normal game never reads these parameters; they only ever apply when
// the URL asks for them, exactly like a player choosing a save.

export function readShotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || '',
    seed: Number(q.get('seed') || '1'),
    // `?autostart=1` starts the game without waiting for a click.
    autostart: q.get('autostart') === '1',
    // `?fx=low` drops shadows for weak machines (and software renderers).
    fx: q.get('fx') || 'high',
  };
}

// Applies one scenario to a booted game object. Returns a short label for
// the test harness, or '' when no scenario was requested.
export function applyShot(game, params) {
  const shot = params.shot;
  if (!shot) return '';
  const g = game;
  g.startGame();
  g.clearDialog();
  if (shot === 'start') {
    // Cover the start screen itself: go back to the menu.
    g.showMenu();
    return 'start screen';
  }
  if (shot === 'street') {
    g.setTimeOfDay(0.42); // late morning sun
    g.teleportPlayer(0, 40, Math.PI * 0.15);
    return 'on foot in the city';
  }
  if (shot === 'drive') {
    g.setTimeOfDay(0.48); // golden afternoon
    g.giveCar('sport', 0xff6a00, 0, 60, 0);
    g.setObjective('Free roam — cruise Neon Bay');
    return 'driving a sports car';
  }
  if (shot === 'chase') {
    g.setTimeOfDay(0.55); // dusk: lamps on, sky orange
    g.giveCar('sport', 0xff6a00, -29, 87, Math.PI / 2);
    g.setPlayerCarSpeed(26);
    g.setWanted(3);
    g.placePoliceChase(); // two units right on the player's tail
    g.setObjective('Heat Run: lose the cops, reach the safehouse');
    return 'wanted chase at dusk';
  }
  if (shot === 'mission') {
    g.setTimeOfDay(0.45);
    g.startMissionTwo(); // spawns the Comet GT at the plaza
    g.driveComet(); // puts the player in the Comet, near the docks
    g.setPlayerCarSpeed(18);
    g.setObjective('Comet Run: deliver the Comet GT to the docks');
    return 'mission delivery at the docks';
  }
  if (shot === 'night') {
    g.setTimeOfDay(0.92); // deep night, neon on
    g.giveCar('sedan', 0x2e6db0, -87, -29, 0);
    g.setWanted(1);
    g.setObjective('Free roam — Neon Bay after dark');
    return 'night drive with one star';
  }
  return '';
}
