"""Ingredients in every state and the plated dishes. Smooth and bevelled. Origin = bottom centre."""
import math, random
from kit import model, Part, glow, shade
from stations import plate_shape

TOM, TOM_L = '#e5392b', '#ff7d63'
LEAF, LEAF_L, LEAF_D = '#62b93c', '#9bdc5a', '#3f8f2a'
BUN, BUN_L = '#e2a14e', '#f3c57d'
MEAT_RAW, MEAT_FAT = '#e0566b', '#ffd9d2'
PATTY_RAW, PATTY = '#e87a86', '#7a4424'
FISH, FISH_B = '#5aa7d6', '#d9eef7'
FILLET = '#f7b7a3'
GOLD, GOLD_D = '#f0b23a', '#c9811f'
POT, POT_IN = '#c99a5b', '#f6e39a'


# ---- whole -------------------------------------------------------------------
def tomato_body(p, r=0.17, loc=(0, 0, 0)):
    x, y, z = loc
    p.sphere(r, (x, y, z + r * 0.86), TOM, 'gloss', scale=(1, 1, 0.86), u=16, v=10)
    for i in range(5):
        a = math.radians(i * 72)
        p.cone_blob(r * 0.2, r * 0.62, (x + r * 0.1 * math.cos(a), y + r * 0.1 * math.sin(a), z + r * 1.64), LEAF_D,
                    'satin', n=5, rot=(0, 78, i * 72), scale=(1, 1, 1), smooth=True)
    p.cyl(r * 0.09, r * 0.3, (x, y, z + r * 1.8), '#4c7a25', n=6)


@model('tomato')
def tomato():
    p = Part('tomato')
    tomato_body(p)
    p.done()


def bun_top(p, z=0.0, r=0.19, seeds=True):
    p.lathe([(0, z), (r * 0.92, z), (r, z + 0.035), (r * 0.93, z + 0.095), (r * 0.6, z + 0.15), (0, z + 0.168)],
            color=BUN, mat='satin', n=16, smooth=True, sharp=60, grad=(BUN_L, '#d18a3a'))
    if seeds:
        rnd = random.Random(3)
        for i in range(11):
            a = rnd.random() * 6.28
            rr = rnd.random() ** 0.6 * r * 0.72
            hz = z + 0.165 - 0.075 * (rr / (r * 0.72)) ** 2
            p.sphere(0.016, (rr * math.cos(a), rr * math.sin(a), hz), '#fff1cf', 'satin', scale=(1.5, 0.8, 0.5),
                     rot=(0, 0, rnd.random() * 180), u=6, v=4)


def bun_bottom(p, z=0.0, r=0.19):
    p.lathe([(0, z), (r * 0.9, z), (r, z + 0.03), (r * 0.98, z + 0.07), (0, z + 0.075)], color=BUN, mat='satin', n=16,
            smooth=True, sharp=60, grad=('#d18a3a', BUN_L))


@model('bun')
def bun():
    p = Part('bun')
    bun_bottom(p, 0.0)
    p.cyl(0.178, 0.012, (0, 0, 0.08), '#fbe3b0', n=16)
    bun_top(p, 0.086)
    p.done()


@model('meat')
def meat():
    p = Part('meat')
    pts = [(0.2 * math.cos(t) * (1 + 0.18 * math.cos(2 * t + 0.6)), 0.15 * math.sin(t) * (1 + 0.1 * math.sin(3 * t)))
           for t in [i * 2 * math.pi / 14 for i in range(14)]]
    p.prism([(x * 1.08, y * 1.1) for x, y in pts], 0.085, (0, 0, 0.05), MEAT_FAT, 'satin', bevel=0.03, segs=3,
            smooth=True, sharp=70)
    p.prism(pts, 0.11, (0.006, 0.0, 0.058), MEAT_RAW, 'gloss', bevel=0.035, segs=3, smooth=True, sharp=70)
    p.torus(0.035, 0.016, (-0.06, 0.01, 0.115), '#fff3ea', 'satin', n=10, m=5, scale=(1, 1, 0.6))
    for (x, y, a) in ((0.05, 0.03, 30), (0.08, -0.04, 12)):
        p.box((0.1, 0.012, 0.01), (x, y, 0.114), '#f29aa5', 'satin', rot=(0, 0, a))
    p.done()


@model('lettuce')
def lettuce():
    p = Part('lettuce')
    p.sphere(0.165, (0, 0, 0.15), LEAF, 'satin', scale=(1, 1, 0.9), u=12, v=8, grad=(LEAF_L, LEAF))
    rnd = random.Random(5)
    for i in range(7):
        a = i * 0.9 + rnd.random() * 0.3
        tilt = 28 + rnd.random() * 30
        p.sphere(0.13, (0.07 * math.cos(a), 0.07 * math.sin(a), 0.15 + 0.03 * (i % 3)), LEAF_L if i % 2 else LEAF_D,
                 'satin', scale=(1.0, 0.25, 0.95), rot=(tilt, 0, math.degrees(a) + 90), u=8, v=6)
    p.sphere(0.07, (0, 0, 0.29), '#c9f08a', 'satin', scale=(1, 1, 0.6), u=8, v=5)
    p.done()


def fish_body(p, col=FISH, belly=FISH_B, z=0.075, s=1.0, eye=True):
    p.sphere(0.1 * s, (0.02 * s, 0, z), col, 'gloss', scale=(2.3, 0.8, 0.95), u=16, v=10, grad=(belly, col))
    p.prism([(0, 0), (0.13 * s, 0.1 * s), (0.1 * s, 0), (0.13 * s, -0.1 * s)], 0.03 * s, (-0.26 * s, 0, z), '#3f86b8',
            'satin', rot=(90, 0, 180), bevel=0.008, smooth=True)
    p.prism([(0, 0), (0.11 * s, 0.0), (0.03 * s, 0.07 * s)], 0.02 * s, (-0.02 * s, 0, z + 0.085 * s), '#3f86b8',
            'satin', rot=(90, 0, 0), bevel=0.006, smooth=True)
    for sy in (-1, 1):
        p.sphere(0.04 * s, (0.06 * s, sy * 0.075 * s, z - 0.03 * s), '#3f86b8', 'satin', scale=(1.4, 0.3, 0.8),
                 rot=(0, 20, sy * 25), u=6, v=4)
        if eye:
            p.sphere(0.024 * s, (0.17 * s, sy * 0.055 * s, z + 0.025 * s), '#ffffff', 'gloss', u=8, v=6)
            p.sphere(0.014 * s, (0.178 * s, sy * 0.068 * s, z + 0.027 * s), '#15171c', 'gloss', u=6, v=4)


@model('fish')
def fish():
    p = Part('fish')
    fish_body(p)
    p.done()


def potato_body(p, s=1.0, loc=(0, 0, 0)):
    x, y, z = loc
    p.sphere(0.13 * s, (x, y, z + 0.115 * s), POT, 'matte', scale=(1.45, 1.0, 0.9), u=12, v=8, grad=('#b78547', '#d7ab6c'))
    p.sphere(0.09 * s, (x + 0.09 * s, y + 0.03 * s, z + 0.12 * s), POT, 'matte', scale=(1.2, 1.0, 0.95), u=10, v=6,
             grad=('#b78547', '#d7ab6c'))
    for (dx, dy, dz) in ((-0.08, -0.09, 0.15), (0.05, -0.1, 0.11), (0.12, 0.03, 0.2), (-0.02, 0.02, 0.228)):
        p.sphere(0.013 * s, (x + dx * s, y + dy * s, z + dz * s), '#7a5327', 'matte', u=6, v=4)


@model('potato')
def potato():
    p = Part('potato')
    potato_body(p)
    p.done()


# ---- chopped -----------------------------------------------------------------
def tomato_pieces(p, z=0.0, s=1.0):
    for (x, y, a, tilt) in ((-0.09, 0.03, 20, 62), (0.07, 0.06, 150, 64), (0.02, -0.08, 265, 60)):
        half = [(0.13 * s * math.cos(t), 0.13 * s * math.sin(t)) for t in [i * math.pi / 8 for i in range(9)]]
        p.prism(half, 0.07 * s, (x * s, y * s, z + 0.05 * s), TOM, 'gloss', rot=(tilt, 0, a), bevel=0.016 * s, segs=2,
                smooth=True, sharp=60)
        inner = [(0.1 * s * math.cos(t), 0.1 * s * math.sin(t) + 0.004) for t in [i * math.pi / 6 for i in range(7)]]
        p.prism(inner, 0.076 * s, (x * s, y * s, z + 0.05 * s), TOM_L, 'gloss', rot=(tilt, 0, a))
        for k in (-1, 0, 1):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            ox = k * 0.045 * s
            p.sphere(0.011 * s, (x * s + ox * ca, y * s + ox * sa, z + 0.085 * s), '#ffe9a3', 'gloss', u=5, v=3)


@model('tomato_chopped')
def tomato_chopped():
    p = Part('tomato_chopped')
    tomato_pieces(p)
    p.done()


def patty(p, col, z=0.0, r=0.16, h=0.07, grill=None):
    p.cyl(r, h, (0, 0, z + h / 2), col, 'satin', n=16, bevel=0.022, segs=3, smooth=True, sharp=70)
    rnd = random.Random(11)
    for i in range(9):
        a = rnd.random() * 6.28
        rr = rnd.random() ** 0.5 * r * 0.75
        p.sphere(0.02, (rr * math.cos(a), rr * math.sin(a), z + h - 0.006), shade(col, 1.12) if isinstance(col, str) else col,
                 'satin', scale=(1, 1, 0.45), u=6, v=4)
    if grill:
        for k in (-0.08, 0, 0.08):
            w = 2 * math.sqrt(max(0.001, (r * 0.86) ** 2 - k * k))
            p.box((w, 0.022, 0.01), (0, k, z + h + 0.001), grill, 'matte', rot=(0, 0, 0))


@model('meat_chopped')
def meat_chopped():
    p = Part('meat_chopped')
    patty(p, PATTY_RAW)
    p.done()


def lettuce_leaves(p, z=0.0, s=1.0, n=3):
    rnd = random.Random(9)
    for i in range(n):
        a = i * 2.1
        r = 0.05 * s if n > 1 else 0
        pts = []
        for k in range(14):
            t = k * 2 * math.pi / 14
            rr = 0.15 * s * (1 + 0.14 * math.sin(5 * t + i))
            pts.append((rr * math.cos(t), rr * 0.8 * math.sin(t)))
        p.prism(pts, 0.022 * s, (r * math.cos(a), r * math.sin(a), z + 0.02 * s + i * 0.022 * s),
                (LEAF_L, LEAF, '#7fcf4a')[i % 3], 'satin', rot=(rnd.uniform(-9, 9), rnd.uniform(-9, 9), i * 50),
                bevel=0.008 * s, smooth=True, sharp=60)
        p.box((0.2 * s, 0.014 * s, 0.008 * s), (r * math.cos(a), r * math.sin(a), z + 0.034 * s + i * 0.022 * s),
              '#d6f5a6', 'satin', rot=(0, 0, i * 50))


@model('lettuce_chopped')
def lettuce_chopped():
    p = Part('lettuce_chopped')
    lettuce_leaves(p)
    p.done()


def fillet(p, col, loc=(0, 0, 0), rot=0, s=1.0, skin=None, bumpy=False, mat='satin'):
    x, y, z = loc
    pts = []
    for k in range(14):
        t = k * 2 * math.pi / 14
        rx = 0.2 * s * (1 - 0.22 * math.cos(t))
        pts.append((rx * math.cos(t) * 0.95, 0.085 * s * math.sin(t) * (1 + 0.25 * math.cos(t))))
    if skin:
        p.prism([(px * 1.05, py * 1.08) for px, py in pts], 0.03 * s, (x, y, z + 0.02 * s), skin, 'gloss',
                rot=(0, 0, rot), bevel=0.01 * s, smooth=True, sharp=70)
    p.prism(pts, 0.07 * s, (x, y, z + 0.045 * s), col, mat, rot=(0, 0, rot), bevel=0.028 * s, segs=3, smooth=True,
            sharp=70)
    if bumpy:
        rnd = random.Random(21)
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        for i in range(9):
            u = rnd.uniform(-0.15, 0.15) * s
            v = rnd.uniform(-0.045, 0.045) * s
            p.sphere(0.03 * s, (x + u * ca - v * sa, y + u * sa + v * ca, z + 0.068 * s), shade(GOLD, rnd.uniform(0.9, 1.12)),
                     mat, scale=(1.2, 1, 0.55), u=6, v=4)
    else:
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        for k in (-0.07, 0, 0.07):
            p.box((0.012 * s, 0.1 * s, 0.006 * s), (x + k * s * ca, y + k * s * sa, z + 0.082 * s), '#fbd7cb', 'satin',
                  rot=(0, 0, rot + 18))


@model('fish_chopped')
def fish_chopped():
    p = Part('fish_chopped')
    fillet(p, FILLET, (0.0, 0.06, 0), 8, skin='#5aa7d6')
    fillet(p, FILLET, (0.0, -0.07, 0), -6, s=0.92, skin='#5aa7d6')
    p.done()


def fries(p, col, col2, loc=(0, 0, 0), n=9, s=1.0, mat='satin'):
    x, y, z = loc
    rnd = random.Random(17)
    for i in range(n):
        layer = 0 if i < 5 else 1
        a = rnd.uniform(-28, 28) + (90 if layer else 0)
        ox = (i % 5 - 2) * 0.05 * s if not layer else rnd.uniform(-0.05, 0.05) * s
        oy = rnd.uniform(-0.03, 0.03) * s if not layer else (i - 7) * 0.05 * s
        p.box((0.25 * s, 0.045 * s, 0.045 * s), (x + ox, y + oy, z + 0.025 * s + layer * 0.046 * s),
              col if i % 2 else col2, mat, rot=(rnd.uniform(-6, 6), rnd.uniform(-9, 9), 90 + a), bevel=0.01 * s,
              smooth=True, sharp=50)


@model('potato_chopped')
def potato_chopped():
    p = Part('potato_chopped')
    fries(p, POT_IN, '#f1d981')
    p.done()


# ---- cooked ------------------------------------------------------------------
@model('meat_cooked')
def meat_cooked():
    p = Part('meat_cooked')
    patty(p, PATTY, grill='#3f2212')
    p.done()


@model('fish_cooked')
def fish_cooked():
    p = Part('fish_cooked')
    fillet(p, GOLD, (0, 0, 0), 0, s=1.08, bumpy=True)
    p.done()


@model('potato_cooked')
def potato_cooked():
    p = Part('potato_cooked')
    fries(p, GOLD, '#f7c95a')
    p.done()


@model('charcoal')
def charcoal():
    p = Part('charcoal')
    rnd = random.Random(2)
    for (x, y, z, r) in ((0, 0, 0.07, 0.12), (0.1, 0.05, 0.05, 0.075), (-0.09, -0.04, 0.05, 0.08), (0.02, -0.1, 0.045, 0.06),
                         (-0.03, 0.1, 0.045, 0.065)):
        p.ico(r, (x, y, z), rnd.choice(['#1c1c20', '#26262b', '#131316']), 'matte',
              scale=(1 + rnd.random() * 0.3, 1, 0.75 + rnd.random() * 0.2), rot=(rnd.random() * 90, rnd.random() * 90, 0))
    e = glow('#ff5a1f', 2.5, 'ember')
    for (x, y, z) in ((0.05, -0.03, 0.125), (-0.05, 0.03, 0.12), (0.11, 0.06, 0.09), (-0.1, -0.05, 0.085)):
        p.ico(0.02, (x, y, z), '#ffffff', e, scale=(1.4, 0.6, 0.4), rot=(0, 0, rnd.random() * 180))
    p.done()


# ---- plated dishes -----------------------------------------------------------
@model('dish_soup')
def dish_soup():
    p = Part('dish_soup')
    plate_shape(p, '#ffffff', '#f1f3f6')
    # bowl
    p.lathe([(0, 0.03), (0.11, 0.03), (0.2, 0.09), (0.225, 0.15), (0.235, 0.155), (0.215, 0.158), (0.19, 0.1),
             (0, 0.07)], color='#ffffff', mat='gloss', n=18, smooth=True, sharp=50)
    p.cyl(0.208, 0.012, (0, 0, 0.134), '#e8452f', 'gloss', n=18)
    p.torus(0.085, 0.014, (0.01, 0.0, 0.142), '#fff3e0', 'gloss', n=14, m=4, arc=290, scale=(1, 1, 0.4))
    p.torus(0.035, 0.012, (0.0, 0.01, 0.142), '#fff3e0', 'gloss', n=10, m=4, arc=250, rot=(0, 0, 140), scale=(1, 1, 0.4))
    for (x, y, a) in ((-0.03, -0.02, 30), (0.035, 0.03, 100)):
        p.sphere(0.04, (x, y, 0.146), LEAF, 'satin', scale=(1.3, 0.65, 0.18), rot=(0, 0, a), u=8, v=4)
    p.done()


@model('dish_burger')
def dish_burger():
    p = Part('dish_burger')
    plate_shape(p, '#ffffff', '#f1f3f6')
    z = 0.032
    bun_bottom(p, z, 0.18)
    # frilly lettuce
    pts = []
    for k in range(20):
        t = k * 2 * math.pi / 20
        rr = 0.205 * (1 + 0.1 * math.sin(6 * t))
        pts.append((rr * math.cos(t), rr * math.sin(t)))
    p.prism(pts, 0.028, (0, 0, z + 0.09), LEAF_L, 'satin', bevel=0.008, smooth=True, sharp=60)
    patty(p, PATTY, z + 0.103, 0.185, 0.065)
    # cheese corners for colour
    p.box((0.27, 0.27, 0.014), (0, 0, z + 0.176), '#ffc93c', 'satin', rot=(0, 0, 45))
    bun_top(p, z + 0.184, 0.185)
    p.done()


@model('dish_fishchips')
def dish_fishchips():
    p = Part('dish_fishchips')
    plate_shape(p, '#ffffff', '#f1f3f6')
    fillet(p, GOLD, (-0.02, 0.08, 0.03), 10, s=0.98, bumpy=True)
    fries(p, GOLD, '#f7c95a', (0.02, -0.085, 0.03), n=9, s=0.86)
    # lemon wedge and a pot of sauce
    half = [(0.06 * math.cos(t), 0.06 * math.sin(t)) for t in [i * math.pi / 6 for i in range(7)]]
    p.prism(half, 0.04, (0.17, 0.09, 0.07), '#ffe14d', 'gloss', rot=(70, 0, -40), bevel=0.01, smooth=True, sharp=60)
    p.cyl(0.05, 0.05, (-0.175, -0.05, 0.058), '#ffffff', 'gloss', n=10, r2=0.058)
    p.cyl(0.048, 0.01, (-0.175, -0.05, 0.082), '#fff8dc', 'gloss', n=10)
    p.done()


@model('dish_salad')
def dish_salad():
    p = Part('dish_salad')
    plate_shape(p, '#ffffff', '#f1f3f6')
    rnd = random.Random(4)
    greens = (LEAF_L, LEAF, LEAF_D, '#7fcf4a')
    for i in range(16):  # ruffled heap of curled leaves, outer ring low, crown high
        k = i / 15
        a = i * 2.4
        d = 0.15 * (1 - k) ** 0.8
        sz = 0.12 * (1 - 0.4 * k)
        p.sphere(sz, (d * math.cos(a), d * math.sin(a), 0.07 + 0.1 * k), greens[i % 4], 'satin',
                 scale=(1, 0.3, 0.8), rot=(rnd.uniform(20, 60), 0, math.degrees(a) + 90), u=8, v=5)
    # tomato wedges on top and around
    for (x, y, z, a) in ((0.03, 0.02, 0.2, 40), (-0.07, 0.01, 0.15, 160), (0.17, -0.07, 0.06, 20), (-0.15, -0.13, 0.06, 250),
                         (0.0, 0.2, 0.06, 95), (-0.19, 0.1, 0.06, 330)):
        half = [(0.075 * math.cos(t), 0.075 * math.sin(t)) for t in [i * math.pi / 6 for i in range(7)]]
        p.prism(half, 0.045, (x, y, z), TOM, 'gloss', rot=(70, 0, a), bevel=0.01, segs=1, smooth=True, sharp=60)
        inner = [(0.058 * math.cos(t), 0.058 * math.sin(t) + 0.003) for t in [i * math.pi / 6 for i in range(7)]]
        p.prism(inner, 0.049, (x, y, z), TOM_L, 'gloss', rot=(70, 0, a))
    p.done()


@model('dish_fishburger')
def dish_fishburger():
    p = Part('dish_fishburger')
    plate_shape(p, '#ffffff', '#f1f3f6')
    z = 0.032
    bun_bottom(p, z, 0.15)
    pts = []
    for k in range(20):
        t = k * 2 * math.pi / 20
        rr = 0.165 * (1 + 0.1 * math.sin(6 * t))
        pts.append((rr * math.cos(t), rr * math.sin(t)))
    p.prism(pts, 0.026, (0, 0, z + 0.07), LEAF_L, 'satin', bevel=0.008, smooth=True, sharp=60)
    fillet(p, GOLD, (0.03, 0.01, z + 0.085), 20, s=1.4, bumpy=True)  # ~0.5 long vs 0.3 bun
    bun_top(p, z + 0.17, 0.15)
    p.done()


@model('dish_stew')
def dish_stew():
    p = Part('dish_stew')
    plate_shape(p, '#ffffff', '#f1f3f6')
    p.lathe([(0, 0.03), (0.11, 0.03), (0.2, 0.09), (0.225, 0.15), (0.235, 0.155), (0.215, 0.158), (0.19, 0.1),
             (0, 0.07)], color='#ffffff', mat='gloss', n=18, smooth=True, sharp=50)
    p.cyl(0.208, 0.012, (0, 0, 0.134), '#a8521e', 'gloss', n=18)
    rnd = random.Random(8)
    cols = ('#6b3a1f', '#f3dd8a', '#e5392b')
    spots = [(0.0, 0.0), (0.09, 0.03), (-0.09, 0.05), (0.03, -0.1), (-0.06, -0.09), (0.12, -0.07), (-0.13, -0.02),
             (0.05, 0.12), (-0.04, 0.13)]
    for i, (x, y) in enumerate(spots):
        c = cols[i % 3]
        z = 0.145
        if c == '#e5392b':
            p.sphere(0.034, (x, y, z), c, 'gloss', scale=(1.1, 1, 0.7), u=8, v=6)
        else:
            p.box((0.07, 0.065, 0.06), (x, y, z), c, 'satin', rot=(rnd.uniform(-12, 12), rnd.uniform(-12, 12), rnd.uniform(0, 90)),
                  bevel=0.014, segs=2, smooth=True, sharp=60)
    for (x, y) in ((-0.02, 0.06), (0.1, -0.02), (-0.1, -0.06)):  # glossy highlights and a parsley fleck
        p.sphere(0.014, (x, y, 0.142), '#ffb067', 'gloss', scale=(1.6, 1, 0.3), u=6, v=4)
    p.sphere(0.03, (0.06, -0.02, 0.15), LEAF, 'satin', scale=(1.3, 0.65, 0.2), rot=(0, 0, 30), u=8, v=4)
    p.done()
