// Lists every pow() call in every shader program the game actually compiled, so each base can be checked for sign.
import { launch } from './cdp.mjs';
const c = await launch({ width: 640, height: 360 });
const seen = new Map();
for (const map of [0, 1, 2, 3]) {
  await c.goto(`http://localhost:4921/?hold&start&bot&seed=2&map=${map}`, 'window.__ready === true', 120000);
  await c.eval(`(() => { window.__sim(60 * 12); const w = window.game.world; const st = w.tiles.find(t => t.kind === 'stove'); w.ignite(st, true); window.__sim(30); window.__step(1); })()`);
  const list = await c.eval(`(() => {
    const r = window.game.gfx.renderer, gl = r.getContext(), out = [];
    for (const p of r.info.programs) for (const [kind, sh] of [['vertex', p.vertexShader], ['fragment', p.fragmentShader]]) {
      const src = gl.getShaderSource(sh) || '';
      src.split('\\n').forEach((line) => { if (/\\bpow\\s*\\(/.test(line) && !/^\\s*\\/\\//.test(line)) out.push(kind + ' | ' + p.name + ' | ' + line.trim()); });
    }
    return { programs: r.info.programs.length, out };
  })()`);
  for (const l of list.out) { const key = l.split(' | ')[2]; if (!seen.has(key)) seen.set(key, new Set()); seen.get(key).add(l.split(' | ')[1]); }
  console.log(`map ${map}: ${list.programs} programs`);
}
console.log(`\n${seen.size} distinct pow() lines:`);
for (const [line, progs] of seen) console.log(`  [${[...progs].slice(0, 3).join(', ')}${progs.size > 3 ? ', ...' : ''}]\n      ${line}`);
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'console errors: 0');
await c.close();
