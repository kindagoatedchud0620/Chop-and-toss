// Minimal Chrome DevTools Protocol driver (Node 22 built-in WebSocket, no dependencies).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// On macOS use CHROME_GL=metal. This Linux box has no GPU, so SwiftShader is the default.
const GL = process.env.CHROME_GL || (process.platform === 'darwin' ? 'metal' : 'swiftshader');

export async function launch({ width = 1920, height = 1080, port = 9333 + Math.floor(Math.random() * 500), extra = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cnt-chrome-'));
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--use-angle=${GL}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--no-sandbox', '--mute-audio', '--hide-scrollbars', '--no-first-run', '--disable-extensions',
    '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--window-size=${width},${height}`, '--force-device-scale-factor=1', ...extra, 'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  let info;
  for (let i = 0; i < 100; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (info.length) break; } catch {}
    await sleep(100);
  }
  if (!info) throw new Error('chrome did not start: ' + stderr.slice(-800));
  const target = info.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const consoleLog = [];
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      consoleLog.push({ type: m.params.type, text });
      if (m.params.type === 'error') errors.push('console.error: ' + text);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('exception: ' + (d.exception?.description || d.text));
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.level === 'error') errors.push(`log.${e.source}: ${e.text} ${e.url || ''}`);
      else if (e.level === 'warning') consoleLog.push({ type: 'warning', text: e.text });
    }
    for (const l of listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    send, consoleLog, errors, proc,
    async goto(url, waitExpr, timeout = 60000) {
      await send('Page.navigate', { url });
      if (waitExpr) await api.waitFor(waitExpr, timeout);
    },
    async eval(expression, awaitPromise = true) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n in: ' + expression.slice(0, 200));
      return r.result.value;
    },
    async waitFor(expr, timeout = 60000) {
      const t0 = Date.now();
      for (;;) {
        let v = false;
        try { v = await api.eval(expr); } catch {}
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error('timeout waiting for ' + expr + '\nerrors: ' + errors.join('\n'));
        await sleep(100);
      }
    },
    async shot(file, { format = 'png', quality = 92 } = {}) {
      const r = await send('Page.captureScreenshot', { format, quality, captureBeyondViewport: false });
      const buf = Buffer.from(r.data, 'base64');
      if (file) writeFileSync(file, buf);
      return buf;
    },
    async key(type, code, key, extra = {}) {
      // type: 'keyDown' | 'keyUp'
      await send('Input.dispatchKeyEvent', { type: type === 'keyDown' ? 'rawKeyDown' : 'keyUp', code, key: key ?? code, windowsVirtualKeyCode: VK[code] || 0, nativeVirtualKeyCode: VK[code] || 0, ...extra });
    },
    async close() { try { await send('Browser.close'); } catch {} try { proc.kill('SIGKILL'); } catch {} },
  };
  return api;
}

export const VK = {
  KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyE: 69, KeyQ: 81, KeyM: 77, KeyR: 82, Space: 32,
  ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17, AltLeft: 18, AltRight: 18,
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Slash: 191, Period: 190,
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
