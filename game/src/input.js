// Keyboard and pointer input for a flight stick: held keys give pitch, bank and
// throttle; one-shot presses (start, pause, camera, menu choices) are queued as
// bit flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_UP = 8;
export const ACTION_DOWN = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CLIMB = new Set(['ArrowUp', 'KeyW']);
const DESCEND = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);

export function createInput(target) {
  let left = false;
  let right = false;
  let climb = false;
  let descend = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CLIMB.has(event.code)) {
      climb = true;
      if (!event.repeat) actions |= ACTION_UP;
    } else if (DESCEND.has(event.code)) {
      descend = true;
      if (!event.repeat) actions |= ACTION_DOWN;
    } else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (CAMERA.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CAMERA;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (CLIMB.has(event.code)) climb = false;
    else if (DESCEND.has(event.code)) descend = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    climb = false;
    descend = false;
    throttleUp = false;
    throttleDown = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    turn() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** -1 to climb, 1 to descend: Up/W climbs, Down/S descends. */
    pitch() {
      return (descend ? 1 : 0) - (climb ? 1 : 0);
    },
    /** -1, 0 or 1: throttle down, hold, up. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
