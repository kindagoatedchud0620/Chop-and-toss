// VS mode end-to-end check: node tools/vs-verify.mjs   (W=960 H=540 recommended; shots go to /tmp/claude-0/eng/)
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT || '/tmp/claude-0/eng/';
mkdirSync(OUT, { recursive: true });
const c = await launch({ width: +process.env.W || 960, height: +process.env.H || 540 });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const ev = (e) => c.eval(e);
const sim = (n) => ev(`window.__sim(${n})`);
const step = (n) => ev(`(() => { window.__sim(${Math.max(0, n - 1)}); window.__step(1); })()`);
const open = (q) => c.goto(`http://localhost:4921/?${q}`, 'window.__ready === true', 120000);
const G = 'window.game.world';

// ---- title toggle ----
await c.goto('http://localhost:4921/does-not-exist');
await ev(`localStorage.removeItem('chop-and-toss-mode')`);
await open('hold');
const tog = () => ev(`({ mode: window.game.mode, on: document.querySelector('.mode-opt.on').dataset.mode, aria: [...document.querySelectorAll('.mode-opt')].map((b) => b.getAttribute('aria-checked')).join(), cap: document.getElementById('mode-caption').textContent, ls: localStorage.getItem('chop-and-toss-mode'), wm: ${G}.mode, state: window.game.state })`);
let t = await tog();
check('default is co-op', t.mode === 'coop' && t.wm === 'coop' && t.on === 'coop', JSON.stringify(t));
await ev(`document.querySelector('[data-mode=vs]').click()`);
t = await tog();
check('click VS: caption, aria, storage, attract world is VS', t.mode === 'vs' && t.on === 'vs' && t.aria === 'false,true' && /tug of war/.test(t.cap) && t.ls === 'vs' && t.wm === 'vs', JSON.stringify(t));
await sim(120); await ev('window.__render()'); await c.shot(OUT + 'title-vs.png');
await open('hold');
t = await tog();
check('reload keeps VS', t.mode === 'vs' && t.on === 'vs' && t.wm === 'vs', JSON.stringify(t));
await ev(`document.querySelector('[data-mode=coop]').click()`);
await open('hold&mode=vs');
t = await tog();
check('?mode=vs forces VS over stored co-op', t.mode === 'vs' && t.ls === 'coop', JSON.stringify(t));
// Enter / Space on the focused toggle does not start a round, but toggles it
await ev(`document.querySelector('[data-mode=coop]').focus()`);
await c.key('keyDown', 'Enter', 'Enter'); await c.key('keyUp', 'Enter', 'Enter');
await c.key('keyDown', 'Space', ' '); await c.key('keyUp', 'Space', ' ');
t = await tog();
check('Enter and Space on the focused toggle do not start the round', t.state === 'title', JSON.stringify(t));
await ev(`document.activeElement.blur()`);
await c.key('keyDown', 'Enter', 'Enter'); await c.key('keyUp', 'Enter', 'Enter');
await sim(1);
check('Enter elsewhere starts the round', (await ev('window.game.state')) === 'countdown');

// ---- round look ----
await open('hold&start&mode=vs&seed=3&map=2');
await ev(`localStorage.setItem('chop-and-toss-mode', 'vs')`);
await sim(60 * 4);
await ev('window.__step(1)');
const hud0 = await ev(`({ vs: document.getElementById('hud').classList.contains('vs'), tug: !document.getElementById('tug').classList.contains('hidden'), pct: document.getElementById('tug-pct').textContent, fill: document.getElementById('tug-fill').style.width, score: getComputedStyle(document.getElementById('score')).display, faces: [...document.querySelectorAll('.tug-side img')].map((i) => i.src.startsWith('data:')).join(), owners: ${G}.hatches.map((h) => h.owner).join() })`);
check('VS HUD: tug visible 50 : 50, score hidden, faces set', hud0.vs && hud0.tug && hud0.pct === '50 : 50' && hud0.fill === '50%' && hud0.score === 'none' && hud0.faces === 'true,true', JSON.stringify(hud0));
await c.shot(OUT + 'vs-round.png');

// ---- stun ----
await ev(`(() => { const w = ${G}, [a, b] = w.chefs; a.x = 0; a.z = 0.6; b.x = 0.9; b.z = 0.6; a.face = Math.PI / 2; b.face = -Math.PI / 2; })()`);
const held = await ev(`(() => { const w = ${G}, b = w.chefs[1]; const p = w.tiles.find((t) => t.item && t.item.kind === 'plate'); const it = p.item; p.item = null; b.held = it; it.x = b.x; it.z = b.z; return !!b.held; })()`);
await c.key('keyDown', 'ShiftLeft', 'Shift'); await c.key('keyUp', 'ShiftLeft', 'Shift'); // P1 dash edge
await sim(8);
let s = await ev(`({ stun: ${G}.chefs.map((c) => c.stun), clips: window.game.view.chefViews.map((v) => v.clip), stars: window.game.view.chefViews[1].stars?.visible, flights: ${G}.flights.length, loose: ${G}.loose.length, held: !!${G}.chefs[1].held, st: ${G}.stats.vs.map((x) => x.stuns + '/' + x.knocked).join() })`);
console.log('INFO stun', JSON.stringify(s), 'held', held);
check('stun: victim plays dizzy, 3 stars orbit, item knocked', s.clips[1] === 'dizzy' && s.stun[1] > 1 && s.stars === true && !s.held, JSON.stringify(s));
await sim(20); await ev('window.__step(1)');
await c.shot(OUT + 'vs-stun.png');
await sim(80);
s = await ev(`({ clips: window.game.view.chefViews.map((v) => v.clip), stars: window.game.view.chefViews[1].stars?.visible, stun: ${G}.chefs[1].stun, loose: ${G}.loose.length, flights: ${G}.flights.length })`);
check('after the stun the clip stops, stars hide, item landed', s.clips[1] === null && s.stars === false && s.stun === 0 && s.flights === 0 && s.loose >= 1, JSON.stringify(s));
await sim(30); await ev('window.__step(1)');
const pose = await ev(`(() => { const cv = window.game.view.chefViews[1]; return cv.act === null && Math.abs(cv.n.body.position.y - cv.n.body.userData.p0.y) < 0.05; })()`);
check('procedural pose resumed', pose);

// ---- VIP ----
await open('hold&start&mode=vs&seed=3&map=2');
await ev(`window.__sim(60 * 4)`);
await ev(`${G}.time = ${G}.nextVip - 0.05`);
await sim(6);
const vip = await ev(`({ vip: ${G}.tickets.filter((t) => t.vip).length, cls: document.querySelectorAll('#tickets .ticket.vip').length, tag: document.querySelectorAll('#tickets .ticket.vip .vip-tag').length, shake: document.getElementById('hud').classList.contains('hud-shake') })`);
check('VIP ticket gets class + tag and the HUD shakes', vip.vip >= 1 && vip.cls >= 1 && vip.tag >= 1 && vip.shake, JSON.stringify(vip));
await ev('window.__step(1)'); await c.shot(OUT + 'vs-vip.png');
await sim(40);
check("hud-shake is removed again", !(await ev(`document.getElementById("hud").classList.contains("hud-shake")`)));

// ---- K.O. ----
const koRound = async (q) => { await open(q); await sim(60 * 4); };
const serveAs = (i, tug) => ev(`(() => { const w = ${G}; w.tug = ${tug}; const h = w.hatches.find((x) => x.owner === ${i}); w.serve(w.chefs[${i}], h.tiles[0], w.newPlate(false), w.tickets[0].dish); return w.tug; })()`);
await koRound('hold&start&mode=vs&seed=3&map=2');
await serveAs(0, 0.9);
await sim(3);
let k = await ev(`({ state: window.game.state, phase: ${G}.phase, result: ${G}.result, big: document.getElementById('big').textContent, bigCls: document.getElementById('big').className, sub: document.getElementById('sub').textContent, subCls: document.getElementById('sub').className, clips: window.game.view.chefViews.map((v) => v.clip), confetti: !!window.game.fx.confetti, pct: document.getElementById('tug-pct').textContent, panel: !document.getElementById('summary').classList.contains('hidden') })`);
check('K.O.: banner, winner victory, loser exhausted, confetti, tug 100 : 0', k.state === 'timeup' && k.result.ko && k.result.winner === 0 && k.big === 'K.O. VICTORY!' && k.bigCls === 'ko' && k.sub === 'CAT CHEF WINS' && k.subCls === 'win-p1' && k.clips.join() === 'victory,exhausted' && k.confetti && k.pct === '100 : 0' && !k.panel, JSON.stringify(k));
await sim(60); await ev('window.__step(1)'); await c.shot(OUT + 'vs-ko-banner.png');
await ev('localStorage.setItem("chop-and-toss-best", "77")');
await sim(80);
k = await ev(`({ state: window.game.state, panel: !document.getElementById('summary').classList.contains('hidden'), head: document.querySelector('.sum-head').textContent, win: document.querySelector('.vs-winner')?.className + '|' + document.querySelector('.vs-winner')?.textContent, bar: document.querySelector('.vs-bar-fill')?.style.width, rows: [...document.querySelectorAll('.vs-col')].map((c) => [...c.querySelectorAll('.vs-row b')].map((b) => b.textContent).join('/')).join(' ; '), hiddenParts: ['stars', 'sum-rows', 'sum-foot'].every((i) => getComputedStyle(document.getElementById(i)).display === 'none'), best: localStorage.getItem('chop-and-toss-best'), sum: window.__test.summary().vs })`);
check('VS panel after 2.2 s: header, winner, bar, stats, co-op parts hidden, best untouched', k.state === 'summary' && k.panel && k.head === 'K.O. VICTORY!' && k.win === 'vs-winner p1|CAT CHEF WINS' && k.bar === '100%' && k.hiddenParts && k.best === '77', JSON.stringify(k));
await ev('window.__step(1)'); await c.shot(OUT + 'vs-ko-panel.png');
// R restarts clean
await c.key('keyDown', 'KeyR', 'r'); await c.key('keyUp', 'KeyR', 'r');
await sim(1);
k = await ev(`({ state: window.game.state, mode: ${G}.mode, tug: ${G}.tug, pct: document.getElementById('tug-pct').textContent, panel: document.getElementById('summary').classList.contains('hidden'), clips: window.game.view.chefViews.map((v) => v.clip).join(), confetti: !!window.game.fx.confetti, vs: !!document.getElementById('vs-result'), head: document.querySelector('.sum-head').textContent, big: document.getElementById('big').textContent, bigCls: document.getElementById('big').className })`);
check('R restarts a clean VS round', k.state === 'countdown' && k.mode === 'vs' && k.tug === 0.5 && k.pct === '50 : 50' && k.panel && k.clips === ',' && !k.confetti && !k.vs && k.head === 'TIME UP' && k.bigCls === '', JSON.stringify(k));

// ---- time up ----
for (const [tug, want, label] of [[0.5, 'DRAW', 'draw'], [0.6, 'CAT CHEF WINS', 'cat']]) {
  await open('hold&start&mode=vs&seed=3&map=2&time=10');
  await sim(60 * 4);
  await ev(`${G}.tug = ${tug}`);
  await ev(`(() => { for (let d = 0; d < 60 * 14 && window.game.state === 'play'; d += 6) window.__sim(6); })()`);
  await sim(20);
  const r = await ev(`({ state: window.game.state, result: ${G}.result, big: document.getElementById('big').textContent, sub: document.getElementById('sub').textContent, clips: window.game.view.chefViews.map((v) => v.clip).join(), confetti: !!window.game.fx.confetti })`);
  check(`time up ${label}: banner ${want}`, r.state === 'timeup' && r.big === 'TIME UP' && r.sub === want && !r.result.ko && !r.confetti, JSON.stringify(r));
  console.log('INFO clips', r.clips);
  await ev('window.__step(1)'); await c.shot(OUT + `vs-timeup-${label}.png`);
  await sim(120);
  await ev('window.__step(1)'); await c.shot(OUT + `vs-timeup-${label}-panel.png`);
}
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon') && !e.includes('does-not-exist') && !/404/.test(e)))];
check('zero console errors', errs.length === 0, errs.join(' | '));
await c.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
