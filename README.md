# Neon Bay — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/tiars837/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/tiars837/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the browser, built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). You roll
into **Neon Bay** — a fictional sun-soaked coastal city — with $250 and a
name to make. Work for Mara Voss, the fixer on Pier 9. Steal cars, run
jobs, and stay ahead of the Neon Bay PD.

Nothing here comes from any commercial game: the city, characters,
vehicles, story, art and music are all original, built from code.

## Play it

Serve `game/` with any static file server and open `index.html` in desktop
Chrome. For local play:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network requests: every script, texture and sound is a
file under `game/` (Three.js r160 is vendored as
`game/vendor/three.module.min.js`) or is generated at runtime.

## The game

- **Open world** — a procedural 7×7-block city with towers, shops, parks,
  a beach and sea, a pier, container docks, palms, street lamps and a full
  day/night cycle.
- **On foot and by car** — walk with WASD + mouse, jump, sprint; press E
  to enter (or steal) any car and drive with arcade physics.
- **Traffic and pedestrians** — cars loop the blocks on the right-hand
  lane; walkers stroll the sidewalks and flee gunfire and speeding cars.
- **Wanted level** — 0–5 stars. Stealing, shooting and running people over
  raise the heat; police cars chase and ram, officers on foot close in to
  arrest you. Lay low and the heat bleeds off.
- **Missions and story** — three jobs for Mara Voss: meet her on the pier,
  steal the Comet GT and deliver it to the docks against the clock, then
  outrun a three-star manhunt to the safehouse. Each job pays cash.
- **Combat** — a pistol with a 12-round magazine (R reloads) and a punch
  for close work, with muzzle flash, tracers and particle impacts.
- **HUD and minimap** — health, cash, wanted stars, speed, ammo, objective
  and timer, plus a live top-down minimap with traffic, police and the
  mission marker.
- **Start, pause and save** — title screen, pause menu, and a save slot in
  localStorage (cash, health, position, mission progress, wanted level).
- **Sound** — everything synthesized live with WebAudio: engine hum,
  two-tone sirens, gunshots, impacts and a bass-driven music loop. No audio
  files.
- **Effects** — crash sparks, car smoke, day/night lighting, neon signs,
  dynamic shadows.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click the game to lock the pointer) |
| E | Enter / steal a car, exit a car |
| Click | Shoot (on foot) |
| F | Punch |
| R | Reload |
| Space | Jump (on foot) / brake (driving) |
| Shift | Sprint |
| P / Esc | Pause |
| M | Mute |

## Layout

```
main.ts            entrypoint: copies game/ + screenshots/ to /output and
                   writes /output/dossier.json with vendor/makefun-game.ts
serve.ts           tiny static server for local play (node serve.ts)
game/
  index.html       page, HUD, menus, import map for three
  vendor/
    three.module.min.js   Three.js r160, vendored
  src/
    main.js        bootstrap, player, camera, frame loop, particles
    city.js        procedural city, beach, pier, docks, day/night
    vehicles.js    car meshes, driving physics, traffic AI
    people.js      pedestrians
    police.js      wanted level and police AI
    missions.js    story missions for Mara Voss
    combat.js      shooting and punching
    hud.js         HUD and live minimap
    audio.js       synthesized WebAudio sound and music
    input.js       keyboard and mouse
    save.js        localStorage save/load
    shots.js       scripted setups for screenshots (?shot=...)
screenshots/       3–4 real renders of the game
```

## Screenshots

Taken in desktop Chrome from this build: a wanted chase at dusk (cover),
a city street on foot, the Comet GT delivery, and a night drive.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 tiars837.
