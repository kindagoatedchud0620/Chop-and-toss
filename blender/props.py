"""Map props and effect meshes. Faceted low-poly. Front is -Y (glTF +Z)."""
import math, random
from kit import model, Part, glow, shade

WOOD_L, WOOD_M, WOOD_D = '#d9a066', '#b97f47', '#7d4f2a'
ROPE = '#e8d6a8'
STEEL, STEEL_D = '#cfd6dd', '#8e98a5'
IRON = '#26282e'


# ---- Split River Rafts -------------------------------------------------------
@model('raft_tile')
def raft_tile():
    p = Part('raft')
    rnd = random.Random(1)
    n = 4
    for i in range(n):
        y = -0.5 + (i + 0.5) / n
        c = shade(WOOD_L, 0.88 + rnd.random() * 0.2)
        p.box((1.0, 1.0 / n - 0.012, 0.09), (0, y, -0.045), c, bevel=0.012)
    p.box((1.0, 1.0, 0.05), (0, 0, -0.1), WOOD_D)
    p.done()


@model('raft_log')
def raft_log():
    """edge log, 1 tile long along X, sits just outside a raft edge"""
    p = Part('log')
    p.cyl(0.16, 1.0, (0, 0, -0.06), WOOD_M, n=8, rot=(0, 90, 0))
    for sx in (-0.5, 0.5):
        p.cyl(0.12, 0.012, (sx * 0.995, 0, -0.06), '#e6c08a', n=8, rot=(0, 90, 0))
        p.cyl(0.05, 0.016, (sx * 0.996, 0, -0.06), WOOD_M, n=8, rot=(0, 90, 0))
    for sx in (-0.3, 0.3):
        p.torus(0.165, 0.022, (sx, 0, -0.06), ROPE, rot=(0, 90, 0), n=8, m=4, smooth=False)
    p.done()


@model('barrel')
def barrel():
    p = Part('barrel')
    p.lathe([(0, 0), (0.24, 0), (0.3, 0.2), (0.31, 0.35), (0.3, 0.5), (0.24, 0.7), (0.2, 0.7), (0.2, 0.66), (0, 0.66)],
            color=WOOD_M, n=10, smooth=False)
    for z, r in ((0.12, 0.282), (0.58, 0.282)):
        p.torus(r, 0.022, (0, 0, z), STEEL_D, 'brushed', n=10, m=4, smooth=False)
    p.done()


def rock(p, seed, s=1.0):
    rnd = random.Random(seed)
    for i in range(3):
        r = (0.34 - i * 0.08) * s
        a = rnd.random() * 6.28
        d = 0.0 if i == 0 else 0.26 * s
        p.ico(r, (d * math.cos(a), d * math.sin(a), r * 0.35), shade('#8d98a3', 0.85 + rnd.random() * 0.25),
              scale=(1 + rnd.random() * 0.3, 1, 0.62 + rnd.random() * 0.2), rot=(rnd.random() * 60, rnd.random() * 60,
              rnd.random() * 180), sub=1)
    p.ico(0.12 * s, (0.05, -0.05, 0.3 * s), '#7fb069', scale=(1.5, 1.2, 0.3), sub=1)


@model('river_rock_a')
def river_rock_a():
    p = Part('rock')
    rock(p, 3)
    p.done()


@model('river_rock_b')
def river_rock_b():
    p = Part('rock')
    rock(p, 12, 0.72)
    p.done()


@model('lilypad')
def lilypad():
    p = Part('lily')
    pts = [(0.26 * math.cos(t), 0.26 * math.sin(t)) for t in [math.radians(20 + i * 320 / 11) for i in range(12)]]
    p.prism([(0, 0)] + pts, 0.02, (0, 0, 0.01), '#4fae5a')
    p.cone_blob(0.06, 0.13, (0.05, 0.04, 0.02), '#ff9ecb', n=6)
    p.cone_blob(0.035, 0.09, (0.05, 0.04, 0.05), '#fff2a8', n=5)
    p.done()


@model('water')
def water():
    """river surface, 1x1 grid of 24x24 cells, scaled and animated in game"""
    import bmesh
    p = Part('water')
    t = bmesh.new()
    bmesh.ops.create_grid(t, x_segments=24, y_segments=24, size=0.5)
    p._merge(t, '#ffffff', 'gloss', smooth=True)
    p.done()


@model('ground')
def ground():
    p = Part('ground')
    p.box((1, 1, 0.02), (0, 0, -0.01), '#ffffff')
    p.done()


# ---- Arcane Portal Kitchen ---------------------------------------------------
def portal(col, col2):
    p = Part('ring')
    rnd = random.Random(8)
    for i in range(10):
        a = math.radians(i * 36)
        p.box((0.2, 0.13, 0.08), (0.43 * math.cos(a), 0.43 * math.sin(a), 0.02), shade('#6b6f8a', 0.8 + rnd.random() * 0.35),
              rot=(rnd.uniform(-6, 6), rnd.uniform(-6, 6), i * 36 + 90), bevel=0.02)
    g2 = glow(col, 3.5, 'rune_' + col.lstrip('#'))
    for i in range(5):
        a = math.radians(i * 72 + 18)
        p.box((0.05, 0.05, 0.02), (0.43 * math.cos(a), 0.43 * math.sin(a), 0.066), '#ffffff', g2, rot=(0, 0, i * 72 + 63))
    p.done()
    s = Part('swirl', loc=(0, 0, 0.012))
    g = glow(col, 2.6, 'portal_' + col.lstrip('#'))
    gd = glow(col2, 1.2, 'portal_d_' + col2.lstrip('#'))
    s.cyl(0.37, 0.01, (0, 0, 0), '#ffffff', gd, n=20)
    for arm in range(3):
        for k in range(9):
            t = k / 8
            a = math.radians(arm * 120 + t * 250)
            r = 0.05 + t * 0.28
            s.box((0.11 - t * 0.04, 0.045 - t * 0.02, 0.012), (r * math.cos(a), r * math.sin(a), 0.008), '#ffffff', g,
                  rot=(0, 0, math.degrees(a) + 65))
    s.cyl(0.05, 0.014, (0, 0, 0.008), '#ffffff', glow('#ffffff', 3.0, 'portal_core'), n=10)
    s.done()


@model('portal_blue')
def portal_blue():
    portal('#35b6ff', '#123a8f')


@model('portal_orange')
def portal_orange():
    portal('#ff9a2e', '#8f3a12')


@model('crystal')
def crystal():
    p = Part('crystal')
    g = glow('#b08cff', 2.2, 'crystal_glow')
    p.ico(0.2, (0, 0, 0.06), '#55506e', scale=(1.3, 1.1, 0.5), sub=1)
    for (x, y, h, r, rx, ry) in ((0, 0, 0.62, 0.11, 4, -6), (0.14, 0.04, 0.4, 0.08, 10, 22), (-0.13, -0.03, 0.34, 0.07, -8, -24),
                                 (0.02, -0.12, 0.26, 0.06, 26, 4)):
        p.cyl(r, h * 0.7, (x, y, h * 0.35 + 0.05), '#ffffff', g, n=6, rot=(rx, ry, 0))
        import math as m
        dx, dy = m.sin(m.radians(ry)) * h * 0.82, -m.sin(m.radians(rx)) * h * 0.82
        p.cyl(r, h * 0.3, (x + dx, y + dy, h * 0.82 + 0.05), '#ffffff', g, n=6, r2=0.0, rot=(rx, ry, 0))
    p.done()


@model('torch')
def torch():
    p = Part('torch')
    p.cyl(0.07, 0.1, (0, 0, 0.05), IRON, n=6)
    p.cyl(0.035, 1.3, (0, 0, 0.7), '#5a4a3a', n=6)
    p.cyl(0.11, 0.12, (0, 0, 1.38), IRON, n=6, r2=0.14)
    g = glow('#7fd4ff', 3.0, 'torch_glow')
    p.cone_blob(0.11, 0.34, (0, 0, 1.42), '#ffffff', g, n=6)
    p.done()


# ---- Conveyor Belt Gauntlet --------------------------------------------------
@model('conveyor')
def conveyor():
    """belt tile at counter height, belt runs along +X"""
    p = Part('frame')
    p.box((0.9, 0.9, 0.07), (0, 0, 0.035), '#33373e')
    for sx in (-0.36, 0.36):
        for sy in (-0.36, 0.36):
            p.box((0.08, 0.08, 0.56), (sx, sy, 0.34), '#f2b632')
    p.box((1.0, 0.92, 0.1), (0, 0, 0.64), '#f2b632')
    for i in range(5):
        p.box((0.1, 0.94, 0.102), (-0.4 + i * 0.2, 0, 0.64), IRON if i % 2 == 0 else '#f2b632', rot=(0, 0, 0))
    for sy in (-1, 1):
        p.box((1.0, 0.07, 0.16), (0, sy * 0.465, 0.75), STEEL, 'brushed')
        p.box((1.0, 0.03, 0.03), (0, sy * 0.465, 0.842), '#eef2f5', 'metal')
    p.box((1.0, 0.86, 0.06), (0, 0, 0.73), '#2a2d33', 'satin')
    p.done()
    s = Part('slats', loc=(0, 0, 0.765))
    for i in range(4):
        s.box((0.06, 0.82, 0.016), (-0.375 + i * 0.25, 0, 0), '#454a55', 'satin')
        s.prism([(-0.04, -0.07), (0.04, 0.0), (-0.04, 0.07), (-0.012, 0.0)], 0.006, (-0.25 + i * 0.25, 0, -0.002), '#f2b632')
    s.done()


@model('conveyor_end')
def conveyor_end():
    """roller housing that caps a belt run (placed over the last half of an end tile, facing +X)"""
    p = Part('cap')
    p.cyl(0.085, 0.86, (0.44, 0, 0.735), '#eef2f5', 'metal', n=8, rot=(90, 0, 0))
    p.box((0.16, 0.98, 0.06), (0.43, 0, 0.83), '#f2b632', bevel=0.012)
    p.box((0.05, 0.98, 0.24), (0.505, 0, 0.72), IRON)
    p.done()


# ---- generic decor -----------------------------------------------------------
@model('plant')
def plant():
    p = Part('plant')
    p.cyl(0.2, 0.3, (0, 0, 0.15), '#c96b45', n=8, r2=0.26)
    p.cyl(0.24, 0.03, (0, 0, 0.3), '#5a3a22', n=8)
    rnd = random.Random(6)
    for i in range(7):
        a = i * 0.9
        p.cone_blob(0.11, 0.5 + rnd.random() * 0.3, (0.07 * math.cos(a), 0.07 * math.sin(a), 0.28),
                    ('#4fae5a', '#62b93c', '#3f8f2a')[i % 3], n=5, rot=(rnd.uniform(14, 34) * math.sin(a), rnd.uniform(14, 34) * -math.cos(a), 0),
                    scale=(1, 0.45, 1))
    p.done()


@model('table')
def table():
    """small bistro table with two stools"""
    p = Part('table')
    p.cyl(0.45, 0.06, (0, 0, 0.7), '#f6ead4', n=12, bevel=0.012)
    p.cyl(0.46, 0.02, (0, 0, 0.675), '#e23b2e', n=12)
    p.cyl(0.05, 0.66, (0, 0, 0.35), IRON, n=6)
    p.cyl(0.24, 0.04, (0, 0, 0.02), IRON, n=10)
    for sx in (-0.72, 0.72):
        p.cyl(0.18, 0.06, (sx, 0, 0.42), '#b97f47', n=10, bevel=0.012)
        p.cyl(0.035, 0.4, (sx, 0, 0.2), IRON, n=6)
        p.cyl(0.14, 0.03, (sx, 0, 0.015), IRON, n=8)
    p.cyl(0.07, 0.012, (0.12, 0.1, 0.736), '#ffffff', 'gloss', n=10)
    p.cyl(0.035, 0.11, (-0.12, -0.06, 0.785), '#ffd166', 'gloss', n=8)
    p.done()


@model('pipe')
def pipe():
    """factory pipe segment with flange, 1 tile along X"""
    p = Part('pipe')
    p.cyl(0.13, 1.0, (0, 0, 0.3), '#7fb3c8', 'brushed', n=8, rot=(0, 90, 0))
    for sx in (-0.42, 0.42):
        p.cyl(0.17, 0.06, (sx, 0, 0.3), '#5d8fa6', 'brushed', n=8, rot=(0, 90, 0))
    p.box((0.12, 0.2, 0.3), (0, 0, 0.15), '#4a5460')
    p.done()


@model('crate_stack')
def crate_stack():
    p = Part('stack')
    rnd = random.Random(10)
    for (x, y, z, s, a) in ((0, 0, 0.3, 0.6, 6), (0.05, -0.02, 0.84, 0.48, -14), (0.62, 0.1, 0.24, 0.48, 20)):
        c = shade(WOOD_L, 0.9 + rnd.random() * 0.15)
        p.box((s, s, s), (x, y, z), c, rot=(0, 0, a))
        p.box((s + 0.03, 0.07, 0.07), (x, y, z + s / 2 - 0.035), WOOD_D, rot=(0, 0, a))
        p.box((0.07, s + 0.03, 0.07), (x, y, z - s / 2 + 0.035), WOOD_D, rot=(0, 0, a))
    p.done()


# ---- effect meshes -----------------------------------------------------------
@model('fx_flame')
def fx_flame():
    p = Part('flame')
    p.cone_blob(0.5, 1.0, (0, 0, 0), '#ffffff', n=6, grad=('#ffffff', '#ffffff'), twist=0.35)
    p.done()


@model('fx_puff')
def fx_puff():
    p = Part('puff')
    p.ico(0.5, (0, 0, 0), '#ffffff', sub=2, smooth=True)
    p.ico(0.3, (0.3, 0.12, 0.1), '#ffffff', sub=1, smooth=True)
    p.ico(0.26, (-0.28, -0.1, 0.16), '#ffffff', sub=1, smooth=True)
    p.done()


@model('fx_star')
def fx_star():
    p = Part('star')
    pts = []
    for i in range(8):
        a = math.radians(i * 45)
        r = 0.5 if i % 2 == 0 else 0.2
        pts.append((r * math.cos(a), r * math.sin(a)))
    p.prism(pts, 0.12, (0, 0, 0), '#ffffff', rot=(90, 0, 0))
    p.done()


@model('fx_bubble')
def fx_bubble():
    p = Part('bubble')
    p.sphere(0.5, (0, 0, 0), '#ffffff', 'gloss', u=10, v=6)
    p.done()


@model('fx_drop')
def fx_drop():
    p = Part('drop')
    p.cone_blob(0.35, 1.0, (0, 0, -0.3), '#ffffff', n=5)
    p.done()


@model('chef_ring')
def chef_ring():
    """flat ring under each chef in the player colour"""
    p = Part('ring')
    g = glow('#ffffff', 1.2, 'ring_glow')
    p.torus(0.4, 0.035, (0, 0, 0.012), '#ffffff', g, n=24, m=4, smooth=False, scale=(1, 1, 0.3))
    p.prism([(-0.09, 0.0), (0.09, 0.0), (0.0, 0.14)], 0.02, (0, -0.52, 0.012), '#ffffff', g, rot=(0, 0, 180))
    p.done()


@model('fx_confetti')
def fx_confetti():
    p = Part('confetti')
    # flat strip, slightly bent along its length
    p.box((0.07, 0.07, 0.01), (-0.035, 0, 0), '#ffffff', rot=(0, -6, 0))
    p.box((0.07, 0.07, 0.01), (0.035, 0, 0), '#ffffff', rot=(0, 6, 0))
    p.done()


@model('fx_ticket')
def fx_ticket():
    p = Part('ticket')
    pts = [(-0.18, -0.12)]                                              # outline, notches cut into the top edge
    pts += [(0.18, -0.12), (0.18, 0.12)]
    for i in range(7, -1, -1):
        x = -0.18 + 0.045 + i * 0.045
        pts += [(x + 0.012, 0.12), (x + 0.012, 0.095), (x - 0.012, 0.095), (x - 0.012, 0.12)] if i < 8 else []
    pts += [(-0.18, 0.12)]
    p.prism(pts, 0.01, (0, 0, 0), '#fff8ea')
    p.box((0.36, 0.045, 0.012), (0, -0.03, 0), '#c9a227')              # stripe band
    p.done()
