// Plain-node self-check for the dish pool, menu and pot rules: node tools/dishtest.mjs
import assert from 'node:assert/strict';
import { World } from '../js/sim.js';
import { DISH_IDS, potResult, DT } from '../js/data.js';

const it = (w, type, state) => w.newItem('ing', type, state);
const pot = (types) => ({ type: 'pot', state: 'idle', items: types.map((t) => ({ type: t })) });
const chopped = (w, t) => it(w, t, 'chopped');

// menu: 3 distinct pool dishes, fixed per seed, varies across seeds
const menus = new Set();
for (let s = 1; s <= 60; s++) {
  const m = new World(0, s).menu;
  assert.equal(new Set(m).size, 3); assert.ok(m.every((d) => DISH_IDS.includes(d)));
  assert.deepEqual(m, new World(0, s).menu);
  menus.add(m.slice().sort().join());
}
assert.ok(menus.size >= 10, 'menus vary');
assert.deepEqual(new World(0, 1, ['salad', 'stew', 'soup']).menu, ['salad', 'stew', 'soup']);

// tickets only use the menu, 3 initial tickets are one of each
{
  const w = new World(1, 5); w.start();
  assert.deepEqual(w.tickets.map((t) => t.dish).sort(), w.menu.slice().sort());
  for (let i = 0; i < 60 * 180; i++) { w.step(); w.events.length = 0; for (const t of w.tickets) assert.ok(w.menu.includes(t.dish)); }
}

// pot rules
const w0 = new World(0, 1, ['soup', 'stew', 'salad']);
const ok = (items, t) => w0.vesselAccepts(pot(items), chopped(w0, t));
assert.ok(ok([], 'tomato') && ok(['tomato'], 'tomato') && ok(['tomato', 'tomato'], 'tomato'));
assert.ok(ok(['meat', 'potato'], 'tomato') && ok(['tomato', 'meat'], 'potato'));
assert.ok(!ok(['meat'], 'meat') && !ok(['tomato', 'tomato'], 'meat') && !ok(['tomato', 'tomato', 'tomato'], 'tomato'));
assert.ok(!ok(['meat', 'potato', 'tomato'], 'tomato') && !ok([], 'lettuce'));
assert.ok(!w0.vesselAccepts(pot([]), it(w0, 'tomato', 'raw')));
assert.equal(potResult(pot(['tomato', 'tomato', 'tomato']).items), 'soup');
assert.equal(potResult(pot(['tomato', 'meat', 'potato']).items), 'stew');
assert.equal(potResult(pot(['tomato', 'meat']).items), null);

// serve a dish: build the plate, return the score gained
function serve(menu, build) {
  const w = new World(0, 1, menu); w.start();
  const c = w.chefs[0];
  const hatch = w.tiles.find((t) => t.kind === 'hatch' && t.station);
  const stove = w.tiles.find((t) => t.ch === 'o');
  const plate = w.newPlate(false);
  build(w, c, stove, plate);
  c.held = plate;
  const before = w.score;
  w.useOnTile(c, hatch, plate);
  return { w, gain: w.score - before };
}
const plateUp = (w, plate, list) => { for (const [t, s] of list) { const i = it(w, t, s); assert.ok(w.canPlate(plate, i), `${t}:${s}`); w.addToPlate(plate, i); } };
const boil = (w, c, stove, types) => {
  for (const t of types) { const i = chopped(w, t); c.held = i; assert.ok(w.useOnTile(c, stove, i), `pot takes ${t}`); }
  assert.equal(stove.vessel.state, 'cooking');
};
const finishPot = (w, stove) => { for (let i = 0; i < 60 * 12 && stove.vessel.state !== 'done'; i++) { w.step(); w.events.length = 0; } assert.equal(stove.vessel.state, 'done'); };

let r = serve(['salad', 'soup', 'burger'], (w, c, s, p) => plateUp(w, p, [['lettuce', 'chopped'], ['tomato', 'chopped']]));
assert.ok(r.gain >= 90, 'salad scores');
r = serve(['fishburger', 'soup', 'burger'], (w, c, s, p) => plateUp(w, p, [['bun', 'raw'], ['fish', 'cooked'], ['lettuce', 'chopped']]));
assert.ok(r.gain >= 150, 'fishburger scores');
r = serve(['stew', 'soup', 'burger'], (w, c, s, p) => {
  boil(w, c, s, ['meat', 'potato', 'tomato']);
  // not done yet: plating must fail
  c.held = p; assert.equal(w.useOnTile(c, s, p), false);
  finishPot(w, s);
  assert.ok(w.useOnTile(c, s, p)); assert.equal(p.contents[0].type, 'stew');
});
assert.ok(r.gain >= 170, 'stew scores');
r = serve(['soup', 'salad', 'burger'], (w, c, s, p) => { boil(w, c, s, ['tomato', 'tomato', 'tomato']); finishPot(w, s); w.useOnTile(c, s, p); });
assert.ok(r.gain >= 100, 'soup still scores');

// a salad plate is not a burger; a burger plate does not accept tomato
r = serve(['burger', 'soup', 'fishchips'], (w, c, s, p) => plateUp(w, p, [['lettuce', 'chopped'], ['tomato', 'chopped']]));
assert.equal(r.gain, 0); assert.equal(r.w.stats.wrong, 1);
{
  const w = new World(0, 1); const p = w.newPlate(false);
  plateUp(w, p, [['bun', 'raw'], ['meat', 'cooked'], ['lettuce', 'chopped']]);
  assert.ok(!w.canPlate(p, chopped(w, 'tomato')));
}
console.log('dishtest ok');
