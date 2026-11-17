// Six 1920x1080 stills, one per required scene. node tools/stills.mjs
import { launch } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../out/stills/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(',') : null;
const want = (n) => !only || only.includes(String(n));
const c = await launch({ width: 1920, height: 1080 });
const open = (q) => c.goto(`http://localhost:4921/?hold&${q}`, 'window.__ready === true', 120000);
const until = async (expr, max = 60 * 170, chunk = 1) => { const hit = await c.eval(`(() => { for (let d = 0; d < ${max}; d += ${chunk}) { window.__sim(${chunk}); if (${expr}) return true; } return false; })()`); return hit; };
let ok = false;
const shot = async (name, note) => { await c.eval('window.__step(1)'); await c.shot(OUT + name); console.log(name, '-', note, JSON.stringify(await c.eval('({ t: +window.game.world.time.toFixed(1), score: window.game.world.score })'))); };

// 1. Split River Rafts: one chef chops while food flies across the river
if (want(1)) {
  await open('start&bot&map=0&seed=31');
  await c.eval('window.__sim(60 * 20)');
  ok = await until('window.game.world.flights.some(f => f.t > f.dur * 0.45 && f.t < f.dur * 0.6 && f.target.s > 3.5) && window.game.world.tiles.some(t => t.vessel && t.vessel.state === "cooking")');
  await shot('1-rafts-throw.png', 'throw across the river ' + ok);
}
// 2. Arcane Portal Kitchen: a chef steps through a portal
if (want(2)) {
  await open('start&bot&map=1&seed=32');
  await c.eval(`window.__sim(60 * 25); window.__tp = 0; { const v = window.game.view; const h = v.handle.bind(v); v.handle = (ev) => { if (ev.type === 'teleport' && ev.chef.held) window.__tp++; h(ev); }; }`);
  ok = await until('window.__tp > 0');
  await c.eval('window.__sim(5)');
  await shot('2-portals-teleport.png', 'teleport with an item ' + ok);
}
// 3. Shifting Counter Bistro: cooking while the island slides
if (want(3)) {
  await open('start&bot&map=2&seed=33');
  await c.eval('window.__sim(60 * 30)');
  ok = await until('window.game.world.island.sliding > 0.5 && window.game.world.island.sliding < 0.8 && window.game.world.tiles.filter(t => t.vessel && t.vessel.state === "cooking").length >= 2');
  await shot('3-bistro-sliding.png', 'island sliding while cooking ' + ok);
}
// 4. Conveyor Belt Gauntlet: washing dishes
if (want(4)) {
  await open('start&bot&map=3&seed=34');
  await c.eval('window.__sim(60 * 35)');
  ok = await until('window.game.world.chefs.some(c => c.work && c.work.kind === "wash") && window.game.world.sinks[0].progress > 0.45 && window.game.world.sinks[0].progress < 0.7 && window.game.world.belts.some(b => b.items.length > 0)');
  await shot('4-belts-washing.png', 'washing at the sink ' + ok);
}
// 5. Extinguishing a stove fire (rafts)
if (want(5)) {
  await open('start&bot&map=0&seed=35');
  await c.eval('window.__sim(60 * 22)');
  await until('window.game.world.tiles.filter(t => t.vessel && t.vessel.state === "cooking").length >= 2', 60 * 60);
  await c.eval('window.__test.neglect(26)');
  ok = await until('window.game.world.fireCount > 0', 60 * 60);
  await c.eval('window.__sim(150); window.game.bot.neglect = 0;');
  ok = await until('window.game.world.chefs.some(c => c.spraying) && window.game.world.fireCount > 0', 60 * 60) && ok;
  await c.eval('window.__sim(22)');
  await shot('5-fire-extinguish.png', 'spraying the fire ' + ok);
}
// 6. End-of-round summary (belts, full 3 minutes)
if (want(6)) {
  await open('start&bot&map=3&seed=36');
  ok = await until('window.game.state === "summary"', 60 * 200, 60);
  await c.eval('window.__step(1)');
  await new Promise((r) => setTimeout(r, 1800));
  await shot('6-summary.png', 'summary ' + ok);
}
// bonus: title screen
if (want(7)) {
  await open('map=0&seed=37');
  await c.eval('window.__sim(60 * 12)');
  await c.eval('window.__step(1)');
  await c.shot(new URL('../out/title.png', import.meta.url).pathname);
}
const errs = [...new Set(c.errors)];
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'console errors: 0');
await c.close();
process.exit(0);
