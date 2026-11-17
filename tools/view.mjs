// node tools/view.mjs out.png "m=chef_cat,chef_raccoon&cols=2&zoom=0.6" [width height]
import { launch } from './cdp.mjs';
const [out, query = '', w = 1600, h = 900] = process.argv.slice(2);
const c = await launch({ width: Number(w), height: Number(h) });
await c.goto(`http://localhost:4921/tools/viewer.html?${query}`, 'window.__ready === true', 90000);
await c.shot(out);
if (c.errors.length) console.log('ERRORS:\n' + c.errors.join('\n'));
const warn = c.consoleLog.filter((l) => l.type === 'warning').map((l) => l.text);
if (warn.length) console.log('WARN:\n' + [...new Set(warn)].join('\n'));
console.log('saved', out);
await c.close();
