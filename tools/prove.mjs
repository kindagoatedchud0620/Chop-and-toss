// Proof run in the real game page (headless Chrome): full 3 minute bot rounds on all four maps,
// a forced stove fire that the bot must put out, dish washing, and random map selection across restarts.
import { launch } from './cdp.mjs';
const c = await launch({ width: 1280, height: 720 });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const COUNT = `window.__ev = {}; { const v = window.game.view; const h = v.handle.bind(v); v.handle = (ev) => { const k = ev.type + (ev.type === 'serve' ? ':' + ev.dish : ''); window.__ev[k] = (window.__ev[k] || 0) + 1; h(ev); }; }`;

for (const map of [0, 1, 2, 3]) {
  await c.goto(`http://localhost:4921/?hold&start&bot&seed=${21 + map}&map=${map}`, 'window.__ready === true', 120000);
  await c.eval(COUNT);
  // every map gets a neglected stove at 0:25 so a fire erupts and has to be dealt with
  const r = await c.eval(`(() => {
    const g = window.game; let fireSeen = 0, maxFires = 0, neglected = false, frames = 0;
    while (g.state !== 'summary' && frames < 60 * 200) {
      window.__sim(30); frames += 30;
      const w = g.world;
      if (!neglected && w.time >= 25 && w.tiles.some(t => t.vessel && t.vessel.state === 'cooking')) { window.__test.neglect(24); neglected = true; }
      if (w.fireCount > 0) { fireSeen++; maxFires = Math.max(maxFires, w.fireCount); }
    }
    window.__render();
    const w = g.world;
    return { state: g.state, name: w.map.name, score: w.score, stats: w.stats, ev: window.__ev, firesLeft: w.fireCount, maxFires, stars: g.lastStars, time: w.time, sumShown: !document.getElementById('summary').classList.contains('hidden') };
  })()`);
  const s = r.stats.served, ev = r.ev;
  console.log(`\n== ${r.name}: score ${r.score}, ${r.stars} stars | soup ${s.soup}, burger ${s.burger}, fish & chips ${s.fishchips} | washed ${r.stats.washed} | thrown ${r.stats.thrown}, caught ${r.stats.caught} | fires ignited ${ev.ignite || 0}, put out ${ev.extinguished || 0}, burning at end ${r.firesLeft} | missed ${r.stats.missed}${ev.teleport ? ' | teleports ' + ev.teleport : ''}${ev.islandMove ? ' | island slides ' + ev.islandMove : ''}`);
  check('round ran the full 180 s and ended on the summary screen', r.state === 'summary' && Math.abs(r.time - 180) < 0.05 && r.sumShown);
  check('all three dishes prepared, plated and served', s.soup > 0 && s.burger > 0 && s.fishchips > 0);
  check('stove fire erupted and every fire was extinguished', (ev.ignite || 0) > 0 && (ev.extinguished || 0) >= (ev.ignite || 0) - r.firesLeft && r.firesLeft === 0, `(${ev.ignite || 0} ignited, ${ev.extinguished || 0} put out)`);
  check('dirty plates came back and were washed', r.stats.washed >= 3 && (ev.plateBack || 0) >= 3, `(${ev.plateBack || 0} returned, ${r.stats.washed} washed)`);
  if (map === 0) check('ingredients thrown across the river, some caught by the partner', r.stats.thrown > 10, `(${r.stats.thrown} throws, ${r.stats.caught} catches, ${ev.splash || 0} lost in the river)`);
  if (map === 1) check('chefs teleported through the portals', (ev.teleport || 0) > 5, `(${ev.teleport})`);
  if (map === 2) check('island slid back and forth every 12 s', (ev.islandMove || 0) >= 12, `(${ev.islandMove} slides)`);
  if (map === 3) check('belts carried dirty plates to the sink', r.stats.washed >= 3);
}

// random map selection: R on the title and in play, the button, and Enter on the summary
await c.goto('http://localhost:4921/?hold&test', 'window.__ready === true', 120000);
const seq = [];
const cur = () => c.eval('window.game.world.map.id');
const title = await c.eval('({ state: window.game.state, shown: !document.getElementById("title").classList.contains("hidden"), best: document.getElementById("best").textContent })');
check('title screen is shown first', title.state === 'title' && title.shown);
await c.eval('document.getElementById("play").click()'); seq.push(await cur());
check('PLAY RANDOM KITCHEN starts a countdown', (await c.eval('window.game.state')) === 'countdown');
for (let i = 0; i < 30; i++) {
  await c.key('keyDown', 'KeyR'); await c.key('keyUp', 'KeyR');
  await c.eval('window.__sim(8)');
  seq.push(await cur());
}
const counts = {};
for (const id of seq) counts[id] = (counts[id] || 0) + 1;
let repeats = 0;
for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) repeats++;
console.log('\nrestart sequence:', seq.join(' '));
check('R rolls a new random kitchen each time, all four maps appear', Object.keys(counts).length === 4 && repeats === 0, JSON.stringify(counts));
const start = await c.eval(`(() => { window.__sim(200); const w = window.game.world; return { state: window.game.state, tickets: w.tickets.length, d: Math.abs(w.chefs[0].x - w.chefs[1].x), plates: w.tiles.reduce((n, t) => n + (t.item && t.item.kind === 'plate' && !t.item.dirty ? t.item.count : 0), 0), left: w.timeLeft }; })()`);
check('round starts with 3 tickets, 4 clean plates, chefs on opposite sides', start.state === 'play' && start.tickets === 3 && start.plates === 4 && start.d > 6, JSON.stringify(start));
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
check('zero console errors or warnings', errs.length === 0 && c.consoleLog.filter((l) => l.type === 'warning').length === 0, errs.join(' | ') + [...new Set(c.consoleLog.filter((l) => l.type === 'warning').map((l) => l.text))].join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await c.close();
process.exit(fail ? 1 : 0);
