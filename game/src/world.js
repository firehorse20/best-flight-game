// The game's rules and state, with no drawing and no browser in it: the plane,
// its physics, the mission's rings, fuel and hull, landings, credits and the
// career (planes and upgrades). step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about
// screens. Nothing here allocates after createWorld returns.
import {
  CRASH_DAMAGE,
  MAX_HULL,
  MISSIONS,
  PAR_BONUS,
  PLANES,
  RING_CREDITS,
  RUNWAY,
  UPGRADES,
} from './config.js';
import { heightAt, islandById, makeClouds } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_DONE = 2;
export const EVENT_CRASH = 4;
export const EVENT_LAND = 8;
export const EVENT_FUEL_LOW = 16;

const RING_RADIUS = 16;
const SLALOM_RADIUS = 13;
const TAKEOFF_SPEED = 55;

/** Lateral/vertical distance from the plane to a ring's centre. */
function ringDistance(plane, ring) {
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Build the ring course for a mission: waypoints are islands, rings sit along the route. */
function buildRings(mission, random) {
  const points = mission.waypoints.map((id) => islandById(id));
  const rings = [];
  const total = mission.rings;
  for (let index = 0; index < total; index += 1) {
    const t = (index + 1) / (total + 1);
    const scaled = t * (points.length - 1);
    const segment = Math.min(points.length - 2, Math.floor(scaled));
    const local = scaled - segment;
    const a = points[segment];
    const b = points[segment + 1];
    const x = a.x + (b.x - a.x) * local + (random() - 0.5) * 60;
    const z = a.z + (b.z - a.z) * local;
    const altitude = mission.lowRings
      ? 20 + random() * 12
      : 55 + random() * 55 + Math.sin(index * 1.3) * 18;
    // Never bury a ring in a hill: clear the ground beneath it by 25 units.
    const ground = heightAt(x, z);
    rings.push({
      x,
      y: Math.max(14, altitude, ground + 25),
      z,
      radius: mission.type === 'slalom' ? SLALOM_RADIUS : RING_RADIUS,
      passed: false,
    });
  }
  return rings;
}

export function createWorld(random) {
  const clouds = makeClouds(random);
  const plane = {
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0,
    speed: 0, throttle: 0, throttleTarget: 0, fuel: 100, hull: MAX_HULL,
  };
  const career = { credits: 0, planes: ['hopper'], upgrades: [], plane: 'hopper' };
  const state = {
    plane,
    clouds,
    career,
    mission: MISSIONS[0],
    missionIndex: 0,
    rings: [],
    ringIndex: 0,
    destination: islandById('north'),
    phase: 'title',
    credits: 0,
    elapsed: 0,
    message: '',
    messageTimer: 0,
    fuelWarned: false,
    view: 'chase',
    gust: 0,
    time: 0,
  };

  function planeSpec() {
    const spec = PLANES.find((entry) => entry.id === career.plane) ?? PLANES[0];
    const speed = state.career.upgrades.includes('engine') ? spec.maxSpeed * 1.15 : spec.maxSpeed;
    const fuel = state.career.upgrades.includes('tank') ? spec.fuel * 1.5 : spec.fuel;
    const hull = state.career.upgrades.includes('hull') ? MAX_HULL + 1 : MAX_HULL;
    return { ...spec, maxSpeed: speed, fuel, hull };
  }

  function onRunway(x, z, island) {
    return (
      Math.abs(x - island.x) < RUNWAY.halfWidth &&
      Math.abs(z - island.z) < RUNWAY.halfLength
    );
  }

  /** The landing zone: the runway plus the island top around it. A bush plane
   *  that settles onto the grass by the strip has still landed at the field. */
  function onLandingZone(x, z, island) {
    return Math.abs(x - island.x) < 200 && Math.abs(z - island.z) < 400;
  }

  function resetToRunway() {
    const home = islandById('coral');
    plane.x = home.x;
    plane.z = home.z - 60;
    plane.y = heightAt(plane.x, plane.z) + 1.2;
    plane.heading = 0;
    plane.pitch = 0;
    plane.bank = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.throttleTarget = 0;
    const spec = planeSpec();
    plane.fuel = spec.fuel;
    plane.hull = spec.hull;
  }

  function startMission(index) {
    state.missionIndex = index;
    state.mission = MISSIONS[index];
    state.rings = buildRings(state.mission, random);
    state.ringIndex = 0;
    state.destination = islandById(state.mission.waypoints[state.mission.waypoints.length - 1]);
    state.credits = 0;
    state.elapsed = 0;
    state.message = `${state.mission.name}: ${state.mission.blurb}`;
    state.messageTimer = 4;
    state.fuelWarned = false;
    state.phase = 'fly';
    resetToRunway();
  }

  function reset() {
    startMission(state.missionIndex);
    state.phase = 'title';
  }

  function say(message, seconds) {
    state.message = message;
    state.messageTimer = seconds;
  }

  /** One fixed step. `input` is {pitch, turn, throttle} plus one-shot `actions`. */
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    if (state.phase === 'fly') state.elapsed += dt;
    if (state.messageTimer > 0) state.messageTimer = Math.max(0, state.messageTimer - dt);

    const spec = planeSpec();
    const storm = state.mission.weather === 'storm' && state.phase === 'fly';
    state.gust = storm
      ? Math.sin(state.time * 0.7) * 0.6 + Math.sin(state.time * 1.7) * 0.4
      : 0;

    // Throttle: W/S nudge the target; fuel runs out and the engine quits.
    plane.throttleTarget = clamp(plane.throttleTarget + input.throttle * dt * 0.8, 0, 1);
    if (plane.fuel <= 0) plane.throttleTarget = 0;
    plane.throttle += (plane.throttleTarget - plane.throttle) * Math.min(1, dt * 2);

    // Pitch and bank ease toward what the stick asks for. On the ground the
    // nose can only rotate once there is speed behind it.
    const targetPitch = clamp(input.pitch, -1, 1) * spec.climb;
    plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 3);
    const targetBank = clamp(input.turn, -1, 1) * 0.6;
    plane.bank += (targetBank - plane.bank) * Math.min(1, dt * 2.5);
    const ground = heightAt(plane.x, plane.z);
    const grounded = plane.y <= ground + 1.3;
    plane.heading += plane.bank * spec.turn * dt * (0.4 + (plane.speed / spec.maxSpeed) * 0.8) * (grounded ? 0.15 : 1);
    // Keep the heading wrapped so it never winds up over a long flight.
    while (plane.heading > Math.PI) plane.heading -= Math.PI * 2;
    while (plane.heading < -Math.PI) plane.heading += Math.PI * 2;

    // Speed chases the throttle; climbing costs speed, descending gives it back.
    const targetSpeed = plane.throttle * spec.maxSpeed;
    const rate = targetSpeed > plane.speed ? 0.7 : 0.3;
    plane.speed += (targetSpeed - plane.speed) * Math.min(1, dt * rate);
    plane.speed -= Math.sin(plane.pitch) * 9 * dt;
    plane.speed = Math.max(0, plane.speed);

    const onStrip = onRunway(plane.x, plane.z, islandById('coral')) ||
      onRunway(plane.x, plane.z, islandById('port')) ||
      onRunway(plane.x, plane.z, islandById('north'));

    if (grounded && plane.speed < TAKEOFF_SPEED) {
      // Rolling on the ground: drag, pitch flattened until there is speed to rotate.
      plane.y = ground + 1.2;
      plane.pitch = Math.min(plane.pitch, 0.05 + Math.max(0, plane.speed - 45) * 0.02);
      plane.x += Math.sin(plane.heading) * plane.speed * dt;
      plane.z += Math.cos(plane.heading) * plane.speed * dt;
      plane.speed = Math.max(0, plane.speed - dt * (onStrip ? 4 : 14));
      if (!onStrip && ground < 1.2) {
        if (!harmless) return crash(events, 'Ran off the runway into the sea.');
      }
      if (!onStrip && plane.speed > 60) {
        if (!harmless) return crash(events, 'Rough ground at speed — airframe lost.');
      }
      if (
        state.phase === 'fly' &&
        state.ringIndex >= state.rings.length &&
        onLandingZone(plane.x, plane.z, state.destination) &&
        plane.speed < 48
      ) {
        return finish(events);
      }
    } else {
      // Airborne.
      plane.x += Math.sin(plane.heading) * plane.speed * dt + state.gust * 6 * dt;
      plane.z += Math.cos(plane.heading) * plane.speed * dt;
      plane.y += Math.sin(plane.pitch) * plane.speed * dt;
      if (plane.y <= ground + 1.2) {
        if (plane.pitch < -0.2 && plane.speed > 40) {
          if (!harmless) return crash(events, 'Nose into the terrain.');
        }
        plane.y = ground + 1.2;
        if (plane.speed > 60 && !onStrip) {
          if (!harmless) return crash(events, 'Came down in the rough.');
        }
      }
    }

    // Water: below 2 units over the sea is a ditching.
    if (plane.y < 2 && ground < 1.2 && !grounded) {
      if (!harmless) return crash(events, 'Ditched in the sea.');
    }

    // Fuel burn and the low-fuel warning.
    if (state.phase === 'fly' && plane.throttle > 0) {
      plane.fuel -= plane.throttle * spec.fuelDrain * 0.35 * dt;
      if (plane.fuel < 20 && !state.fuelWarned) {
        state.fuelWarned = true;
        events |= EVENT_FUEL_LOW;
        say('Fuel low — head for a runway.', 3);
      }
      if (plane.fuel < 0) plane.fuel = 0;
    }

    // Rings: fly through the next one to score.
    if (state.phase === 'fly' && state.ringIndex < state.rings.length) {
      const ring = state.rings[state.ringIndex];
      if (Math.abs(plane.z - ring.z) < 9 && ringDistance(plane, ring) < ring.radius) {
        ring.passed = true;
        state.ringIndex += 1;
        state.credits += RING_CREDITS;
        events |= EVENT_RING;
        say(
          state.ringIndex >= state.rings.length
            ? 'All rings clear — land at ' + state.destination.name + '!'
            : `Ring ${state.ringIndex} of ${state.rings.length} — +${RING_CREDITS} credits`,
          2.5,
        );
      }
    }

    // Title backdrop: loop the course forever, never crash.
    if (state.phase === 'title' && plane.z > 5600) {
      resetToRunway();
      plane.throttleTarget = 0.7;
    }
    return events;
  }

  function crash(events, message) {
    plane.hull -= CRASH_DAMAGE;
    if (plane.hull > 0) {
      plane.y = heightAt(plane.x, plane.z) + 8;
      plane.speed *= 0.4;
      plane.pitch = 0;
      say(`Hard hit! Hull ${plane.hull} left — climb out.`, 3);
      return events;
    }
    state.phase = 'over';
    state.message = message;
    state.messageTimer = 0;
    return events | EVENT_CRASH;
  }

  function finish(events) {
    let bonus = state.mission.reward;
    let note = `Landed at ${state.destination.name}.`;
    if (state.mission.par > 0 && state.elapsed < state.mission.par) {
      bonus += PAR_BONUS;
      note += ` Beat par (${Math.round(state.elapsed)}s) — +${PAR_BONUS} bonus.`;
    }
    state.credits += bonus;
    career.credits += state.credits;
    state.phase = 'done';
    state.message = `${note} +${state.credits} credits.`;
    state.messageTimer = 0;
    return events | EVENT_DONE;
  }

  function buyPlane(id) {
    const spec = PLANES.find((entry) => entry.id === id);
    if (!spec || career.planes.includes(id) || career.credits < spec.unlock) return false;
    career.credits -= spec.unlock;
    career.planes.push(id);
    career.plane = id;
    return true;
  }

  function buyUpgrade(id) {
    const upgrade = UPGRADES.find((entry) => entry.id === id);
    if (!upgrade || career.upgrades.includes(id) || career.credits < upgrade.cost) return false;
    career.credits -= upgrade.cost;
    career.upgrades.push(id);
    return true;
  }

  function selectPlane(id) {
    if (career.planes.includes(id)) career.plane = id;
  }

  reset();
  return {
    state, reset, step, startMission, planeSpec, buyPlane, buyUpgrade, selectPlane,
  };
}
