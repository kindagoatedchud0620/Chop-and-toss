// VS bot matrix: node tools/vsbottest.mjs [--dishes=3,4,5] [--solo]  (seeds 1-5 x 4 maps; --solo: only chef 0 is a bot)
import { World } from '../js/sim.js';
import { BotTeam } from '../js/bot.js';
import { MAPS, DISH_IDS } from '../js/data.js';
const args = process.argv.slice(2);
const d = args.find((a) => a.startsWith('--dishes='));
const menu = d ? d.slice(9).split(',').map((i) => DISH_IDS[Number(i)]) : null;
const solo = args.includes('--solo');
const wins = MAPS.map(() => [0, 0, 0]), tot = { stuns: 0, rounds: 0, ko: 0, vip: 0, wrong: 0, low: 0, idle: 0 };
for (let m = 0; m < MAPS.length; m++) {
  const rows = [];
  for (let seed = 1; seed <= 5; seed++) {
    const w = new World(m, seed, menu, { mode: 'vs' }), bot = new BotTeam(w);
    if (solo) bot.active = [true, false];
    w.start();
    let wrong = 0, frames = 0, idle = [0, 0];
    while (w.phase !== 'over' && frames < 60 * 200) {
      bot.update(); w.step();
      for (const e of w.events) if (e.type === 'hint' && e.text === 'WRONG HATCH') wrong++;
      w.events.length = 0;
      bot.brains.forEach((b, i) => { if (!b.task) idle[i]++; });
      frames++;
    }
    const v = w.stats.vs, r = w.result;
    wins[m][r.winner < 0 ? 2 : r.winner]++;
    tot.rounds++; tot.stuns += v[0].stuns + v[1].stuns; tot.ko += r.ko ? 1 : 0; tot.vip += v[0].vip + v[1].vip; tot.wrong += wrong;
    if (v[0].served < 3 || (!solo && v[1].served < 3)) tot.low++;
    tot.idle = Math.max(tot.idle, ...idle.filter((_, i) => !solo || i === 0).map((x) => x / frames));
    rows.push(`${v[0].served}/${v[1].served}${r.ko ? 'K' : ''}`);
  }
  console.log(`${MAPS[m].name.padEnd(26)} served ${rows.join('  ')}  wins P1/P2/draw ${wins[m].join('/')}`);
}
console.log(`stuns/round ${(tot.stuns / tot.rounds).toFixed(1)}  K.O. ${tot.ko}/${tot.rounds}  vip served ${tot.vip}  wrongHatch ${tot.wrong}  rounds with a bot <3 dishes ${tot.low}  max idle ${Math.round(tot.idle * 100)}%`);
