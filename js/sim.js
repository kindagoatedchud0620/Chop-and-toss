// The whole game simulation. Fixed 1/60 s steps, no rendering, no DOM. Views and audio listen to world.events.
import { TUNE, DT, ROUND_TIME, MAPS, DISHES, DISH_IDS, CHOPPABLE, POT_OK, PAN_OK, CRATE_OF, plateAccepts, dishOfContents, makeRng } from './data.js';

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // S, E, N, W  (rot index = facing)
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let NEXT_ID = 1;

export class World {
  constructor(mapIndex, seed = 1) {
    this.mapIndex = mapIndex;
    this.map = MAPS[mapIndex];
    this.rng = makeRng(seed * 7919 + mapIndex * 104729 + 13);
    this.events = [];
    this.time = 0;                 // sim time since the shift started
    this.timeLeft = ROUND_TIME;
    this.phase = 'ready';          // ready -> play -> over
    this.score = 0;
    this.streak = 0;
    this.stats = { served: { soup: 0, burger: 0, fishchips: 0 }, base: 0, tips: 0, missed: 0, bestStreak: 0, wrong: 0, fires: 0, washed: 0, thrown: 0, caught: 0 };
    this.tickets = [];
    this.ticketSpawn = 0;
    this.ticketExtra = 0;
    this.bag = [];
    this.returns = [];
    this.flights = [];
    this.loose = [];
    this.tiles = [];
    this.sinks = [];
    this.hatches = [];
    this.belts = [];
    this.portals = [];
    this.island = null;
    this.chefs = [];
    this.hitStop = 0;
    this.build();
  }

  emit(type, data = {}) { data.type = type; this.events.push(data); return data; }

  // ---- construction -------------------------------------------------------
  wx(gx) { return gx - (this.W - 1) / 2; }
  wz(gz) { return gz - (this.H - 1) / 2; }
  gxOf(x) { return Math.round(x + (this.W - 1) / 2); }
  gzOf(z) { return Math.round(z + (this.H - 1) / 2); }
  cell(gx, gz) { return gx < 0 || gz < 0 || gx >= this.W || gz >= this.H ? null : this.cells[gz * this.W + gx]; }

  build() {
    const rows = this.map.rows;
    this.H = rows.length; this.W = rows[0].length;
    this.cells = [];
    const spawns = [];
    const portalChars = {};
    for (let gz = 0; gz < this.H; gz++) {
      if (rows[gz].length !== this.W) throw new Error(`map ${this.map.id} row ${gz} has wrong length`);
      for (let gx = 0; gx < this.W; gx++) {
        const ch = rows[gz][gx];
        const c = { gx, gz, x: this.wx(gx), z: this.wz(gz), type: 'floor', tile: null, portal: null, lane: false, ch };
        this.cells.push(c);
        if (ch === '.') continue;
        if (ch === '~') { c.type = 'river'; continue; }
        if (ch === ' ') { c.type = 'void'; continue; }
        if (ch === 'I') { c.lane = true; continue; }
        if (ch === '1' || ch === '2') { spawns[Number(ch) - 1] = c; continue; }
        if ('uUvV'.includes(ch)) { portalChars[ch] = c; continue; }
        c.type = 'solid';
        const t = this.makeTile(ch, gx, gz);
        c.tile = t;
      }
    }
    // portals
    for (const [a, b, color] of [['u', 'U', 'blue'], ['v', 'V', 'orange']]) {
      if (portalChars[a] && portalChars[b]) {
        const pa = { cell: portalChars[a], x: portalChars[a].x, z: portalChars[a].z, color, pair: null };
        const pb = { cell: portalChars[b], x: portalChars[b].x, z: portalChars[b].z, color, pair: pa };
        pa.pair = pb; pa.cell.portal = pa; pb.cell.portal = pb;
        this.portals.push(pa, pb);
      }
    }
    // island of sliding counters
    if (this.map.island) {
      const d = this.map.island;
      const isl = { row: d.row, xA: d.xA, xB: d.xB, x0: d.xA, at: 'A', timer: d.period, period: d.period, slide: d.slide, sliding: 0, tiles: [], vx: 0 };
      [...d.cells].forEach((ch, i) => {
        const t = this.makeTile(ch, d.xA + i, d.row);
        t.mover = isl; t.mi = i;
        isl.tiles.push(t);
      });
      this.island = isl;
    }
    // orientation: face the first walkable neighbour (S, N, E, W)
    for (const t of this.tiles) {
      if (t.mover) { t.rot = 0; continue; }
      t.rot = 0;
      for (const r of [0, 2, 1, 3]) {
        const n = this.cell(t.gx + DIRS[r][0], t.gz + DIRS[r][1]);
        if (n && n.type === 'floor') { t.rot = r; break; }
      }
    }
    // two-tile stations
    for (const t of this.tiles) {
      if (t.ch === 'S' || t.ch === 'H') {
        const want = t.ch === 'S' ? 's' : 'h';
        let other = null;
        for (const [dx, dz] of DIRS) {
          const n = this.cell(t.gx + dx, t.gz + dz);
          if (n && n.tile && n.tile.ch === want && !n.tile.station) { other = n.tile; break; }
        }
        if (!other) throw new Error('two-tile station is missing its second half');
        const horiz = other.gz === t.gz;
        let rot = t.rot;
        if (horiz && (rot === 1 || rot === 3)) rot = other.rot === 0 || other.rot === 2 ? other.rot : 0;
        if (!horiz && (rot === 0 || rot === 2)) rot = other.rot === 1 || other.rot === 3 ? other.rot : 1;
        const st = { kind: t.kind, tiles: [t, other], x: (t.x + other.x) / 2, z: (t.z + other.z) / 2, rot, dirty: 0, clean: 0, progress: 0, busy: 0, flash: 0 };
        t.station = st; other.station = st; t.rot = rot; other.rot = rot;
        (t.kind === 'sink' ? this.sinks : this.hatches).push(st);
      }
    }
    // belts: contiguous runs in a row
    for (let gz = 0; gz < this.H; gz++) {
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const dir = run[0].ch === '>' ? 1 : -1;
        const tiles = dir === 1 ? run : run.slice().reverse();
        const belt = { tiles, dir, items: [], scroll: 0, returnTile: null };
        tiles.forEach((t, i) => { t.belt = belt; t.bi = i; t.rot = dir === 1 ? 1 : 3; });
        this.belts.push(belt);
        run = [];
      };
      for (let gx = 0; gx < this.W; gx++) {
        const t = this.cell(gx, gz).tile;
        if (t && t.kind === 'belt' && (!run.length || run[0].ch === t.ch)) run.push(t);
        else { flush(); if (t && t.kind === 'belt') run.push(t); }
      }
      flush();
    }
    this.returnTile = this.tiles.find((t) => t.kind === 'return');
    for (const b of this.belts) {
      const first = b.tiles[0];
      if (this.returnTile && Math.abs(first.gx - this.returnTile.gx) + Math.abs(first.gz - this.returnTile.gz) === 1) { b.returnTile = this.returnTile; this.returnBelt = b; }
    }
    // starting plates: 4 clean plates split over the 'p' counters
    const pc = this.tiles.filter((t) => t.ch === 'p');
    const total = 4;
    pc.forEach((t, i) => {
      const n = Math.floor(total / pc.length) + (i < total % pc.length ? 1 : 0);
      if (n > 0) this.putOnTile(t, this.newPlate(false, n));
    });
    const ex = this.tiles.find((t) => t.ch === 'e');
    if (ex) this.putOnTile(ex, this.newItem('ext'));
    // chefs
    for (let i = 0; i < 2; i++) {
      const s = spawns[i];
      this.chefs.push({
        idx: i, x: s.x, z: s.z, vx: 0, vz: 0, face: i === 0 ? Math.PI / 2 : -Math.PI / 2, held: null, target: null, work: null,
        dashT: 0, dashCd: 0, dashX: 0, dashZ: 0, spraying: false, portalLock: null, bump: 0, catchPop: 0, throwPop: 0, moving: 0,
        input: { mx: 0, mz: 0, pick: false, act: false, actHeld: false, dash: false },
      });
    }
    for (let i = 0; i < 3; i++) this.spawnTicket(true);
  }

  makeTile(ch, gx, gz) {
    const t = {
      id: NEXT_ID++, ch, gx, gz, x: this.wx(gx), z: this.wz(gz), rot: 0, kind: 'counter', item: null, fire: 0, spreadT: 0, immune: 0,
      mover: null, station: null, belt: null, vessel: null, ctype: null, anim: 0, work: 0,
    };
    if (ch === 'W') t.kind = 'wall';
    else if (CRATE_OF[ch]) { t.kind = 'crate'; t.ctype = CRATE_OF[ch]; }
    else if (ch === 'c') t.kind = 'board';
    else if (ch === 'o' || ch === 'n') { t.kind = 'stove'; t.vessel = { type: ch === 'o' ? 'pot' : 'pan', items: [], progress: 0, burn: 0, state: 'idle' }; }
    else if (ch === 'S' || ch === 's') t.kind = 'sink';
    else if (ch === 'H' || ch === 'h') t.kind = 'hatch';
    else if (ch === 'R') t.kind = 'return';
    else if (ch === 'X') t.kind = 'trash';
    else if (ch === '>' || ch === '<') t.kind = 'belt';
    this.tiles.push(t);
    return t;
  }

  // ---- items --------------------------------------------------------------
  newItem(kind, type = null, state = 'raw') {
    return { id: NEXT_ID++, kind, type, state, chop: 0, dirty: false, contents: [], count: 1, where: { k: 'none' }, x: 0, z: 0, age: 0 };
  }
  newPlate(dirty, count = 1) { const p = this.newItem('plate'); p.dirty = dirty; p.count = count; return p; }
  putOnTile(tile, item) { tile.item = item; item.where = { k: 'tile', tile }; }
  give(chef, item) { chef.held = item; item.where = { k: 'chef', chef }; }
  destroy(item) { item.where = { k: 'gone' }; }
  isThrowable(it) { return it && it.kind === 'ing' && (it.state === 'raw' || it.state === 'chopped'); }
  isChoppable(it) { return it && it.kind === 'ing' && it.state === 'raw' && CHOPPABLE[it.type]; }
  plateReady(it) { return it && it.kind === 'ing' && ((it.type === 'bun' && it.state === 'raw') || (it.type === 'lettuce' && it.state === 'chopped') || it.state === 'cooked'); }

  vesselAccepts(v, it) {
    if (!it || it.kind !== 'ing' || it.state !== 'chopped' || v.state === 'burnt' || v.state === 'done') return false;
    if (v.type === 'pot') return !!POT_OK[it.type] && v.items.length < 3 && v.state === 'idle';
    return !!PAN_OK[it.type] && v.items.length === 0;
  }
  addToVessel(tile, it) {
    const v = tile.vessel;
    v.items.push(it); it.where = { k: 'vessel', tile };
    if (v.type === 'pan' || v.items.length === 3) { v.state = 'cooking'; v.progress = 0; v.burn = 0; }
    this.emit('sizzle', { tile, vessel: v.type });
  }
  beltFree(belt, i) { return !belt.items.some((e) => Math.abs(e.s - i) < 0.8); }
  beltEntryAt(belt, i) {
    let best = null;
    for (const e of belt.items) { const d = Math.abs(e.s - i); if (d < 0.65 && (!best || d < Math.abs(best.s - i))) best = e; }
    return best;
  }

  /** can a thrown or dropped loose item land on this tile */
  tileAccepts(tile, it) {
    if (tile.fire > 0) return false;
    switch (tile.kind) {
      case 'counter': case 'board': return !tile.item;
      case 'stove': return this.vesselAccepts(tile.vessel, it);
      case 'belt': return this.beltFree(tile.belt, tile.bi);
      default: return false;
    }
  }
  landOnTile(tile, it) {
    if (tile.kind === 'stove') this.addToVessel(tile, it);
    else if (tile.kind === 'belt') { tile.belt.items.push({ item: it, s: tile.bi }); it.where = { k: 'belt', belt: tile.belt }; }
    else this.putOnTile(tile, it);
  }

  // ---- lookups ------------------------------------------------------------
  /** solid tile occupying a grid cell, island aware */
  tileAtCell(gx, gz) {
    const c = this.cell(gx, gz);
    if (!c) return null;
    if (c.tile) return c.tile;
    if (this.island && gz === this.island.row) {
      const x = this.wx(gx);
      for (const t of this.island.tiles) if (Math.abs(t.x - x) < 0.5) return t;
    }
    return null;
  }
  tileAtPoint(x, z) {
    const gx = this.gxOf(x), gz = this.gzOf(z);
    const c = this.cell(gx, gz);
    if (!c) return null;
    if (c.tile) return c.tile;
    if (this.island && gz === this.island.row) for (const t of this.island.tiles) if (Math.abs(t.x - x) <= 0.5) return t;
    return null;
  }
  walkable(gx, gz) {
    const c = this.cell(gx, gz);
    return !!c && c.type === 'floor' && !this.tileAtCell(gx, gz);
  }
  walkablePoint(x, z) {
    const c = this.cell(this.gxOf(x), this.gzOf(z));
    return !!c && c.type === 'floor' && !this.tileAtPoint(x, z);
  }
  neighbours(tile) {
    const out = [];
    const gx = Math.round(tile.x + (this.W - 1) / 2);
    for (const [dx, dz] of DIRS) { const t = this.tileAtCell(gx + dx, tile.gz + dz); if (t && t !== tile) out.push(t); }
    return out;
  }

  // ---- main step ----------------------------------------------------------
  step() {
    const dt = DT;
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.phase === 'play') {
      this.time += dt;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.phase = 'over'; this.emit('timeup'); for (const c of this.chefs) { c.work = null; c.spraying = false; } return; }
    }
    const live = this.phase === 'play';
    this.updateIsland(dt, live);
    for (const c of this.chefs) this.updateChef(c, dt, live);
    this.collideChefs();
    if (!live) return;
    this.updateFlights(dt);
    this.updateBelts(dt);
    this.updateStoves(dt);
    this.updateFire(dt);
    this.updateOrders(dt);
    this.updateReturns(dt);
    for (const s of this.sinks) { if (s.busy > 0) s.busy -= dt; if (s.flash > 0) s.flash -= dt; }
  }

  start() { if (this.phase === 'ready') { this.phase = 'play'; this.emit('go'); } }

  // ---- island -------------------------------------------------------------
  updateIsland(dt, live) {
    const isl = this.island;
    if (!isl) return;
    isl.vx = 0;
    if (isl.sliding > 0) {
      isl.sliding -= dt;
      const u = clamp(1 - isl.sliding / isl.slide, 0, 1);
      const e = u * u * (3 - 2 * u);
      const from = isl.at === 'A' ? isl.xA : isl.xB, to = isl.at === 'A' ? isl.xB : isl.xA;
      const nx = from + (to - from) * e;
      isl.vx = (nx - isl.x0) / dt;
      isl.x0 = nx;
      if (isl.sliding <= 0) { isl.x0 = to; isl.at = isl.at === 'A' ? 'B' : 'A'; isl.timer = isl.period; this.emit('islandStop'); }
    } else if (live) {
      isl.timer -= dt;
      if (isl.timer <= 1.0 && !isl.warned) { isl.warned = true; this.emit('islandWarn'); }
      if (isl.timer <= 0) { isl.sliding = isl.slide; isl.warned = false; this.emit('islandMove'); }
    }
    isl.tiles.forEach((t, i) => { t.x = this.wx(isl.x0 + i); t.gx = Math.round(isl.x0 + i); });
    // push loose items out of the way
    if (isl.vx !== 0) {
      for (const it of this.loose) {
        if (this.gzOf(it.z) !== isl.row) continue;
        const t = this.tileAtPoint(it.x, it.z);
        if (t) it.x = t.x + Math.sign(isl.vx) * 0.75;
      }
    }
  }

  // ---- chefs --------------------------------------------------------------
  updateChef(c, dt, live) {
    const inp = c.input;
    let mx = inp.mx, mz = inp.mz;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    if (!live) { mx = 0; mz = 0; }
    c.dashCd -= dt;
    if (live && inp.dash && c.dashCd <= 0) {
      c.dashT = TUNE.dashTime; c.dashCd = TUNE.dashCooldown;
      if (mag > 0.1) { c.dashX = mx / Math.max(mag, 1e-6) * (mag > 1 ? mag : 1); c.dashZ = mz / Math.max(mag, 1e-6) * (mag > 1 ? mag : 1); const m2 = Math.hypot(c.dashX, c.dashZ); c.dashX /= m2; c.dashZ /= m2; }
      else { c.dashX = Math.sin(c.face); c.dashZ = Math.cos(c.face); }
      this.emit('dash', { chef: c });
    }
    let speed = TUNE.walkSpeed * (c.spraying ? 0.55 : 1);
    if (mag < 0.2) speed = 0; // a light touch only turns the chef (used by the AI to aim)
    let tvx = mx * speed, tvz = mz * speed;
    if (c.dashT > 0) { c.dashT -= dt; tvx = c.dashX * TUNE.dashSpeed; tvz = c.dashZ * TUNE.dashSpeed; c.vx = tvx; c.vz = tvz; }
    const k = Math.min(1, TUNE.accel * dt / Math.max(0.001, Math.hypot(tvx - c.vx, tvz - c.vz)));
    c.vx += (tvx - c.vx) * k; c.vz += (tvz - c.vz) * k;
    if (mag > 0.05) {
      const want = Math.atan2(mx, mz);
      c.face += angDiff(want, c.face) * Math.min(1, dt * 20);
    }
    c.moving = Math.hypot(c.vx, c.vz);
    // integrate in two substeps so fast dashes do not tunnel
    for (let s = 0; s < 2; s++) {
      c.x += c.vx * dt * 0.5; c.z += c.vz * dt * 0.5;
      this.collideChef(c);
    }
    this.checkPortal(c);
    if (c.bump > 0) c.bump -= dt;
    if (c.catchPop > 0) c.catchPop -= dt;
    if (c.throwPop > 0) c.throwPop -= dt;
    c.target = this.computeTarget(c);
    c.spraying = false;
    if (!live) { c.work = null; inp.pick = inp.act = inp.dash = false; return; }
    if (inp.pick) this.doPick(c);
    this.doAct(c, inp.act, inp.actHeld);
    inp.pick = inp.act = inp.dash = false;
    // ongoing work (chopping, washing) continues while the chef keeps facing the station
    if (c.work) {
      const w = c.work;
      if (c.target !== w.tile && !(w.tile.station && c.target && c.target.station === w.tile.station)) c.work = null;
      else if (c.held) c.work = null;
      else if (w.kind === 'chop') {
        const it = w.tile.item;
        if (!this.isChoppable(it) || w.tile.fire > 0) c.work = null;
        else {
          it.chop += dt / TUNE.chopTime;
          w.tile.work = 0.15;
          w.beat = (w.beat || 0) - dt;
          if (w.beat <= 0) { w.beat = 0.21; this.emit('chop', { tile: w.tile, chef: c }); }
          if (it.chop >= 1) { it.state = 'chopped'; it.chop = 0; c.work = null; this.emit('chopDone', { tile: w.tile, item: it, chef: c }); }
        }
      } else if (w.kind === 'wash') {
        const st = w.tile.station;
        if (st.dirty <= 0) c.work = null;
        else {
          st.progress += dt / TUNE.washTime;
          st.busy = 0.15;
          w.beat = (w.beat || 0) - dt;
          if (w.beat <= 0) { w.beat = 0.16; this.emit('scrub', { station: st, chef: c }); }
          if (st.progress >= 1) {
            st.progress = 0; st.dirty--; st.clean++; st.flash = 0.4; this.stats.washed++;
            this.emit('washDone', { station: st, chef: c });
            if (st.dirty <= 0) c.work = null;
          }
        }
      }
    }
  }

  solidBoxes(c, out) {
    out.length = 0;
    const gx = this.gxOf(c.x), gz = this.gzOf(c.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cell = this.cell(gx + dx, gz + dz);
      if (!cell) out.push(this.wx(gx + dx), this.wz(gz + dz));
      else if (cell.type !== 'floor') out.push(cell.x, cell.z);
    }
    if (this.island && Math.abs(gz - this.island.row) <= 1) for (const t of this.island.tiles) if (Math.abs(t.x - c.x) < 1.6) out.push(t.x, t.z);
    return out;
  }

  collideChef(c) {
    const r = TUNE.chefRadius;
    const boxes = this._boxes || (this._boxes = []);
    this.solidBoxes(c, boxes);
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      for (let i = 0; i < boxes.length; i += 2) {
        const bx = boxes[i], bz = boxes[i + 1];
        const px = clamp(c.x, bx - 0.5, bx + 0.5), pz = clamp(c.z, bz - 0.5, bz + 0.5);
        let dx = c.x - px, dz = c.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 < 1e-9) {
          // centre is inside the box: leave through the nearest face
          const ox = c.x - bx, oz = c.z - bz;
          if (Math.abs(ox) > Math.abs(oz)) c.x = bx + Math.sign(ox || 1) * (0.5 + r); else c.z = bz + Math.sign(oz || 1) * (0.5 + r);
        } else {
          const d = Math.sqrt(d2);
          c.x = px + dx / d * r; c.z = pz + dz / d * r;
        }
      }
      if (!hit) break;
    }
  }

  collideChefs() {
    const [a, b] = this.chefs;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz), min = TUNE.chefRadius * 2;
    if (d < min && d > 1e-6) {
      const push = (min - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel > 2.2 && a.bump <= 0 && b.bump <= 0) {
        // light shove: the faster chef passes some speed to the other
        const k = rel * 0.45;
        a.vx -= nx * k; a.vz -= nz * k; b.vx += nx * k; b.vz += nz * k;
        a.bump = b.bump = 0.3;
        this.emit('bump', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      }
      this.collideChef(a); this.collideChef(b);
    }
  }

  checkPortal(c) {
    if (c.portalLock) {
      const p = c.portalLock;
      if (Math.hypot(c.x - p.x, c.z - p.z) > 0.66) c.portalLock = null;
      return;
    }
    for (const p of this.portals) {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 0.3) {
        const q = p.pair;
        this.emit('teleport', { chef: c, from: p, to: q });
        c.x = q.x; c.z = q.z; c.portalLock = q;
        return;
      }
    }
  }

  computeTarget(c) {
    let best = null, bestScore = 1e9;
    const gx = this.gxOf(c.x), gz = this.gzOf(c.z);
    const consider = (t) => {
      if (!t || t.kind === 'wall') return;
      const px = clamp(c.x, t.x - 0.5, t.x + 0.5), pz = clamp(c.z, t.z - 0.5, t.z + 0.5);
      const dist = Math.hypot(c.x - px, c.z - pz);
      if (dist > TUNE.reach) return;
      const diff = Math.abs(angDiff(Math.atan2(t.x - c.x, t.z - c.z), c.face));
      if (diff > 1.2) return;
      const score = diff + dist * 0.6;
      if (score < bestScore) { bestScore = score; best = t; }
    };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const cell = this.cell(gx + dx, gz + dz); if (cell && cell.tile) consider(cell.tile); }
    if (this.island && Math.abs(gz - this.island.row) <= 1) for (const t of this.island.tiles) consider(t);
    return best;
  }

  nearestLoose(c, maxD) {
    let best = null, bd = maxD;
    for (const it of this.loose) { const d = Math.hypot(it.x - c.x, it.z - c.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  takeLoose(it) { const i = this.loose.indexOf(it); if (i >= 0) this.loose.splice(i, 1); }

  /** what the pick up / drop / plate key would do right now (also used by hints) */
  doPick(c) {
    const t = c.target;
    const h = c.held;
    if (!h) {
      const near = this.nearestLoose(c, 0.62);
      if (near) { this.takeLoose(near); this.give(c, near); this.emit('pickup', { chef: c, item: near }); return true; }
      if (t && this.takeFromTile(c, t)) return true;
      const far = this.nearestLoose(c, 0.95);
      if (far) { this.takeLoose(far); this.give(c, far); this.emit('pickup', { chef: c, item: far }); return true; }
      return false;
    }
    if (t) {
      if (this.useOnTile(c, t, h)) return true;
      this.emit('nope', { chef: c, tile: t });
      return false;
    }
    // no station in front: put it down on the floor
    let px = c.x + Math.sin(c.face) * 0.62, pz = c.z + Math.cos(c.face) * 0.62;
    if (!this.walkablePoint(px, pz)) { px = c.x; pz = c.z; }
    c.held = null; h.x = px; h.z = pz; h.where = { k: 'floor' }; this.loose.push(h);
    this.emit('drop', { chef: c, item: h, x: px, z: pz });
    return true;
  }

  takeFromTile(c, t) {
    if (t.fire > 0) {
      if (t.item && t.item.kind === 'ext') { const it = t.item; t.item = null; this.give(c, it); this.emit('pickup', { chef: c, item: it, tile: t }); return true; }
      this.emit('nope', { chef: c, tile: t, why: 'fire' });
      return false;
    }
    switch (t.kind) {
      case 'crate': {
        const it = this.newItem('ing', t.ctype, 'raw');
        this.give(c, it); t.anim = 0.25;
        this.emit('pickup', { chef: c, item: it, tile: t, crate: true });
        return true;
      }
      case 'counter': case 'board': case 'return': {
        const it = t.item;
        if (!it) return false;
        if (it.kind === 'plate' && it.count > 1) { it.count--; const p = this.newPlate(it.dirty); this.give(c, p); this.emit('pickup', { chef: c, item: p, tile: t }); return true; }
        t.item = null; this.give(c, it);
        this.emit('pickup', { chef: c, item: it, tile: t });
        return true;
      }
      case 'stove': {
        const v = t.vessel;
        if (v.state === 'burnt' || (v.type === 'pan' && v.state === 'done')) {
          const it = v.items[0];
          v.items = []; v.state = 'idle'; v.progress = 0; v.burn = 0;
          this.give(c, it); this.emit('pickup', { chef: c, item: it, tile: t });
          return true;
        }
        if (v.type === 'pot' && v.state === 'done') this.emit('hint', { chef: c, tile: t, text: 'NEED A PLATE' });
        return false;
      }
      case 'sink': {
        const st = t.station;
        if (st.clean > 0) { st.clean--; const p = this.newPlate(false); this.give(c, p); this.emit('pickup', { chef: c, item: p, tile: t }); return true; }
        return false;
      }
      case 'belt': {
        const e = this.beltEntryAt(t.belt, t.bi);
        if (!e) return false;
        t.belt.items.splice(t.belt.items.indexOf(e), 1);
        this.give(c, e.item); this.emit('pickup', { chef: c, item: e.item, tile: t });
        return true;
      }
      default: return false;
    }
  }

  addToPlate(plate, it) {
    plate.contents.push(it); it.where = { k: 'plate', plate };
    this.emit('plated', { plate, item: it, dish: dishOfContents(plate.contents) });
  }
  canPlate(plate, it) { return plate.kind === 'plate' && !plate.dirty && plate.count === 1 && this.plateReady(it) && plateAccepts(plate.contents, it); }

  useOnTile(c, t, h) {
    if (t.fire > 0) { this.emit('nope', { chef: c, tile: t, why: 'fire' }); return true; }
    const put = (ev = 'place') => { c.held = null; this.emit(ev, { chef: c, item: h, tile: t }); return true; };
    switch (t.kind) {
      case 'counter': case 'board': {
        const it = t.item;
        if (!it) { if (t.kind === 'board' && h.kind !== 'ing') return false; this.putOnTile(t, h); return put(); }
        if (h.kind === 'plate' && it.kind === 'ing' && this.canPlate(h, it)) { t.item = null; this.addToPlate(h, it); return true; }
        if (h.kind === 'ing' && it.kind === 'plate' && this.canPlate(it, h)) { c.held = null; this.addToPlate(it, h); return true; }
        if (h.kind === 'plate' && it.kind === 'plate' && h.dirty === it.dirty && !h.contents.length && !it.contents.length && h.count === 1) { it.count++; this.destroy(h); return put('stack'); }
        return false;
      }
      case 'stove': {
        const v = t.vessel;
        if (this.vesselAccepts(v, h)) { c.held = null; this.addToVessel(t, h); this.emit('place', { chef: c, item: h, tile: t }); return true; }
        if (h.kind === 'plate' && v.state === 'done') {
          if (v.type === 'pot') {
            const soup = this.newItem('ing', 'soup', 'cooked');
            if (!this.canPlate(h, soup)) return false;
            for (const it of v.items) this.destroy(it);
            v.items = []; v.state = 'idle'; v.progress = 0; v.burn = 0;
            this.addToPlate(h, soup);
            return true;
          }
          const it = v.items[0];
          if (!this.canPlate(h, it)) return false;
          v.items = []; v.state = 'idle'; v.progress = 0; v.burn = 0;
          this.addToPlate(h, it);
          return true;
        }
        return false;
      }
      case 'trash': {
        if (h.kind === 'ing') { c.held = null; this.destroy(h); t.anim = 0.3; this.emit('trash', { chef: c, tile: t }); return true; }
        if (h.kind === 'plate' && h.contents.length) { for (const it of h.contents) this.destroy(it); h.contents = []; t.anim = 0.3; this.emit('trash', { chef: c, tile: t, plate: h }); return true; }
        return false;
      }
      case 'hatch': {
        if (h.kind !== 'plate') return false;
        const dish = dishOfContents(h.contents);
        if (!dish) { this.emit('hint', { chef: c, tile: t, text: h.dirty ? 'DIRTY PLATE' : 'NOT A FULL DISH' }); return false; }
        c.held = null; this.serve(c, t, h, dish);
        return true;
      }
      case 'sink': {
        if (h.kind === 'plate' && h.dirty) { c.held = null; t.station.dirty += h.count; this.destroy(h); this.emit('place', { chef: c, item: h, tile: t, sink: true }); return true; }
        if (h.kind === 'plate' && !h.dirty && !h.contents.length) { c.held = null; t.station.clean += h.count; this.destroy(h); this.emit('place', { chef: c, item: h, tile: t }); return true; }
        return false;
      }
      case 'crate': {
        if (h.kind === 'ing' && h.type === t.ctype && h.state === 'raw') { c.held = null; this.destroy(h); t.anim = 0.25; this.emit('place', { chef: c, item: h, tile: t }); return true; }
        return false;
      }
      case 'belt': {
        if (!this.beltFree(t.belt, t.bi)) return false;
        if (h.kind === 'plate' && h.count > 1) return false;
        c.held = null; this.landOnTile(t, h); this.emit('place', { chef: c, item: h, tile: t });
        return true;
      }
      default: return false;
    }
  }

  doAct(c, pressed, heldKey) {
    const h = c.held, t = c.target;
    if (h && h.kind === 'ext') {
      if (heldKey || pressed) this.spray(c);
      return;
    }
    if (!pressed) return;
    if (h) {
      if (this.isThrowable(h)) this.throwItem(c);
      else this.emit('nope', { chef: c });
      return;
    }
    if (!t || t.fire > 0) return;
    if (t.kind === 'board' && this.isChoppable(t.item)) c.work = { kind: 'chop', tile: t, beat: 0 };
    else if (t.kind === 'sink' && t.station.dirty > 0) c.work = { kind: 'wash', tile: t, beat: 0 };
  }

  // ---- throwing -----------------------------------------------------------
  planThrow(x, z, dx, dz, item, thrower, ignoreChefs = false) {
    let lastFloor = null, lastTile = null;
    const step = 0.12;
    for (let s = 0.5; s <= TUNE.throwRange; s += step) {
      const px = x + dx * s, pz = z + dz * s;
      for (const o of this.chefs) {
        if (ignoreChefs || o === thrower || o.held) continue;
        if (this.flights.some((f) => f.target.k === 'chef' && f.target.chef === o)) continue;
        if (Math.hypot(o.x - px, o.z - pz) < 0.6) return { k: 'chef', chef: o, s };
      }
      const cell = this.cell(this.gxOf(px), this.gzOf(pz));
      if (!cell) break;
      const tile = this.tileAtPoint(px, pz);
      if (tile) {
        if (tile.kind === 'wall') break;
        if (tile !== lastTile) {
          lastTile = tile;
          if (this.tileAccepts(tile, item)) return { k: 'tile', tile, s };
        }
        continue;
      }
      if (cell.type === 'floor') {
        lastFloor = { k: 'floor', x: px, z: pz, s };
        if (s >= TUNE.throwFloor) return lastFloor;
      } else if (s >= TUNE.throwFloor + 0.8 && cell.type === 'river') return { k: 'water', x: px, z: pz, s };
    }
    if (lastFloor) return lastFloor;
    return { k: 'floor', x, z, s: 0.3 };
  }

  throwItem(c) {
    const item = c.held;
    const dx = Math.sin(c.face), dz = Math.cos(c.face);
    const target = this.planThrow(c.x, c.z, dx, dz, item, c);
    c.held = null; c.throwPop = 0.25;
    const f = { item, x0: c.x + dx * 0.35, z0: c.z + dz * 0.35, y0: 0.95, target, t: 0, dur: 0.24 + target.s * 0.062, h: 0.55 + target.s * 0.17, x: c.x, y: 0.95, z: c.z, by: c };
    item.where = { k: 'air', flight: f };
    this.flights.push(f);
    this.stats.thrown++;
    this.emit('throw', { chef: c, item, flight: f });
  }

  flightTargetPos(f) {
    const t = f.target;
    if (t.k === 'chef') return [t.chef.x + Math.sin(t.chef.face) * 0.3, 0.9, t.chef.z + Math.cos(t.chef.face) * 0.3];
    if (t.k === 'tile') return [t.tile.x, t.tile.kind === 'stove' ? 1.0 : 0.86, t.tile.z];
    if (t.k === 'water') return [t.x, -0.15, t.z];
    return [t.x, 0.05, t.z];
  }

  updateFlights(dt) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      const [tx, ty, tz] = this.flightTargetPos(f);
      f.x = f.x0 + (tx - f.x0) * u; f.z = f.z0 + (tz - f.z0) * u;
      f.y = f.y0 + (ty - f.y0) * u + Math.sin(Math.PI * u) * f.h;
      if (u >= 1) { this.flights.splice(i, 1); this.land(f); }
    }
  }

  dropLoose(item, x, z) {
    if (!this.walkablePoint(x, z)) {
      // nearest walkable cell centre
      let best = null, bd = 1e9;
      for (const c of this.cells) {
        if (c.type !== 'floor' || this.tileAtCell(c.gx, c.gz)) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best || bd > 2.5) { this.destroy(item); this.emit('splash', { x, z, item }); return; }
      x = best.x; z = best.z;
    }
    item.x = x; item.z = z; item.where = { k: 'floor' };
    this.loose.push(item);
    this.emit('land', { item, x, z, floor: true });
  }

  land(f) {
    const t = f.target, item = f.item;
    if (t.k === 'chef') {
      if (!t.chef.held) {
        this.give(t.chef, item); t.chef.catchPop = 0.3; this.stats.caught++;
        this.emit('catch', { chef: t.chef, item, by: f.by });
      } else this.dropLoose(item, t.chef.x - Math.sin(t.chef.face) * 0.5, t.chef.z - Math.cos(t.chef.face) * 0.5);
    } else if (t.k === 'tile') {
      if (this.tileAccepts(t.tile, item)) { this.landOnTile(t.tile, item); this.emit('land', { item, tile: t.tile, x: t.tile.x, z: t.tile.z }); }
      else {
        const dx = f.x0 - t.tile.x, dz = f.z0 - t.tile.z, d = Math.hypot(dx, dz) || 1;
        this.dropLoose(item, t.tile.x + dx / d * 0.9, t.tile.z + dz / d * 0.9);
      }
    } else if (t.k === 'water') { this.destroy(item); this.emit('splash', { x: t.x, z: t.z, item }); }
    else this.dropLoose(item, t.x, t.z);
  }

  // ---- belts --------------------------------------------------------------
  updateBelts(dt) {
    for (const b of this.belts) {
      b.scroll = (b.scroll + TUNE.beltSpeed * dt) % 1;
      b.items.sort((p, q) => q.s - p.s);
      let limit = b.tiles.length - 1;
      for (const e of b.items) {
        e.s = Math.min(limit, e.s + TUNE.beltSpeed * dt);
        limit = e.s - 0.8;
        e.item.x = b.tiles[0].x + b.dir * e.s; e.item.z = b.tiles[0].z;
      }
    }
  }

  // ---- stoves and fire ----------------------------------------------------
  updateStoves(dt) {
    for (const t of this.tiles) {
      if (t.work > 0) t.work -= dt;
      if (t.anim > 0) t.anim -= dt;
      if (t.immune > 0) t.immune -= dt;
      if (t.kind !== 'stove' || t.fire > 0) continue;
      const v = t.vessel;
      if (v.state === 'cooking') {
        v.progress += dt / (v.type === 'pot' ? TUNE.boilTime : TUNE.fryTime);
        if (v.progress >= 1) {
          v.progress = 1; v.state = 'done'; v.burn = 0;
          if (v.type === 'pan') v.items[0].state = 'cooked';
          this.emit('cooked', { tile: t, vessel: v.type });
        }
      } else if (v.state === 'done') {
        v.burn += dt / TUNE.burnTime;
        if (v.burn >= 0.45 && !v.warned) { v.warned = true; this.emit('burnWarn', { tile: t }); }
        if (v.burn >= 1) this.burnVessel(t);
      } else v.warned = false;
    }
  }

  burnVessel(t) {
    const v = t.vessel;
    for (const it of v.items) this.destroy(it);
    const coal = this.newItem('ing', 'charcoal', 'burnt');
    coal.where = { k: 'vessel', tile: t };
    v.items = [coal]; v.state = 'burnt'; v.progress = 0; v.burn = 0; v.warned = false;
    this.emit('burnt', { tile: t });
    this.ignite(t, true);
  }

  ignite(t, erupt = false) {
    if (t.fire > 0 || t.immune > 0) return false;
    if (t.item && t.item.kind === 'ext') return false;
    t.fire = TUNE.fireHp; t.spreadT = TUNE.fireSpread * (0.8 + this.rng() * 0.4);
    this.stats.fires++;
    if (t.item && t.item.kind === 'ing' && t.item.type !== 'charcoal') { t.item.type = 'charcoal'; t.item.state = 'burnt'; t.item.chop = 0; this.emit('charred', { item: t.item }); }
    if (t.kind === 'stove' && t.vessel.items.length && t.vessel.state !== 'burnt') this.burnVessel(t);
    this.emit('ignite', { tile: t, erupt });
    return true;
  }

  get fireCount() { let n = 0; for (const t of this.tiles) if (t.fire > 0) n++; return n; }

  updateFire(dt) {
    for (const t of this.tiles) {
      if (t.fire <= 0) continue;
      t.spreadT -= dt;
      if (t.spreadT <= 0) {
        t.spreadT = TUNE.fireSpread * (0.8 + this.rng() * 0.4);
        const opts = this.neighbours(t).filter((n) => (n.kind === 'counter' || n.kind === 'board' || n.kind === 'stove') && n.fire <= 0 && n.immune <= 0 && !(n.item && n.item.kind === 'ext'));
        if (opts.length) this.ignite(opts[Math.floor(this.rng() * opts.length)]);
      }
    }
  }

  spray(c) {
    c.spraying = true;
    c.sprayBeat = (c.sprayBeat || 0) - DT;
    if (c.sprayBeat <= 0) { c.sprayBeat = 0.05; this.emit('spray', { chef: c }); }
    for (const t of this.tiles) {
      if (t.fire <= 0) continue;
      const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
      if (d > TUNE.sprayRange) continue;
      if (d > 0.7 && Math.abs(angDiff(Math.atan2(dx, dz), c.face)) > 0.62) continue;
      t.fire -= TUNE.sprayRate * DT;
      if (t.fire <= 0) { t.fire = 0; t.immune = 5; this.emit('extinguished', { tile: t, chef: c }); }
    }
  }

  // ---- orders, serving, plates -------------------------------------------
  spawnTicket(initial = false) {
    if (!this.bag.length) {
      this.bag = DISH_IDS.slice();
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
    }
    const dish = this.bag.pop();
    const dur = TUNE.ticketTime + (initial ? this.tickets.length * 14 : 0);
    const tk = { id: NEXT_ID++, dish, t: dur, dur };
    this.tickets.push(tk);
    this.emit('ticket', { ticket: tk });
    return tk;
  }

  updateOrders(dt) {
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      const tk = this.tickets[i];
      tk.t -= dt;
      if (tk.t <= 0) {
        this.tickets.splice(i, 1);
        this.score = Math.max(0, this.score - TUNE.missPenalty);
        this.streak = 0; this.stats.missed++;
        this.emit('ticketMissed', { ticket: tk });
      }
    }
    if (this.tickets.length < 3) {
      this.ticketSpawn += dt;
      if (this.ticketSpawn >= 1.4) { this.ticketSpawn = 0; this.spawnTicket(); }
    } else if (this.tickets.length < 4) {
      this.ticketExtra += dt;
      if (this.ticketExtra >= TUNE.ticketGap) { this.ticketExtra = 0; this.spawnTicket(); }
    }
  }

  serve(c, tile, plate, dish) {
    const idx = this.tickets.findIndex((tk) => tk.dish === dish);
    for (const it of plate.contents) this.destroy(it);
    this.destroy(plate);
    this.returns.push({ t: TUNE.plateReturn });
    tile.station.flash = 0.6;
    if (idx < 0) {
      this.streak = 0; this.stats.wrong++;
      this.emit('serveWrong', { chef: c, tile, dish });
      return;
    }
    const tk = this.tickets[idx];
    this.tickets.splice(idx, 1);
    const inOrder = idx === 0;
    this.streak = inOrder ? this.streak + 1 : 0;
    const mult = Math.max(1, Math.min(4, this.streak));
    this.stats.bestStreak = Math.max(this.stats.bestStreak, mult);
    const base = DISHES[dish].points;
    const tip = Math.max(5, Math.round(TUNE.tipMax * (tk.t / tk.dur) * mult / 5) * 5);
    this.score += base + tip;
    this.stats.served[dish]++; this.stats.base += base; this.stats.tips += tip;
    this.hitStop = 0.07;
    this.emit('serve', { chef: c, tile, dish, base, tip, mult, inOrder, ticket: tk });
  }

  updateReturns(dt) {
    for (let i = this.returns.length - 1; i >= 0; i--) {
      const r = this.returns[i];
      r.t -= dt;
      if (r.t > 0) continue;
      if (this.returnBelt) {
        if (!this.beltFree(this.returnBelt, 0)) continue;
        const p = this.newPlate(true);
        this.returnBelt.items.push({ item: p, s: 0 }); p.where = { k: 'belt', belt: this.returnBelt };
        this.emit('plateBack', { tile: this.returnTile, item: p });
      } else {
        const t = this.returnTile;
        if (t.item && t.item.kind === 'plate' && t.item.dirty) t.item.count++;
        else if (!t.item) this.putOnTile(t, this.newPlate(true));
        else continue;
        this.emit('plateBack', { tile: t, item: t.item });
      }
      this.returns.splice(i, 1);
    }
  }

  stars() { return this.score >= 1100 ? 3 : this.score >= 500 ? 2 : 1; }
}
