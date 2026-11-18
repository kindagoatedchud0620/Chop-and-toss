// Real E (P1) and K (P2) key holds chop at the same time in the real-time loop. Chefs and tomatoes are placed by script, the keys are real.
import { launch, sleep } from './cdp.mjs';
const c = await launch({ width: 320, height: 180 });
await c.goto('http://localhost:4921/?start&map=0&seed=1&test', 'window.__ready === true', 120000);
const waitFor = async (expr, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await c.eval(`!!(${expr})`)) return true; await sleep(100); } return false; };
await waitFor('window.game.state === "play"', 120000);
await c.eval(`(() => {
  const w = window.game.world;
  [[2, 8, 0], [3, 8, 1]].forEach(([gx, gz, i]) => {
    const t = w.tileAtCell(gx, gz); w.putOnTile(t, w.newItem('ing', 'tomato', 'raw'));
    const ch = w.chefs[i]; ch.x = t.x; ch.z = t.z - 1; ch.face = 0; ch.vx = ch.vz = 0; w.bot = null;
  });
})()`);
await waitFor('window.game.world.chefs[0].target && window.game.world.chefs[1].target', 5000);
const tg = await c.eval('window.game.world.chefs.map((x) => x.target && x.target.kind)');
await c.key('keyDown', 'KeyE'); await c.key('keyDown', 'KeyK');
const mid = await waitFor('window.game.world.chefs.every((x) => x.work && x.work.kind === "chop")', 8000);
const done = await waitFor('["2,8", "3,8"].every((k) => { const [gx, gz] = k.split(",").map(Number); const it = window.game.world.tileAtCell(gx, gz).item; return it && it.state === "chopped"; })', 60000);
await c.key('keyUp', 'KeyE'); await c.key('keyUp', 'KeyK');
console.log(`${tg.join(',') === 'board,board' && mid && done ? 'PASS' : 'FAIL'}  holding E (P1) and K (P2) together chops both tomatoes on their boards (targets ${tg}, chopping started ${mid}, both chopped ${done})`);
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
console.log(`${errs.length ? 'FAIL' : 'PASS'}  zero console errors ${errs.join(' | ')}`);
await c.close();
process.exit(0);
