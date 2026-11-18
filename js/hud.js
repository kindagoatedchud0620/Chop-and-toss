// Plain DOM heads-up display, title screen and end-of-round summary.
import { DISHES, POT_RECIPES, STARS, TUNE } from './data.js';

const $ = (id) => document.getElementById(id);
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8z"/></svg>';

export class Hud {
  constructor() {
    this.el = { hud: $('hud'), tickets: $('tickets'), streak: $('streak'), clock: $('clock'), score: $('score'), map: $('mapname'), alarm: $('alarm'), center: $('center'), big: $('big'), sub: $('sub'),
      title: $('title'), summary: $('summary'), sound: $('sound'), best: $('best'), loading: $('loading'), loadbar: $('loadbar') };
    this.tickets = new Map();
    this.thumbs = {};
    this.last = {};
    this.alarmT = 0;
  }

  loading(p) { this.el.loadbar.style.width = Math.round(p * 100) + '%'; }
  loaded() { this.el.loading.classList.add('done'); setTimeout(() => this.el.loading.remove(), 500); }

  img(name, cls = '') { return `<img ${cls ? `class="${cls}"` : ''} src="${this.thumbs[name]}" alt="${name.replace('dish_', '').replace('_', ' ')}" draggable="false">`; }

  setThumbs(t) {
    this.thumbs = t;
    $('face-p1').src = t.chef_cat; $('face-p2').src = t.chef_raccoon;
  }

  /** ingredient flow picture for a dish, built from its data */
  flow(d) {
    const g = (...n) => `<span class="grp">${n.map((x) => this.img(x)).join('')}</span>`;
    const op = (c) => `<span class="op">${c}</span>`;
    const r = POT_RECIPES[d.id];
    if (r) return (new Set(r).size === 1 ? g(...r) + op('&#9656;') + this.img('board') : r.map((i) => g(i, 'board')).join(op('+'))) + op('&#9656;') + this.img('pot');
    const rank = (k) => (k.endsWith(':raw') ? 1 : 0); // raw parts (the bun) last
    return d.needs.slice().sort((x, y) => rank(x) - rank(y)).map((k) => {
      const [type, state] = k.split(':');
      return g(type, ...(state === 'chopped' ? ['board'] : state === 'cooked' ? ['board', 'pan'] : []));
    }).join(op('+'));
  }

  /** title recipe cards for the current menu */
  showRecipes(menu) {
    $('recipes').innerHTML = menu.map((id) => `<div class="recipe">${this.img('dish_' + id, 'dish')}<div><b>${DISHES[id].name}</b><div class="flow">${this.flow(DISHES[id])}</div></div><div class="pts">${DISHES[id].points}<small>plus tip</small></div></div>`).join('');
  }

  /** dish tiles under the countdown number; pass null to remove */
  menuStrip(menu) {
    let el = $('menustrip');
    if (!el) { el = document.createElement('div'); el.id = 'menustrip'; this.el.center.appendChild(el); }
    el.innerHTML = menu ? menu.map((id) => `<div>${this.img('dish_' + id)}<span>${DISHES[id].name}</span></div>`).join('') : '';
  }

  showTitle(on, best = 0) { this.el.title.classList.toggle('hidden', !on); this.el.best.textContent = best; }
  showHud(on) { this.el.hud.classList.toggle('hidden', !on); }
  setSound(on) { this.el.sound.querySelector('b').textContent = on ? 'on' : 'off'; }

  reset(world) {
    this.el.tickets.innerHTML = '';
    this.tickets.clear();
    this.last = {};
    this.el.map.textContent = world.map.name;
    this.el.streak.classList.add('hidden');
    this.el.alarm.style.opacity = '0';
    this.el.summary.classList.add('hidden');
    this.menuStrip(world.menu);
    this.center('', '');
  }

  center(big, sub = '', cls = '') {
    const show = !!(big || sub);
    this.el.center.classList.toggle('hidden', !show);
    if (this.last.big !== big) { this.el.big.textContent = big; this.last.big = big; }
    if (this.last.sub !== sub) { this.el.sub.textContent = sub; this.last.sub = sub; }
    this.el.big.className = cls;
  }
  centerScale(s, alpha = 1) { this.el.big.style.transform = `scale(${s.toFixed(3)})`; this.el.big.style.opacity = alpha.toFixed(2); }

  ticketEl(tk) {
    const d = DISHES[tk.dish];
    const el = document.createElement('div');
    el.className = 'ticket in';
    el.innerHTML = `<span class="flag">NEXT</span><div class="top">${this.img('dish_' + tk.dish, 'thumb')}<div class="name">${d.name}</div></div><div class="ings">${d.icons.map((n) => this.img(n)).join('')}</div><div class="bar"><i></i></div>`;
    this.el.tickets.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('in')));
    setTimeout(() => el.classList.remove('in'), 60);
    return { el, bar: el.querySelector('.bar i'), cls: '' };
  }

  update(world, dt, alarmLevel) {
    // tickets
    const live = new Set();
    world.tickets.forEach((tk, i) => {
      live.add(tk.id);
      let t = this.tickets.get(tk.id);
      if (!t) { t = this.ticketEl(tk); this.tickets.set(tk.id, t); }
      const f = Math.max(0, tk.t / tk.dur);
      t.bar.style.transform = `scaleX(${f.toFixed(3)})`;
      const cls = (f < 0.22 ? 'late ' : f < 0.5 ? 'warn ' : '') + (i === 0 ? 'next' : '');
      if (cls !== t.cls) { t.el.classList.remove('late', 'warn', 'next'); for (const c of cls.split(' ')) if (c) t.el.classList.add(c); t.cls = cls; }
    });
    for (const [id, t] of this.tickets) {
      if (live.has(id)) continue;
      this.tickets.delete(id);
      t.el.classList.add(t.missed ? 'miss' : 'out');
      t.el.style.position = 'absolute';
      t.el.style.left = t.el.offsetLeft + 'px';
      setTimeout(() => t.el.remove(), 260);
    }
    // clock and score
    const secs = Math.ceil(world.timeLeft - 1e-6);
    if (secs !== this.last.secs) {
      this.last.secs = secs;
      this.el.clock.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      this.el.clock.classList.toggle('low', secs <= 15 && world.phase === 'play');
    }
    if (world.score !== this.last.score) {
      if (this.last.score != null) { this.el.score.classList.remove('bump'); void this.el.score.offsetWidth; this.el.score.classList.add('bump'); }
      this.last.score = world.score;
      this.el.score.querySelector('b').textContent = world.score;
    }
    const mult = Math.max(1, Math.min(4, world.streak));
    if (mult !== this.last.mult) {
      this.last.mult = mult;
      this.el.streak.classList.toggle('hidden', mult < 2);
      this.el.streak.querySelector('b').textContent = 'x' + mult;
      this.el.streak.classList.remove('bump'); void this.el.streak.offsetWidth; this.el.streak.classList.add('bump');
    }
    // red edge pulse: fast for fire, slow heartbeat for the last 15 seconds
    this.alarmT += dt;
    let a = 0;
    if (alarmLevel === 2) a = 0.25 + 0.5 * Math.pow(Math.max(0, Math.sin(this.alarmT * Math.PI * 2.2)), 2);
    else if (alarmLevel === 1) a = 0.12 + 0.4 * Math.pow(Math.max(0, Math.sin(this.alarmT * Math.PI)), 6);
    const ao = a.toFixed(2);
    if (ao !== this.last.alarm) { this.last.alarm = ao; this.el.alarm.style.opacity = ao; }
  }

  markMissed(tk) { const t = this.tickets.get(tk.id); if (t) t.missed = true; }

  showSummary(world, best, isNew) {
    const s = world.stats;
    const stars = world.score >= STARS[2] ? 3 : world.score >= STARS[1] ? 2 : 1;
    $('sum-map').textContent = world.map.name;
    $('stars').innerHTML = [0, 1, 2].map((i) => STAR.replace('<svg', `<svg class="${i < stars ? 'on' : ''}"`)).join('');
    $('sum-score').textContent = world.score;
    const b = $('sum-best');
    b.textContent = isNew ? 'NEW BEST SCORE' : `BEST ${best}`;
    b.className = isNew ? 'new' : '';
    $('sum-rows').innerHTML = world.menu.map((id) => `<div class="sum-row">${this.img('dish_' + id)}<span class="n">${DISHES[id].name}</span><span class="c">x${s.served[id]}</span><span class="p">${s.served[id] * DISHES[id].points}</span></div>`).join('');
    const total = world.menu.reduce((n, id) => n + s.served[id], 0);
    $('sum-foot').innerHTML = `<span>Dishes <b>${total}</b></span><span>Tips <b>+${s.tips}</b></span><span>Best streak <b>x${Math.max(1, s.bestStreak)}</b></span>` +
      (s.missed ? `<span class="neg">Missed ${s.missed} <b>-${s.missed * TUNE.missPenalty}</b></span>` : '');
    this.el.summary.classList.remove('hidden');
    return stars;
  }
  hideSummary() { this.el.summary.classList.add('hidden'); }
}
