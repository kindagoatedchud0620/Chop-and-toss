"""Kitchen stations and structure. Faceted low-poly. Front of every model is -Y (glTF +Z)."""
import math
from kit import model, Part, empty, glow, shade

WOOD_L, WOOD_M, WOOD_D = '#e3ad6b', '#c98a4b', '#8a552b'
STEEL, STEEL_D, STEEL_DD = '#cfd6dd', '#8e98a5', '#59616d'
IRON = '#26282e'
CREAM = '#f0dfc0'
RED = '#e23b2e'
TOP_H = 0.8  # counter top height


def cabinet(p, w=0.94, d=0.94, x=0.0, col='#ffffff', doors=True):
    """white cabinet body (tinted per map in game) with toe kick"""
    p.box((w - 0.06, d - 0.06, 0.08), (x, 0, 0.04), '#3a3f47')
    p.box((w, d, 0.62), (x, 0, 0.39), col)
    if doors:
        for s in (-1, 1):
            p.box((w - 0.16, 0.02, 0.44), (x, s * (d / 2 + 0.005), 0.39), shade('#ffffff', 0.86))
            p.box((0.02, d - 0.16, 0.44), (x + s * (w / 2 + 0.005), 0, 0.39), shade('#ffffff', 0.86))


@model('floor_tile')
def floor_tile():
    p = Part('floor')
    p.box((0.97, 0.97, 0.06), (0, 0, -0.03), '#ffffff', bevel=0.012)
    p.box((1.0, 1.0, 0.04), (0, 0, -0.05), '#9a9a9a')
    p.done()


@model('counter')
def counter():
    cab = Part('cab')
    cabinet(cab)
    cab.done()
    top = Part('top')
    top.box((1.0, 1.0, 0.1), (0, 0, 0.75), shade(CREAM, 0.9), bevel=0.018)
    top.box((0.9, 0.9, 0.012), (0, 0, 0.8), CREAM, bevel=0.005)
    top.done()


@model('counter_cart')
def counter_cart():
    """counter on wheels for the sliding island"""
    cab = Part('cab')
    cab.box((0.96, 0.9, 0.5), (0, 0, 0.45), '#ffffff')
    for s in (-1, 1):
        cab.box((0.8, 0.02, 0.34), (0, s * 0.455, 0.45), shade('#ffffff', 0.84))
    cab.box((1.0, 0.96, 0.06), (0, 0, 0.17), STEEL_D, 'brushed')
    cab.done()
    top = Part('top')
    top.box((1.0, 1.0, 0.1), (0, 0, 0.75), shade(CREAM, 0.9), bevel=0.018)
    top.box((0.9, 0.9, 0.012), (0, 0, 0.8), CREAM, bevel=0.005)
    for sx in (-0.34, 0.34):
        for sy in (-0.36, 0.36):
            top.cyl(0.085, 0.07, (sx, sy, 0.085), IRON, n=10, rot=(90, 0, 0))
            top.cyl(0.035, 0.09, (sx, sy, 0.085), STEEL, 'metal', n=6, rot=(90, 0, 0))
    top.done()


@model('rail')
def rail():
    """floor track segment for the sliding island (1 tile, runs along X)"""
    p = Part('rail')
    for sy in (-0.36, 0.36):
        p.box((1.0, 0.07, 0.03), (0, sy, 0.012), STEEL_D, 'brushed')
        p.box((1.0, 0.03, 0.02), (0, sy, 0.035), STEEL, 'metal')
    for sx in (-0.33, 0, 0.33):
        p.box((0.1, 0.9, 0.016), (sx, 0, 0.006), '#5b4636')
    p.done()


@model('wall')
def wall():
    """1 tile stone wall block"""
    p = Part('wall')
    p.box((1.0, 1.0, 1.0), (0, 0, 0.5), '#ffffff')
    p.box((1.04, 1.04, 0.12), (0, 0, 1.06), shade('#ffffff', 1.0), bevel=0.02)
    # capstones on top so the wall reads from above
    for (cx, cy, w2, d2, sh) in ((-0.25, -0.25, 0.44, 0.44, 0.8), (0.25, -0.25, 0.44, 0.44, 0.7), (-0.25, 0.25, 0.44, 0.44, 0.72), (0.25, 0.25, 0.44, 0.44, 0.82)):
        p.box((w2, d2, 0.05), (cx, cy, 1.14), shade('#ffffff', sh), bevel=0.015)
    # brick courses, both long faces
    import random
    rnd = random.Random(4)
    for s in (-1, 1):
        for row in range(4):
            off = 0.0 if row % 2 == 0 else 0.25
            for k in range(-1, 3):
                cx = -0.5 + off + k * 0.5 + 0.25
                x0, x1 = max(-0.49, cx - 0.23), min(0.49, cx + 0.23)
                if x1 - x0 < 0.08:
                    continue
                sh = 0.82 + rnd.random() * 0.14
                p.box((x1 - x0, 0.03, 0.2), ((x0 + x1) / 2, s * 0.505, 0.125 + row * 0.25), shade('#ffffff', sh))
                p.box((0.03, x1 - x0, 0.2), (s * 0.505, (x0 + x1) / 2, 0.125 + row * 0.25), shade('#ffffff', sh))
    p.done()


@model('crate')
def crate():
    p = Part('crate')
    w, h = 0.92, 0.74
    p.box((w - 0.06, w - 0.06, 0.05), (0, 0, 0.03), WOOD_D)
    # slats on four sides
    for s in (-1, 1):
        for i in range(3):
            z = 0.14 + i * 0.235
            p.box((w, 0.05, 0.19), (0, s * (w / 2 - 0.025), z), WOOD_L if i != 1 else WOOD_M, bevel=0.012)
            p.box((0.05, w - 0.1, 0.19), (s * (w / 2 - 0.025), 0, z), WOOD_M if i != 1 else WOOD_L, bevel=0.012)
    # corner posts and rim
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.1, 0.1, h + 0.04), (sx * (w / 2 - 0.03), sy * (w / 2 - 0.03), (h + 0.04) / 2), WOOD_D, bevel=0.015)
    # dark inside floor (food piles on it)
    p.box((w - 0.12, w - 0.12, 0.04), (0, 0, 0.52), '#5c3a1f')
    # blank plaque on the front and back, rope handles on the sides
    for s in (-1, 1):
        p.box((0.36, 0.03, 0.24), (0, s * (w / 2 + 0.012), 0.38), CREAM, bevel=0.01)
        p.torus(0.08, 0.018, (s * (w / 2 + 0.01), 0, 0.5), '#d9c9a3', rot=(0, 90, 0), n=8, m=5, arc=180, smooth=False)
    p.done()


@model('emblem')
def emblem():
    """floating sign above a crate. The ingredient model is attached in game."""
    p = Part('emblem')
    p.cyl(0.25, 0.035, (0, 0, 0), CREAM, n=16, rot=(90, 0, 0), bevel=0.01)
    p.torus(0.25, 0.028, (0, 0, 0), WOOD_M, rot=(90, 0, 0), n=16, m=6, smooth=False)
    p.done()


@model('board')
def board():
    p = Part('block')
    # thick butcher block made of glued strips
    n = 7
    w, d, h = 0.74, 0.52, 0.1
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        p.box((w / n + 0.001, d, h), (x, 0, h / 2 + 0.015), WOOD_L if i % 2 == 0 else '#d59a59')
    p.box((w + 0.02, 0.03, h - 0.02), (0, d / 2, h / 2 + 0.015), WOOD_M)
    p.box((w + 0.02, 0.03, h - 0.02), (0, -d / 2, h / 2 + 0.015), WOOD_M)
    for sx in (-0.3, 0.3):
        for sy in (-0.2, 0.2):
            p.box((0.08, 0.08, 0.02), (sx, sy, 0.01), WOOD_D)
    # a few knife scars
    for (x, y, a) in ((-0.1, 0.05, 20), (0.05, -0.08, -15), (0.16, 0.1, 40)):
        p.box((0.16, 0.008, 0.004), (x, y, h + 0.016), WOOD_M, rot=(0, 0, a))
    p.done()
    # cleaver: origin at the handle butt, blade extends along -X, cutting edge down (-Z)
    c = Part('cleaver', loc=(0.3, 0.0, 0.13))
    c.box((0.17, 0.035, 0.045), (-0.045, 0, 0.0), '#5b3a22', bevel=0.012)
    c.cyl(0.012, 0.04, (-0.01, 0, 0), STEEL, 'metal', n=6, rot=(90, 0, 0))
    c.cyl(0.012, 0.04, (-0.08, 0, 0), STEEL, 'metal', n=6, rot=(90, 0, 0))
    c.prism([(-0.13, 0.03), (-0.13, -0.12), (-0.40, -0.12), (-0.42, -0.07), (-0.42, 0.03)], 0.022,
            (0, 0, 0), '#e3e9ee', 'metal', rot=(90, 0, 0))
    c.prism([(-0.14, -0.105), (-0.14, -0.123), (-0.405, -0.123), (-0.41, -0.105)], 0.026, (0, 0, 0), '#ffffff',
            'metal', rot=(90, 0, 0))
    c.cyl(0.014, 0.03, (-0.37, 0, -0.0), IRON, n=8, rot=(90, 0, 0))
    c.done()


@model('stove')
def stove():
    p = Part('stove')
    p.box((0.92, 0.92, 0.07), (0, 0, 0.035), '#33373e')
    p.box((0.98, 0.98, 0.64), (0, 0, 0.39), STEEL, 'brushed')
    # oven doors front and back with dark glass and a bar handle
    for s in (-1, 1):
        p.box((0.74, 0.03, 0.36), (0, s * 0.497, 0.33), STEEL_D, 'brushed')
        p.box((0.52, 0.02, 0.18), (0, s * 0.515, 0.31), '#1c2027', 'gloss')
        p.box((0.6, 0.035, 0.03), (0, s * 0.53, 0.5), '#eef2f5', 'metal')
        for kx in (-0.3, -0.1, 0.1, 0.3):
            p.cyl(0.035, 0.04, (kx, s * 0.5, 0.635), RED if abs(kx) > 0.2 else IRON, n=8, rot=(90, 0, 0))
    for s in (-1, 1):
        p.box((0.02, 0.7, 0.4), (s * 0.497, 0, 0.36), STEEL_D, 'brushed')
    # black cooktop
    p.box((1.0, 1.0, 0.09), (0, 0, 0.755), '#2a2d33', 'satin', bevel=0.016)
    p.cyl(0.33, 0.012, (0, 0, 0.804), '#16181c', n=16)
    # pan support grate
    for a in range(4):
        p.box((0.6, 0.045, 0.035), (0, 0, 0.822), '#0e0f12', rot=(0, 0, a * 45))
    p.done()
    # burner ring, lights up when something is cooking
    b = Part('burner')
    b.torus(0.2, 0.028, (0, 0, 0.812), '#ffffff', glow('#ff7a1a', 3.0, 'burner_glow'), n=16, m=5, smooth=False)
    b.torus(0.1, 0.022, (0, 0, 0.812), '#ffffff', glow('#ff7a1a', 3.0, 'burner_glow'), n=12, m=5, smooth=False)
    b.done()


@model('pot')
def pot():
    p = Part('pot')
    ro, ri, h = 0.3, 0.27, 0.36
    p.lathe([(0, 0), (ro - 0.03, 0), (ro, 0.03), (ro, h), (ro + 0.025, h + 0.012), (ro + 0.025, h + 0.03),
             (ri, h + 0.03), (ri, 0.05), (0, 0.05)], color='#dfe5ea', mat='metal', n=14, smooth=True, sharp=30)
    p.cyl(ro + 0.004, 0.035, (0, 0, h * 0.62), '#aeb7c0', 'brushed', n=14, caps=False)
    for s in (-1, 1):
        p.box((0.11, 0.16, 0.035), (s * (ro + 0.06), 0, h - 0.06), '#2b2d33', bevel=0.012)
        p.box((0.04, 0.05, 0.035), (s * (ro + 0.015), 0.055, h - 0.06), '#2b2d33')
        p.box((0.04, 0.05, 0.035), (s * (ro + 0.015), -0.055, h - 0.06), '#2b2d33')
    p.done()
    s = Part('soup', loc=(0, 0, 0.3))
    s.cyl(ri - 0.004, 0.02, (0, 0, 0), '#ffffff', 'satin', n=14)
    s.done()


@model('pan')
def pan():
    p = Part('pan')
    ro = 0.31
    p.lathe([(0, 0), (ro - 0.07, 0), (ro, 0.085), (ro + 0.012, 0.1), (ro - 0.012, 0.1), (ro - 0.075, 0.03), (0, 0.03)],
            color='#23252b', mat='satin', n=14, smooth=True, sharp=30)
    p.cyl(ro - 0.085, 0.006, (0, 0, 0.034), '#34373f', 'satin', n=14)
    # handle points to +X, slightly raised
    p.box((0.34, 0.07, 0.035), (ro + 0.16, 0, 0.115), '#1a1b20', rot=(0, -8, 0), bevel=0.014)
    p.box((0.06, 0.05, 0.03), (ro + 0.0, 0, 0.095), STEEL, 'metal')
    p.cyl(0.018, 0.04, (ro + 0.29, 0, 0.138), STEEL, 'metal', n=6)
    p.done()


@model('sink')
def sink():
    """double basin steel sink, 2 tiles wide along X. left basin washes, right basin is the drying rack"""
    p = Part('sink')
    p.box((1.9, 0.9, 0.07), (0, 0, 0.035), '#33373e')
    p.box((1.96, 0.96, 0.6), (0, 0, 0.38), '#ffffff')
    for s in (-1, 1):
        for cx in (-0.5, 0.5):
            p.box((0.74, 0.02, 0.42), (cx, s * 0.485, 0.38), shade('#ffffff', 0.86))
    # steel top built as a frame around two basins
    z, t = 0.75, 0.1
    bw, bd = 0.72, 0.62  # basin opening
    p.box((2.0, (1.0 - bd) / 2, t), (0, -(bd / 2 + (1.0 - bd) / 4), z), STEEL, 'brushed')
    p.box((2.0, (1.0 - bd) / 2, t), (0, (bd / 2 + (1.0 - bd) / 4), z), STEEL, 'brushed')
    side = (2.0 - 2 * bw - 0.16) / 2
    p.box((side, bd, t), (-1.0 + side / 2, 0, z), STEEL, 'brushed')
    p.box((side, bd, t), (1.0 - side / 2, 0, z), STEEL, 'brushed')
    p.box((0.16, bd, t), (0, 0, z), STEEL, 'brushed')
    for cx in (-(0.08 + bw / 2), (0.08 + bw / 2)):
        p.box((bw, bd, 0.02), (cx, 0, 0.56), STEEL_D, 'brushed')
        p.box((bw, 0.02, 0.24), (cx, bd / 2 - 0.01, 0.68), STEEL_D, 'brushed')
        p.box((bw, 0.02, 0.24), (cx, -bd / 2 + 0.01, 0.68), '#aab3bd', 'brushed')
        p.box((0.02, bd, 0.24), (cx - bw / 2 + 0.01, 0, 0.68), '#b6bec7', 'brushed')
        p.box((0.02, bd, 0.24), (cx + bw / 2 - 0.01, 0, 0.68), '#b6bec7', 'brushed')
    # raised lip
    p.box((2.0, 0.03, 0.03), (0, -0.485, 0.815), '#eef2f5', 'metal')
    p.box((2.0, 0.03, 0.03), (0, 0.485, 0.815), '#eef2f5', 'metal')
    # faucet: post at the back between basins arcing over the left basin
    p.cyl(0.05, 0.08, (0, 0.36, 0.84), '#eef2f5', 'metal', n=8)
    p.cyl(0.028, 0.34, (0, 0.36, 1.0), '#eef2f5', 'metal', n=8)
    p.torus(0.14, 0.028, (-0.14, 0.36, 1.17), '#eef2f5', 'metal', rot=(90, 0, 0), n=10, m=6, arc=180, smooth=True)
    p.cyl(0.034, 0.06, (-0.28, 0.36, 1.14), '#eef2f5', 'metal', n=8)
    for sx, c in ((-0.12, '#3d8bfd'), (0.12, RED)):
        p.box((0.09, 0.035, 0.035), (sx, 0.36, 0.86), c, bevel=0.01)
    # drying rack in the right basin
    cx = 0.08 + bw / 2
    for i in range(5):
        p.box((0.02, bd - 0.06, 0.02), (cx - 0.28 + i * 0.14, 0, 0.8), '#eef2f5', 'metal')
    p.box((bw - 0.04, 0.02, 0.02), (cx, 0.22, 0.79), '#eef2f5', 'metal')
    p.box((bw - 0.04, 0.02, 0.02), (cx, -0.22, 0.79), '#eef2f5', 'metal')
    p.done()
    w = Part('water', loc=(-(0.08 + bw / 2), 0, 0.74))
    w.box((bw - 0.03, bd - 0.03, 0.02), (0, 0, 0), '#6fd3f2', 'gloss')
    w.done()


@model('hatch')
def hatch():
    """striped serving hatch with a belt, 2 tiles wide along X. Dishes go in from the front (-Y)."""
    p = Part('hatch')
    p.box((1.92, 0.92, 0.07), (0, 0, 0.035), '#33373e')
    n = 10
    for i in range(n):
        x = -0.98 + (i + 0.5) * 1.96 / n
        c = RED if i % 2 == 0 else '#fff5e6'
        p.box((1.96 / n + 0.001, 0.96, 0.62), (x, 0, 0.39), c)
    p.box((2.0, 1.0, 0.07), (0, 0, 0.735), '#fff5e6', bevel=0.014)
    # belt bed
    p.box((1.84, 0.7, 0.05), (0, -0.02, 0.785), '#30333a', 'satin')
    for sx in (-0.92, 0.92):
        p.cyl(0.055, 0.74, (sx, -0.02, 0.785), '#eef2f5', 'metal', n=8, rot=(90, 0, 0))
    p.box((1.9, 0.04, 0.07), (0, -0.4, 0.79), STEEL, 'metal')
    p.box((1.9, 0.04, 0.07), (0, 0.36, 0.79), STEEL, 'metal')
    # arch at the back with a little striped canopy and a pass window
    for sx in (-0.93, 0.93):
        p.box((0.1, 0.1, 0.78), (sx, 0.43, 1.16), WOOD_D, bevel=0.015)
    p.box((1.96, 0.1, 0.1), (0, 0.43, 1.56), WOOD_D, bevel=0.015)
    for i in range(n):
        x = -0.98 + (i + 0.5) * 1.96 / n
        c = RED if i % 2 == 0 else '#fff5e6'
        p.box((1.96 / n + 0.001, 0.36, 0.035), (x, 0.36, 1.66), c, rot=(-22, 0, 0))
        p.cyl(0.098, 0.03, (x, 0.2, 1.585), c, n=8, rot=(90, 0, 0), scale=(1, 1, 1))
    # bell
    p.cyl(0.07, 0.02, (0.78, -0.3, 0.79), IRON, n=10)
    p.sphere(0.075, (0.78, -0.3, 0.8), '#f6c445', 'metal', scale=(1, 1, 0.8), u=10, v=6)
    p.sphere(0.02, (0.78, -0.3, 0.87), '#f6c445', 'metal', u=6, v=4)
    p.done()
    # moving belt slats, slid along X in game
    b = Part('belt', loc=(0, -0.02, 0.812))
    for i in range(8):
        b.box((0.035, 0.66, 0.012), (-0.8 + i * 0.23, 0, 0), '#4a4e58', 'satin')
    b.done()


@model('trash')
def trash():
    p = Part('trash')
    p.lathe([(0, 0), (0.3, 0), (0.33, 0.04), (0.38, 0.74), (0.41, 0.76), (0.41, 0.8), (0.35, 0.8), (0.31, 0.1),
             (0, 0.1)], color='#7f8a96', mat='brushed', n=10, smooth=False)
    for i in range(10):
        a = math.radians(i * 36 + 18)
        p.box((0.03, 0.02, 0.56), (0.356 * math.cos(a), 0.356 * math.sin(a), 0.4), '#646e7a', 'brushed',
              rot=(0, 0, i * 36 + 18))
    p.torus(0.41, 0.03, (0, 0, 0.8), '#d7dde3', 'metal', n=10, m=5, smooth=False)
    p.cyl(0.345, 0.02, (0, 0, 0.3), '#16181c', n=10)
    # recycle-free "bin" mark: a simple down arrow plate on front and back
    for s in (-1, 1):
        p.box((0.2, 0.02, 0.2), (0, s * 0.372, 0.46), '#f6c445', rot=(s * 3.5, 0, 0), bevel=0.008)
        p.prism([(-0.06, 0.02), (0.06, 0.02), (0, -0.06)], 0.012, (0, s * 0.386, 0.44), IRON, rot=(90, 0, 0))
        p.box((0.04, 0.012, 0.07), (0, s * 0.386, 0.5), IRON)
    p.done()


@model('extinguisher')
def extinguisher():
    p = Part('ext')
    p.cyl(0.11, 0.3, (0, 0, 0.17), RED, 'gloss', n=10, smooth=True, sharp=50)
    p.sphere(0.11, (0, 0, 0.32), RED, 'gloss', scale=(1, 1, 0.7), u=10, v=6)
    p.cyl(0.115, 0.03, (0, 0, 0.03), '#9c1f17', 'gloss', n=10)
    p.cyl(0.113, 0.09, (0, 0, 0.2), '#fff5e6', n=10, caps=False)
    p.cyl(0.114, 0.02, (0, 0, 0.2), '#f6c445', n=10, caps=False)
    p.cyl(0.04, 0.07, (0, 0, 0.415), IRON, n=8)
    p.box((0.05, 0.16, 0.025), (0, -0.04, 0.47), IRON, rot=(-14, 0, 0))
    p.box((0.05, 0.14, 0.022), (0, -0.03, 0.435), '#d7dde3', 'metal', rot=(6, 0, 0))
    # hose and nozzle pointing forward (-Y)
    p.torus(0.085, 0.02, (0.03, -0.02, 0.36), IRON, rot=(90, 0, 100), n=8, m=5, arc=200, smooth=False)
    p.cyl(0.035, 0.12, (0.0, -0.17, 0.33), IRON, r2=0.055, n=8, rot=(90, 0, 0))
    p.sphere(0.03, (0.07, 0.07, 0.42), '#f6c445', 'metal', u=6, v=4)
    p.done()


def plate_shape(p, col, col2):
    p.lathe([(0, 0), (0.15, 0), (0.19, 0.012), (0.275, 0.05), (0.28, 0.062), (0.262, 0.06), (0.175, 0.03),
             (0, 0.028)], color=col, mat='gloss', n=18, smooth=True, sharp=40)
    p.cyl(0.172, 0.004, (0, 0, 0.031), col2, 'gloss', n=18)


@model('plate')
def plate():
    p = Part('plate')
    plate_shape(p, '#ffffff', '#f1f3f6')
    p.done()


@model('plate_dirty')
def plate_dirty():
    p = Part('plate')
    plate_shape(p, '#b08a62', '#8a6240')
    import random
    rnd = random.Random(7)
    for i in range(6):
        a = rnd.random() * 6.28
        r = rnd.random() * 0.13
        p.ico(0.035 + rnd.random() * 0.03, (r * math.cos(a), r * math.sin(a), 0.034),
              rnd.choice(['#5a3a22', '#6e4426', '#7a2f1c', '#4a2f1a']), 'satin', scale=(1, 1, 0.16), sub=1)
    for a in (0.6, 2.3, 4.4):
        p.ico(0.03, (0.235 * math.cos(a), 0.235 * math.sin(a), 0.05), '#5a3a22', 'satin', scale=(1.3, 1, 0.2), sub=1,
              rot=(0, 0, math.degrees(a) + 90))
    p.done()


@model('plate_return')
def plate_return():
    """rubber mat with chevrons that sits on a counter where dirty plates come back"""
    p = Part('mat')
    p.box((0.82, 0.82, 0.03), (0, 0, 0.015), '#2f6f8f', bevel=0.012)
    p.box((0.7, 0.7, 0.012), (0, 0, 0.034), '#3b8bb0')
    p.torus(0.25, 0.022, (0, 0, 0.04), '#bfe6f5', n=14, m=4, arc=250, smooth=False, rot=(0, 0, 20))
    p.prism([(0.0, 0.085), (0.11, 0.0), (0.0, -0.085)], 0.02, (0.25 * math.cos(math.radians(20)) - 0.02,
            0.25 * math.sin(math.radians(20)) - 0.02, 0.045), '#bfe6f5', rot=(0, 0, -75))
    p.done()


@model('cursor')
def cursor():
    """corner brackets that mark the tile a chef is facing (tinted per player)"""
    p = Part('cursor')
    g = glow('#ffffff', 1.6, 'cursor_glow')
    L, t, h = 0.3, 0.07, 0.035
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((L, t, h), (sx * (0.5 - L / 2), sy * (0.5 - t / 2), 0), '#ffffff', g)
            p.box((t, L, h), (sx * (0.5 - t / 2), sy * (0.5 - L / 2), 0), '#ffffff', g)
    p.done()
