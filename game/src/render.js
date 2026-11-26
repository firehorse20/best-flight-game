// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred. A pinhole camera
// behind the plane projects islands, runways, rings and clouds; the plane is a
// vector sprite in chase view, and a lit instrument panel in cockpit view.
// Text that holds a number is rebuilt only when the number changes.
import { FIELD, FONT, MISSIONS, PALETTE, PLANES, UPGRADES } from './config.js';
import { cameraFor, heightAt, project, visibleIslands } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

const PANEL = { width: 660, line: 30 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const altLabel = cachedLabel('ALT ');
  const spdLabel = cachedLabel('SPD ');
  const hdgLabel = cachedLabel('HDG ');
  const creditsLabel = cachedLabel('◆ ');
  const timeLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    // A dark drop shadow keeps white HUD text legible against white clouds.
    context.shadowColor = 'rgba(8,18,28,0.6)';
    context.shadowBlur = 5;
    context.shadowOffsetY = 2;
    context.fillText(value, x, y);
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }

  function skyColors(weather) {
    if (weather === 'dusk') return [PALETTE.skyDuskTop, PALETTE.skyDuskBottom];
    if (weather === 'storm') return [PALETTE.skyStormTop, PALETTE.skyStormBottom];
    return [PALETTE.skyDayTop, PALETTE.skyDayBottom];
  }

  function drawSky(state, camera) {
    const [top, bottom] = skyColors(state.mission.weather);
    const gradient = context.createLinearGradient(0, 0, 0, camera.horizon + 80);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, camera.horizon + 80);
    // Sun: low and warm at dusk, high and white at noon.
    const sunX = state.mission.weather === 'dusk' ? 1020 : 980;
    const sunY = state.mission.weather === 'dusk' ? camera.horizon - 60 : 90;
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, state.mission.weather === 'dusk' ? 'rgba(255,190,90,0.95)' : 'rgba(255,250,220,0.95)');
    glow.addColorStop(1, 'rgba(255,250,220,0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 90, sunY - 90, 180, 180);
    context.fillStyle = state.mission.weather === 'dusk' ? '#ffb45e' : '#fff6d8';
    context.beginPath();
    context.arc(sunX, sunY, 26, 0, Math.PI * 2);
    context.fill();
  }

  function drawSea(state, camera) {
    const gradient = context.createLinearGradient(0, camera.horizon, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.seaShallow);
    gradient.addColorStop(1, PALETTE.seaDeep);
    context.fillStyle = gradient;
    context.fillRect(0, camera.horizon, FIELD.width, FIELD.height - camera.horizon);
    // Wave lines: rows below the horizon, drifting with time.
    context.strokeStyle = 'rgba(255,255,255,0.22)';
    context.lineWidth = 2;
    for (let row = 0; row < 9; row += 1) {
      const y = camera.horizon + 26 + row * 44;
      if (y > FIELD.height) break;
      const drift = ((state.time * (6 + row * 2)) % 120) - 60;
      context.beginPath();
      for (let x = -60 + drift; x < FIELD.width + 60; x += 120) {
        context.moveTo(x, y);
        context.quadraticCurveTo(x + 30, y - 4, x + 60, y);
      }
      context.stroke();
    }
  }

  function ellipse(cx, cy, rx, ry, color) {
    if (rx <= 0 || ry <= 0) return;
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawIsland(state, camera, entry) {
    const { island } = entry;
    const base = project(camera, island.x, 0, island.z);
    if (!base) return;
    const rx = island.r * base.scale;
    if (rx < 2) return;
    const top = project(camera, island.x, island.h, island.z);
    const topY = top ? top.y : base.y - island.h * base.scale;
    const domeRy = Math.max(2, (base.y - topY) * 0.55);
    // Sand ring at the waterline, grass dome above it.
    ellipse(base.x, base.y, rx, Math.max(2, rx * 0.3), PALETTE.sand);
    ellipse(base.x, base.y - domeRy * 0.4, rx * 0.9, Math.max(2, rx * 0.3), PALETTE.grass);
    ellipse(base.x, topY + domeRy * 0.5, rx * 0.62, domeRy, island.kind === 'mountain' ? PALETTE.rock : PALETTE.grassDark);
    if (island.kind === 'mountain') {
      // Two peaks, snow-capped when tall.
      const peakH = domeRy * 2.4;
      context.fillStyle = PALETTE.rock;
      context.beginPath();
      context.moveTo(base.x - rx * 0.55, topY + domeRy * 0.6);
      context.lineTo(base.x - rx * 0.2, topY - peakH);
      context.lineTo(base.x + rx * 0.1, topY + domeRy * 0.6);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.rock;
      context.beginPath();
      context.moveTo(base.x + rx * 0.05, topY + domeRy * 0.6);
      context.lineTo(base.x + rx * 0.32, topY - peakH * 0.8);
      context.lineTo(base.x + rx * 0.6, topY + domeRy * 0.6);
      context.closePath();
      context.fill();
      if (island.h > 60) {
        context.fillStyle = PALETTE.snow;
        context.beginPath();
        context.moveTo(base.x - rx * 0.2, topY - peakH);
        context.lineTo(base.x - rx * 0.28, topY - peakH * 0.72);
        context.lineTo(base.x - rx * 0.12, topY - peakH * 0.72);
        context.closePath();
        context.fill();
      }
    } else if (island.kind === 'city') {
      // A harbour town: lit blocks clustered on the dome.
      const seed = island.x * 7 + island.z;
      for (let index = 0; index < 14; index += 1) {
        const offset = ((seed + index * 37) % 100) / 100 - 0.5;
        const w = 6 + ((seed + index * 13) % 10);
        const h = 8 + ((seed + index * 29) % 18);
        context.fillStyle = index % 3 === 0 ? PALETTE.cityLight : PALETTE.city;
        context.fillRect(base.x + offset * rx * 1.1 - w / 2, topY + domeRy * 0.5 - h, w, h);
      }
    } else {
      // Palm dots on the green islands.
      const seed = island.x * 3 + island.z;
      for (let index = 0; index < 9; index += 1) {
        const offset = ((seed + index * 53) % 100) / 100 - 0.5;
        const px = base.x + offset * rx * 1.2;
        const py = topY + domeRy * (0.4 + ((seed + index * 17) % 40) / 100);
        context.fillStyle = PALETTE.grassDark;
        context.beginPath();
        context.arc(px, py, Math.max(1.5, rx * 0.02), 0, Math.PI * 2);
        context.fill();
      }
    }
    if (island.runway) drawRunway(camera, island);
    // Island name, once it is big enough to read.
    if (rx > 60) {
      text(island.name.toUpperCase(), base.x, topY - domeRy - 8, 15, 'rgba(255,255,255,0.85)', 'center', true);
    }
  }

  function drawRunway(camera, island) {
    const y = heightAt(island.x, island.z) * 0.92;
    const corners = [
      project(camera, island.x - 14, y, island.z - 130),
      project(camera, island.x + 14, y, island.z - 130),
      project(camera, island.x + 14, y, island.z + 130),
      project(camera, island.x - 14, y, island.z + 130),
    ];
    if (corners.some((corner) => corner === null)) return;
    context.fillStyle = PALETTE.runway;
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (let index = 1; index < 4; index += 1) context.lineTo(corners[index].x, corners[index].y);
    context.closePath();
    context.fill();
    // Centreline dashes, from the far end toward the camera.
    context.strokeStyle = PALETTE.runwayLine;
    context.lineWidth = 2;
    for (let step = -110; step <= 110; step += 40) {
      const a = project(camera, island.x, y + 0.5, island.z + step);
      const b = project(camera, island.x, y + 0.5, island.z + step + 18);
      if (!a || !b) continue;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  function drawClouds(state, camera) {
    for (const cloud of state.clouds) {
      const drift = (cloud.x + cloud.speed * state.time + 800) % 1600 - 800;
      const point = project(camera, drift, cloud.y, cloud.z);
      if (!point) continue;
      const alpha = state.mission.weather === 'storm' ? 0.55 : 0.85;
      context.fillStyle = state.mission.weather === 'storm' ? `rgba(70,76,88,${alpha})` : `rgba(255,255,255,${alpha})`;
      const r = cloud.size * point.scale;
      if (r < 2) continue;
      context.beginPath();
      context.ellipse(point.x, point.y, r, r * 0.36, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(point.x + r * 0.5, point.y + r * 0.08, r * 0.7, r * 0.3, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRings(state, camera) {
    const rings = [...state.rings].reverse();
    for (const ring of rings) {
      const point = project(camera, ring.x, ring.y, ring.z);
      if (!point || point.depth > 1200) continue;
      const radius = ring.radius * point.scale;
      if (radius < 2) continue;
      const color = ring.passed ? PALETTE.ringDone : ring === state.rings[state.ringIndex] ? PALETTE.ringNext : PALETTE.ringFar;
      context.strokeStyle = color;
      context.lineWidth = Math.max(2, radius * 0.12);
      context.beginPath();
      context.ellipse(point.x, point.y, radius, radius * 0.82, 0, 0, Math.PI * 2);
      context.stroke();
      if (ring === state.rings[state.ringIndex]) {
        const pulse = 1 + Math.sin(state.time * 5) * 0.08;
        context.strokeStyle = 'rgba(255,194,51,0.45)';
        context.lineWidth = Math.max(2, radius * 0.2);
        context.beginPath();
        context.ellipse(point.x, point.y, radius * pulse, radius * 0.82 * pulse, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  /** The chase-view plane sprite, banking with the turn, pitched with the climb. */
  function drawPlane(state) {
    const plane = state.plane;
    const cx = FIELD.width / 2 + plane.bank * 90;
    const cy = 418 - plane.pitch * 160;
    context.save();
    context.translate(cx, cy);
    context.rotate(-plane.bank * 0.9);
    // Wings.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.moveTo(-14, 2);
    context.lineTo(-78, 16);
    context.lineTo(-72, 26);
    context.lineTo(-10, 12);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, 2);
    context.lineTo(78, 16);
    context.lineTo(72, 26);
    context.lineTo(10, 12);
    context.closePath();
    context.fill();
    // Tail.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.moveTo(-8, -26);
    context.lineTo(-30, -44);
    context.lineTo(-24, -48);
    context.lineTo(-2, -30);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(8, -26);
    context.lineTo(30, -44);
    context.lineTo(24, -48);
    context.lineTo(2, -30);
    context.closePath();
    context.fill();
    // Fuselage.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.ellipse(0, -4, 13, 34, 0, 0, Math.PI * 2);
    context.fill();
    // Cockpit window and nose stripe.
    context.fillStyle = PALETTE.planeAccent;
    context.beginPath();
    context.ellipse(0, -16, 8, 12, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.planeWing;
    context.fillRect(-13, 14, 26, 5);
    // Propeller blur.
    context.fillStyle = 'rgba(230,235,240,0.5)';
    context.beginPath();
    context.ellipse(0, 32, 22, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /** Cockpit view: windshield frame plus a lit instrument panel across the bottom. */
  function drawCockpit(state, camera) {
    const plane = state.plane;
    // Windshield frame.
    context.strokeStyle = '#10141c';
    context.lineWidth = 26;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, FIELD.height);
    context.moveTo(FIELD.width, 0);
    context.lineTo(FIELD.width, FIELD.height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(FIELD.width, 0);
    context.stroke();
    // Instrument panel.
    const panelTop = 540;
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, panelTop, FIELD.width, FIELD.height - panelTop);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(0, panelTop);
    context.lineTo(FIELD.width, panelTop);
    context.stroke();
    // Artificial horizon.
    const ax = 300;
    const ay = panelTop + 88;
    const ar = 62;
    context.save();
    context.beginPath();
    context.arc(ax, ay, ar, 0, Math.PI * 2);
    context.clip();
    context.translate(ax, ay);
    context.rotate(-plane.bank);
    context.translate(0, plane.pitch * 140);
    context.fillStyle = '#3f8fd2';
    context.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
    context.fillStyle = '#7a5a34';
    context.fillRect(-ar, 0, ar * 2, ar * 2);
    context.restore();
    context.strokeStyle = PALETTE.hud;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(ax, ay, ar, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(ax - 26, ay);
    context.lineTo(ax + 26, ay);
    context.stroke();
    // Altimeter, airspeed, heading.
    const alt = Math.round(plane.y * 10);
    const spd = Math.round(plane.speed * 1.8);
    const hdg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
    text('ALT', 470, panelTop + 40, 16, PALETTE.muted, 'left', true);
    text(String(alt), 470, panelTop + 78, 34, PALETTE.hudAmber, 'left', true);
    text('FT', 560, panelTop + 78, 16, PALETTE.muted, 'left');
    text('AIRSPEED', 640, panelTop + 40, 16, PALETTE.muted, 'left', true);
    text(String(spd), 640, panelTop + 78, 34, PALETTE.hudAmber, 'left', true);
    text('KT', 730, panelTop + 78, 16, PALETTE.muted, 'left');
    text('HEADING', 810, panelTop + 40, 16, PALETTE.muted, 'left', true);
    text(String(hdg).padStart(3, '0') + '°', 810, panelTop + 78, 34, PALETTE.hudAmber, 'left', true);
    // Compass strip.
    const points = ['N', '045', 'E', '135', 'S', '225', 'W', '315'];
    for (let index = -3; index <= 3; index += 1) {
      const deg = Math.round(hdg / 45) * 45 + index * 45;
      const label = points[((deg / 45) % 8 + 8) % 8];
      const x = 900 + index * 52;
      text(label, x, panelTop + 130, 15, index === 0 ? PALETTE.hudAmber : PALETTE.muted, 'center', index === 0);
    }
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(900, panelTop + 100);
    context.lineTo(908, panelTop + 112);
    context.lineTo(892, panelTop + 112);
    context.closePath();
    context.fill();
    // Fuel and throttle gauges.
    text('FUEL', 90, panelTop + 40, 16, PALETTE.muted, 'left', true);
    context.fillStyle = '#2a3140';
    context.fillRect(90, panelTop + 52, 140, 16);
    context.fillStyle = plane.fuel < 20 ? PALETTE.hudRed : PALETTE.hudAmber;
    context.fillRect(90, panelTop + 52, 140 * Math.max(0, plane.fuel / 100), 16);
    text('THR', 90, panelTop + 96, 16, PALETTE.muted, 'left', true);
    context.fillStyle = '#2a3140';
    context.fillRect(90, panelTop + 108, 140, 16);
    context.fillStyle = PALETTE.ringDone;
    context.fillRect(90, panelTop + 108, 140 * plane.throttle, 16);
  }

  function drawHud(state) {
    const plane = state.plane;
    const alt = Math.round(plane.y * 10);
    const spd = Math.round(plane.speed * 1.8);
    const hdg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
    context.textBaseline = 'top';
    text(altLabel(alt) + ' FT', 24, 18, 26, PALETTE.hud, 'left', true);
    text(spdLabel(spd) + ' KT', 24, 50, 26, PALETTE.hud, 'left', true);
    text(hdgLabel(String(hdg).padStart(3, '0')) + '°', 24, 82, 26, PALETTE.hud, 'left', true);
    // Mission progress, top centre.
    const mission = state.mission;
    const ringText = state.ringIndex >= state.rings.length
      ? `Land at ${state.destination.name}`
      : `Ring ${state.ringIndex + 1} / ${state.rings.length}`;
    text(mission.name.toUpperCase(), FIELD.width / 2, 24, 22, PALETTE.hud, 'center', true);
    text(ringText, FIELD.width / 2, 52, 20, PALETTE.hudAmber, 'center');
    // Credits and clock, top right.
    text(creditsLabel(state.credits) + ' credits', FIELD.width - 24, 18, 26, PALETTE.hudAmber, 'right', true);
    const clock = `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`;
    text(timeLabel(clock), FIELD.width - 24, 50, 26, PALETTE.hud, 'right', true);
    if (mission.par > 0) text(`PAR ${Math.floor(mission.par / 60)}:${String(mission.par % 60).padStart(2, '0')}`, FIELD.width - 24, 82, 20, PALETTE.muted, 'right');
    // Fuel bar, bottom left; throttle bar, bottom right.
    const barY = FIELD.height - 34;
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(20, barY - 8, 220, 26);
    context.fillStyle = plane.fuel < 20 ? PALETTE.hudRed : PALETTE.hudAmber;
    context.fillRect(24, barY - 4, 140 * Math.max(0, plane.fuel / 100), 18);
    text('FUEL', 170, barY + 12, 16, PALETTE.hud, 'left', true);
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(FIELD.width - 240, barY - 8, 220, 26);
    context.fillStyle = PALETTE.ringDone;
    context.fillRect(FIELD.width - 236, barY - 4, 140 * plane.throttle, 18);
    text('THR', FIELD.width - 90, barY + 12, 16, PALETTE.hud, 'left', true);
    // Hull pips.
    for (let index = 0; index < plane.hull; index += 1) {
      context.fillStyle = PALETTE.hudRed;
      context.beginPath();
      context.arc(FIELD.width / 2 - 20 + index * 26, barY + 4, 8, 0, Math.PI * 2);
      context.fill();
    }
    // Centre message.
    if (state.messageTimer > 0 && state.message) {
      text(state.message, FIELD.width / 2, 120, 24, PALETTE.hud, 'center', true);
    }
    // Low fuel flash.
    if (plane.fuel < 20 && Math.floor(state.time * 2) % 2 === 0) {
      text('LOW FUEL', FIELD.width / 2, 152, 22, PALETTE.hudRed, 'center', true);
    }
    // Storm gusts.
    if (state.mission.weather === 'storm') {
      text('STORM — GUSTS', FIELD.width / 2, 182, 18, PALETTE.hudAmber, 'center', true);
    }
  }

  function drawRain(state) {
    context.strokeStyle = 'rgba(200,215,230,0.5)';
    context.lineWidth = 1.5;
    context.beginPath();
    for (let index = 0; index < 70; index += 1) {
      const x = ((index * 173 + state.time * 900) % 1400) - 60;
      const y = ((index * 97 + state.time * 1400) % 800) - 40;
      context.moveTo(x, y);
      context.lineTo(x - 8, y + 22);
    }
    context.stroke();
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = 150 + lines.length * PANEL.line + 64;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,13,20,0.82)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    text(title, FIELD.width / 2, y + 62, 44, PALETTE.text, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 116 + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.hudAmber, 'center', true);
  }

  function drawTitle(state, ui) {
    const career = state.career;
    const mission = MISSIONS[ui.missionIndex];
    const planeSpec = PLANES[ui.planeIndex];
    const owned = career.planes.includes(planeSpec.id);
    const lines = [
      'Fly the archipelago: courier runs, rescues, races, slaloms and storms.',
      '',
      `CONTRACT  ${mission.name} — ${mission.blurb}`,
      `Reward ${mission.reward} credits · ${mission.rings} rings · ${mission.weather}`,
      '',
      `PLANE  ${planeSpec.name} — ${planeSpec.blurb}`,
      owned ? `Top speed ${Math.round(planeSpec.maxSpeed * 1.8)} kt · Fuel ${planeSpec.fuel}` : `Locked — ${planeSpec.unlock} credits to buy (Space buys it)`,
      '',
      `Career credits: ${career.credits}  ·  Best flight: ${ui.best} credits`,
      '↑ ↓ pick a contract · ← → pick a plane · Space flies · C switches camera',
    ];
    const height = 150 + lines.length * PANEL.line + 64;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,13,20,0.82)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    text('ISLAND COURIER', FIELD.width / 2, y + 62, 52, PALETTE.text, 'center', true);
    text('A flight campaign over the Coral Archipelago', FIELD.width / 2, y + 100, 20, PALETTE.hudAmber, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const color = line.startsWith('CONTRACT') || line.startsWith('PLANE') ? PALETTE.text : PALETTE.muted;
      text(line, FIELD.width / 2, y + 140 + index * PANEL.line, line.startsWith('CONTRACT') || line.startsWith('PLANE') ? 21 : 19, color, 'center', line.startsWith('CONTRACT') || line.startsWith('PLANE'));
    }
    text('Press Space to fly — W/S throttle · ↑ climb · ↓ descend · ← → bank · C camera · P pause', FIELD.width / 2, y + height - 30, 17, PALETTE.muted, 'center');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const camera = cameraFor(state.plane, state.view, state.plane.pitch);
    drawSky(state, camera);
    drawClouds(state, camera);
    drawSea(state, camera);
    for (const entry of visibleIslands(camera)) drawIsland(state, camera, entry);
    drawRings(state, camera);
    if (state.view === 'cockpit') drawCockpit(state, camera);
    else drawPlane(state);
    if (state.mission.weather === 'storm') drawRain(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The islands will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Flight over', [state.message, `Credits this flight: ${state.credits}`, `Best flight: ${ui.best} credits`], 'Press Space to fly again', PALETTE.hudRed);
    } else if (screen === SCREEN_DONE) {
      drawPanel('Mission complete', [state.message, `Credits this flight: ${state.credits}`, `Career credits: ${state.career.credits}`], 'Press Space for the next contract', PALETTE.ringDone);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
