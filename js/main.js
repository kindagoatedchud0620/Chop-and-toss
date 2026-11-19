// CHOP & TOSS: boot, game states, main loop and test hooks.
//   ?start        skip the title screen          ?map=0..3   force a kitchen
//   ?bot          both chefs are AI (?bot=1 or ?bot=2 for a single AI chef)
//   ?hold         no real-time loop: call window.__step(n) to advance n frames of 1/60 s
//   ?seed=N       fixed random seed
//   ?time=N       shift length in seconds (3 to 180) for testing the end of shift
//   ?mode=vs      Tug-of-War VS mode (otherwise the title screen toggle decides, stored in localStorage)
//   ?dishes=0,1,2 force the menu (3 indices into DISH_IDS) for every round
import { createGfx } from './gfx.js';
import { loadAssets } from './assets.js';
import { World } from './sim.js';
import { BotTeam } from './bot.js';
import { View } from './view.js';
import { Fx } from './fx.js';
import { Hud, vsWinner } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { makeThumbs } from './thumbs.js';
import { MAPS, DT, DISH_IDS } from './data.js';

const q = new URLSearchParams(location.search);
const HOLD = q.has('hold');
const BOT = q.has('bot') ? (q.get('bot') || 'both') : null;
const FORCED = q.has('map') ? Math.max(0, Math.min(MAPS.length - 1, parseInt(q.get('map'), 10) || 0)) : null;
const SEED = q.has('seed') ? Number(q.get('seed')) : null;
const idx = (q.get('dishes') || '').split(',').map(Number);
const MENU = idx.length === 3 && new Set(idx).size === 3 && idx.every((i) => Number.isInteger(i) && i >= 0 && i < DISH_IDS.length) ? idx.map((i) => DISH_IDS[i]) : null;
const TIME = /^\d+$/.test(q.get('time') || '') && +q.get('time') >= 3 && +q.get('time') <= 180 ? +q.get('time') : null;
const BEST_KEY = 'chop-and-toss-best', MODE_KEY = 'chop-and-toss-mode';
const CAPTIONS = { coop: 'Cook together. Beat the clock.', vs: 'Race to your own hatch. Dash to stun. Win the tug of war.' };

const canvas = document.getElementById('stage');
const hud = new Hud();
const input = new Input();
const sfx = new Sfx();
hud.onEvent = (type, i) => { if (type === 'stamp') sfx.star(i); else if (type === 'smash') sfx.bump(); }; // DOM tally moments
let gfx, fx;

const game = {
  state: 'loading', world: null, view: null, bot: null, mapIndex: -1, frame: 0, cd: 0, tu: 0, rounds: 0, history: [],
  mode: 'coop', reattract: false, perf: { fps: 0, cpuMs: 0, frames: 0, worstMs: 0 }, best: 0, prevBest: 0, end: null, lastStars: 0, alarmBeat: 0,
};
window.game = game;

function loadBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* private mode */ } }

function loadMode() { try { return localStorage.getItem(MODE_KEY) === 'vs' ? 'vs' : 'coop'; } catch { return 'coop'; } }
/** title toggle: user picks persist, the attract backdrop is rebuilt for the new mode */
function setMode(m, user = false) {
  game.mode = m;
  for (const b of document.querySelectorAll('.mode-opt')) { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
  document.getElementById('mode-caption').textContent = CAPTIONS[m];
  if (!user) return;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  if (game.state === 'title') startAttract();
}

function pickMap(explicit) {
  if (explicit != null) return explicit;
  if (FORCED != null) return FORCED;
  let i;
  do { i = Math.floor(Math.random() * MAPS.length); } while (i === game.mapIndex && MAPS.length > 1);
  return i;
}

function makeWorld(idx, attract, menu) {
  if (game.view) game.view.dispose();
  fx.clear();
  const seed = SEED != null ? SEED + game.rounds : (Math.random() * 1e9) | 0;
  const world = new World(idx, seed, menu || MENU, { mode: game.mode });
  game.world = world;
  game.mapIndex = idx;
  if (TIME && !attract) world.timeLeft = TIME;
  game.end = null;
  game.view = new View(gfx, fx, world);
  game.view.attract = attract;
  fx.quiet = attract;
  game.bot = null;
  if (attract || BOT) {
    game.bot = new BotTeam(world);
    if (!attract && BOT === '1') game.bot.active = [true, false];
    if (!attract && BOT === '2') game.bot.active = [false, true];
  }
  input.flush();
  return world;
}

function startAttract() {
  const w = makeWorld(pickMap(), true);
  w.start(); w.timeLeft = 1e9;
  hud.showRecipes(w.menu);
  game.state = 'title';
  hud.showHud(false); hud.hideSummary(); hud.center('', '');
  hud.showTitle(true, game.best);
}

function startRound(mapIdx, menu) {
  const w = makeWorld(pickMap(mapIdx), false, menu);
  game.rounds++;
  game.history.push(w.map.id);
  game.state = 'countdown'; game.cd = 0; game.tu = 0;
  hud.showTitle(false); hud.hideSummary(); hud.centerScale(1, 1); hud.reset(w); hud.showHud(true);
  hud.update(w, 0, 0);
  sfx.tick();
}
game.startRound = startRound;

// VS round over (K.O. at once, or time up): winner and loser clips, banner and sounds; the result panel follows
function endVs(w) {
  const r = w.result;
  game.end = { vs: true, t: 0 };
  game.state = 'timeup'; game.tu = 0;
  game.view.beginEndVs(r);
  hud.center(r.ko ? 'K.O. VICTORY!' : 'TIME UP', vsWinner(r), r.ko ? 'ko' : 'small', r.winner < 0 ? '' : 'win-p' + (r.winner + 1));
  hud.centerScale(1, 1);
  if (!r.ko) { sfx.buzzer(0.6); if (r.winner >= 0) sfx.fanfare(0.6); } // the K.O. sound plays from the 'ko' event
}

// the shift just ended: decide record or standard ending, stage it and play the matching sound
function endShift(w) {
  const prevBest = game.best, record = w.score > prevBest && w.score > 0;
  if (record) { game.best = w.score; saveBest(w.score); } // saved now, so closing the page during the celebration keeps it
  game.prevBest = prevBest;
  game.end = { record, prevBest, t: 0 };
  game.state = 'timeup'; game.tu = 0;
  game.view.beginEnd(record);
  if (record) { sfx.buzzer(0.3); sfx.fanfare(0.3); } else sfx.buzzer();
}

function advance() {
  const w = game.world, view = game.view;
  game.frame++;
  if (game.state === 'countdown') {
    const before = game.cd;
    game.cd += DT;
    const label = game.cd < 0.8 ? '3' : game.cd < 1.6 ? '2' : game.cd < 2.4 ? '1' : 'GO!';
    const local = game.cd < 2.4 ? (game.cd % 0.8) / 0.8 : (game.cd - 2.4) / 0.7;
    hud.center(label, game.cd < 2.4 ? w.map.name : '', label === 'GO!' ? 'go' : '');
    hud.centerScale(1.6 - Math.min(1, local * 4) * 0.6 + (local > 0.7 ? -(local - 0.7) * 0.5 : 0), local > 0.85 ? 1 - (local - 0.85) / 0.15 * (label === 'GO!' ? 1 : 0.5) : 1);
    for (const edge of [0.8, 1.6]) if (before < edge && game.cd >= edge) sfx.tick();
    if (before < 2.4 && game.cd >= 2.4) { w.start(); sfx.go(); hud.menuStrip(null); }
    if (game.cd >= 3.1) { game.state = 'play'; hud.center('', ''); hud.centerScale(1, 1); }
  }
  const playing = game.state === 'play' || game.state === 'countdown';
  if (playing) w.chefs.forEach((c, i) => { if (!(game.bot && (!game.bot.active || game.bot.active[i]))) input.apply(c, i); });
  if (game.bot) game.bot.update();
  w.step();
  const audible = game.state !== 'title';
  for (const ev of w.events) {
    view.handle(ev);
    if (audible && ev.type !== 'timeup') sfx.handle(ev);
    if (ev.type === 'ticketMissed') hud.markMissed(ev.ticket);
    if (game.state !== 'title') { if (ev.type === 'tug') hud.tugBump(ev); else if (ev.type === 'vip') hud.vipShake(); }
    if (ev.type === 'ko' && game.state === 'title') game.reattract = true; // the demo round ended: start another
    if ((ev.type === 'ko' || ev.type === 'timeup') && game.state === 'play') (w.mode === 'vs' ? endVs : endShift)(w);
  }
  w.events.length = 0;
  view.update(DT, game.state !== 'summary');
  fx.update(DT, gfx.camera, window.innerWidth, window.innerHeight);

  if (game.state === 'timeup' || game.state === 'summary') game.end.t += DT;
  if (game.state === 'timeup') {
    game.tu += DT;
    if (game.end.vs) {
      if (game.tu < 0.2 && !w.result.ko) hud.centerScale(1.5 - game.tu * 2.5, 1);
      if (game.tu >= 2.2) { hud.center('', ''); hud.centerScale(1, 1); hud.showVsSummary(w); game.state = 'summary'; game.sumAt = performance.now(); }
    } else if (game.tu < 1) {
      hud.center('TIME UP', '', 'small');
      hud.centerScale(1.5 - Math.min(1, game.tu * 5) * 0.5, 1);
    } else if (game.tu < 1 + DT) { hud.center('', ''); hud.centerScale(1, 1); }
    if (!game.end.vs && game.tu >= (game.end.record ? 2.6 : 1.8)) {
      game.lastStars = hud.showSummary(w, { best: game.best, prevBest: game.prevBest, record: game.end.record });
      game.state = 'summary'; game.sumAt = performance.now();
    }
  }
  if (game.state !== 'title') {
    const fire = w.fireCount > 0 && w.phase === 'play';
    const lastSecs = w.phase === 'play' && w.timeLeft <= 15;
    hud.update(w, DT, fire ? 2 : lastSecs ? 1 : 0);
    game.alarmBeat -= DT;
    if (fire && game.alarmBeat <= 0) { sfx.alarm(); game.alarmBeat = 0.55; }
    else if (!fire && lastSecs && game.alarmBeat <= 0) { sfx.tick(w.timeLeft <= 5); game.alarmBeat = 1.0; }
  }
  sfx.ambient(w, game.state === 'play');
  if (game.reattract) { game.reattract = false; startAttract(); }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, Math.sqrt(3.7e6 / Math.max(1, w * h)), 2);
  gfx.resize(w, h, Math.max(0.5, pr));
  if (game.view) game.view.fitCamera();
}

let last = 0, acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (HOLD || game.state === 'loading') return;
  const p = game.perf;
  if (dt > 0) { p.fps = p.fps ? p.fps * 0.95 + (1 / dt) * 0.05 : 1 / dt; p.worstMs = Math.max(p.worstMs * 0.995, dt * 1000); }
  if (Math.abs(dt - DT) < 0.0035) dt = DT;
  acc += dt;
  const t0 = performance.now();
  let n = 0;
  while (acc >= DT - 1e-6 && n < 5) { advance(); acc -= DT; n++; }
  if (n === 5) acc = 0;
  const t1 = performance.now();
  gfx.render();
  const t2 = performance.now();
  // simMs: game logic + scene update per rendered frame, drawMs: time to submit the frame to the GPU
  p.simMs = p.simMs ? p.simMs * 0.95 + (t1 - t0) * 0.05 : t1 - t0;
  p.drawMs = p.drawMs ? p.drawMs * 0.95 + (t2 - t1) * 0.05 : t2 - t1;
  p.cpuMs = p.simMs + p.drawMs;
  p.calls = gfx.stats.calls; p.triangles = gfx.stats.triangles;
  p.frames++;
}

// frame stepping for scripts: advance n simulation frames, then draw once
window.__step = (n = 1) => {
  for (let i = 0; i < n; i++) advance();
  gfx.render();
  return game.frame;
};
window.__render = () => gfx.render();
window.__sim = (n = 1) => { for (let i = 0; i < n; i++) advance(); return game.frame; }; // advance without drawing
window.__test = {
  neglect(seconds) { if (game.bot) game.bot.neglect = Math.round(seconds * 60); },
  summary() {
    const w = game.world;
    const vs = w.mode === 'vs' ? { tug: w.tug, result: w.result, stats: w.stats.vs, stun: w.chefs.map((c) => c.stun) } : undefined;
    return { vs, state: game.state, map: w.map.id, time: +w.time.toFixed(2), left: +w.timeLeft.toFixed(2), score: w.score, stats: w.stats, tickets: w.tickets.map((t) => t.dish), fires: w.fireCount, streak: w.streak,
      chefs: w.chefs.map((c) => ({ x: +c.x.toFixed(2), z: +c.z.toFixed(2), held: c.held ? (c.held.type || c.held.kind) + ':' + c.held.state : null })), stars: game.lastStars };
  },
};

// from the title the round uses the menu shown there; otherwise a fresh map and menu
// the focused mode toggle keeps Tab, Space and Enter for itself: they must not start the round
for (const type of ['keydown', 'keyup']) window.addEventListener(type, (e) => { if (e.target.closest?.('.mode-opt') && ['Tab', 'Space', 'Enter', 'NumpadEnter'].includes(e.code)) e.stopPropagation(); }, true);
for (const b of document.querySelectorAll('.mode-opt')) b.addEventListener('click', (e) => { if (e.detail) b.blur(); setMode(b.dataset.mode, true); }); // a mouse click gives focus back so Enter starts the round
const go = () => startRound(undefined, game.state === 'title' ? game.world.menu : undefined);
input.onGlobal = (code) => {
  if (game.state === 'loading') return;
  if (code === 'KeyM') hud.setSound(sfx.toggle());
  else if (code === 'KeyR') go();
  else if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && (game.state === 'title' || game.state === 'summary')) {
    // Enter and Space are also chef keys: do not let a mashed key skip the score screen
    if (game.state === 'summary' && performance.now() - game.sumAt < (game.end?.record ? 2500 : 1200)) return;
    go();
  }
};
document.getElementById('play').addEventListener('click', (e) => { e.currentTarget.blur(); go(); });
document.getElementById('again').addEventListener('click', (e) => { e.currentTarget.blur(); go(); });
window.addEventListener('resize', () => { if (gfx) resize(); });
window.addEventListener('beforeunload', (e) => {
  // Ctrl is a chef key, so Ctrl+W is one slip away: ask before closing mid-shift
  if (game.state === 'play' && !HOLD && !BOT && !q.has('test')) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

async function boot() {
  gfx = createGfx(canvas, { msaa: q.get('msaa') !== '0', bloom: q.get('bloom') !== '0', shadows: q.get('shadows') !== '0' }); // dev switches for profiling
  resize();
  await Promise.all([loadAssets((p) => hud.loading(p * 0.9)), document.fonts.ready]);
  fx = new Fx(gfx, document.getElementById('popups'));
  game.fx = fx; game.gfx = gfx;
  await Promise.all(['900 20px Unbounded', '700 20px Unbounded', '600 16px "Instrument Sans"', '500 16px "Instrument Sans"'].map((f) => document.fonts.load(f)));
  hud.setThumbs(makeThumbs(gfx));
  hud.loading(1);
  game.best = loadBest();
  setMode(q.get('mode') === 'vs' ? 'vs' : loadMode());
  if (q.has('start')) startRound(); else startAttract();
  advance();
  gfx.render();
  hud.loaded();
  window.__ready = true;
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });
}
boot().catch((err) => { console.error(err); document.querySelector('.load-logo').textContent = 'Could not start: ' + err.message; });
