// Standard ending framing on all kitchens: node tools/run.mjs tools/framing.mjs  (W=1280 H=720)
const OUT = '/tmp/claude-0/eng/';
export default async (c, h) => {
  for (const m of [0, 1, 2, 3]) {
    await h.open(`hold&start&time=8&map=${m}&seed=3&bot`);
    await h.until("game.state === 'timeup'", 60 * 15);
    await h.step(100);
    const r = await c.eval(`JSON.stringify(game.view.chefViews.map((v) => { const p = new v.g.position.constructor(v.at.x, 0.9, v.at.z).project(game.gfx.camera); return +(p.x / 2 + 0.5).toFixed(3); }))`);
    console.log('map', m, 'chef screen x', r);
    await c.shot(`${OUT}framing-${m}.png`);
  }
};
