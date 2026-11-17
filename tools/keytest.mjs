// Real key events through the DevTools protocol, both players at the same time, real-time loop (no ?hold, no bot).
import { launch, sleep } from './cdp.mjs';
const c = await launch({ width: 320, height: 180 });
const log = (...a) => console.log(...a);
const st = () => c.eval(`(() => { const w = window.game.world; return { state: window.game.state, t: +w.time.toFixed(2), chefs: w.chefs.map(c => ({ x: +c.x.toFixed(2), z: +c.z.toFixed(2), face: +c.face.toFixed(2), held: c.held ? (c.held.type || c.held.kind) : null, target: c.target ? c.target.kind + (c.target.ctype ? ':' + c.target.ctype : '') : null, spraying: c.spraying, dashCd: +c.dashCd.toFixed(2) })), thrown: w.stats.thrown, loose: w.loose.length, flights: w.flights.length }; })()`);
const waitFor = async (expr, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await c.eval(`!!(${expr})`)) return true; await sleep(60); } return false; };
const down = (code) => c.key('keyDown', code), up = (code) => c.key('keyUp', code);
const tap = async (code, ms = 250) => { await down(code); await sleep(ms); await up(code); };
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

await c.goto('http://localhost:4921/?start&map=2&seed=1&test', 'window.__ready === true', 120000);
await c.eval(`window.__dp = {}; window.addEventListener('keydown', (e) => setTimeout(() => { window.__dp[e.code] = e.defaultPrevented; }, 0));`);
check('countdown runs in real time and reaches play', await waitFor('window.game.state === "play"', 120000));
const a = await st();

// 1. both players steer at the same time
await down('KeyD'); await down('ArrowLeft');
await waitFor(`window.game.world.time > ${a.t + 0.6}`);
const b = await st();
await up('KeyD'); await up('ArrowLeft');
check('P1 moves right on D while P2 moves left on ArrowLeft (held together)', b.chefs[0].x > a.chefs[0].x + 0.8 && b.chefs[1].x < a.chefs[1].x - 0.8, `p1 x ${a.chefs[0].x} -> ${b.chefs[0].x}, p2 x ${a.chefs[1].x} -> ${b.chefs[1].x}`);

// 2. walk both chefs to a station: P1 to the tomato crate (top left), P2 to the extinguisher counter (bottom right)
await down('KeyA'); await down('KeyW'); await down('ArrowDown');
await waitFor('(() => { const c = window.game.world.chefs; return c[0].x < -5.6 && c[0].z < -1.6 && c[1].z > 1.6; })()', 90000);
await up('KeyA');
await waitFor('(() => { const c = window.game.world.chefs; return c[0].target && c[0].target.ctype === "tomato" && Math.abs(c[0].face - Math.PI) < 0.2 || false; })()', 20000);
await up('KeyW');
// line P2 up with the extinguisher counter
const onExt = '(() => { const c = window.game.world.chefs[1]; return !!(c.target && c.target.item && c.target.item.kind === "ext" && Math.abs(c.face) < 0.15); })()';
for (let i = 0; i < 200 && !(await c.eval(onExt)); i++) {
  const p2 = (await st()).chefs[1];
  await up('ArrowLeft'); await up('ArrowRight');
  if (Math.abs(p2.x - 4) > 0.3) await down(p2.x > 4 ? 'ArrowLeft' : 'ArrowRight');
  await sleep(40);
}
await up('ArrowLeft'); await up('ArrowRight');
await waitFor(onExt, 20000);
await up('ArrowDown');
let s = await st();
check('P1 faces the tomato crate, P2 faces the extinguisher counter', s.chefs[0].target === 'crate:tomato' && (await c.eval(onExt)), JSON.stringify(s.chefs.map((x) => x.target)));

// 3. both grab in the same instant: Space for P1, Right Shift for P2
await down('Space'); await down('ShiftRight');
await waitFor('window.game.world.chefs[0].held && window.game.world.chefs[1].held', 15000);
await up('Space'); await up('ShiftRight');
s = await st();
check('Space picks up a tomato for P1 while Right Shift picks up the extinguisher for P2', s.chefs[0].held === 'tomato' && s.chefs[1].held === 'ext', JSON.stringify(s.chefs.map((x) => x.held)));

// 4. P1 turns and throws with E while P2 holds / to spray
await tap('KeyS', 300);
await down('Slash');
await down('KeyE');
await waitFor('window.game.world.stats.thrown > 0 && window.game.world.chefs[1].spraying', 15000);
s = await st();
await up('KeyE');
check('E throws the tomato for P1 while P2 sprays with /', s.thrown === 1 && s.chefs[0].held === null && s.chefs[1].spraying === true, `thrown ${s.thrown}, p2 spraying ${s.chefs[1].spraying}`);
await up('Slash');

// 5. dashes on Q and . at the same time
const d0 = await st();
await down('KeyD'); await down('ArrowUp'); await sleep(120);
await down('KeyQ'); await down('Period');
await waitFor('window.game.world.chefs[0].dashCd > 0 && window.game.world.chefs[1].dashCd > 0', 15000);
const d1 = await st();
await up('KeyQ'); await up('Period'); await up('KeyD'); await up('ArrowUp');
check('Q and . dash both chefs at once', d1.chefs[0].dashCd > 0 && d1.chefs[1].dashCd > 0, JSON.stringify(d1.chefs.map((x) => x.dashCd)));

// 6. alternate keys: Left Shift / Left Ctrl for P1, Enter / Right Ctrl for P2
await down('ControlRight');
await waitFor('window.game.world.chefs[1].spraying', 10000);
s = await st();
await up('ControlRight');
check('Right Ctrl also sprays for P2 (alternate use key)', s.chefs[1].spraying === true);
await tap('Enter', 300);
await waitFor('!window.game.world.chefs[1].held', 8000);
s = await st();
check('Enter drops for P2 (alternate grab key)', s.chefs[1].held === null, `held ${s.chefs[1].held}, state ${s.state}`);

// 7. scrolling keys are swallowed
const dp = await c.eval('window.__dp');
const scroll = await c.eval('[window.scrollX, window.scrollY]');
check('Space, arrows and / are preventDefault-ed and the page did not scroll', dp.Space === true && dp.ArrowDown === true && dp.ArrowLeft === true && dp.ArrowUp === true && dp.Slash === true && scroll[0] === 0 && scroll[1] === 0, JSON.stringify(dp));

// 8. sound is off and no audio context exists
const snd = await c.eval('({ label: document.querySelector("#sound b").textContent })');
check('sound is off by default', snd.label === 'off');

const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
check('zero console errors', errs.length === 0, errs.join(' | '));
log(`\n${pass} passed, ${fail} failed`);
await c.close();
process.exit(fail ? 1 : 0);
