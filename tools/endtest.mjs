// End-of-shift check. node tools/run.mjs tools/endtest.mjs standard|record   (W=960 H=540 recommended)
// Injects best = 500, plays a short ?time=8 shift and reports camera, clips, storage and confetti.
const OUT = '/tmp/claude-0/eng/';
export default async (c, h, [mode = 'standard', map = '0']) => {
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: "if (!sessionStorage.seen) { localStorage.setItem('chop-and-toss-best', '500'); sessionStorage.seen = 1; }" });
  await h.open(`hold&start&time=8&seed=3&map=${map}`);
  const camDist = () => c.eval('(() => { const g = game, p = g.gfx.camera.position, v = g.view; return +Math.hypot(p.x - v.camDrift.x, p.y - 0.3, p.z - v.camTz - v.camDrift.z).toFixed(2); })()');
  await h.step(60 * 4); // countdown 3.1 s and a little play
  const before = await camDist();
  await c.eval(`window.game.world.score = ${mode === 'record' ? 800 : 120}`);
  console.log('hit end', await h.until("game.state === 'timeup'", 60 * 12));
  const ls = () => c.eval("localStorage.getItem('chop-and-toss-best')");
  console.log('end', JSON.stringify(await c.eval('game.end')), 'best', await c.eval('game.best'), 'storage', await ls(), 'camDist before', before);
  const info = () => c.eval(`JSON.stringify({ t: +game.end.t.toFixed(2), state: game.state, clips: game.view.chefViews.map((v) => v.clip), sc: game.view.chefViews.map((v) => +v.sc.toFixed(2)), at: game.view.chefViews.map((v) => v.at && [+v.at.x.toFixed(2), +v.at.z.toFixed(2)]), conf: game.fx.confetti ? game.fx.confetti.list.length : 0, tix: game.fx.tickets ? game.fx.tickets.list.length : 0, err: 0 })`);
  const t0 = await c.eval('game.end.t');
  for (const [name, at] of mode === 'record' ? [['pop', 0.45], ['hi', 1.2], ['late', 2.0]] : [['a', 0.9], ['b', 1.5]]) {
    await h.step(Math.round((at - (await c.eval('game.end.t'))) * 60));
    console.log(name, await info(), 'camDist', await camDist());
    await c.shot(`${OUT}${mode}-${name}.png`);
  }
  await h.step(60 * 2);
  console.log('after', await info(), 'storage', await ls(), 'prevBest', await c.eval('game.prevBest'));
  if (process.env.PRESS_R) {
    await c.key('keyDown', 'KeyR'); await c.key('keyUp', 'KeyR');
    await h.step(5);
    console.log('after R', await c.eval(`JSON.stringify({ state: game.state, conf: !!game.fx.confetti, clips: game.view.chefViews.map((v) => v.clip), sc: game.view.chefViews.map((v) => v.sc), end: game.end, view: game.gfx.camera.view, camDist: ${await camDist()} })`));
    await c.shot(`${OUT}${mode}-afterR.png`);
  }
};
