// Stage point check on all four kitchens and sim cost during confetti: node tools/run.mjs tools/stagetest.mjs
export default async (c, h) => {
  for (const m of [0, 1, 2, 3]) {
    await h.open(`hold&start&time=3&seed=3&map=${m}`);
    await h.step(60 * 4);
    const cost = () => c.eval('(() => { const t = performance.now(); window.__sim(60); return +((performance.now() - t) / 60).toFixed(2); })()');
    const calm = await cost();
    await c.eval('game.world.score = ' + (1000 + m * 100)); // above the best saved by the previous kitchen
    await h.until("game.state === 'timeup'", 60 * 6);
    await h.step(90);
    const r = await c.eval(`(() => { const v = game.view, s = v.end.stage, w = game.world; let ok = true; for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) ok = ok && w.walkablePoint(s.x + dx, s.z + dz); return { stage: [s.x, s.z], free: ok, calls: game.gfx.stats.calls }; })()`);
    console.log('map', m, JSON.stringify(r), 'ms/frame calm', calm, 'celebrating', await cost());
    if (!r.free) throw new Error('stage not free on map ' + m);
  }
};
