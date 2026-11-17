// Real-time loop measurement: node tools/perf.mjs [width height seconds map]
import { launch, sleep } from './cdp.mjs';
const [w = '1920', h = '1080', secs = '12', map = '2'] = process.argv.slice(2);
const c = await launch({ width: Number(w), height: Number(h) });
await c.goto(`http://localhost:4921/?start&bot&seed=4&map=${map}&test`, 'window.__ready === true', 120000);
const gpu = await c.eval(`(()=>{const g=window.game.gfx.renderer.getContext();const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`);
await sleep(4000);
const f0 = await c.eval('window.game.perf.frames'), t0 = Date.now();
await sleep(Number(secs) * 1000);
const p = await c.eval('window.game.perf'), dt = (Date.now() - t0) / 1000;
const size = await c.eval('(()=>{const s=window.game.gfx.renderer.getDrawingBufferSize(new (window.game.gfx.renderer.getSize(new Object).constructor||Object)());return 0})()').catch(() => 0);
const buf = await c.eval('[window.game.gfx.renderer.domElement.width, window.game.gfx.renderer.domElement.height]');
console.log(`renderer: ${gpu}`);
console.log(`drawing buffer ${buf.join('x')}  frames/s ${(((p.frames - f0) / dt)).toFixed(1)}  sim+scene ${p.simMs.toFixed(2)} ms  draw submit ${p.drawMs.toFixed(2)} ms  draw calls ${p.calls}  triangles ${p.triangles}`);
console.log('state', JSON.stringify(await c.eval('({s: window.game.state, t: window.game.world.time.toFixed(1), score: window.game.world.score})')));
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'console errors: 0');
await c.close();
