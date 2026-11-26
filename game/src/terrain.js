// The archipelago and the camera projection. The world is a corridor of sea
// along +z with hand-placed islands; terrain height is a sum of gaussian bumps,
// so heightAt(x, z) is cheap and the same for the simulation and the renderer.
// The projection is a plain pinhole camera: forward is the plane's heading, so
// banking turns the whole world.

import { DRAW_DISTANCE, FIELD, FOCAL } from './config.js';

/** The islands of the archipelago, in world units. `runway` marks a landing strip. */
export const ISLANDS = [
  { id: 'coral', name: 'Coral Bay', x: 0, z: 0, r: 260, h: 26, kind: 'home', runway: true },
  { id: 'turtle', name: 'Turtle Isle', x: -220, z: 900, r: 150, h: 42, kind: 'green' },
  { id: 'peaks', name: 'Twin Peaks', x: 180, z: 1600, r: 210, h: 74, kind: 'mountain' },
  { id: 'port', name: 'Port City', x: 0, z: 2400, r: 280, h: 18, kind: 'city', runway: true },
  { id: 'stormrock', name: 'Storm Rock', x: -260, z: 3200, r: 120, h: 56, kind: 'rock' },
  { id: 'palm', name: 'Palm Atoll', x: 240, z: 4000, r: 170, h: 12, kind: 'green' },
  { id: 'north', name: 'North Field', x: 0, z: 5200, r: 300, h: 22, kind: 'home', runway: true },
  { id: 'spine', name: 'The Spine', x: -80, z: 6600, r: 700, h: 150, kind: 'mountain' },
];

export function islandById(id) {
  for (const island of ISLANDS) if (island.id === id) return island;
  return ISLANDS[0];
}

/** Ground height at (x, z): sea level is 0, island tops are their `h`. */
export function heightAt(x, z) {
  let height = 0;
  for (let index = 0; index < ISLANDS.length; index += 1) {
    const island = ISLANDS[index];
    const dx = x - island.x;
    const dz = z - island.z;
    const d2 = dx * dx + dz * dz;
    const sigma = island.r / 2;
    height += island.h * Math.exp(-d2 / (2 * sigma * sigma));
  }
  return height;
}

/** A cloud bank: soft blobs drifting slowly, placed once per seed. */
export function makeClouds(random) {
  const clouds = [];
  for (let index = 0; index < 26; index += 1) {
    clouds.push({
      x: (random() - 0.5) * 1600,
      y: 150 + random() * 130,
      z: random() * 6000,
      size: 60 + random() * 130,
      speed: 2 + random() * 4,
    });
  }
  return clouds;
}

/**
 * A camera behind the plane: `plane` holds x, y, z and heading. `view` is
 * 'chase' or 'cockpit'. Returns the camera position and the forward/right
 * vectors, plus the screen horizon line for the current pitch.
 */
export function cameraFor(plane, view, pitch) {
  const sin = Math.sin(plane.heading);
  const cos = Math.cos(plane.heading);
  const behind = view === 'cockpit' ? 2 : 17;
  const above = view === 'cockpit' ? 1.5 : 4.5;
  return {
    x: plane.x - sin * behind,
    y: plane.y + above,
    z: plane.z - cos * behind,
    fx: sin,
    fz: cos,
    rx: cos,
    rz: -sin,
    horizon: FIELD.horizonY + pitch * FOCAL * 0.9,
  };
}

/**
 * Project a world point into screen space. Returns null when the point is
 * behind the camera or too close to draw. `scale` is pixels per world unit.
 */
export function project(camera, x, y, z) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const dz = z - camera.z;
  const forward = dx * camera.fx + dz * camera.fz;
  if (forward < 4) return null;
  const right = dx * camera.rx + dz * camera.rz;
  const scale = FOCAL / forward;
  return {
    x: FIELD.width / 2 + right * scale,
    y: camera.horizon - dy * scale,
    scale,
    depth: forward,
  };
}

/** Islands sorted far-to-near for the camera, limited to the draw distance. */
export function visibleIslands(camera) {
  const list = [];
  for (let index = 0; index < ISLANDS.length; index += 1) {
    const island = ISLANDS[index];
    const dx = island.x - camera.x;
    const dz = island.z - camera.z;
    const forward = dx * camera.fx + dz * camera.fz;
    if (forward > -island.r && forward < DRAW_DISTANCE) list.push({ island, forward });
  }
  list.sort((a, b) => b.forward - a.forward);
  return list;
}
