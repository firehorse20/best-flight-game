// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between title, play, paused, mission
// complete and flight over. On the title screen Up/Down pick a contract,
// Left/Right pick a plane, Space buys a locked plane or flies.
//
// ?seed=N fixes the cloud and ring pattern. ?shot=takeoff|coast|cockpit|landing
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, CAREER_KEY, MISSIONS, PLANES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_DONE, EVENT_RING } from './world.js';
import {
  ACTION_CAMERA,
  ACTION_CONFIRM,
  ACTION_DOWN,
  ACTION_PAUSE,
  ACTION_UP,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_DONE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot, titlePilot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function readCareer() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CAREER_KEY) ?? 'null');
    if (parsed && typeof parsed.credits === 'number') return parsed;
  } catch {
    // A corrupt save starts a fresh career.
  }
  return null;
}

function saveCareer(career) {
  try {
    window.localStorage.setItem(CAREER_KEY, JSON.stringify(career));
  } catch {
    // Storage can be off: the career then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { best: scene.best, missionIndex: 0, planeIndex: 0 };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const savedCareer = readCareer();
  if (savedCareer) {
    const career = world.state.career;
    career.credits = savedCareer.credits || 0;
    career.planes = Array.isArray(savedCareer.planes) ? savedCareer.planes : ['hopper'];
    career.upgrades = Array.isArray(savedCareer.upgrades) ? savedCareer.upgrades : [];
    career.plane = career.planes.includes(savedCareer.plane) ? savedCareer.plane : 'hopper';
  }
  let screen = SCREEN_TITLE;
  let best = readBest();
  let missionIndex = 0;
  let planeIndex = 0;
  let lastTurn = 0;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function syncPlane() {
    const plane = PLANES[planeIndex];
    world.selectPlane(plane.id);
  }

  function startFlight() {
    const plane = PLANES[planeIndex];
    const career = world.state.career;
    if (!career.planes.includes(plane.id)) {
      if (world.buyPlane(plane.id)) {
        saveCareer(career);
        announce(`${plane.name} bought. Press Space to fly it.`);
      } else {
        announce(`${plane.name} needs ${plane.unlock} credits. You have ${career.credits}.`);
      }
      return;
    }
    syncPlane();
    world.startMission(missionIndex);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${world.state.mission.name}.`);
  }

  function endFlight() {
    const state = world.state;
    if (state.credits > best) {
      best = state.credits;
      saveBest(best);
    }
    saveCareer(state.career);
    screen = state.phase === 'done' ? SCREEN_DONE : SCREEN_OVER;
    announce(screen === SCREEN_DONE ? `Mission complete. ${state.credits} credits.` : `Flight over. ${state.message}`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CAMERA && screen === SCREEN_PLAY) {
      world.state.view = world.state.view === 'cockpit' ? 'chase' : 'cockpit';
      announce(world.state.view === 'cockpit' ? 'Cockpit view.' : 'Chase view.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_UP) {
        missionIndex = (missionIndex + MISSIONS.length - 1) % MISSIONS.length;
        announce(MISSIONS[missionIndex].name);
      } else if (actions & ACTION_DOWN) {
        missionIndex = (missionIndex + 1) % MISSIONS.length;
        announce(MISSIONS[missionIndex].name);
      }
      const turn = input.turn();
      if (turn !== 0 && lastTurn === 0) {
        planeIndex = (planeIndex + (turn > 0 ? 1 : PLANES.length - 1)) % PLANES.length;
        announce(PLANES[planeIndex].name);
      }
      lastTurn = turn;
      if (actions & ACTION_CONFIRM) startFlight();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_OVER || screen === SCREEN_DONE)) {
      if (screen === SCREEN_DONE) missionIndex = (missionIndex + 1) % MISSIONS.length;
      world.reset();
      screen = SCREEN_TITLE;
      announce('Island Courier. Pick a contract.');
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, titlePilot(world.state), true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const control = { pitch: -input.pitch(), turn: input.turn(), throttle: input.throttle() };
    const events = world.step(STEP, control, false);
    if (events & EVENT_RING) announce(world.state.message);
    if (events & (EVENT_DONE | EVENT_CRASH)) endFlight();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { best, missionIndex, planeIndex });
  }

  // Leaving the tab pauses a running flight rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  world.reset();
  announce('Island Courier. Pick a contract, then press Space to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
