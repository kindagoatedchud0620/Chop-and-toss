// VS mode tests, plain node: node tools/vstest.mjs
import assert from 'node:assert/strict';
import { World } from '../js/sim.js';
import { MAPS, TUNE, DISHES } from '../js/data.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const vsWorld = (m = 2, seed = 1) => { const w = new World(m, seed, null, { mode: 'vs' }); w.start(); return w; };
const run = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const evs = (w, type) => w.events.filter((e) => e.type === type);
const flush = (w) => { w.events.length = 0; };

// ---- layouts: reachability and fairness -----------------------------------
const KINDS = {
  tomato: (t) => t.ctype === 'tomato', meat: (t) => t.ctype === 'meat', fish: (t) => t.ctype === 'fish', lettuce: (t) => t.ctype === 'lettuce',
  potato: (t) => t.ctype === 'potato', bun: (t) => t.ctype === 'bun', board: (t) => t.kind === 'board',
  pot: (t) => t.vessel && t.vessel.type === 'pot', pan: (t) => t.vessel && t.vessel.type === 'pan', sink: (t) => t.kind === 'sink',
  plates: (t) => t.ch === 'p', return: (t) => t.kind === 'return', trash: (t) => t.kind === 'trash', ext: (t) => t.ch === 'e',
};
function bfs(w, start) {
  const d = new Map(), key = (c) => c.gz * w.W + c.gx, q = [start];
  d.set(key(start), 0);
  const portalCell = (c) => (c.portal ? c.portal.pair.cell : null);
  for (let i = 0; i < q.length; i++) {
    const c = q[i], k = d.get(key(c));
    const nb = [w.cell(c.gx + 1, c.gz), w.cell(c.gx - 1, c.gz), w.cell(c.gx, c.gz + 1), w.cell(c.gx, c.gz - 1), portalCell(c)];
    for (const n of nb) if (n && w.walkable(n.gx, n.gz) && !d.has(key(n))) { d.set(key(n), k + 1); q.push(n); }
  }
  return (t) => { // walking distance to stand next to tile t
    let best = Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = d.get((t.gz + dz) * w.W + t.gx + dx); if (v !== undefined && t.gx + dx >= 0 && t.gx + dx < w.W) best = Math.min(best, v); }
    return best;
  };
}
const table = [];
MAPS.forEach((m, mi) => {
  const w = new World(mi, 1, null, { mode: 'vs' });
  assert.equal(w.map.vsRows.length > 0, true);
  assert.equal(w.chefs.length, 2);
  assert.ok(w.gxOf(w.chefs[0].x) < w.W / 2 && w.gxOf(w.chefs[1].x) > w.W / 2, 'spawns left and right');
  assert.equal(w.hatches.length, 2);
  const own = [0, 1].map((i) => w.hatches.find((h) => h.owner === i));
  assert.ok(own[0] && own[1]);
  assert.ok(own[0].x < 0 && own[1].x > 0, 'P1 hatch left, P2 hatch right');
  assert.equal(w.tiles.filter((t) => KINDS.pot(t)).length >= 2, true);
  assert.equal(w.tiles.filter((t) => KINDS.pan(t)).length >= 2, true);
  assert.equal(w.tiles.filter(KINDS.board).length >= 3, true);
  assert.equal(w.tiles.filter((t) => t.kind === 'return').length, 1);
  assert.equal(w.tiles.reduce((n, t) => n + (t.item && t.item.kind === 'plate' ? t.item.count : 0), 0), 4);
  const tot = [0, 0];
  for (let i = 0; i < 2; i++) {
    const s = w.cell(w.gxOf(w.chefs[i].x), w.gzOf(w.chefs[i].z)), dist = bfs(w, s);
    for (const [name, f] of Object.entries(KINDS)) {
      const best = Math.min(...w.tiles.filter(f).map(dist));
      assert.ok(best < Infinity, `${m.id} P${i + 1} cannot reach ${name}`);
      if (!['return', 'trash', 'ext'].includes(name)) tot[i] += best;
    }
    for (const h of w.hatches) assert.ok(Math.min(...h.tiles.map(dist)) < Infinity, `${m.id} P${i + 1} cannot reach hatch ${h.owner}`);
    tot[i] += Math.min(...own[i].tiles.map(dist));
  }
  assert.ok(Math.abs(tot[0] - tot[1]) <= 0.2 * Math.max(...tot), `${m.id} unfair ${tot}`);
  table.push(`${m.id.padEnd(8)} P1 ${String(tot[0]).padStart(3)}  P2 ${String(tot[1]).padStart(3)}  diff ${(100 * Math.abs(tot[0] - tot[1]) / Math.max(...tot)).toFixed(1)}%`);
});
console.log(table.join('\n'));

// ---- co-op unchanged -------------------------------------------------------
MAPS.forEach((m, mi) => {
  const w = new World(mi, 1);
  assert.equal(w.mode, 'coop'); assert.equal(w.result, null);
  assert.ok(w.hatches.every((h) => h.owner === -1) && w.hatches.every((h) => h.tiles.every((t) => 'Hh'.includes(t.ch))));
  assert.ok(!w.tiles.some((t) => t.ch === 'G'));
  assert.equal(w.stats.vs, undefined);
});
{
  const w = new World(2, 1); w.start();
  const [a, b] = w.chefs; a.x = 0; a.z = 1.5; b.x = 1.0; b.z = 1.5; a.face = Math.PI / 2;
  a.input.mx = 1; a.input.dash = true; run(w, 20);
  assert.equal(b.stun, 0); assert.equal(evs(w, 'stun').length, 0);
  assert.equal(a.dashCd > 0 && a.dashCd <= TUNE.dashCooldown, true);
}

// ---- tug -------------------------------------------------------------------
/** chef i stands at their own (or other) hatch holding a finished dish, then presses pick */
function serveAt(w, i, hatchOwner, dish = null, noTicket = false) {
  if (!w.tickets.length) w.spawnTicket();
  if (dish && !noTicket) { const tk = w.tickets[0]; tk.dish = dish; }
  const c = w.chefs[i], st = w.hatches.find((h) => h.owner === hatchOwner), t = st.tiles[0];
  const dish2 = dish || w.tickets[0].dish;
  const plate = w.newPlate(false);
  for (const need of DISHES[dish2].needs) { const [type, state] = need.split(':'); const it = w.newItem('ing', type, state); plate.contents.push(it); it.where = { k: 'plate', plate }; }
  w.give(c, plate);
  const wlk = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => w.cell(t.gx + dx, t.gz + dz)).find((n) => n && w.walkable(n.gx, n.gz));
  c.x = wlk.x; c.z = wlk.z; c.vx = c.vz = 0; c.face = Math.atan2(t.x - c.x, t.z - c.z);
  const o = w.chefs[1 - i]; o.x = 100; o.z = 100; // out of the way
  flush(w); w.hitStop = 0; c.input.pick = true; run(w, 3);
  return c;
}
{
  const w = vsWorld(2);
  assert.equal(w.tug, 0.5); assert.equal(w.mode, 'vs'); assert.equal(w.result, null);
  w.tickets[0].dish = 'soup'; const n = w.tickets.length, tk = w.tickets[0];
  serveAt(w, 0, 0, 'soup');
  near(w.tug, 0.6); assert.equal(w.score, 0); assert.equal(w.streak, 0); assert.equal(w.tickets.includes(tk), false);
  const tg = evs(w, 'tug')[0]; assert.ok(tg && tg.by === 0 && !tg.vip); near(tg.delta, 0.1); near(tg.value, 0.6);
  const sv = evs(w, 'serve')[0]; assert.ok(sv && sv.vip === false && sv.owner === 0);
  assert.equal(w.stats.vs[0].served, 1);
  // P2 pulls back
  serveAt(w, 1, 1, 'soup'); near(w.tug, 0.5); assert.equal(evs(w, 'tug')[0].by, 1);
  // wrong hatch refused, plate kept
  const c = serveAt(w, 0, 1, 'soup');
  assert.ok(evs(w, 'hint').some((e) => e.text === 'WRONG HATCH')); assert.ok(c.held && c.held.kind === 'plate'); near(w.tug, 0.5); assert.equal(evs(w, 'tug').length, 0);
  // dish with no ticket: serveWrong, no bar move
  w.tickets.length = 0; w.tickets.push({ id: 0, dish: 'stew', t: 50, dur: 50 });
  serveAt(w, 0, 0, 'soup', true);
  assert.equal(evs(w, 'serveWrong').length, 1); near(w.tug, 0.5);
}
{ // 5 serves from 0.5 K.O. Player 1; and Player 2
  for (const who of [0, 1]) {
    const w = vsWorld(2);
    for (let i = 0; i < 5; i++) { assert.equal(w.phase, 'play'); serveAt(w, who, who, 'soup'); }
    assert.equal(w.tug, who ? 0 : 1); assert.equal(w.phase, 'over'); assert.deepEqual(w.result, { winner: who, ko: true });
    assert.equal(evs(w, 'ko').length, 1); assert.equal(evs(w, 'ko')[0].winner, who); assert.equal(w.score, 0);
  }
  const w = vsWorld(2); w.tug = 0.8; w.tickets[0].vip = true; w.tickets[0].dish = 'soup'; serveAt(w, 0, 0);
  assert.equal(w.tug, 1); assert.deepEqual(w.result, { winner: 0, ko: true }); assert.equal(w.stats.vs[0].vip, 1);
  const w2 = vsWorld(2); w2.tickets[0].vip = true; serveAt(w2, 1, 1); near(w2.tug, 0.2); assert.equal(evs(w2, 'tug')[0].vip, true); near(evs(w2, 'tug')[0].delta, -0.3);
}
{ // time limit
  for (const [tug, win] of [[0.7, 0], [0.3, 1], [0.5, -1]]) {
    const w = vsWorld(2); w.tug = tug; w.timeLeft = 0.01; run(w, 2);
    assert.equal(w.phase, 'over'); assert.deepEqual(w.result, { winner: win, ko: false });
    const e = evs(w, 'timeup')[0]; assert.ok(e && e.result.winner === win);
  }
  const w = new World(2, 1); w.start(); w.timeLeft = 0.01; run(w, 2); assert.equal(w.result, null);
}

// ---- stun ------------------------------------------------------------------
function face2face(w) {
  const [a, b] = w.chefs;
  a.x = -2; a.z = -0.5; b.x = -1; b.z = -0.5; // bistro row 2/3 lane area is free here
  a.face = Math.PI / 2; b.face = -Math.PI / 2;
  const plate = w.newPlate(false);
  for (const need of DISHES.soup.needs) { const [type, state] = need.split(':'); const it = w.newItem('ing', type, state); plate.contents.push(it); it.where = { k: 'plate', plate }; }
  w.give(b, plate);
  return plate;
}
{
  const w = vsWorld(2), [a, b] = w.chefs;
  w.tickets.forEach((t) => { t.t = 1e6; t.dur = 1e6; });
  const plate = face2face(w);
  w.chefs[1].z = w.chefs[0].z = w.cell(0, 4).z; // row 4 lane is open floor
  const z = a.z; flush(w);
  a.input.mx = 1; a.input.dash = true; run(w, 12);
  assert.equal(b.stun > 1.3 && b.stun <= TUNE.stunTime, true, 'stunned ' + b.stun);
  assert.equal(evs(w, 'stun').length, 1); assert.equal(evs(w, 'knock').length, 1);
  assert.equal(evs(w, 'stun')[0].by, a); assert.equal(evs(w, 'stun')[0].chef, b);
  assert.equal(w.stats.vs[0].stuns, 1); assert.equal(w.stats.vs[0].knocked, 1); assert.equal(w.stats.vs[1].stuns, 0);
  assert.equal(b.held, null); assert.equal(a.dashT, 0);
  // stunned: inputs ignored for the whole stun
  const bx = b.x, bz = b.z;
  for (let i = 0; i < 60; i++) { a.input.mx = a.input.mz = 0; b.input.mx = 1; b.input.mz = 1; b.input.pick = true; b.input.act = true; b.input.dash = true; w.step(); assert.ok(b.stun > 0); }
  assert.ok(Math.hypot(b.x - bx, b.z - bz) < 1e-6, 'B must not move'); assert.equal(b.held, null);
  // plate flew about 1.6 away and lies loose with its contents
  assert.ok(w.loose.includes(plate), 'plate lies loose'); assert.equal(plate.contents.length, DISHES.soup.needs.length);
  assert.ok(Math.abs(Math.hypot(plate.x - bx, plate.z - bz) - 1.6) < 0.5, `knocked ${Math.hypot(plate.x - bx, plate.z - bz)}`);
  assert.ok(plate.x > bx, 'in the dash direction');
  assert.equal(evs(w, 'stunEnd').length, 0);
  b.input.mx = 0; b.input.mz = 0; b.input.dash = false; b.input.pick = b.input.act = false;
  for (let i = 0; i < 60 && !evs(w, 'stunEnd').length; i++) w.step();
  assert.equal(evs(w, 'stunEnd').length, 1); assert.equal(b.stun, 0); assert.ok(b.stunImmune > 0.9);
  // immunity: A (cooldown aside) cannot stun again right away
  a.dashCd = 0; a.x = b.x - 1; a.z = b.z; a.input.mx = 1; a.input.dash = true; flush(w); run(w, 12);
  assert.equal(evs(w, 'stun').length, 0); assert.equal(b.stun, 0);
}
{ // exact stun duration and cooldown
  const w = vsWorld(2), [a, b] = w.chefs; face2face(w); a.z = b.z = w.cell(0, 4).z;
  a.input.mx = 1; a.input.dash = true; w.step(); a.input.dash = false;
  assert.equal(a.dashCd > TUNE.vsDashCooldown - 0.05, true);
  let hit = 0; for (let i = 0; i < 30 && !b.stun; i++) { w.step(); hit++; }
  assert.ok(b.stun > 0);
  let n = 0; while (b.stun > 0) { w.step(); n++; }
  assert.ok(Math.abs(n / 60 - 1.5) < 0.05, 'stun lasts 1.5 s: ' + n);
  const d0 = a.dashCd; assert.ok(d0 > 1 && d0 < 3);
  a.input.dash = true; w.step(); assert.equal(a.dashT, 0, 'dash blocked while cooling');
  run(w, 60 * 2); a.input.dash = true; w.step(); assert.ok(a.dashCd > 2.9, 'dash allowed after 3 s');
}
{ // the shove stays harmless: a slow walk into the chef does not stun
  const w = vsWorld(2), [a, b] = w.chefs; face2face(w); a.z = b.z = w.cell(0, 4).z; a.input.mx = 1; run(w, 40);
  assert.equal(b.stun, 0);
}

// ---- VIP -------------------------------------------------------------------
{
  const w = vsWorld(0);
  for (const c of w.chefs) { c.x = c.z = 50; }
  w.tickets.forEach((t) => { t.t = 20; });
  let vipEv = null, prevCount = w.tickets.length;
  while (w.time < 39.9) { run(w, 1); w.tickets.forEach((t) => { if (t.t < 5) t.t = 20; }); flush(w); }
  assert.equal(w.tickets.some((t) => t.vip), false);
  const youngest = w.tickets.filter((t) => !t.vip).at(-1);
  while (!vipEv && w.time < 41) { run(w, 1); vipEv = evs(w, 'vip')[0]; if (!vipEv) w.tickets.forEach((t) => { if (t.t < 5) t.t = 20; }); }
  assert.ok(vipEv && vipEv.ticket.vip === true); near(vipEv.time ?? w.time, w.time, 1); assert.ok(w.time >= 40 && w.time < 40.1);
  const vip = vipEv.ticket; assert.equal(vip.t, vip.dur - 0 * 0, 'timer refilled'); assert.ok(w.tickets.includes(vip));
  assert.equal(w.tickets.filter((t) => t.vip).length, 1);
  // drains 2x
  const other = w.tickets.find((t) => !t.vip); const v0 = vip.t, o0 = other.t; run(w, 120);
  near((v0 - vip.t) / (o0 - other.t), 2, 0.05);
  // expiry: no penalty, event with vip true
  w.tug = 0.5; flush(w); vip.t = 0.02; run(w, 3);
  const miss = evs(w, 'ticketMissed').find((e) => e.ticket === vip);
  assert.ok(miss && miss.ticket.vip); assert.equal(w.score, 0); assert.equal(w.tug, 0.5);
  // more VIPs at 80, 120, 160
  let n = 1; w.tickets.length = 0;
  while (w.phase === 'play' && w.time < 170) { run(w, 1); w.tickets.forEach((t) => { if (t.t < 5) t.t = 20; }); n += evs(w, 'vip').length; flush(w); }
  assert.equal(n, 4);
  // no ticket at all: a new one is spawned as the VIP
  const w2 = vsWorld(0); w2.tickets.length = 0; w2.time = 39.99; w2.ticketSpawn = -100; run(w2, 2);
  assert.ok(w2.tickets.length >= 1 && w2.tickets.some((t) => t.vip));
}
{ // co-op has no VIPs and keeps its penalty
  const w = new World(0, 1); w.start(); run(w, 60 * 41); assert.equal(w.tickets.some((t) => t.vip), false);
}
console.log('vstest ok');
