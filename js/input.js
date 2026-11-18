// Split keyboard input for two chefs. Uses physical key codes so layouts do not matter.
const MAP = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], pick: ['Space'], act: ['KeyE'], dash: ['ShiftLeft'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], pick: ['KeyJ'], act: ['KeyK'], dash: ['KeyL'] },
];
const GAME_KEYS = new Set(MAP.flatMap((m) => Object.values(m).flat()));

export class Input {
  constructor() {
    this.down = new Set();
    this.edges = [{ pick: false, act: false, dash: false }, { pick: false, act: false, dash: false }];
    this.onGlobal = null;      // (code) => void for M, R, Enter on menus
    this.blockGame = () => false;
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code) || e.code === 'Tab') e.preventDefault();
      // keep browser shortcuts like Ctrl+S or Ctrl+D from firing while the chefs use Ctrl as a key
      if ((e.ctrlKey || e.altKey) && /^Key[A-Z]$/.test(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (this.onGlobal) this.onGlobal(e.code, e);
      MAP.forEach((m, i) => {
        if (m.pick.includes(e.code)) this.edges[i].pick = true;
        if (m.act.includes(e.code)) this.edges[i].act = true;
        if (m.dash.includes(e.code)) this.edges[i].dash = true;
      });
    }, { passive: false });
    window.addEventListener('keyup', (e) => { if (GAME_KEYS.has(e.code)) e.preventDefault(); this.down.delete(e.code); }, { passive: false });
    window.addEventListener('blur', () => this.down.clear());
  }
  any(list) { for (const c of list) if (this.down.has(c)) return true; return false; }
  /** write this frame's input into a chef */
  apply(chef, i) {
    const m = MAP[i], inp = chef.input, e = this.edges[i];
    inp.mx = (this.any(m.right) ? 1 : 0) - (this.any(m.left) ? 1 : 0);
    inp.mz = (this.any(m.down) ? 1 : 0) - (this.any(m.up) ? 1 : 0);
    inp.pick = e.pick; inp.act = e.act; inp.dash = e.dash;
    inp.actHeld = this.any(m.act);
    e.pick = e.act = e.dash = false;
  }
  flush() { for (const e of this.edges) e.pick = e.act = e.dash = false; }
}
