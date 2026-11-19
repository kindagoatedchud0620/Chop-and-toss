// End-to-end check of the end-of-shift celebration at 1920x1080 (headless Chrome, real DOM timing, stepped 3D).
//   node tools/finale-verify.mjs      -> PASS/FAIL lines + stills in out/stills-v3/
import { launch, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../out/stills-v3/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const c = await launch({ width: 1920, height: 1080 });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const ev = (e) => c.eval(e);
const sim = (n) => ev(`window.__sim(${n})`);
const untilExpr = (expr, max = 60 * 40, chunk = 6) => ev(`(() => { for (let d = 0; d < ${max}; d += ${chunk}) { if (${expr}) return true; window.__sim(${chunk}); } return !!(${expr}); })()`);
const phase = () => ev('document.getElementById("summary").dataset.phase || ""');
const waitPhase = async (p, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === p) return true; await sleep(40); } return false; };
const camDist = () => ev('(() => { const g = window.game; const cam = g.gfx.camera; const q = cam.getWorldDirection(new cam.position.constructor()); return +cam.position.length().toFixed(2); })()');
const open = async (query) => { await c.goto(`http://localhost:4921/?${query}`, 'window.__ready === true', 120000); };

// seed the stored best score of 500 (same origin as the game, no game code involved)
await c.goto('http://localhost:4921/does-not-exist');
await ev(`localStorage.setItem('chop-and-toss-best', '500')`);
check('injected Best Shift of 500 into localStorage', (await ev(`localStorage.getItem('chop-and-toss-best')`)) === '500');

// ---------------- standard ending (?time=40 with the bot: a real score of about 320, below 500) ----------------
const Q = 'hold&start&bot&time=40&map=2&seed=3&dishes=0,1,2';
await open(Q);
check('?time=40 shortens the round', (await ev('window.game.world.timeLeft')) === 40);
await untilExpr('window.game.state === "play"', 60 * 6);
await sim(60 * 4); await ev('window.__step(1)');
const d0 = await camDist();
await untilExpr('window.game.state === "timeup"', 60 * 60);
check('timer hit 0:00 and froze the shift (state timeup, sim phase over)', (await ev('window.game.state')) === 'timeup' && (await ev('window.game.world.phase')) === 'over');
const stdScore = await ev('window.game.world.score');
check('standard score (a real score under 500): not a record, stored best untouched', stdScore > 0 && stdScore < 500 && (await ev('window.game.end.record')) === false && (await ev(`localStorage.getItem('chop-and-toss-best')`)) === '500', JSON.stringify(await ev('({ score: window.game.world.score, end: window.game.end })')));
await sim(90); await ev('window.__step(1)');
const d1 = await camDist();
const clipsStd = await ev('window.game.view.chefViews.map((v) => v.clip)');
check('camera pulled back', d1 > d0 * 1.08, `(distance ${d0} -> ${d1}, x${(d1 / d0).toFixed(2)})`);
check('both chefs play the exhausted clip', clipsStd.every((x) => x === 'exhausted'), JSON.stringify(clipsStd));
await c.shot(OUT + 'standard-1-exhausted-pullback.png');
// run into the summary state, then let the DOM timeline play in real time
// draw the 3D frame BEFORE the DOM timeline starts (a 1080p software draw takes seconds and the DOM runs in real time)
await untilExpr('window.game.end.t >= 1.6', 60 * 4);
await ev('window.__step(1)');
await untilExpr('window.game.state === "summary"', 60 * 4);
const stdDone = await waitPhase('done', 20000);
await c.shot(OUT + 'standard-2-summary-stars.png');
const stdUi = await ev('({ score: document.getElementById("sum-score").textContent, lit: document.querySelectorAll("#stars svg.on").length, pill: document.getElementById("sum-best").textContent, banner: getComputedStyle(document.getElementById("sum-banner")).opacity + "/" + getComputedStyle(document.getElementById("sum-banner")).display, stars: window.game.lastStars })');
check('DOM tallied the score and stamped the stars (phase done)', stdDone && stdUi.lit === stdUi.stars && stdUi.stars >= 1, JSON.stringify(stdUi));
check('standard ending shows BEST 500 and no record banner', /500/.test(stdUi.pill) && (stdUi.banner.endsWith('none') || stdUi.banner.startsWith('0')), stdUi.pill);

// ---------------- record ending (score inflated past 500) ----------------
await open(Q);
await untilExpr('window.game.state === "play"', 60 * 6);
await sim(60 * 4); await ev('window.__step(1)');
const r0 = await camDist();
await sim(60 * 30);
await ev('window.game.world.score = 840');
await untilExpr('window.game.state === "timeup"', 60 * 60);
check('NEW HIGH SCORE detected (record true, previous best 500)', (await ev('window.game.end.record')) === true && (await ev('window.game.prevBest')) === 500);
check('new best written to localStorage the moment the shift ends', (await ev(`localStorage.getItem('chop-and-toss-best')`)) === '840');
await sim(78);               // 1.3 s after the buzzer: the climax of the confetti drop
await ev('window.__step(1)');
const r1 = await camDist();
const rec = await ev('({ clips: window.game.view.chefViews.map((v) => v.clip), scale: window.game.view.chefViews.map((v) => +v.sc.toFixed(2)), confetti: window.game.fx.confetti ? window.game.fx.confetti.list.length : 0, tickets: window.game.fx.tickets ? window.game.fx.tickets.list.length : 0, apart: Math.hypot(window.game.view.chefViews[0].g.position.x - window.game.view.chefViews[1].g.position.x, window.game.view.chefViews[0].g.position.z - window.game.view.chefViews[1].g.position.z) })');
check('camera pushed in on the chefs', r1 < r0 * 0.75, `(distance ${r0} -> ${r1}, x${(r1 / r0).toFixed(2)})`);
check('both chefs loop the victory clip, standing together for the high-five', rec.clips.every((x) => x === 'victory') && rec.apart > 0.9 && rec.apart < 1.4, JSON.stringify(rec));
check('golden confetti and order tickets are raining', rec.confetti > 150 && rec.tickets > 15, `(${rec.confetti} confetti, ${rec.tickets} tickets alive)`);
await c.shot(OUT + 'record-1-confetti-climax.png');
await untilExpr('window.game.end.t >= 2.4', 60 * 4);
await ev('window.__step(1)');
await untilExpr('window.game.state === "summary"', 60 * 4);
const gotBest = await waitPhase('best', 20000);
await sleep(300);
await c.shot(OUT + 'record-2-old-best.png');
const cardOld = await ev('document.getElementById("sum-oldbest").textContent');
check('old BEST SCORE is displayed first', gotBest && /500/.test(cardOld), `(phase best, card "${cardOld.trim()}")`);
const gotSmash = await waitPhase('smash', 10000);
await sleep(180);
await c.shot(OUT + 'record-3-smash.png');
check('CSS smash phase reached', gotSmash);
const recDone = await waitPhase('done', 10000);
await sleep(200);
await c.shot(OUT + 'record-4-new-record-banner.png');
const recUi = await ev('({ card: document.getElementById("sum-oldbest").textContent, banner: document.getElementById("sum-banner").textContent, bannerVis: getComputedStyle(document.getElementById("sum-banner")).opacity, anim: getComputedStyle(document.getElementById("sum-banner")).animationName, score: document.getElementById("sum-score").textContent })');
check('new score replaced the old one and the NEW SHIFT RECORD! banner pulses', recDone && /840/.test(recUi.card) && /NEW SHIFT RECORD/i.test(recUi.banner) && /pulse/.test(recUi.anim), JSON.stringify(recUi));

// ---------------- persistence across a restart ----------------
check('localStorage still holds 840 after the celebration', (await ev(`localStorage.getItem('chop-and-toss-best')`)) === '840');
await c.key('keyDown', 'KeyR'); await c.key('keyUp', 'KeyR');
await sim(30);
const afterR = await ev('({ state: window.game.state, confetti: !!window.game.fx.confetti, clips: window.game.view.chefViews.map((v) => v.clip), best: window.game.best, ls: localStorage.getItem("chop-and-toss-best"), view: window.game.gfx.camera.view && window.game.gfx.camera.view.enabled })');
check('R restarts cleanly (no confetti, no clips, camera view reset) and the record survives', afterR.state === 'countdown' && !afterR.confetti && afterR.clips.every((x) => !x) && afterR.best === 840 && afterR.ls === '840' && !afterR.view, JSON.stringify(afterR));
await open('hold');
const title = await ev('({ best: document.getElementById("best").textContent, ls: localStorage.getItem("chop-and-toss-best") })');
check('after a full page restart the title shows BEST 840 and storage is 840', title.best.trim() === '840' && title.ls === '840', JSON.stringify(title));

// frame cost of the celebration (logic + scene update, no GPU involved)
await open(Q);
await untilExpr('window.game.state === "play"', 60 * 6);
await sim(60 * 5);
await ev('window.game.world.score = 840');
const costPlay = await ev('(() => { const t = performance.now(); window.__sim(120); return (performance.now() - t) / 120; })()');
await untilExpr('window.game.state === "timeup"', 60 * 60);
await sim(60);
const costParty = await ev('(() => { const t = performance.now(); window.__sim(120); return (performance.now() - t) / 120; })()');
console.log(`INFO  game logic + scene update per frame: ${costPlay.toFixed(2)} ms in play, ${costParty.toFixed(2)} ms during the record celebration (budget 16.7 ms)`);
check('celebration stays far under the 16.7 ms frame budget on the CPU side', costParty < 5, `(${costParty.toFixed(2)} ms)`);

const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon') && !e.includes('does-not-exist') && !/404/.test(e)))];
check('zero console errors across the DOM to 3D transitions', errs.length === 0, errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await c.close();
process.exit(fail ? 1 : 0);
