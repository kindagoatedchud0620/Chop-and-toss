// Manager's VS verification: real keys in the live loop, natural bot rounds on all 4 maps, 1920x1080 stills.
//   node tools/vs-final.mjs            (server on :4921; ~10 min on software GL)
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../out/stills-vs/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const allErrors = [];

// ---------- A. real key presses in the real-time loop ----------
{
  const c = await launch({ width: 320, height: 180 });
  const ev = (e) => c.eval(e);
  const waitFor = async (expr, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(`!!(${expr})`)) return true; await sleep(50); } return false; };
  await c.goto('http://localhost:4921/?start&mode=vs&map=2&seed=1&test', 'window.__ready === true', 120000);
  await waitFor('window.game.state === "play"', 120000);
  const place = (attacker) => ev(`(() => { const w = window.game.world, [a, b] = ${attacker === 0 ? '[w.chefs[0], w.chefs[1]]' : '[w.chefs[1], w.chefs[0]]'};
    const z = w.wz(1); a.x = w.wx(5); b.x = w.wx(6); a.z = b.z = z;
    a.face = Math.PI / 2; b.face = -Math.PI / 2; for (const ch of w.chefs) { ch.vx = ch.vz = 0; ch.stun = 0; ch.stunImmune = 0; }
    if (!b.held) w.give(b, w.newPlate(false)); return [a.idx, b.idx]; })()`);
  // P1 dashes with Left Shift into P2 who holds a plate
  await place(0);
  await c.key('keyDown', 'ShiftLeft', 'Shift'); await c.key('keyUp', 'ShiftLeft', 'Shift');
  const hit = await waitFor('window.game.world.chefs[1].stun > 0', 8000);
  const s1 = await ev('(() => { const w = window.game.world; return { stun: +w.chefs[1].stun.toFixed(2), held: !!w.chefs[1].held, flying: w.flights.length, loose: w.loose.length, cd: +w.chefs[0].dashCd.toFixed(2), clip: window.game.view.chefViews[1].clip }; })()');
  check('Left Shift dash by P1 stuns P2 and knocks the plate out (real key, live loop)', hit && !s1.held && (s1.flying + s1.loose) >= 1, JSON.stringify(s1));
  check('victim plays the dizzy clip', s1.clip === 'dizzy', s1.clip);
  // stunned P2 presses J and holds Left: nothing happens
  const p0 = await ev('[window.game.world.chefs[1].x, window.game.world.chefs[1].z]');
  await c.key('keyDown', 'ArrowLeft', 'ArrowLeft'); await c.key('keyDown', 'KeyJ', 'j'); await sleep(350); await c.key('keyUp', 'KeyJ', 'j'); await sleep(250);
  const p1 = await ev('({ x: window.game.world.chefs[1].x, z: window.game.world.chefs[1].z, held: !!window.game.world.chefs[1].held, stun: window.game.world.chefs[1].stun })');
  await c.key('keyUp', 'ArrowLeft', 'ArrowLeft');
  check('stunned P2 cannot move or pick up (arrows and J ignored)', p1.stun > 0 && Math.hypot(p1.x - p0[0], p1.z - p0[1]) < 0.05 && !p1.held, JSON.stringify(p1));
  const ended = await waitFor('window.game.world.chefs[1].stun === 0', 8000);
  const dur = await ev('window.game.view.chefViews[1].clip');
  check('stun ends after about 1.5 s and the clip stops', ended && dur === null, `clip ${dur}`);
  // P1 tries to dash again immediately: 3 s VS cooldown blocks it
  await place(0);
  const cd = await ev('window.game.world.chefs[0].dashCd');
  await c.key('keyDown', 'ShiftLeft', 'Shift'); await c.key('keyUp', 'ShiftLeft', 'Shift');
  await sleep(600);
  const again = await ev('({ stun: window.game.world.chefs[1].stun, dashT: window.game.world.chefs[0].dashT })');
  check('dash cooldown (3 s in VS) blocks an immediate second stun', cd > 0 && again.stun === 0, `(cooldown left ${cd.toFixed(2)} s, ${JSON.stringify(again)})`);
  // P2 retaliates with L
  await place(1);
  await c.key('keyDown', 'KeyL', 'l'); await c.key('keyUp', 'KeyL', 'l');
  const hit2 = await waitFor('window.game.world.chefs[0].stun > 0', 8000);
  check('L dash by P2 stuns P1 (real key)', hit2);
  const st = await ev('window.game.world.stats.vs');
  check('per-player stats count the stuns and knock-outs', st[0].stuns >= 1 && st[1].stuns >= 1 && st[0].knocked >= 1 && st[1].knocked >= 1, JSON.stringify(st));
  allErrors.push(...c.errors);
  await c.close();
}

// ---------- B. natural bot rounds on every map (hold stepping, no drawing) ----------
{
  const c = await launch({ width: 640, height: 360 });
  const ev = (e) => c.eval(e);
  const rows = [];
  for (const map of [0, 1, 2, 3]) {
    await c.goto(`http://localhost:4921/?hold&start&bot&mode=vs&seed=${31 + map}&map=${map}`, 'window.__ready === true', 120000);
    const r = await ev(`(() => {
      const g = window.game, n = {}; let vipDrain = null, vipT = null, normT = null, normId = null, vipTk = null, wrong = 0;
      const h = g.view.handle.bind(g.view);
      g.view.handle = (e) => { n[e.type] = (n[e.type] || 0) + 1; if (e.type === 'hint' && e.text === 'WRONG HATCH') wrong++; if (e.type === 'vip' && !vipTk) { vipTk = e.ticket; vipT = e.ticket.t; const o = g.world.tickets.find((t) => !t.vip); if (o) { normId = o; normT = o.t; } } h(e); };
      let f = 0, k = -1;
      while (g.state !== 'summary' && f < 60 * 200) { window.__sim(1); f++; if (vipTk && k < 0) k = f; if (k > 0 && f === k + 60) { vipDrain = vipT - vipTk.t; if (normId && g.world.tickets.includes(normId)) normT = normT - normId.t; else normT = null; } }
      const w = g.world;
      return { name: w.map.name, menu: w.menu.join('+'), state: g.state, t: +w.time.toFixed(1), tug: +w.tug.toFixed(2), result: w.result, stats: w.stats.vs, n, wrong, vipDrain, normDrain: normT,
        panel: !document.getElementById('summary').classList.contains('hidden'), winner: (document.querySelector('.vs-winner') || {}).textContent, score: w.score };
    })()`);
    rows.push(r);
    const s = r.stats;
    console.log(`\n== ${r.name} (${r.menu}): ${r.result.ko ? 'K.O.' : 'time'} at ${r.t}s, bar ${Math.round(r.tug * 100)} : ${Math.round((1 - r.tug) * 100)}, winner "${r.winner}" | cat served ${s[0].served} (VIP ${s[0].vip}), stuns ${s[0].stuns}, knocked ${s[0].knocked} | raccoon served ${s[1].served} (VIP ${s[1].vip}), stuns ${s[1].stuns}, knocked ${s[1].knocked} | VIP tickets ${r.n.vip || 0}${r.vipDrain != null ? `, 1 s drain VIP ${r.vipDrain.toFixed(2)} s vs normal ${r.normDrain != null ? r.normDrain.toFixed(2) : 'n/a'} s` : ''}`);
    check('round ended and the VS result panel shows the winner', r.state === 'summary' && r.panel && /WINS|DRAW/.test(r.winner || ''));
    check('result matches the bar (K.O. at 100/0, else the bigger side)', r.result.ko ? (r.result.winner === 0 ? r.tug > 0.999 : r.tug < 0.001) : (r.result.winner === (r.tug > 0.5 + 1e-6 ? 0 : r.tug < 0.5 - 1e-6 ? 1 : -1)), JSON.stringify(r.result));
    check('both bots cook and serve at their own hatch, no wrong-hatch serves, no co-op score', s[0].served >= 1 && s[1].served + s[0].served >= 3 && r.wrong === 0 && r.score === 0, `(wrong hatch ${r.wrong})`);
    if (r.t > 41) check('a VIP ticket appeared after 40 s and drains about 2x faster', (r.n.vip || 0) >= 1 && r.vipDrain > 1.8 && (r.normDrain == null || Math.abs(r.normDrain - 1) < 0.1), `(VIP ${r.vipDrain && r.vipDrain.toFixed(2)} s per second${r.normDrain != null ? `, normal ${r.normDrain.toFixed(2)}` : ''})`);
  }
  const stuns = rows.reduce((a, r) => a + r.stats[0].stuns + r.stats[1].stuns, 0), vips = rows.reduce((a, r) => a + r.stats[0].vip + r.stats[1].vip, 0);
  check('bots dash into each other naturally (stuns happen across the 4 rounds)', stuns >= 2, `(${stuns} stuns)`);
  check('VIP tickets get served for the 30 percent shove', vips >= 1, `(${vips} VIP serves)`);
  allErrors.push(...c.errors);
  await c.close();
}

// ---------- C. 1920x1080 stills ----------
{
  const c = await launch({ width: 1920, height: 1080 });
  const ev = (e) => c.eval(e);
  const until = (expr, max = 60 * 200, chunk = 1) => ev(`(() => { for (let d = 0; d < ${max}; d += ${chunk}) { window.__sim(${chunk}); if (${expr}) return true; } return false; })()`);
  const shot = async (name) => { await ev('window.__step(1)'); await c.shot(OUT + name); console.log('still', name); };
  await c.goto('http://localhost:4921/does-not-exist');
  await ev(`localStorage.setItem('chop-and-toss-mode', 'vs')`);
  await c.goto('http://localhost:4921/?hold&seed=5', 'window.__ready === true', 120000);
  await ev('window.__sim(60 * 8)');
  await shot('1-title-vs-toggle.png');
  await c.goto('http://localhost:4921/?hold&start&bot&mode=vs&seed=34&map=3', 'window.__ready === true', 120000);
  await until('window.game.world.time > 20 && window.game.world.chefs.some((c) => c.held && c.held.kind === "plate")', 60 * 120, 2);
  await shot('2-race-to-own-hatch.png');
  await until('window.game.world.chefs.some((c) => c.stun > 1.15)', 60 * 150, 1);
  await shot('3-dash-stun-dizzy.png');
  await until('window.game.world.tickets.some((t) => t.vip)', 60 * 150, 1);
  await ev('window.__sim(12)');
  await shot('4-vip-ticket.png');
  await until('window.game.state === "timeup"', 60 * 200, 30);
  await ev('window.__sim(40)');
  await shot('5-round-end-banner.png');
  await until('window.game.state === "summary"', 60 * 10, 6);
  await ev('window.__step(1)');
  await sleep(900);
  await c.shot(OUT + '6-vs-results.png'); console.log('still 6-vs-results.png');
  await ev(`localStorage.removeItem('chop-and-toss-mode')`);
  allErrors.push(...c.errors);
  await c.close();
}

const errs = [...new Set(allErrors.filter((e) => !e.includes('favicon') && !e.includes('does-not-exist') && !/404/.test(e)))];
check('zero console errors in every run', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
