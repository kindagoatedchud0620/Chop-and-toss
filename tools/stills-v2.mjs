// Verification stills for the six-dish update (1920x1080): title with menu + new control legend, countdown menu strip, each new plated dish, a re-rolled menu.
import { launch } from './cdp.mjs';
const OUT = new URL('../out/stills-v2/', import.meta.url).pathname;
const c = await launch({ width: 1920, height: 1080 });
const open = (q) => c.goto(`http://localhost:4921/?hold&${q}`, 'window.__ready === true', 120000);
const until = (expr, max = 60 * 170, chunk = 1) => c.eval(`(() => { for (let d = 0; d < ${max}; d += ${chunk}) { window.__sim(${chunk}); if (${expr}) return true; } return false; })()`);
const shot = async (name, note) => { await c.eval('window.__step(1)'); await c.shot(OUT + name); console.log(name, '-', note, JSON.stringify(await c.eval('({ t: +window.game.world.time.toFixed(1), menu: window.game.world.menu, score: window.game.world.score })'))); };

// 1. title: new menu cards and the new key legend
await open('map=1&seed=3&dishes=3,4,5');
await c.eval('window.__sim(60 * 10)');
await shot('1-title-menu-salad-fishburger-stew.png', 'title, forced menu 3,4,5');
// 2. a different roll on the title (no hook, random seed): the cards change with the menu
await open('map=2&seed=11');
await c.eval('window.__sim(60 * 10)');
await shot('2-title-other-roll.png', 'title, seed 11 menu roll');
// 3. round start: the menu strip under the countdown
await open('start&map=1&seed=3&dishes=3,4,5&bot');
await c.eval('window.__sim(60 * 1.2)');
await shot('3-countdown-menu-strip.png', 'countdown with menu strip');
// 4-6. each new plated dish, resting on a counter (fresh run each, so none is served before the shot), plus a zoomed close-up
for (const [n, id, label, map, seed] of [[4, 'salad', 'Garden Salad', 2, 5], [5, 'fishburger', 'Fish Burger', 2, 5], [6, 'stew', 'Hearty Stew', 2, 5]]) {
  await open(`start&bot&map=${map}&seed=${seed}&dishes=3,4,5`);
  await c.eval(`window.__data = null; import('/js/data.js').then((m) => { window.__data = m; });`);
  await new Promise((r) => setTimeout(r, 600));
  const found = `(() => { const w = window.game.world, D = window.__data; const it = [...w.tiles.map((t) => t.item), ...w.chefs.map((x) => x.held)].find((it) => it && it.kind === 'plate' && D.dishOfContents(it.contents) === '${id}'); window.__it = it || null; return !!it; })()`;
  const ok = await until(found, 60 * 170, 1);
  await c.eval('window.__sim(20)');
  await shot(`${n}-plated-${id}.png`, `${label} plated ${ok}`);
  const px = await c.eval(`(() => { const p = window.game.view.itemViews.get(window.__it).g.position; const v = new window.game.gfx.camera.position.constructor(p.x, p.y, p.z).project(window.game.gfx.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight]; })()`);
  console.log(`   close-up centre ${px.map(Math.round)}`);
  await c.eval('window.__zoom = null');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const clip = { x: Math.max(0, px[0] - 330), y: Math.max(0, px[1] - 230), width: 660, height: 460, scale: 2 };
  const r = await c.send('Page.captureScreenshot', { format: 'png', clip });
  (await import('node:fs')).writeFileSync(`${OUT}${n}-plated-${id}-closeup.png`, Buffer.from(r.data, 'base64'));
}
// 7. stew boiling in the pot (brown, chunky bar) mid cook
await open('start&map=1&seed=3&dishes=3,4,5&bot');
const ok7 = await until('window.game.world.tiles.some((t) => t.vessel && t.vessel.type === "pot" && t.vessel.state === "cooking" && t.vessel.progress > 0.5)', 60 * 120, 1);
await shot('7-stew-boiling.png', 'stew boiling ' + ok7);
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'console errors: 0');
await c.close();
process.exit(0);
