// Self-check for the bot's cook routing and a quick all-dishes serve test: node tools/bottest.mjs
import assert from 'node:assert/strict';
import { World } from '../js/sim.js';
import { BotTeam } from '../js/bot.js';
import { DISH_IDS } from '../js/data.js';
const bot = new BotTeam(new World(0, 1, ['soup', 'burger', 'fishchips']));
const route = (dish, type) => bot.kindFor({ dish }, type);
const want = { soup: { tomato: 'pot' }, stew: { meat: 'pot', potato: 'pot', tomato: 'pot' }, salad: { tomato: null, lettuce: null }, burger: { meat: 'pan', lettuce: null, bun: null }, fishchips: { fish: 'pan', potato: 'pan' }, fishburger: { fish: 'pan', bun: null, lettuce: null } };
for (const [d, m] of Object.entries(want)) for (const [t, k] of Object.entries(m)) assert.equal(route(d, t), k, `${d}/${t}`);
// every dish gets served on the roomiest map within a round
for (const menu of [DISH_IDS.slice(0, 3), DISH_IDS.slice(3)]) {
  const w = new World(0, 1, menu), b = new BotTeam(w);
  w.start();
  for (let f = 0; f < 60 * 200 && w.phase !== 'over'; f++) { b.update(); w.step(); w.events.length = 0; }
  for (const d of menu) assert.ok(w.stats.served[d] > 0, `${menu} never served ${d}`);
}
console.log('bottest ok');
