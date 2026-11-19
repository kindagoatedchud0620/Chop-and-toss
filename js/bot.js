// Two-chef AI. Drives the same inputs a player would (move, pick, act). No rendering, no DOM.
import { TUNE, DISHES, CHOPPABLE, PAN_OK, POT_RECIPES, dishOfContents, plateAccepts } from './data.js';

const D4 = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const D8 = [[0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1], [1, 1, 1.42], [1, -1, 1.42], [-1, 1, 1.42], [-1, -1, 1.42]];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const MAX_PLANS = 2;
const HELP_RANGE = 6.5;

export class BotTeam {
  constructor(world, { log = null, solo = null } = {}) {
    this.w = world;
    this.log = log;
    this.tick = 0;
    this.solo = solo; // VS: this team is one chef playing for itself
    if (world.mode === 'vs' && solo == null) {
      // VS: two independent single-chef teams, one per chef
      this.subs = [0, 1].map((i) => new BotTeam(world, { log, solo: i }));
      this.brains = this.subs.map((s, i) => s.brains[i]);
      return;
    }
    this.roles = solo == null ? world.map.bot : { prep: solo, cook: solo, wash: solo };
    this.neglect = 0;
    this.plans = [];
    this.planSeq = 1;
    this.brains = world.chefs.map((chef, i) => ({ chef, i, task: null, wait: 0, lastX: chef.x, lastZ: chef.z, still: 0, nudge: 0, nx: 0, nz: 0, field: null, fieldTick: -1, bad: new Map(), parkT: 0 }));
    const cx = (list) => list.reduce((s, t) => s + t.x, 0) / Math.max(1, list.length);
    const cz = (list) => list.reduce((s, t) => s + t.z, 0) / Math.max(1, list.length);
    let stoves = world.tiles.filter((t) => t.kind === 'stove');
    let hatch = world.tiles.filter((t) => t.kind === 'hatch');
    if (solo != null) { // own hatch and the stoves nearest to it
      const hx = this.hatchOf(this.brains[solo]).x, hz = this.hatchOf(this.brains[solo]).z;
      hatch = [this.hatchOf(this.brains[solo])];
      stoves = stoves.sort((a, c) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(c.x - hx, c.z - hz)).slice(0, Math.ceil(stoves.length / 2));
    }
    this.cookSpot = { x: (cx(stoves) + cx(hatch)) / 2, z: (cz(stoves) + cz(hatch)) / 2 };
    this.homeExt = world.tiles.find((t) => t.ch === 'e') || null;
  }

  say(b, msg) { if (this.log) this.log(`[${this.w.time.toFixed(1)}] chef${b.i}: ${msg}`); }

  // ---- per frame ----------------------------------------------------------
  update() {
    const w = this.w;
    this.tick++;
    const act = this.active || (this.active = [true, true]);
    if (this.subs) {
      if (this.neglect > 0) this.neglect--;
      // alternate who moves first so neither side wins every shared-resource tie
      for (const i of this.tick % 2 ? [0, 1] : [1, 0]) { const s = this.subs[i]; s.active = [i === 0 && act[0], i === 1 && act[1]]; s.neglect = this.neglect > 0 ? 1 : 0; s.update(); }
      return;
    }
    for (const b of this.brains) { if (!act[b.i]) continue; const i = b.chef.input; i.mx = 0; i.mz = 0; i.actHeld = false; }
    if (w.phase !== 'play') return;
    if (this.pending && this.pending.length) { const now = this.tick; const run = this.pending.filter((p) => p.at <= now); this.pending = this.pending.filter((p) => p.at > now); for (const p of run) p.fn(); }
    if (this.neglect > 0) { this.neglect--; return; }
    if ((this.tick + 4 * (this.solo || 0)) % 8 === 1) this.manage();
    for (const b of this.brains) if (act[b.i]) this.think(b);
  }

  think(b) {
    const c = b.chef;
    // stunned: the sim ignores inputs, drop the task (a knocked item is recovered from the floor later)
    if (c.stun > 0) { const t = b.task; b.task = null; b.still = 0; if (t && t.onFail) t.onFail(); return; }
    if (this.solo != null && this.sabotage(b)) return;
    if (b.wait > 0) { b.wait--; return; }
    if (b.task && b.task.ttl-- <= 0) { this.say(b, 'timeout ' + b.task.note); this.fail(b); }
    if (!b.task) {
      b.task = this.decide(b);
      if (!b.task) { b.wait = 6; return; }
      if (b.task.ttl == null) b.task.ttl = 900;
      this.say(b, b.task.note || b.task.kind);
    }
    this.exec(b);
    // stuck watchdog
    const moved = Math.hypot(c.x - b.lastX, c.z - b.lastZ);
    const trying = Math.hypot(c.input.mx, c.input.mz) > 0.5;
    if (trying && moved < 0.004) b.still++; else b.still = Math.max(0, b.still - 2);
    b.lastX = c.x; b.lastZ = c.z;
    if (b.still > 40) {
      b.still = 0; b.nudge = 14;
      let a = w_rand(this.w) * Math.PI * 2;
      const o = this.other(b).chef;
      // VS: jammed head-on with the rival (one-tile bridge): sometimes back off
      if (this.solo != null && Math.hypot(o.x - c.x, o.z - c.z) < 1.5 && w_rand(this.w) < 0.5) a = Math.atan2(c.z - o.z, c.x - o.x);
      b.nx = Math.cos(a); b.nz = Math.sin(a);
    }
    if (b.nudge > 0) { b.nudge--; c.input.mx = b.nx; c.input.mz = b.nz; }
  }

  /** VS: opportunistic dash into the rival when close, in a clear line and either worth it or by chance (rate limited) */
  sabotage(b) {
    const w = this.w, c = b.chef, o = this.other(b).chef;
    if (w.time < (b.sabAt || 8) || c.dashCd > 0 || o.stun > 0 || o.stunImmune > 0) return false;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), h = o.held;
    if (d > 2.6 || d < 0.1 || !this.clearLine(c.x, c.z, o.x, o.z)) return false;
    const rich = h && ((h.kind === 'plate' && h.contents.length) || (h.kind === 'ing' && h.state === 'cooked'));
    if (w_rand(w) > (rich ? 0.02 : 0.001)) return false;
    b.sabAt = w.time + 8 + w_rand(w) * 8;
    c.input.mx = dx / d; c.input.mz = dz / d; c.input.dash = true;
    this.say(b, 'dash at rival');
    return true;
  }

  /** an item that belongs to the other VS team's plan: hands off */
  foreign(it) { return !!(it && it.plan && it.plan.owner !== this); }

  hatchOf(b) { const w = this.w; return (w.mode === 'vs' && w.hatches.find((h) => h.owner === b.i)) || w.hatches[0]; }
  sinkOf(b) {
    const w = this.w;
    if (w.mode !== 'vs' || w.sinks.length < 2) return w.sinks[0];
    const h = this.hatchOf(b);
    return w.sinks.slice().sort((a, c) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(c.x - h.x, c.z - h.z))[0];
  }

  finish(b) { const t = b.task; b.task = null; if (t && t.onDone) t.onDone(); }
  fail(b) {
    const t = b.task; b.task = null;
    if (t) this.say(b, '  x gave up: ' + (t.note || t.kind));
    if (t && t.tile) b.bad.set(t.tile.id, this.tick + 90);
    if (t && t.onFail) t.onFail();
    b.wait = 4;
  }
  isBad(b, tile) { const u = b.bad.get(tile.id); return u != null && u > this.tick; }
  other(b) { return this.brains[1 - b.i]; }
  claimed(b, obj) { const o = this.other(b); return !!(o.task && o.task.claims && o.task.claims.includes(obj)); }

  // ---- path field ---------------------------------------------------------
  fieldOf(b) {
    if (b.fieldTick === this.tick) return b.field;
    const w = this.w, W = w.W, H = w.H, n = W * H;
    const f = b.field || (b.field = { dist: new Float32Array(n), prev: new Int16Array(n), entry: new Int16Array(n), done: new Uint8Array(n), start: 0 });
    f.dist.fill(Infinity); f.prev.fill(-1); f.entry.fill(-1); f.done.fill(0);
    const c = b.chef, oc = this.other(b).chef;
    let sx = w.gxOf(c.x), sz = w.gzOf(c.z);
    if (!w.cell(sx, sz)) { sx = Math.max(0, Math.min(W - 1, sx)); sz = Math.max(0, Math.min(H - 1, sz)); }
    const start = sz * W + sx;
    f.start = start; f.dist[start] = 0;
    const ox = w.gxOf(oc.x), oz = w.gzOf(oc.z);
    const walk = this._walk || (this._walk = new Uint8Array(n));
    for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) walk[gz * W + gx] = w.walkable(gx, gz) ? 1 : 0;
    // island cells that are about to be covered count as blocked
    if (w.island && w.island.sliding > 0) for (let gx = 0; gx < W; gx++) { const i = w.island.row * W + gx; if (w.cells[i].lane && gx >= Math.min(w.island.xA, w.island.xB) && gx <= Math.max(w.island.xA, w.island.xB) + w.island.tiles.length - 1) walk[i] = 0; }
    walk[start] = 1;
    // standing on the rim of a portal without having gone through yet: finishing the step is a legal move
    const sc = w.cells[start];
    if (sc.portal && c.portalLock !== sc.portal) {
      const qc = sc.portal.pair.cell, qv = qc.gz * W + qc.gx;
      f.dist[qv] = 0.8; f.prev[qv] = start; f.entry[qv] = start;
    }
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!f.done[i] && f.dist[i] < best) { best = f.dist[i]; u = i; }
      if (u < 0) break;
      f.done[u] = 1;
      const ux = u % W, uz = (u - ux) / W;
      for (const [dx, dz, cost] of D8) {
        const vx = ux + dx, vz = uz + dz;
        if (vx < 0 || vz < 0 || vx >= W || vz >= H) continue;
        let v = vz * W + vx;
        if (!walk[v]) continue;
        if (dx && dz && (!walk[uz * W + vx] || !walk[vz * W + ux])) continue;
        let add = cost, entry = -1;
        const cell = w.cells[v];
        if (cell.portal) {
          if (dx && dz) continue;
          const q = cell.portal.pair.cell;
          entry = v; v = q.gz * W + q.gx; add += 0.6;
          if (v === u) continue;
        } else if (dx && dz && (w.cells[uz * W + vx].portal || w.cells[vz * W + ux].portal)) continue;
        if (vx === ox && vz === oz) add += 3;
        const nd = best + add;
        if (nd < f.dist[v]) { f.dist[v] = nd; f.prev[v] = u; f.entry[v] = entry; }
      }
    }
    b.fieldTick = this.tick;
    return f;
  }

  cellIdx(gx, gz) { return gz * this.w.W + gx; }

  /** best standing cell next to a tile (or its two-tile station) */
  stand(b, tile) {
    const w = this.w, f = this.fieldOf(b);
    const tiles = tile.station ? tile.station.tiles : [tile];
    let best = null;
    for (const t of tiles) {
      const gx = Math.round(t.x + (w.W - 1) / 2), gz = t.gz;
      for (const [dx, dz] of D4) {
        const x = gx + dx, z = gz + dz;
        if (!w.walkable(x, z)) continue;
        const i = this.cellIdx(x, z);
        const cell = w.cells[i];
        if (cell.portal) continue;
        const d = f.dist[i];
        if (d < Infinity && (!best || d < best.d)) best = { idx: i, d, tile: t, x: cell.x, z: cell.z };
      }
    }
    return best;
  }
  reach(b, tile) { const s = this.stand(b, tile); return s ? s.d : Infinity; }

  /** steer toward a cell; returns distance left to its centre */
  goTo(b, idx) {
    const w = this.w, f = this.fieldOf(b), c = b.chef, W = w.W;
    if (!(f.dist[idx] < Infinity)) return -1;
    const path = [];
    for (let k = idx, guard = 0; k !== f.start && k >= 0 && guard < 300; k = f.prev[k], guard++) path.push(k);
    path.reverse();
    const dest = w.cells[idx];
    let tx = dest.x, tz = dest.z;
    if (path.length) {
      if (f.entry[path[0]] >= 0) { const e = w.cells[f.entry[path[0]]]; tx = e.x; tz = e.z; }
      else {
        let pick = 0;
        for (let j = 0; j < path.length && j < 9; j++) {
          if (f.entry[path[j]] >= 0) break;
          const p = w.cells[path[j]];
          if (this.clearLine(c.x, c.z, p.x, p.z)) pick = j; else if (j > 0) break;
        }
        const p = w.cells[path[pick]];
        tx = p.x; tz = p.z;
        // if the next hop after the smoothed point is a portal entrance, aim straight for it when visible
      }
    }
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    const left = Math.hypot(dest.x - c.x, dest.z - c.z);
    if (d > 1e-4) {
      const sp = path.length <= 1 ? Math.min(1, Math.max(0.25, left * 3.2)) : 1;
      c.input.mx = dx / d * sp; c.input.mz = dz / d * sp;
    }
    return left;
  }

  clearLine(x0, z0, x1, z1) {
    const w = this.w, d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.2)), r = 0.36;
    for (let i = 1; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
      if (!w.walkablePoint(x - r, z - r) || !w.walkablePoint(x + r, z - r) || !w.walkablePoint(x - r, z + r) || !w.walkablePoint(x + r, z + r)) return false;
      const cell = w.cell(w.gxOf(x), w.gzOf(z));
      if (cell && cell.portal) return false;
    }
    return true;
  }

  // ---- task execution -----------------------------------------------------
  targeting(c, tile) { return c.target && (c.target === tile || (tile.station && c.target.station === tile.station)); }

  exec(b) {
    const w = this.w, c = b.chef, t = b.task, inp = c.input;
    switch (t.kind) {
      case 'wait': if (--t.frames <= 0) this.finish(b); return;
      case 'step': { const left = this.goTo(b, t.cell); if (left < 0.25) this.finish(b); return; }
      case 'use': case 'work': {
        const tile = t.tile;
        if (tile.fire > 0 && !(t.grabExt)) return this.fail(b);
        if (t.valid && !t.valid()) return this.fail(b);
        if (t.kind === 'work' && c.work && this.targeting(c, tile)) { t.started = true; return; }
        if (t.kind === 'work' && t.done()) return this.finish(b);
        if (this.targeting(c, tile) && (!t.exact || c.target === tile)) {
          // hold still and face the station for a moment so the press cannot miss
          const fx = c.target.x - c.x, fz = c.target.z - c.z, fd = Math.hypot(fx, fz) || 1;
          inp.mx = fx / fd * 0.12; inp.mz = fz / fd * 0.12;
          t.lock = (t.lock || 0) + 1;
          if (t.lock < 2 || c.moving > 1.2) return;
          if (t.ready && !t.ready()) return; // e.g. wait for food still riding the belt
          if (t.kind === 'use') { inp.pick = true; this.finishAfterPress(b); return; }
          if (!c.work) { t.cd = (t.cd || 0) - 1; if (t.cd <= 0) { inp.act = true; t.cd = 10; } }
          return;
        }
        t.lock = 0;
        const s = this.stand(b, tile);
        if (!s) { t.noPath = (t.noPath || 0) + 1; if (t.noPath > 30) this.fail(b); return; }
        const left = this.goTo(b, s.idx);
        if (left >= 0 && left < 0.22) {
          // at the standing cell: turn to face the station
          const dx = s.tile.x - c.x, dz = s.tile.z - c.z, d = Math.hypot(dx, dz) || 1;
          inp.mx = dx / d * 0.3; inp.mz = dz / d * 0.3;
          t.atStand = (t.atStand || 0) + 1;
          if (t.atStand > 50) this.fail(b);
        }
        return;
      }
      case 'loose': {
        const it = t.item;
        if (it.where.k !== 'floor' || c.held) return this.fail(b);
        const d = Math.hypot(it.x - c.x, it.z - c.z);
        if (d < 0.5) { inp.pick = true; this.finishAfterPress(b, null); return; }
        const idx = this.cellIdx(w.gxOf(it.x), w.gzOf(it.z));
        const left = this.goTo(b, idx);
        if (left < 0) return this.fail(b);
        if (left < 0.6) { inp.mx = (it.x - c.x) / d; inp.mz = (it.z - c.z) / d; }
        return;
      }
      case 'throw': {
        if (!c.held || c.held !== t.item) return this.fail(b);
        const cell = w.cells[t.cell];
        const left = this.goTo(b, t.cell);
        if (left < 0) return this.fail(b);
        if (left > 0.07) return;
        const want = Math.atan2(t.dx, t.dz);
        inp.mx = t.dx * 0.12; inp.mz = t.dz * 0.12;
        if (Math.abs(angDiff(c.face, want)) > 0.04) return;
        const r = w.planThrow(c.x, c.z, Math.sin(c.face), Math.cos(c.face), c.held, c);
        const ok = t.wantChef ? (r.k === 'chef' && r.chef === t.wantChef) : ((r.k === 'tile' && r.tile === t.expect) || r.k === 'chef');
        if (ok) { inp.act = true; inp.mx = inp.mz = 0; this.finish(b); b.wait = 6; return; }
        t.miss = (t.miss || 0) + 1;
        if (t.miss > (t.wantChef ? 200 : 25)) { if (t.wantChef) b.noCatch = this.tick + 600; this.fail(b); }
        return;
      }
      case 'catch': {
        // stand in the lane, face the thrower and wait for the food
        if (c.held) return this.finish(b);
        const incoming = w.flights.some((f) => f.target.k === 'chef' && f.target.chef === c);
        if (!incoming && t.from.held !== t.item) return this.finish(b);
        const left = this.goTo(b, t.cell);
        if (left < 0) return this.fail(b);
        if (left < 0.1) { const dx = t.from.x - c.x, dz = t.from.z - c.z, d = Math.hypot(dx, dz) || 1; inp.mx = dx / d * 0.12; inp.mz = dz / d * 0.12; }
        return;
      }
      case 'spray': {
        const tile = t.tile;
        if (!c.held || c.held.kind !== 'ext') return this.fail(b);
        if (tile.fire <= 0) return this.finish(b);
        const left = this.goTo(b, t.cell);
        if (left < 0) return this.fail(b);
        const dx = tile.x - c.x, dz = tile.z - c.z, d = Math.hypot(dx, dz) || 1;
        if (left < 0.25 || d < 1.2) {
          inp.mx = dx / d * 0.12; inp.mz = dz / d * 0.12;
          if (Math.abs(angDiff(c.face, Math.atan2(dx, dz))) < 0.5) inp.actHeld = true;
        }
        return;
      }
      default: this.finish(b);
    }
  }

  finishAfterPress(b, before) {
    // the key press lands this frame; look at the result next frame
    const t = b.task;
    b.task = null;
    b.wait = 2;
    if (t && t.onDone) { this.pending = this.pending || []; this.pending.push({ at: this.tick + 1, fn: t.onDone }); }
    if (t && t.tile) { const k = t.tile.id; const n = (b.repeat && b.repeat.k === k ? b.repeat.n : 0) + 1; b.repeat = { k, n, at: this.tick }; if (n >= 4) { b.bad.set(k, this.tick + 120); b.repeat = null; } }
  }

  // ---- item bookkeeping ---------------------------------------------------
  allItems() {
    const w = this.w, out = [];
    const add = (it) => { if (!it) return; out.push(it); if (it.kind === 'plate') for (const c of it.contents) out.push(c); };
    for (const c of w.chefs) add(c.held);
    for (const t of w.tiles) { add(t.item); if (t.vessel) for (const it of t.vessel.items) add(it); }
    for (const b of w.belts) for (const e of b.items) add(e.item);
    for (const it of w.loose) add(it);
    for (const f of w.flights) add(f.item);
    return out;
  }

  planComplete(p) { return !!(p.plate && p.plate.where.k !== 'gone' && dishOfContents(p.plate.contents) === p.dish); }

  manage() {
    const w = this.w;
    const items = this.allItems();
    this.items = items;
    // 1. drop finished plans and dead references
    for (const p of this.plans) {
      if (p.plate && p.plate.where.k === 'gone') p.dead = true;
      if (p.plate && (p.plate.dirty || p.plate.count > 1)) { p.plate.plan = null; p.plate = null; }
      if (p.pot && (p.pot.vessel.state === 'burnt')) { /* comps are gone, they reset below */ }
      const souped = p.pot && p.plate && p.plate.contents.some((x) => x.type === p.dish);
      for (const cmp of p.comps) {
        const it = cmp.item;
        if (!it) continue;
        if (souped) continue;
        if (it.where.k === 'gone' || it.type === 'charcoal' || it.plan !== p) { cmp.item = null; }
        else if (it.where.k === 'plate' && it.where.plate !== p.plate) { it.plan = null; cmp.item = null; }
      }
    }
    // 2. bind plans to tickets by dish, oldest first
    const taken = new Set();
    const tks = this.solo != null ? w.tickets.slice().sort((x, y) => !!y.vip - !!x.vip) : w.tickets; // VS: VIP first
    for (const p of this.plans) {
      if (p.dead) continue;
      const tk = tks.find((x) => x.dish === p.dish && !taken.has(x));
      if (tk) { taken.add(tk); p.ticket = tk; } else p.dead = true;
    }
    for (const p of this.plans) if (p.dead) this.dissolve(p);
    this.plans = this.plans.filter((p) => !p.dead);
    // 3. new plans for the oldest unplanned tickets
    for (const tk of tks) {
      if (this.plans.length >= MAX_PLANS + (this.solo != null && tk.vip ? 1 : 0)) break;
      if (taken.has(tk)) continue;
      const p = { owner: this, id: this.planSeq++, dish: tk.dish, ticket: tk, comps: [], plate: null, pot: null, plateClaim: -1 };
      const recipe = POT_RECIPES[tk.dish];
      if (recipe) {
        // soup and stew each own a pot; with one pot the second waits until it frees (shortcut: a pot left holding another recipe's items blocks until that dish is ordered again)
        const fits = (v) => { const left = recipe.slice(); return v.items.every((x) => { const k = left.indexOf(x.type); if (k < 0) return false; left.splice(k, 1); return true; }); };
        const pots = w.tiles.filter((t) => t.kind === 'stove' && t.vessel.type === 'pot' && !t.planRef && t.vessel.state !== 'burnt' && t.fire <= 0 && fits(t.vessel));
        if (!pots.length) continue;
        pots.sort((a, c) => c.vessel.items.length - a.vessel.items.length);
        p.pot = pots[0]; p.pot.planRef = p;
        p.comps = recipe.map((type) => ({ type, item: null }));
        for (const x of p.pot.vessel.items) { const cmp = p.comps.find((m) => m.type === x.type && !m.item); if (cmp) { cmp.item = x; x.plan = p; } }
      } else if (tk.dish === 'burger') p.comps = [{ type: 'meat', item: null }, { type: 'lettuce', item: null }, { type: 'bun', item: null }];
      else p.comps = DISHES[tk.dish].needs.map((k) => ({ type: k.split(':')[0], item: null }));
      taken.add(tk);
      this.plans.push(p);
    }
    this.plans.sort((a, c) => tks.indexOf(a.ticket) - tks.indexOf(c.ticket));
    // 4. adopt orphans
    for (const p of this.plans) {
      if (!p.plate) {
        const needs = DISHES[p.dish].needs;
        const plate = items.find((x) => x.kind === 'plate' && !x.dirty && !x.plan && x.count === 1 && x.contents.length && x.contents.every((cc) => needs.includes(`${cc.type}:${cc.state}`)) && x.where.k !== 'gone');
        if (plate) {
          p.plate = plate; plate.plan = p;
          for (const cc of plate.contents) { const cmp = p.comps.find((m) => m.type === cc.type); if (cmp) { if (cmp.item && cmp.item !== cc) cmp.item.plan = null; cmp.item = cc; cc.plan = p; } }
        }
      }
      for (const cmp of p.comps) {
        if (cmp.item) continue;
        const cand = items.find((x) => x.kind === 'ing' && x.type === cmp.type && !x.plan && x.state !== 'burnt' && x.where.k !== 'gone' && x.where.k !== 'plate' &&
          !(x.where.k === 'vessel' && (p.pot ? x.where.tile !== p.pot : x.where.tile.vessel.type === 'pot')) && !(p.pot && x.state === 'cooked'));
        if (cand) { cmp.item = cand; cand.plan = p; }
      }
    }
  }

  dissolve(p) {
    for (const cmp of p.comps) if (cmp.item) cmp.item.plan = null;
    if (p.plate) p.plate.plan = null;
    if (p.pot) p.pot.planRef = null;
  }

  // ---- decisions ----------------------------------------------------------
  use(tile, note, extra = {}) { return { kind: 'use', tile, note, claims: [tile], ttl: 600, ...extra }; }

  decide(b) {
    const c = b.chef;
    if (!this.items) this.manage();
    const fire = this.jobFire(b);
    if (fire) return fire;
    if (c.held) return this.continueHeld(b) || { kind: 'wait', frames: 10, note: 'hold' };
    const cook = this.roles.cook === b.i, wash = this.roles.wash === b.i;
    // jobs after the '|' are the partner's speciality: only help with those when they are close by
    const order = this.solo != null
      ? ['serve', 'vesselDone', 'plateEarly', 'collect', 'move', 'clearBurnt', 'washUrgent', 'takeChopped', 'chop', 'fetch', 'wash', 'platesHome']
      : cook
      ? ['serve', 'vesselDone', 'plateEarly', 'collect', 'move', 'clearBurnt', wash ? 'washUrgent' : null, wash ? 'wash' : null, '|', 'takeChopped', 'chop', 'fetch', wash ? null : 'wash', 'platesHome']
      : [wash ? 'platesHome' : null, 'takeChopped', wash ? 'washUrgent' : null, 'chop', 'move', 'fetch', wash ? 'wash' : null, '|', 'serve', 'vesselDone', 'plateEarly', 'collect', 'clearBurnt', wash ? null : 'wash', wash ? null : 'platesHome'];
    let helping = false;
    for (const name of order) {
      if (!name) continue;
      if (name === '|') { helping = true; continue; }
      const t = this['job_' + name](b);
      if (!t) continue;
      if (helping && !t.urgent) {
        let d = 0;
        if (t.tile) d = this.reach(b, t.tile);
        else if (t.item) d = this.fieldOf(b).dist[this.cellIdx(this.w.gxOf(t.item.x), this.w.gzOf(t.item.z))];
        if (!(d <= HELP_RANGE)) { if (t.onFail) t.onFail(); continue; }
      }
      return t;
    }
    return this.offPortal(b);
  }

  /** idle right after a portal hop: step clear, a parked chef on the exit tile jams the partner's way through */
  offPortal(b) {
    const lock = b.chef.portalLock;
    if (!lock) return null;
    const f = this.fieldOf(b);
    let best = null;
    for (const cell of this.w.cells) {
      const i = this.cellIdx(cell.gx, cell.gz), d = f.dist[i];
      if (d < Infinity && !cell.portal && Math.hypot(cell.x - lock.x, cell.z - lock.z) > 1.3 && (!best || d < best.d)) best = { i, d };
    }
    return best && { kind: 'step', cell: best.i, ttl: 120, note: 'step off portal' };
  }

  // -- fire
  jobFire(b) {
    const w = this.w, c = b.chef;
    const fires = w.tiles.filter((t) => t.fire > 0);
    if (c.held && c.held.kind === 'ext') {
      if (!fires.length) return null;
      const f = this.fieldOf(b);
      let best = null;
      for (const t of fires) {
        for (const cell of w.cells) {
          const d = Math.hypot(cell.x - t.x, cell.z - t.z);
          if (d > 2.1 || cell.portal) continue;
          const i = this.cellIdx(cell.gx, cell.gz);
          if (!(f.dist[i] < Infinity) || !w.walkable(cell.gx, cell.gz)) continue;
          const cost = f.dist[i] + d * 1.5;
          if (!best || cost < best.cost) best = { cost, tile: t, cell: i };
        }
      }
      if (!best) return null;
      return { kind: 'spray', tile: best.tile, cell: best.cell, note: 'spray fire', ttl: 500 };
    }
    if (!fires.length) return null;
    const ext = this.items.find((x) => x.kind === 'ext');
    if (!ext) return null;
    if (ext.where.k === 'chef') return null;
    const o = this.other(b);
    let mine, theirs, task;
    if (ext.where.k === 'tile') { mine = this.reach(b, ext.where.tile); theirs = this.reach(o, ext.where.tile); task = () => this.use(ext.where.tile, 'grab extinguisher', { grabExt: true, valid: () => ext.where.k === 'tile' }); }
    else if (ext.where.k === 'floor') { const f = this.fieldOf(b), fo = this.fieldOf(o); const i = this.cellIdx(w.gxOf(ext.x), w.gzOf(ext.z)); mine = f.dist[i]; theirs = fo.dist[i]; task = () => ({ kind: 'loose', item: ext, note: 'grab extinguisher', ttl: 400 }); }
    else return null;
    if (!(mine < Infinity)) return null;
    if (theirs < mine - 0.01 || (theirs === mine && b.i === 1)) return null;
    if (c.held) return this.putDown(b, 'free hands for fire');
    return task();
  }

  freeCounters(b, who = b) {
    const w = this.w;
    return w.tiles.filter((t) => t.kind === 'counter' && !t.item && t.fire <= 0 && !this.claimed(b, t) && !this.isBad(b, t) && this.reach(who, t) < Infinity && t !== this.homeExt);
  }

  putDown(b, note, near = null) {
    const c = b.chef;
    let best = null;
    for (const t of this.freeCounters(b)) {
      const d = this.reach(b, t) + (near ? Math.hypot(t.x - near.x, t.z - near.z) * 0.7 : 0);
      if (!best || d < best.d) best = { t, d };
    }
    if (!best) return null;
    return this.use(best.t, note);
  }

  // -- continue with whatever is in hand
  continueHeld(b) {
    const w = this.w, c = b.chef, h = c.held;
    if (h.kind === 'ext') {
      if (this.homeExt && !this.homeExt.item && this.homeExt.fire <= 0 && this.reach(b, this.homeExt) < Infinity) return this.use(this.homeExt, 'return extinguisher');
      return this.putDown(b, 'park extinguisher');
    }
    if (h.kind === 'plate') {
      if (h.dirty) {
        const sink = this.sinkOf(b);
        if (sink && this.reach(b, sink.tiles[0]) < Infinity) return this.use(sink.tiles[0], 'dirty plate to sink');
        return this.putDown(b, 'park dirty plate');
      }
      if (dishOfContents(h.contents)) {
        const hatch = this.hatchOf(b);
        if (this.reach(b, hatch.tiles[0]) < Infinity) return this.use(hatch.tiles[0], 'serve ' + dishOfContents(h.contents));
        return this.putDown(b, 'park dish');
      }
      const p = h.plan;
      if (p) {
        const ready = this.readyFor(p, b);
        if (ready.length) { ready.sort((x, y) => x.d - y.d); return this.use(ready[0].tile, 'plate up at ' + ready[0].tile.kind, { valid: ready[0].valid }); }
        const anchor = this.planAnchor(p);
        return this.putDown(b, 'stage plate', anchor);
      }
      if (h.contents.length) return this.putDown(b, 'park plate', this.cookSpot);
      // an unclaimed pot of soup that is ready: plate it before it burns
      for (const t of w.tiles) {
        if (t.kind === 'stove' && t.vessel.type === 'pot' && t.vessel.state === 'done' && !t.planRef && t.fire <= 0 && this.reach(b, t) < 12) return this.use(t, 'plate leftover soup', { valid: () => t.vessel.state === 'done' });
      }
      // clean empty plate without a job: take it to plate storage
      return this.storePlate(b, h);
    }
    // ingredients
    if (h.type === 'charcoal' || h.state === 'burnt') return this.toTrash(b);
    const p = h.plan;
    if (h.state === 'raw' && CHOPPABLE[h.type]) {
      const boards = w.tiles.filter((t) => t.kind === 'board' && !t.item && t.fire <= 0 && !this.claimed(b, t) && !this.isBad(b, t));
      let best = null;
      for (const t of boards) { const d = this.reach(b, t); if (d < Infinity && (!best || d < best.d)) best = { t, d }; }
      if (best) return this.use(best.t, 'to board');
      return { kind: 'wait', frames: 12, note: 'wait for board' };
    }
    const kind = this.kindOf(h);
    if (h.state === 'chopped' && kind) {
      const dest = this.cookTile(b, h);
      if (dest) { const r = this.route(b, h, dest); if (r) { if (kind === 'pan') h.dest = dest; return r; } }
      return this.park(b, h);
    }
    if (w.plateReady(h)) {
      if (p && p.plate && p.plate.where.k === 'tile' && plateAccepts(p.plate.contents, h)) {
        const tile = p.plate.where.tile;
        const d = this.reach(b, tile);
        if (d < 14) return this.use(tile, 'add to plate', { valid: () => p.plate && p.plate.where.k === 'tile' && p.plate.where.tile === tile });
      }
      return this.toStaging(b, h);
    }
    return this.toTrash(b) || this.putDown(b, 'park odd item');
  }

  toTrash(b) {
    const w = this.w;
    const bin = w.tiles.find((t) => t.kind === 'trash');
    if (bin && this.reach(b, bin) < Infinity) return this.use(bin, 'trash it');
    return this.putDown(b, 'park rubbish');
  }

  park(b, h) {
    // nowhere to cook it yet: wait a moment, then put it on a counter close by
    b.parkT = (b.parkT || 0) + 1;
    if (b.parkT < 4) return { kind: 'wait', frames: 15, note: 'wait for a free pan' };
    b.parkT = 0;
    return this.putDown(b, 'park ' + h.type);
  }

  /** where a held ingredient is cooked: 'pot', 'pan' or null (goes straight to the plate) */
  kindOf(h) {
    return h.plan ? this.kindFor(h.plan, h.type) : PAN_OK[h.type] ? 'pan' : null;
  }

  kindFor(p, type) { return POT_RECIPES[p.dish] ? 'pot' : DISHES[p.dish].needs.includes(`${type}:cooked`) ? 'pan' : null; }

  cookTile(b, h) { const k = this.kindOf(h); return k === 'pot' ? this.potFor(h) : k === 'pan' ? this.panFor(b, h) : null; }

  potFor(h) {
    const w = this.w;
    const p = h.plan;
    if (p && p.pot && w.vesselAccepts(p.pot.vessel, h) && p.pot.fire <= 0) return p.pot;
    return null;
  }

  panFor(b, h) {
    const w = this.w;
    const pans = w.tiles.filter((t) => t.kind === 'stove' && t.vessel.type === 'pan' && t.fire <= 0 && w.vesselAccepts(t.vessel, h) &&
      !this.items.some((x) => x !== h && x.dest === t && x.where.k !== 'vessel' && x.where.k !== 'gone' && x.state === 'chopped'));
    if (!pans.length) return null;
    let best = null;
    for (const t of pans) {
      let d = this.reach(b, t);
      if (!(d < Infinity)) d = 30 + Math.hypot(t.x - b.chef.x, t.z - b.chef.z);
      if (!best || d < best.d) best = { t, d };
    }
    return best.t;
  }

  /** deliver an item to a specific tile: walk, throw straight in, or ride a belt */
  route(b, item, dest) {
    const w = this.w, c = b.chef;
    const opts = [];
    const walk = this.reach(b, dest);
    if (walk < Infinity) opts.push({ cost: walk, task: () => this.use(dest, `carry ${item.type} to ${dest.kind}`) });
    if (w.isThrowable(item)) {
      const spot = this.throwSpot(b, item, dest);
      if (spot) opts.push({ cost: spot.d + 2.2, task: () => ({ kind: 'throw', item, cell: spot.idx, dx: spot.dx, dz: spot.dz, expect: dest, note: `throw ${item.type} into ${dest.kind}`, claims: [dest], ttl: 500 }) });
    }
    if (!(walk < 9)) {
      const bt = this.beltToward(b, dest);
      if (bt) opts.push({ cost: bt.d + 3.5, task: () => this.use(bt.tile, `${item.type} onto belt`, { exact: true }) });
    }
    if (!opts.length) return null;
    opts.sort((x, y) => x.cost - y.cost);
    return opts[0].task();
  }

  throwSpot(b, item, dest) {
    const w = this.w, f = this.fieldOf(b), c = b.chef;
    const gx0 = Math.round(dest.x + (w.W - 1) / 2), gz0 = dest.gz;
    let best = null;
    for (const [dx, dz] of D4) {
      for (let k = 1; k <= 8; k++) {
        const gx = gx0 - dx * k, gz = gz0 - dz * k;
        const cell = w.cell(gx, gz);
        if (!cell) break;
        if (cell.tile && cell.tile.kind === 'wall') break;
        if (!w.walkable(gx, gz) || cell.portal || cell.lane) continue;
        const i = this.cellIdx(gx, gz);
        const d = f.dist[i];
        if (!(d < Infinity)) continue;
        const r = w.planThrow(cell.x, cell.z, dx, dz, item, c, true);
        if (r.k === 'tile' && r.tile === dest && (!best || d < best.d)) best = { idx: i, d, dx, dz };
      }
    }
    return best;
  }

  beltToward(b, dest) {
    const w = this.w, c = b.chef;
    let best = null;
    for (const belt of w.belts) {
      if (belt === w.returnBelt) continue;
      const end = belt.tiles[belt.tiles.length - 1];
      const gain = Math.hypot(c.x - dest.x, c.z - dest.z) - Math.hypot(end.x - dest.x, end.z - dest.z);
      if (gain < 2) continue;
      for (const t of belt.tiles) {
        if (!w.beltFree(belt, t.bi) || t.bi > belt.tiles.length - 3) continue;
        const d = this.reach(b, t);
        if (d < Infinity && (!best || d < best.d)) best = { tile: t, d };
      }
    }
    return best;
  }

  /** a straight lane where this chef can throw and the partner can stand and catch (only when they cannot just walk over) */
  catchLane(b, pb, item) {
    const w = this.w, f = this.fieldOf(b), pf = this.fieldOf(pb);
    const pcell = this.cellIdx(w.gxOf(pb.chef.x), w.gzOf(pb.chef.z));
    if (f.dist[pcell] < 12) return null;
    let best = null;
    for (const cell of w.cells) {
      const ci = this.cellIdx(cell.gx, cell.gz);
      const cd = pf.dist[ci];
      if (!(cd <= 6) || cell.portal || cell.lane || !w.walkable(cell.gx, cell.gz)) continue;
      for (const [dx, dz] of D4) {
        for (let k = 2; k <= 7; k++) {
          const gx = cell.gx - dx * k, gz = cell.gz - dz * k;
          const tc = w.cell(gx, gz);
          if (!tc) break;
          if (tc.tile && tc.tile.kind === 'wall') break;
          const ti = this.cellIdx(gx, gz);
          if (!w.walkable(gx, gz) || tc.portal || !(f.dist[ti] < Infinity)) continue;
          const r = w.planThrow(tc.x, tc.z, dx, dz, item, b.chef, true);
          if (r.s < k - 0.35) continue; // something else would take it first
          const cost = cd + f.dist[ti];
          if (!best || cost < best.cost) best = { cost, cc: ci, tc: ti, dx, dz };
        }
      }
    }
    return best;
  }

  /** plate-ready food with no plate waiting: get it onto a counter in the cooking area */
  toStaging(b, h) {
    const w = this.w, cookB = this.brains[this.roles.cook];
    // partner is free and across a gap: toss it straight into their hands
    if (cookB !== b && w.isThrowable(h) && !cookB.chef.held && !cookB.task && !(b.noCatch > this.tick) && !w.tiles.some((t) => t.fire > 0)) {
      const lane = this.catchLane(b, cookB, h);
      if (lane) {
        cookB.task = { kind: 'catch', cell: lane.cc, from: b.chef, item: h, ttl: 420, note: 'get in position to catch' };
        cookB.wait = 0;
        this.say(cookB, cookB.task.note);
        return { kind: 'throw', item: h, cell: lane.tc, dx: lane.dx, dz: lane.dz, expect: null, wantChef: cookB.chef, note: `throw ${h.type} to partner`, ttl: 420 };
      }
    }
    const cands = this.freeCounters(b, cookB).map((t) => ({ t, far: Math.hypot(t.x - this.cookSpot.x, t.z - this.cookSpot.z) }));
    cands.sort((x, y) => x.far - y.far);
    let best = null;
    for (const cd of cands.slice(0, 10)) {
      const walk = this.reach(b, cd.t);
      if (walk < Infinity) { const cost = walk + cd.far * 0.8; if (!best || cost < best.cost) best = { cost, task: () => this.use(cd.t, `stage ${h.type}`) }; }
      if (w.isThrowable(h)) {
        const spot = this.throwSpot(b, h, cd.t);
        if (spot) { const cost = spot.d + 2.5 + cd.far * 0.8; if (!best || cost < best.cost) best = { cost, task: () => ({ kind: 'throw', item: h, cell: spot.idx, dx: spot.dx, dz: spot.dz, expect: cd.t, note: `throw ${h.type} to counter`, claims: [cd.t], ttl: 500 }) }; }
      }
    }
    if (!best || best.cost > 12) {
      const hatch = this.hatchOf(b).tiles[0];
      const bt = this.beltToward(b, hatch);
      if (bt && (!best || bt.d + 4 < best.cost)) return this.use(bt.tile, `${h.type} onto belt`, { exact: true });
    }
    return best ? best.task() : this.putDown(b, 'park ' + h.type);
  }

  storePlate(b, plate) {
    const w = this.w;
    const stores = w.tiles.filter((t) => t.ch === 'p' && t.fire <= 0 && (!t.item || (t.item.kind === 'plate' && !t.item.dirty && !t.item.contents.length && !t.item.plan)));
    let best = null;
    for (const t of stores) { const d = this.reach(b, t); if (d < Infinity && (!best || d < best.d)) best = { t, d }; }
    if (best && best.d < 12) return this.use(best.t, 'store clean plate');
    const hatch = this.hatchOf(b).tiles[0];
    const bt = this.beltToward(b, hatch);
    if (bt) return this.use(bt.tile, 'clean plate onto belt', { exact: true });
    if (best) return this.use(best.t, 'store clean plate');
    return this.putDown(b, 'park clean plate', this.cookSpot);
  }

  planAnchor(p) {
    if (p.pot) return p.pot;
    for (const cmp of p.comps) { const it = cmp.item; if (it && it.where.k === 'vessel') return it.where.tile; }
    return this.cookSpot;
  }

  /** places where a held plate of this plan can pick something up right now */
  readyFor(p, b) {
    const w = this.w, out = [];
    if (!p.plate) return out;
    if (p.pot) {
      if (p.pot.vessel.state === 'done' && p.pot.fire <= 0) { const d = this.reach(b, p.pot); if (d < Infinity) out.push({ tile: p.pot, d, valid: () => p.pot.vessel.state === 'done' }); }
      return out;
    }
    for (const cmp of p.comps) {
      const it = cmp.item;
      if (!it || it.where.k === 'plate') continue;
      if (!plateAccepts(p.plate.contents, it) && !(it.where.k === 'vessel' && it.state === 'chopped')) continue;
      if (it.where.k === 'vessel') {
        const tile = it.where.tile;
        if (tile.vessel.state === 'done' && tile.fire <= 0) { const d = this.reach(b, tile); if (d < Infinity) out.push({ tile, d: d - 3, valid: () => tile.vessel.state === 'done' }); }
      } else if (it.where.k === 'tile' && w.plateReady(it) && it.where.tile.fire <= 0) {
        const tile = it.where.tile;
        const d = this.reach(b, tile);
        if (d < Infinity) out.push({ tile, d, valid: () => it.where.k === 'tile' && it.where.tile === tile });
      }
    }
    return out;
  }

  cleanPlateSource(b) {
    const w = this.w;
    let best = null;
    const offer = (tile, d, mk) => { if (d < 11 && (!best || d < best.d)) best = { tile, d, mk }; };
    for (const t of w.tiles) {
      if (t.fire > 0 || this.isBad(b, t)) continue;
      if ((t.kind === 'counter') && t.item && t.item.kind === 'plate' && !t.item.dirty && !t.item.contents.length && !t.item.plan && !this.claimed(b, t)) offer(t, this.reach(b, t), null);
    }
    for (const s of w.sinks) if (s.clean > 0 && !this.claimed(b, s.tiles[0])) offer(s.tiles[0], this.reach(b, s.tiles[0]) + 0.5, { valid: () => s.clean > 0 });
    for (const belt of w.belts) for (const e of belt.items) {
      const it = e.item;
      if (it.kind !== 'plate' || it.dirty || it.contents.length || it.plan) continue;
      const tile = this.beltTileFor(belt, e);
      if (tile && !this.claimed(b, tile)) offer(tile, this.reach(b, tile) + 1, { exact: true, ready: () => { const e2 = w.beltEntryAt(belt, tile.bi); return !!e2 && e2.item === it; }, valid: () => it.where.k === 'belt' });
    }
    for (const it of w.loose) if (it.kind === 'plate' && !it.dirty && !it.contents.length && !it.plan) {
      const d = this.fieldOf(b).dist[this.cellIdx(w.gxOf(it.x), w.gzOf(it.z))];
      if (d < Infinity && (!best || d < best.d)) best = { loose: it, d };
    }
    return best;
  }

  beltTileFor(belt, e) {
    // where this entry will come to rest (items queue up at the end, 0.8 apart)
    const sorted = belt.items.slice().sort((p, q) => q.s - p.s);
    const rank = sorted.indexOf(e);
    const fin = belt.tiles.length - 1 - 0.8 * rank;
    const idx = Math.max(0, Math.min(belt.tiles.length - 1, Math.round(fin)));
    return belt.tiles[idx];
  }

  fetchPlate(b, p, why) {
    const src = this.cleanPlateSource(b);
    if (!src) return null;
    p.plateClaim = b.i;
    const c = b.chef;
    const onDone = () => { p.plateClaim = -1; const h = c.held; if (h && h.kind === 'plate' && !h.dirty && !h.plan && !p.plate) { h.plan = p; p.plate = h; } };
    const onFail = () => { p.plateClaim = -1; };
    if (src.loose) return { kind: 'loose', item: src.loose, note: 'plate for ' + p.dish, onDone, onFail, ttl: 400 };
    return this.use(src.tile, `plate for ${p.dish} (${why})`, { onDone, onFail, ...(src.mk || {}) });
  }

  // -- jobs for empty hands
  job_serve(b) {
    const w = this.w;
    let best = null;
    for (const t of w.tiles) {
      const it = t.item;
      if (!it || it.kind !== 'plate' || t.fire > 0 || this.claimed(b, t) || this.isBad(b, t) || this.foreign(it)) continue;
      const dish = dishOfContents(it.contents);
      if (!dish || !w.tickets.some((tk) => tk.dish === dish)) continue;
      const d = this.reach(b, t);
      if (d < Infinity && (!best || d < best.d)) best = { t, d };
    }
    return best && this.reach(b, this.hatchOf(b).tiles[0]) < Infinity ? this.use(best.t, 'pick up finished dish') : null;
  }

  job_vesselDone(b) {
    const w = this.w;
    const list = w.tiles.filter((t) => t.kind === 'stove' && t.vessel.state === 'done' && t.fire <= 0 && !this.claimed(b, t)).sort((x, y) => y.vessel.burn - x.vessel.burn);
    for (const t of list) {
      if (!(this.reach(b, t) < Infinity)) continue;
      const v = t.vessel;
      let p = v.type === 'pot' ? t.planRef : v.items[0].plan;
      if (p && p.owner !== this) continue;
      if (p && !this.plans.includes(p)) p = null; // plan already dissolved
      if (p) {
        if (p.plate) {
          if (p.plate.where.k === 'tile' && !this.claimed(b, p.plate.where.tile) && this.reach(b, p.plate.where.tile) < Infinity) {
            const tile = p.plate.where.tile;
            return this.use(tile, 'take plate to ' + v.type, { claims: [tile, t], urgent: v.burn > 0.45, valid: () => p.plate && p.plate.where.k === 'tile' && p.plate.where.tile === tile });
          }
          continue;
        }
        if (p.plateClaim >= 0) continue;
        const f = this.fetchPlate(b, p, v.type + ' is ready');
        if (f) { f.claims = (f.claims || []).concat([t]); f.urgent = v.burn > 0.45; return f; }
      }
      // no plate to be had, or nobody wants it: save pan food before it burns
      if (v.type === 'pan' && v.burn > 0.3 && this.freeCounters(b).length) return this.use(t, 'rescue from pan', { urgent: true });
      if (v.type === 'pot' && !p && v.burn > 0.15) {
        const src = this.cleanPlateSource(b);
        if (src && !src.loose) return this.use(src.tile, 'plate for leftover soup', { urgent: true, claims: [src.tile, t], ...(src.mk || {}) });
      }
    }
    return null;
  }

  job_plateEarly(b) {
    const w = this.w;
    for (const p of this.plans) {
      if (p.plate || p.plateClaim >= 0) continue;
      let want = false;
      if (p.pot) want = p.pot.vessel.state === 'cooking' && p.pot.vessel.progress > 0.5;
      for (const cmp of p.comps) {
        const it = cmp.item;
        if (!it) continue;
        if (it.where.k === 'vessel' && it.where.tile.vessel.type === 'pan' && it.where.tile.vessel.progress > 0.45) want = true;
        if ((it.where.k === 'tile' || it.where.k === 'floor' || it.where.k === 'belt') && w.plateReady(it) && !(it.state === 'chopped' && this.kindFor(p, it.type))) want = true;
      }
      if (!want) continue;
      const f = this.fetchPlate(b, p, 'early');
      if (f) return f;
    }
    return null;
  }

  job_collect(b) {
    const w = this.w;
    for (const p of this.plans) {
      if (p.plate && (p.plate.where.k === 'floor' || p.plate.where.k === 'belt')) { const t = this.pickResting(b, p.plate); if (t) return t; }
      if (!p.plate || p.plate.where.k !== 'tile') continue;
      const ptile = p.plate.where.tile;
      if (this.claimed(b, ptile) || !(this.reach(b, ptile) < Infinity)) continue;
      for (const cmp of p.comps) {
        const it = cmp.item;
        if (!it || !w.plateReady(it) || !plateAccepts(p.plate.contents, it) || (it.state === 'chopped' && this.kindFor(p, it.type))) continue;
        if (it.where.k === 'tile' && it.where.tile.fire <= 0 && this.reach(b, it.where.tile) < Infinity && !this.claimed(b, it.where.tile)) {
          const tile = it.where.tile;
          // carry whichever is closer to the other
          return this.use(tile, `collect ${it.type} for plate`, { valid: () => it.where.k === 'tile' && it.where.tile === tile });
        }
        const pick = this.pickResting(b, it);
        if (pick) return pick;
      }
    }
    return null;
  }

  /** go and pick up an item lying on the floor or riding a belt */
  pickResting(b, it) {
    const w = this.w;
    if (it.where.k === 'floor') {
      const d = this.fieldOf(b).dist[this.cellIdx(w.gxOf(it.x), w.gzOf(it.z))];
      if (d < Infinity) return { kind: 'loose', item: it, note: 'pick up ' + (it.type || it.kind) + ' from floor', ttl: 400, claims: [it] };
    } else if (it.where.k === 'belt') {
      const belt = it.where.belt;
      const e = belt.items.find((x) => x.item === it);
      if (!e) return null;
      const tile = this.beltTileFor(belt, e);
      const mine = this.reach(b, tile), theirs = this.reach(this.other(b), tile);
      const cookFirst = this.roles.cook === b.i ? 0.5 : -0.5;
      if (mine < Infinity && (this.solo != null || mine <= theirs + cookFirst) && !this.claimed(b, tile)) {
        return this.use(tile, 'take ' + (it.type || it.kind) + ' off belt', {
          exact: true, ttl: 500, claims: [tile, it],
          valid: () => { if (it.where.k !== 'belt') return false; const e2 = belt.items.find((x) => x.item === it); return !!e2 && this.beltTileFor(belt, e2) === tile; },
          ready: () => { const e2 = w.beltEntryAt(belt, tile.bi); return !!e2 && e2.item === it; },
        });
      }
    }
    return null;
  }

  job_move(b) {
    const w = this.w;
    for (const it of this.items) {
      if (it.kind !== 'ing' || this.claimed(b, it) || this.foreign(it)) continue;
      const k = it.where.k;
      if (k !== 'tile' && k !== 'floor' && k !== 'belt') continue;
      if (k === 'tile' && (it.where.tile.kind === 'board' || it.where.tile.fire > 0 || this.claimed(b, it.where.tile))) continue;
      let go = false;
      if (it.type === 'charcoal') go = true;
      else if (it.state === 'raw' && CHOPPABLE[it.type]) go = !!it.plan && w.tiles.some((t) => t.kind === 'board' && !t.item && this.reach(b, t) < Infinity);
      else if (it.state === 'chopped' && this.kindOf(it)) go = !!it.plan && !!this.cookTile(b, it);
      else if (w.plateReady(it) && (k === 'floor' || k === 'belt')) go = true;
      // plate-ready food on my side of a gap while its plate waits on the cook's side: send it over (shortcut: only the non-cook does this, cook-side food stranded from the plate is not handled)
      else if (w.plateReady(it) && this.roles.cook !== b.i && it.plan && it.plan.plate && it.plan.plate.where.k === 'tile' && !(this.reach(b, it.plan.plate.where.tile) < Infinity)) go = true;
      if (!go) continue;
      if (k === 'tile') {
        const tile = it.where.tile;
        if (this.reach(b, tile) < Infinity && !this.isBad(b, tile)) return this.use(tile, 'move ' + it.type, { claims: [tile, it], valid: () => it.where.k === 'tile' && it.where.tile === tile });
      } else { const t = this.pickResting(b, it); if (t) return t; }
    }
    return null;
  }

  job_clearBurnt(b) {
    const w = this.w;
    for (const t of w.tiles) {
      if (t.kind === 'stove' && t.vessel.state === 'burnt' && t.fire <= 0 && !this.claimed(b, t) && this.reach(b, t) < Infinity) return this.use(t, 'clear burnt ' + t.vessel.type);
    }
    return null;
  }

  dirtyAvailable(b) {
    const w = this.w;
    const t = w.returnTile;
    if (t && t.item && t.item.kind === 'plate' && t.item.dirty && !this.claimed(b, t) && this.reach(b, t) < Infinity) return this.use(t, 'collect dirty plate');
    for (const belt of w.belts) for (const e of belt.items) {
      if (e.item.kind === 'plate' && e.item.dirty) { const p = this.pickResting(b, e.item); if (p) return p; }
    }
    for (const it of w.loose) if (it.kind === 'plate' && it.dirty) { const p = this.pickResting(b, it); if (p) return p; }
    for (const tile of w.tiles) if (tile.kind === 'counter' && tile.item && tile.item.kind === 'plate' && tile.item.dirty && !this.claimed(b, tile) && this.reach(b, tile) < Infinity) return this.use(tile, 'collect dirty plate');
    return null;
  }

  cleanCount() {
    let n = 0;
    for (const it of this.items) if (it.kind === 'plate' && !it.dirty && !it.contents.length && !it.plan && it.where.k !== 'gone') n += it.count;
    for (const s of this.w.sinks) n += s.clean;
    return n;
  }

  job_washUrgent(b) { return this.cleanCount() <= 1 ? this.job_wash(b) : null; }

  job_wash(b) {
    const w = this.w;
    const sink = this.sinkOf(b);
    if (!sink || !(this.reach(b, sink.tiles[0]) < Infinity)) return null;
    if (sink.dirty > 0 && !this.claimed(b, sink.tiles[0])) return { kind: 'work', tile: sink.tiles[0], note: 'wash plates', claims: [sink.tiles[0]], ttl: 900, done: () => sink.dirty <= 0 };
    return this.dirtyAvailable(b);
  }

  job_platesHome(b) {
    // clean plates sitting in a far-away sink get carried (or belted) back to the cooking area
    const w = this.w;
    const sink = this.sinkOf(b);
    if (!sink || sink.clean <= 0 || this.claimed(b, sink.tiles[0])) return null;
    if (!(this.reach(b, sink.tiles[0]) < Infinity)) return null;
    const cookB = this.brains[this.roles.cook];
    const far = Math.hypot(sink.x - this.cookSpot.x, sink.z - this.cookSpot.z) > 6.5;
    if (!far) return null;
    if (b === cookB && this.reach(b, sink.tiles[0]) > 6) return null;
    return this.use(sink.tiles[0], 'take clean plate', {});
  }

  job_takeChopped(b) {
    const w = this.w;
    for (const t of w.tiles) {
      if (t.kind !== 'board' || !t.item || t.fire > 0 || this.claimed(b, t) || this.isBad(b, t)) continue;
      const it = t.item;
      if (it.kind !== 'ing' || it.state === 'raw' || this.foreign(it)) continue;
      if (!(this.reach(b, t) < Infinity)) continue;
      let ok = true;
      if (it.state === 'chopped' && this.kindOf(it)) ok = !!this.cookTile(b, it);
      const boardsFree = w.tiles.some((x) => x.kind === 'board' && !x.item && this.reach(b, x) < Infinity);
      if (!ok && boardsFree) continue;
      return this.use(t, 'take chopped ' + it.type, { claims: [t, it] });
    }
    return null;
  }

  job_chop(b) {
    const w = this.w;
    let best = null;
    for (const t of w.tiles) {
      if (t.kind !== 'board' || !w.isChoppable(t.item) || this.foreign(t.item) || t.fire > 0 || this.claimed(b, t) || this.isBad(b, t)) continue;
      const d = this.reach(b, t);
      if (d < Infinity && (!best || d < best.d)) best = { t, d };
    }
    if (!best) return null;
    const tile = best.t, it = tile.item;
    return { kind: 'work', tile, note: 'chop ' + it.type, claims: [tile], ttl: 600, done: () => tile.item !== it || it.state !== 'raw' };
  }

  job_fetch(b) {
    const w = this.w;
    const pans = w.tiles.filter((t) => t.kind === 'stove' && t.vessel.type === 'pan').length;
    // pan-bound food already on its way
    let panLoad = 0;
    for (const it of this.items) if (it.kind === 'ing' && this.kindOf(it) === 'pan' && it.state !== 'cooked' && it.where.k !== 'gone' && it.where.k !== 'plate') panLoad++;
    for (const t of w.tiles) if (t.kind === 'stove' && t.vessel.type === 'pan' && t.vessel.state === 'done') panLoad++;
    const boardFree = w.tiles.some((t) => t.kind === 'board' && !t.item && t.fire <= 0 && this.reach(b, t) < Infinity && !this.claimed(b, t));
    for (const p of this.plans) {
      if (this.planComplete(p)) continue;
      for (const cmp of p.comps) {
        if (cmp.item || cmp.claim === this.other(b).i) continue;
        if (this.kindFor(p, cmp.type) === 'pan' && panLoad >= pans + 1) continue;
        if (p.pot && (p.pot.vessel.state === 'burnt' || p.pot.fire > 0)) continue;
        if (CHOPPABLE[cmp.type] && !boardFree) continue;
        const crate = w.tiles.find((t) => t.kind === 'crate' && t.ctype === cmp.type);
        if (!crate || !(this.reach(b, crate) < Infinity) || this.isBad(b, crate)) continue;
        cmp.claim = b.i;
        const c = b.chef;
        return this.use(crate, `fetch ${cmp.type} for ${p.dish}`, {
          claims: [],
          onDone: () => { cmp.claim = -1; const h = c.held; if (h && h.kind === 'ing' && h.type === cmp.type && !h.plan && !cmp.item) { h.plan = p; cmp.item = h; } },
          onFail: () => { cmp.claim = -1; },
        });
      }
    }
    return null;
  }
}

function w_rand(w) { return w.rng(); }
