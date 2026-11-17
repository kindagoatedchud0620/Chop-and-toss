// Headless bot run of the pure simulation: node tools/simtest.mjs [map|all] [seed] [--log] [--fire]
import { World } from '../js/sim.js';
import { BotTeam } from '../js/bot.js';
import { MAPS } from '../js/data.js';
const args = process.argv.slice(2);
const which = args[0] && args[0] !== 'all' ? [Number(args[0])] : [0, 1, 2, 3];
const seed = Number(args[1]) || 1;
const log = args.includes('--log');
const fire = args.includes('--fire');
for (const m of which) {
  const w = new World(m, seed);
  const bot = new BotTeam(w, { log: log ? (s) => console.log(s) : null });
  w.start();
  let frames = 0, idle = [0, 0];
  const evCount = {};
  while (w.phase !== 'over' && frames < 60 * 200) {
    if (fire && frames === 60 * 40) bot.neglect = 60 * 22;
    bot.update();
    w.step();
    for (const e of w.events) evCount[e.type] = (evCount[e.type] || 0) + 1;
    if (log) for (const e of w.events) if (['serve', 'serveWrong', 'ticketMissed', 'ignite', 'extinguished', 'burnt', 'splash', 'catch', 'ticket'].includes(e.type)) console.log(`[${w.time.toFixed(1)}] EVENT ${e.type} ${e.dish || (e.ticket && e.ticket.dish) || ''} ${e.tip != null ? 'tip ' + e.tip + ' x' + e.mult : ''}`);
    w.events.length = 0;
    bot.brains.forEach((b, i) => { if (!b.task) idle[i]++; });
    frames++;
  }
  const s = w.stats;
  console.log(`${MAPS[m].name.padEnd(26)} score ${String(w.score).padStart(5)}  soup ${s.served.soup} burger ${s.served.burger} fish ${s.served.fishchips}  missed ${s.missed} wrong ${s.wrong} fires ${s.fires} washed ${s.washed} thrown ${s.thrown} caught ${s.caught} splash ${evCount.splash || 0} bestStreak x${s.bestStreak}  idle ${idle.map((x) => Math.round(x / frames * 100) + '%').join('/')}`);
}
