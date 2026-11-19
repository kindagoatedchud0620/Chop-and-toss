// Exercises every sound path against a silent mock AudioContext (no audio device is touched).
import { Sfx } from '../js/audio.js';
const calls = { osc: 0, noise: 0, gain: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new Error('exponential ramp to non-positive value ' + v); }, setTargetAtTime() {} });
const node = (extra = {}) => ({ connect() {}, start() {}, stop() {}, ...extra });
class MockCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = node(); }
  createGain() { calls.gain++; return node({ gain: param() }); }
  createOscillator() { calls.osc++; return node({ frequency: param(), type: 'sine' }); }
  createBiquadFilter() { return node({ frequency: param(), Q: param(), type: 'lowpass' }); }
  createBufferSource() { calls.noise++; return node({ playbackRate: param(), buffer: null, loop: false }); }
  createDynamicsCompressor() { return node(); }
  createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  resume() {}
}
globalThis.window = { AudioContext: MockCtx };
const s = new Sfx();
if (s.on || s.ctx) throw new Error('sound must start off with no audio context');
for (const ev of ['chop', 'serve', 'ignite', 'vip', 'stun', 'ko']) s.handle({ type: ev });
s.fanfare(); s.buzzer(0.3); s.siren(); s.stun(); s.ko();
if (s.ctx) throw new Error('events must not create an audio context while sound is off');
s.toggle();
const names = ['chop', 'chopDone', 'whoosh', 'catchPop', 'land', 'pickup', 'place', 'nope', 'sizzleHit', 'scrub', 'washDone', 'cooked', 'bell', 'coin', 'alarm', 'tick', 'go', 'buzzer', 'ignite', 'out', 'dash', 'bump', 'splash', 'portal', 'ticket', 'missed', 'plate', 'rumble', 'siren', 'stun', 'ko'];
for (const n of names) s[n]();
for (let i = 0; i < 3; i++) s.star(i);
const osc0 = calls.osc;
s.buzzer(0.3); s.fanfare(0.3); s.fm(440, 2, 3, 0.2, 0.1);
if (calls.osc - osc0 < 40) throw new Error('fanfare should create many FM oscillators');
for (const t of ['chop', 'chopDone', 'throw', 'catch', 'land', 'pickup', 'place', 'stack', 'drop', 'plated', 'nope', 'sizzle', 'scrub', 'washDone', 'cooked', 'serve', 'serveWrong', 'ignite', 'extinguished', 'dash', 'bump', 'splash', 'teleport', 'ticket', 'ticketMissed', 'trash', 'islandMove', 'timeup', 'vip', 'stun', 'knock', 'ko', 'tug', 'stunEnd', 'unknown']) s.handle({ type: t });
const world = { tiles: [{ fire: 1, vessel: { state: 'cooking', type: 'pan' } }, { fire: 0, vessel: { state: 'done', type: 'pot' } }], chefs: [{ spraying: true }, { spraying: false }] };
s.ambient(world, true);
const lv = Object.fromEntries(Object.entries(s.loops).map(([k, v]) => [k, v.level]));
if (!(lv.sizzle > 0 && lv.boil > 0 && lv.hiss > 0 && lv.fire > 0)) throw new Error('ambient beds not driven: ' + JSON.stringify(lv));
s.toggle(); s.ambient(world, true); s.toggle(); s.ambient(world, true);
if (!(s.loops.sizzle.level > 0)) throw new Error('beds do not come back after sound is switched on again');
console.log(`audio paths ok: ${names.length + 3} one-shots, 4 beds, ${calls.osc} oscillators and ${calls.noise} noise sources created on the mock, no exceptions`);
