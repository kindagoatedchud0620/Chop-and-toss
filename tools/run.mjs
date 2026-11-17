// Generic scripted run: node tools/run.mjs script.mjs   (script exports default async (c, helpers) => {...})
import { launch, sleep } from './cdp.mjs';
import { pathToFileURL } from 'node:url';
const file = process.argv[2];
const w = Number(process.env.W || 1920), h = Number(process.env.H || 1080);
const c = await launch({ width: w, height: h });
const helpers = {
  sleep,
  async open(query) { await c.goto(`http://localhost:4921/?${query}`, 'window.__ready === true', 120000); },
  async step(n) { await c.eval(`(() => { window.__sim(${Math.max(0, n - 1)}); window.__step(1); })()`); },
  async until(expr, max = 60 * 200, chunk = 30) {
    const hit = await c.eval(`(() => { for (let d = 0; d < ${max}; d += ${chunk}) { window.__sim(${chunk}); if (${expr}) return true; } return false; })()`);
    await c.eval('window.__render()');
    return hit;
  },
  sum: () => c.eval('window.__test.summary()'),
};
try { await (await import(pathToFileURL(file).href)).default(c, helpers, process.argv.slice(3)); }
catch (e) { console.log('SCRIPT ERROR', e.message); }
const errs = [...new Set(c.errors.filter((e) => !e.includes('favicon')))];
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'console errors: 0');
const warn = [...new Set(c.consoleLog.filter((l) => l.type === 'warning').map((l) => l.text))];
if (warn.length) console.log('WARN:\n' + warn.join('\n'));
await c.close();
