// The screenshot scenes behind ?shot=takeoff|coast|cockpit|landing. Each one
// plays the real rules forward from a fresh world, steered by an autopilot
// (aim at the next ring, climb to its height, hold the throttle), so the frame
// is what a real flight looks like and the same seed always gives the same
// frame. The landing scene flies a whole contract to a touchdown.
import { STEP } from './config.js';
import { heightAt } from './terrain.js';
import { EVENT_CRASH, EVENT_DONE } from './world.js';
import { SCREEN_DONE, SCREEN_OVER, SCREEN_PLAY } from './render.js';

const TAKEOFF_SECONDS = 5;
const COAST_SECONDS = 24;
const LANDING_LIMIT_SECONDS = 420;

/** Steer the plane at the next ring (or the destination runway once they are done). */
export function autopilot(state, speedTarget) {
  const plane = state.plane;
  const rings = state.rings;
  let targetX;
  let targetY;
  let targetZ;
  let turn;
  let pitch;
  if (state.ringIndex < rings.length) {
    // En route: point pursuit of the next ring, climbing over ground ahead.
    const ring = rings[state.ringIndex];
    targetX = ring.x;
    targetY = ring.y;
    targetZ = ring.z;
    const dx = targetX - plane.x;
    const dz = targetZ - plane.z;
    const desiredHeading = Math.atan2(dx, dz);
    let error = desiredHeading - plane.heading;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    turn = Math.max(-1, Math.min(1, error * 2.2));
    // Climb over the ground ahead as well as toward the ring: islands between
    // two rings are higher than the rings themselves. Sample the whole
    // approach, not one point ahead: a single sample past a peak would read
    // low ground and dive the plane into the near slope.
    let maxGround = 0;
    for (let distance = 60; distance <= 300; distance += 60) {
      const aheadX = plane.x + Math.sin(plane.heading) * distance;
      const aheadZ = plane.z + Math.cos(plane.heading) * distance;
      maxGround = Math.max(maxGround, heightAt(aheadX, aheadZ));
    }
    const desiredAlt = Math.max(targetY, maxGround + 18);
    pitch = Math.max(-1, Math.min(1, (desiredAlt - plane.y) / 45));
  } else {
    // Final approach: fly at the threshold itself, slow, on a shallow slope
    // whose foot sits below ground level so the plane is driven onto the
    // strip. The landing zone is the whole island top, so an orbit that
    // settles onto the grass still counts as landing at the destination.
    const dest = state.destination;
    targetX = dest.x;
    targetZ = dest.z - 60;
    targetY = heightAt(dest.x, dest.z) - 4 + Math.max(0, (dest.z - 60 - plane.z)) * 0.1;
    const dx = targetX - plane.x;
    const dz = targetZ - plane.z;
    const desiredHeading = Math.atan2(dx, dz);
    let error = desiredHeading - plane.heading;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    turn = Math.max(-1, Math.min(1, error * 2.2));
    pitch = Math.max(-1, Math.min(1, (targetY - plane.y) / 25));
  }
  const dz = targetZ - plane.z;
  // On final approach, slow down for the runway.
  const close = Math.abs(dz) < 400 && state.ringIndex >= rings.length;
  const speed = close ? 0.35 : speedTarget;
  const throttle = Math.max(-1, Math.min(1, (speed - plane.throttleTarget) * 6));
  return { pitch, turn, throttle };
}

/** The title screen's backdrop: the same pilot, gentle and harmless. */
export function titlePilot(state) {
  return autopilot(state, 0.55);
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best credits to show. Names: takeoff, coast, cockpit, landing; any other name
 * is the title backdrop.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'takeoff') {
    world.startMission(0);
    for (let index = 0; index < TAKEOFF_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(state, 0.9), true);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'coast') {
    world.startMission(0);
    for (let index = 0; index < COAST_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(state, 0.75), true);
    }
    return { screen: SCREEN_PLAY, best: state.credits };
  }
  if (name === 'cockpit') {
    world.startMission(1);
    state.view = 'cockpit';
    for (let index = 0; index < COAST_SECONDS / STEP; index += 1) {
      world.step(STEP, autopilot(state, 0.75), true);
    }
    return { screen: SCREEN_PLAY, best: state.credits };
  }
  if (name === 'landing') {
    world.startMission(1);
    let done = false;
    for (let index = 0; index < LANDING_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, autopilot(state, 0.75), true);
      if (events & (EVENT_DONE | EVENT_CRASH)) {
        done = true;
        break;
      }
    }
    const over = state.phase === 'over';
    return { screen: over ? SCREEN_OVER : SCREEN_DONE, best: state.credits, done };
  }
  world.reset();
  state.phase = 'title';
  return { screen: 'title', best: 0 };
}
