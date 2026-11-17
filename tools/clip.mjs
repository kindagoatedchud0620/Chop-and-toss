// One segment of the showcase clip: node tools/clip.mjs <map 0..3> <out.mp4> [seconds] [width height]
// Finds an interesting moment with a fast simulation pass, reloads the same seeded run, then steps the game
// one 1/60 s frame at a time and pipes every screenshot into ffmpeg (60 fps, no audio track).
import { launch } from './cdp.mjs';
import { spawn } from 'node:child_process';
const [mapArg = '0', out = 'seg.mp4', secsArg = '4.25', W = '1280', H = '720'] = process.argv.slice(2);
const map = Number(mapArg), frames = Math.round(Number(secsArg) * 60);
const SEED = [41, 42, 43, 44][map];
const url = `http://localhost:4921/?hold&start&bot&map=${map}&seed=${SEED}`;
const c = await launch({ width: Number(W), height: Number(H) });

// in-page driver shared by both passes so the two runs are identical
const DRIVER = `
  window.__log = []; window.__neg = false;
  { const v = window.game.view; const h = v.handle.bind(v); v.handle = (ev) => { window.__log.push([window.game.frame, ev.type, ev.dish || '', ev.chef ? ev.chef.idx : -1, ev.chef && ev.chef.held ? 1 : 0]); h(ev); }; }
  window.__run = (toFrame, fire) => {
    const g = window.game;
    while (g.frame < toFrame && g.state !== 'summary') {
      const w = g.world;
      if (fire && !window.__neg && w.time >= 20 && w.tiles.filter(t => t.vessel && t.vessel.state === 'cooking').length >= 2) { window.__test.neglect(22); window.__neg = true; }
      window.__sim(1);
    }
    return g.frame;
  };`;
const fire = map === 3;
await c.goto(url, 'window.__ready === true', 120000);
await c.eval(DRIVER);
await c.eval(`window.__run(60 * 150, ${fire})`);
const log = await c.eval('window.__log');
const at = (type, pred = () => true) => log.filter((e) => e[1] === type && pred(e)).map((e) => e[0]);
let start = 60 * 30, why = 'fallback';
if (map === 0) {
  const t = at('catch').find((f) => f > 60 * 15) ?? at('throw').find((f) => f > 60 * 20);
  start = t - Math.round(frames * 0.66); why = 'catch across the river';
} else if (map === 1) {
  const tps = at('teleport', (e) => e[4] === 1), serves = at('serve').filter((f) => f > 60 * 20);
  const s = serves.find((f) => tps.some((t) => t > f - 170 && t < f - 40)) ?? serves[0];
  start = s - Math.round(frames * 0.74); why = 'portal hop then serve';
} else if (map === 2) {
  const moves = at('islandMove').filter((f) => f > 60 * 25), serves = at('serve');
  const m = moves.find((f) => serves.some((s) => s > f + 20 && s < f + 150)) ?? moves[0];
  start = m - Math.round(frames * 0.3); why = 'island slide with a serve';
} else {
  const ex = at('extinguished')[0];
  start = ex - Math.round(frames * 0.8); why = 'stove fire put out';
}
start = Math.max(200, start);
console.log(`map ${map}: ${why}, frames ${start}..${start + frames} (t = ${(start / 60 - 3.1).toFixed(1)} s)`);

await c.goto(url, 'window.__ready === true', 120000);
await c.eval(DRIVER);
await c.eval(`window.__run(${start}, ${fire})`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '60', '-an', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await c.eval(`(() => { window.__run(window.game.frame + 1, ${fire}); window.__render(); })()`);
  const png = await c.shot(null);
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 30 === 29) console.log(`map ${map}: ${i + 1}/${frames} frames, ${((Date.now() - t0) / (i + 1) / 1000).toFixed(1)} s per frame`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
const errs = [...new Set(c.errors)];
console.log(`map ${map}: done, ${errs.length ? 'ERRORS ' + errs.join(' | ') : 'console errors: 0'}`);
await c.close();
process.exit(0);
