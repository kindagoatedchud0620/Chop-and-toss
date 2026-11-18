// Headless bot run of the pure simulation: node tools/simtest.mjs [map|all] [seed] [--log] [--fire] [--dishes=3,4,5] [--menus[=N]]
import { World } from '../js/sim.js';
import { BotTeam } from '../js/bot.js';
import { MAPS, DISH_IDS } from '../js/data.js';
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const which = pos[0] && pos[0] !== 'all' ? [Number(pos[0])] : [0, 1, 2, 3];
const seed = Number(pos[1]) || 1;
const log = args.includes('--log');
const fire = args.includes('--fire');
const opt = (n) => { const a = args.find((x) => x === `--${n}` || x.startsWith(`--${n}=`)); return a ? a.split('=')[1] || '' : null; };
const dishes = opt('dishes');
const menusN = opt('menus');

function run(m, menu) {
  const w = new World(m, seed, menu);
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
  return { w, idle, frames, evCount };
}

if (menusN != null) {
  // every C(6,3) menu (first N) on the chosen maps: score and served counts per menu dish, '!' where a dish was never served
  const all = [];
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) all.push([a, b, c]);
  const never = [];
  for (const idx of all.slice(0, Number(menusN) || 20)) {
    const menu = idx.map((i) => DISH_IDS[i]);
    const cells = which.map((m) => {
      const { w } = run(m, menu), s = w.stats.served;
      const miss = menu.filter((d) => !s[d]);
      for (const d of miss) never.push(`${menu.join('+')} map ${m}: ${d}`);
      return `${String(w.score).padStart(5)} ${menu.map((d) => s[d] || '!').join('/')}`.padEnd(15);
    });
    console.log(`${idx.join(',')} ${menu.map((d) => d.slice(0, 5)).join('+').padEnd(20)}| ${cells.join('| ')}`);
  }
  console.log(never.length ? `NEVER SERVED:\n  ${never.join('\n  ')}` : 'every menu dish served on every map');
} else {
  const menu = dishes ? dishes.split(',').map((i) => DISH_IDS[Number(i)]) : null;
  for (const m of which) {
    const { w, idle, frames, evCount } = run(m, menu);
    const s = w.stats;
    console.log(`${MAPS[m].name.padEnd(26)} score ${String(w.score).padStart(5)}  ${w.menu.map((d) => `${d} ${s.served[d]}`).join(' ')}  missed ${s.missed} wrong ${s.wrong} fires ${s.fires} washed ${s.washed} thrown ${s.thrown} caught ${s.caught} splash ${evCount.splash || 0} bestStreak x${s.bestStreak}  idle ${idle.map((x) => Math.round(x / frames * 100) + '%').join('/')}`);
  }
}
