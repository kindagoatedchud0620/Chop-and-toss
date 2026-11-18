// Game constants, recipes and the four kitchen maps. No DOM or three.js in here.

export const ROUND_TIME = 180;
export const DT = 1 / 60;

export const TUNE = {
  chefRadius: 0.34,
  walkSpeed: 3.7,
  accel: 26,
  dashSpeed: 9.5,
  dashTime: 0.17,
  dashCooldown: 0.55,
  reach: 0.5,
  chopTime: 1.9,
  washTime: 2.4,
  boilTime: 9.0,
  fryTime: 6.5,
  burnTime: 10.0,          // time between "done" and "burnt"
  throwRange: 7.6,
  throwFloor: 4.6,        // where a throw with no target comes down
  fireSpread: 6.5,
  fireHp: 1.0,
  sprayRate: 1.25,
  sprayRange: 2.7,
  plateReturn: 5.0,
  beltSpeed: 2.3,
  ticketTime: 78,
  ticketGap: 17,
  missPenalty: 30,
  tipMax: 40,
};

export const INGREDIENTS = ['tomato', 'bun', 'meat', 'lettuce', 'fish', 'potato'];
export const CHOPPABLE = { tomato: 1, meat: 1, lettuce: 1, fish: 1, potato: 1 };
export const POT_OK = { tomato: 1, meat: 1, potato: 1 };
export const POT_RECIPES = { soup: ['tomato', 'tomato', 'tomato'], stew: ['meat', 'potato', 'tomato'] };
export const PAN_OK = { meat: 1, fish: 1, potato: 1 };

export const DISHES = {
  soup: {
    id: 'soup', name: 'Tomato Soup', points: 100, needs: ['soup:cooked'],
    icons: ['tomato', 'tomato', 'tomato'], steps: 'Chop 3 tomatoes. Boil in a pot. Plate.',
  },
  burger: {
    id: 'burger', name: 'Classic Burger', points: 140, needs: ['bun:raw', 'meat:cooked', 'lettuce:chopped'],
    icons: ['bun', 'meat', 'lettuce'], steps: 'Bun. Chop and fry meat. Chop lettuce. Stack on a plate.',
  },
  fishchips: {
    id: 'fishchips', name: 'Fish & Chips', points: 120, needs: ['fish:cooked', 'potato:cooked'],
    icons: ['fish', 'potato'], steps: 'Chop and fry fish. Chop and fry potato. Plate.',
  },
  salad: {
    id: 'salad', name: 'Garden Salad', points: 90, needs: ['lettuce:chopped', 'tomato:chopped'],
    icons: ['lettuce', 'tomato'], steps: 'Chop lettuce. Chop a tomato. Plate both.',
  },
  fishburger: {
    id: 'fishburger', name: 'Fish Burger', points: 150, needs: ['bun:raw', 'fish:cooked', 'lettuce:chopped'],
    icons: ['bun', 'fish', 'lettuce'], steps: 'Bun. Chop and fry fish. Chop lettuce. Stack on a plate.',
  },
  stew: {
    id: 'stew', name: 'Hearty Stew', points: 170, needs: ['stew:cooked'],
    icons: ['meat', 'potato', 'tomato'], steps: 'Chop meat, potato and a tomato. Boil together in a pot. Plate.',
  },
};
export const DISH_IDS = ['soup', 'burger', 'fishchips', 'salad', 'fishburger', 'stew']; // pool order, ?dishes= indexes it

/** pot contents -> finished dish id when complete, else null */
export function potResult(items) {
  const have = items.map((i) => i.type).sort().join();
  for (const [id, r] of Object.entries(POT_RECIPES)) if (r.slice().sort().join() === have) return id;
  return null;
}
/** can this ingredient type join the pot and still become a recipe (sub-multiset of one) */
export function potCanTake(items, type) {
  const want = [...items.map((i) => i.type), type];
  return Object.values(POT_RECIPES).some((r) => {
    const left = r.slice();
    return want.every((t) => { const k = left.indexOf(t); if (k < 0) return false; left.splice(k, 1); return true; });
  });
}

export const STARS = [0, 500, 1100]; // 1 star always, 2 stars at 500, 3 stars at 1100

export const keyOf = (it) => `${it.type}:${it.state}`;

/** which dish could this set of plate contents still become */
export function plateAccepts(contents, item) {
  const k = keyOf(item);
  const have = contents.map(keyOf);
  if (have.includes(k)) return false;
  for (const id of DISH_IDS) {
    const needs = DISHES[id].needs;
    if (needs.includes(k) && have.every((h) => needs.includes(h))) return true;
  }
  return false;
}
export function dishOfContents(contents) {
  const have = contents.map(keyOf);
  for (const id of DISH_IDS) {
    const needs = DISHES[id].needs;
    if (needs.length === have.length && needs.every((n) => have.includes(n))) return id;
  }
  return null;
}

/*
 Map legend
   .  floor            #  counter          W  wall (blocks throws)     ~  river (throw over it)
   T M F L P B  crates: tomato, meat, fish, lettuce, potato, bun
   c  chopping board   o  stove + pot      n  stove + pan
   S s  sink (two tiles)        H h  serving hatch (two tiles)
   R  plate return     X  trash bin        p  counter with clean plates       e  counter with extinguisher
   1 2  chef spawns    u U  blue portal pair      v V  orange portal pair
   > <  conveyor belt tiles (direction of travel)
   I  lane of the sliding island (floor)
*/
export const MAPS = [
  {
    id: 'rafts', name: 'Split River Rafts',
    blurb: 'Prep on the left raft. Cook on the right. Throw across the river.',
    rows: [
      '#TccL#~~~#pp#X#',
      '#.....~~~#....#',
      'F.....~~~o....H',
      '#.....~~~n....h',
      '#.1...~~~#..2.R',
      '#.....~~~n....#',
      'P.....~~~o....e',
      '#.....~~~#....#',
      '#MccB#~~~#Ss###',
    ],
    theme: {
      bg: 0x2d7fa6, ground: null, floor: 'raft', floorA: 0xffffff, floorB: 0xf1dcc0, cab: 0x2f9a86, top: 0xffeed4,
      wall: 0xb9a48a, fog: 0x2d7fa6, hemiSky: 0xd9f1ff, hemiGround: 0x4f8f9f, keyColor: 0xfff0cf,
    },
    bot: { prep: 0, cook: 1, wash: 1 },
  },
  {
    id: 'portals', name: 'Arcane Portal Kitchen',
    blurb: 'Two rooms. One wall. Step through the portals.',
    rows: [
      '#TMF###W#onno##',
      '#.....uWU.....#',
      'L.....cW#.....H',
      'P.....cW#.....h',
      'B.1...#Wp..2..R',
      '#.....cWp.....X',
      '#.....#W#.....e',
      '#.....vWV.....#',
      '##Ss###W#######',
    ],
    theme: {
      bg: 0x191530, ground: 0x241f44, floor: 'tile', floorA: 0x8a84b8, floorB: 0x6f6aa0, cab: 0x7a54c9, top: 0xe9e2ff,
      wall: 0x6a6790, fog: 0x191530, hemiSky: 0xb9a8ff, hemiGround: 0x3a2f66, keyColor: 0xffe2c4,
    },
    bot: { prep: 0, cook: 1, wash: 0 },
  },
  {
    id: 'bistro', name: 'Shifting Counter Bistro',
    blurb: 'The middle island slides every 12 seconds. Mind the lanes.',
    rows: [
      '#TMF#LPB##Ss###',
      '#.............#',
      '#.1...........#',
      '#IIIIIIIIIIIII#',
      '#...........2.#',
      '#.............#',
      '#pp#Hh#R#X#e###',
    ],
    island: { row: 3, xA: 2, xB: 4, cells: 'cno#c#onc', period: 12, slide: 1.5 },
    theme: {
      bg: 0x3a251c, ground: 0x6b4630, floor: 'tile', floorA: 0xf4e3c6, floorB: 0xc9603f, cab: 0x2d5fae, top: 0xfff3dc,
      wall: 0xc9a27a, fog: 0x3a251c, hemiSky: 0xffe9cf, hemiGround: 0x7a5238, keyColor: 0xffe0b5,
    },
    bot: { prep: 0, cook: 1, wash: 1 },
  },
  {
    id: 'belts', name: 'Conveyor Belt Gauntlet',
    blurb: 'Belts carry food right and dirty plates left. Two doors in the middle.',
    rows: [
      '#>>>>>>>>>>>>##',
      'T......e......n',
      'M......W......p',
      'F.1...........o',
      'L..cc..c...2..p',
      'P.............n',
      'B......W......H',
      '#......X......h',
      '#Ss<<<<<<<<<<R#',
    ],
    theme: {
      bg: 0x1c232b, ground: 0x2c3540, floor: 'tile', floorA: 0x9fb0bd, floorB: 0x7f909d, cab: 0xf2b632, top: 0xe8edf2,
      wall: 0x5e6b78, fog: 0x1c232b, hemiSky: 0xd6e6ff, hemiGround: 0x4a5560, keyColor: 0xffe8c8,
    },
    bot: { prep: 0, cook: 1, wash: 0 },
  },
];

export const PLAYER_COLORS = [0x3d8bfd, 0xff4d5e];
export const CRATE_OF = { T: 'tomato', M: 'meat', F: 'fish', L: 'lettuce', P: 'potato', B: 'bun' };

/** small deterministic rng (mulberry32) */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
