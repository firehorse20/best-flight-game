// Every tuning number, colour, aircraft, mission and upgrade in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, horizonY: 300 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Perspective focal length, in pixels, for the chase/cockpit projection. */
export const FOCAL = 520;

/** How far ahead the world is drawn, in world units. */
export const DRAW_DISTANCE = 1400;

/** Where the best credits are kept between visits (this browser only). */
export const BEST_KEY = 'island-courier.best';
export const CAREER_KEY = 'island-courier.career';

export const PALETTE = {
  skyDayTop: '#2f6fd0',
  skyDayBottom: '#bfe3f5',
  skyDuskTop: '#3a2a63',
  skyDuskBottom: '#ff9a52',
  skyStormTop: '#3d4450',
  skyStormBottom: '#8b98a5',
  seaDeep: '#0d4d7a',
  seaShallow: '#2fa8a0',
  sand: '#e8d29a',
  grass: '#4f9e4d',
  grassDark: '#35773a',
  rock: '#8d8578',
  snow: '#eef2f5',
  city: '#5a6270',
  cityLight: '#ffd76a',
  runway: '#3c4148',
  runwayLine: '#f2f2e8',
  ringNext: '#ffc233',
  ringDone: '#3ddc74',
  ringFar: '#e8eef4',
  planeBody: '#e8eef4',
  planeWing: '#d84a35',
  planeAccent: '#1f6fb2',
  panel: '#171c26',
  panelEdge: '#39415a',
  hud: '#ffffff',
  hudAmber: '#ffc233',
  hudRed: '#ff5a4e',
  text: '#eef1f5',
  muted: '#9aa5b5',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The three flyable aircraft. `unlock` is the career credits needed to buy it. */
export const PLANES = [
  {
    id: 'hopper',
    name: 'Island Hopper',
    blurb: 'Steady bush plane. Forgiving, short takeoffs.',
    maxSpeed: 92,
    climb: 0.42,
    turn: 0.85,
    fuel: 100,
    fuelDrain: 1.0,
    unlock: 0,
  },
  {
    id: 'albatross',
    name: 'Albatross',
    blurb: 'Long-range seaplane. Huge tank, gentle handling.',
    maxSpeed: 78,
    climb: 0.34,
    turn: 0.7,
    fuel: 165,
    fuelDrain: 0.85,
    unlock: 150,
  },
  {
    id: 'swift',
    name: 'Swift',
    blurb: 'Racing stunt plane. Fast and twitchy, thirsty.',
    maxSpeed: 132,
    climb: 0.58,
    turn: 1.15,
    fuel: 82,
    fuelDrain: 1.25,
    unlock: 300,
  },
];

/** Upgrades bought with career credits; each applies to every plane. */
export const UPGRADES = [
  { id: 'engine', name: 'Tuned Engine', blurb: '+15% top speed', cost: 120, speed: 1.15 },
  { id: 'tank', name: 'Aux Tank', blurb: '+50% fuel', cost: 100, fuel: 1.5 },
  { id: 'hull', name: 'Reinforced Hull', blurb: 'one extra hard landing', cost: 80, hull: 2 },
];

/**
 * The five contracts. `waypoints` are island stops in order; the route is built
 * from them. `weather` is clear, dusk or storm. `par` is the par time in seconds
 * for race missions (0 when it does not apply).
 */
export const MISSIONS = [
  {
    id: 'courier',
    name: 'Island Courier',
    type: 'courier',
    blurb: 'Fly the mail run: Coral Bay to North Field, through 6 rings.',
    weather: 'clear',
    waypoints: ['coral', 'turtle', 'peaks', 'port', 'palm', 'north'],
    rings: 6,
    reward: 60,
    par: 0,
  },
  {
    id: 'rescue',
    name: 'Reef Rescue',
    type: 'rescue',
    blurb: 'Pick up stranded sailors at 3 low rings, then land at North Field.',
    weather: 'dusk',
    waypoints: ['coral', 'turtle', 'stormrock', 'north'],
    rings: 3,
    reward: 80,
    par: 0,
    lowRings: true,
  },
  {
    id: 'race',
    name: 'Coral Cup Race',
    type: 'race',
    blurb: '8 rings against the clock. Beat the 150 s par for a bonus.',
    weather: 'clear',
    waypoints: ['coral', 'peaks', 'port', 'palm', 'stormrock', 'turtle', 'peaks', 'north'],
    rings: 8,
    reward: 70,
    par: 150,
  },
  {
    id: 'slalom',
    name: 'Ring Slalom',
    type: 'slalom',
    blurb: '10 tight rings weaving between the islands. No room for error.',
    weather: 'clear',
    waypoints: ['coral', 'turtle', 'peaks', 'port', 'palm', 'north'],
    rings: 10,
    reward: 90,
    par: 0,
  },
  {
    id: 'storm',
    name: 'Storm Front',
    type: 'storm',
    blurb: 'Courier run through a storm front: gusts, rain, low cloud.',
    weather: 'storm',
    waypoints: ['coral', 'turtle', 'peaks', 'port', 'palm', 'north'],
    rings: 6,
    reward: 110,
    par: 0,
  },
];

/** Credits per ring passed, and the time bonus for beating par. */
export const RING_CREDITS = 8;
export const PAR_BONUS = 40;

/** Runway geometry: a strip centred on its island, running along +z. */
export const RUNWAY = { halfWidth: 14, halfLength: 130 };

/** Crash damage: one hard hit costs this much hull; hull 0 ends the flight. */
export const CRASH_DAMAGE = 1;
export const MAX_HULL = 1;
