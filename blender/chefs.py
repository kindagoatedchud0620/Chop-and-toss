"""The two bobblehead chefs. Smooth and bevelled. Articulated nodes:
chef > body, head (> eyes, hat), handL, handR, footL, footR, tail.   Front is -Y (glTF +Z)."""
import math, bpy
from kit import model, Part, empty, shade


R = 0.33      # head radius
CZ = 0.3      # head centre above the neck pivot
SX, SZ = 1.1, 0.94


def hp(az, el, k=1.0):
    """point on the head ellipsoid. az: degrees right of straight ahead, el: degrees up"""
    a, e = math.radians(az), math.radians(el)
    return (SX * R * k * math.cos(e) * math.sin(a), -R * k * math.cos(e) * math.cos(a), CZ + SZ * R * k * math.sin(e))


def hr(az, el, roll=0):
    """rotation that lays a flat (thin in Y) patch on the head at az/el"""
    return (-el, roll, az)


def toque(head, tilt=-10):
    hat = Part('hat', parent=head, loc=(0, 0.05, CZ + SZ * R - 0.085), rot=(tilt, 0, 0))
    hat.cyl(0.225, 0.16, (0, 0, 0.08), '#ffffff', 'matte', n=20, smooth=True, sharp=50, bevel=0.012)
    hat.lathe([(0.22, 0.14), (0.225, 0.18), (0.26, 0.26), (0.285, 0.34), (0.28, 0.42), (0.23, 0.485), (0.13, 0.52),
               (0, 0.53)], color='#ffffff', mat='matte', n=20, smooth=True, sharp=70, grad=('#e3e8ef', '#ffffff'))
    for i in range(10):
        a = math.radians(i * 36 + 18)
        hat.box((0.012, 0.03, 0.17), (0.236 * math.cos(a), 0.236 * math.sin(a), 0.225), '#cfd6e0', 'matte',
                rot=(0, 0, i * 36 + 18 + 90), taper=(1, 1))
    hat.done()
    return hat


def eyes(head, az=23, el=6, r=0.1, iris=None, k=0.0):
    ex, ey, ez = hp(az, el, 0.97)
    p = Part('eyes', parent=head, loc=(0, 0, ez))
    for s in (-1, 1):
        x, y, _ = hp(s * az, el, 0.955 + k)
        rot = hr(s * az, el)
        p.sphere(r, (x, y, 0), '#ffffff', 'gloss', scale=(1.0, 0.42, 1.14), rot=rot, u=14, v=10)
        x2, y2, _ = hp(s * (az - 2.5), el, 1.02 + k)
        if iris:
            p.sphere(r * 0.8, (x2, y2 + 0.012, -0.004), iris, 'gloss', scale=(1.0, 0.4, 1.12), rot=rot, u=12, v=8)
        p.sphere(r * 0.62, (x2, y2 - (0.004 if iris else -0.006), -0.004), '#16181d', 'gloss', scale=(1.0, 0.45, 1.14), rot=rot,
                 u=12, v=8)
        x3, y3, _ = hp(s * (az - 2.5) + 5, el, 1.085 + k)
        p.sphere(r * 0.24, (x3, y3, 0.04), '#ffffff', 'gloss', u=8, v=6)
        x4, y4, _ = hp(s * (az - 2.5) - 6, el, 1.08 + k)
        p.sphere(r * 0.12, (x4, y4, -0.035), '#ffffff', 'gloss', u=6, v=4)
    p.done()


def body_part(root, scarf, fur):
    body = Part('body', parent=root, loc=(0, 0, 0.2))
    body.sphere(0.25, (0, 0, 0.15), '#ffffff', 'satin', scale=(1.0, 0.9, 1.04), u=18, v=12, grad=('#dfe5ee', '#ffffff'))
    # fur peeking out at the bottom
    body.sphere(0.2, (0, 0, 0.02), fur, 'matte', scale=(1.0, 0.9, 0.7), u=14, v=8)
    # double-breasted buttons
    for sx in (-0.065, 0.065):
        for z in (0.1, 0.2):
            yy = -0.9 * 0.25 * math.sqrt(max(0, 1 - ((z - 0.15) / 0.26) ** 2 - (sx / 0.25) ** 2))
            body.sphere(0.022, (sx, yy - 0.004, z), '#3a4350', 'gloss', scale=(1, 0.5, 1), u=8, v=6)
    # neckerchief in the player colour
    body.torus(0.165, 0.05, (0, 0, 0.345), scarf, 'satin', n=16, m=8, scale=(1, 0.92, 0.8))
    body.sphere(0.055, (0.03, -0.17, 0.33), scarf, 'satin', scale=(1, 0.8, 0.9), u=8, v=6)
    body.cone_blob(0.05, 0.14, (0.0, -0.19, 0.32), scarf, 'satin', n=6, rot=(170, 20, 0), smooth=True)
    body.cone_blob(0.045, 0.12, (0.06, -0.185, 0.32), shade(scarf, 0.85), 'satin', n=6, rot=(165, -25, 0), smooth=True)
    body.done()
    return body


def paws(root, col, toe, pad='#f7a6b4'):
    for name, s in (('handL', -1), ('handR', 1)):
        p = Part(name, parent=root, loc=(s * 0.31, -0.03, 0.4))
        p.sphere(0.092, (0, 0, 0), col, 'matte', scale=(1, 1.05, 0.92), u=12, v=8)
        for k in (-1, 0, 1):
            p.sphere(0.036, (k * 0.045, -0.078, -0.012), toe, 'matte', u=8, v=6)
        p.sphere(0.035, (0, -0.02, -0.075), pad, 'satin', scale=(1.2, 1, 0.5), u=8, v=5)
        # white jacket cuff
        p.torus(0.075, 0.03, (0, 0.06, 0.01), '#ffffff', 'satin', rot=(90, 0, 0), n=12, m=6, scale=(1, 1, 1))
        p.done()
    for name, s in (('footL', -1), ('footR', 1)):
        p = Part(name, parent=root, loc=(s * 0.125, -0.02, 0.0))
        p.sphere(0.1, (0, -0.02, 0.066), toe, 'matte', scale=(1.0, 1.4, 0.66), u=12, v=8)
        for k in (-1, 0, 1):
            p.sphere(0.03, (k * 0.045, -0.145, 0.045), shade(toe, 0.9), 'matte', u=6, v=4)
        p.done()


@model('chef_cat', anim=True)
def chef_cat():
    F, FD, FL = '#f59b3c', '#d66f1c', '#fff0d9'
    root = empty('chef')
    body_part(root, '#2f8dff', F)
    head = Part('head', parent=root, loc=(0, 0, 0.56))
    head.sphere(R, (0, 0, CZ), F, 'matte', scale=(SX, 1.0, SZ), u=24, v=16, grad=('#f8b057', F))
    # cheeks fluff and white muzzle
    for s in (-1, 1):
        head.cone_blob(0.09, 0.2, hp(s * 78, -22, 0.82), F, 'matte', n=6, rot=(0, s * 108, 0), smooth=True)
        head.cone_blob(0.07, 0.16, hp(s * 70, -34, 0.84), '#f8b057', 'matte', n=6, rot=(0, s * 122, 0), smooth=True)
        head.sphere(0.092, hp(s * 11, -20, 0.93), FL, 'matte', scale=(1.15, 0.8, 0.9), u=12, v=8)
        # blush
        head.sphere(0.05, hp(s * 43, -15, 0.985), '#ff8f7a', 'matte', scale=(1.2, 0.2, 0.75), rot=hr(s * 43, -15), u=8, v=5)
        # whiskers
        for dz, ang in ((0.0, 8), (-0.035, -8)):
            x, y, z = hp(s * 30, -20, 1.0)
            head.box((0.2, 0.01, 0.01), (x + s * 0.09, y - 0.02, z + dz), '#fff8ec', 'matte', rot=(0, -s * ang, -s * 24))
    head.sphere(0.07, hp(0, -31, 0.93), FL, 'matte', scale=(1.1, 0.8, 0.8), u=10, v=6)
    x, y, z = hp(0, -11, 1.03)
    head.sphere(0.034, (x, y - 0.012, z), '#ff7f96', 'gloss', scale=(1.25, 0.8, 0.8), u=8, v=6)
    head.torus(0.03, 0.009, (0.03, y - 0.03, z - 0.05), '#7a3d16', 'matte', rot=(-100, 0, 0), n=8, m=4, arc=180,
               smooth=False, scale=(1, 1, 1))
    head.torus(0.03, 0.009, (-0.03, y - 0.03, z - 0.05), '#7a3d16', 'matte', rot=(-100, 0, 0), n=8, m=4, arc=180,
               smooth=False)
    # tabby stripes: forehead and sides
    for az, ln in ((-15, 0.075), (0, 0.095), (15, 0.075)):
        head.sphere(ln, hp(az, 37, 0.985), FD, 'matte', scale=(0.3, 0.16, 1.0), rot=hr(az, 37), u=8, v=6)
    for s in (-1, 1):
        for el, ln in ((14, 0.085), (0, 0.075)):
            head.sphere(ln, hp(s * 72, el, 0.985), FD, 'matte', scale=(1.0, 0.16, 0.26), rot=hr(s * 72, el), u=8, v=6)
    # ears poke out through the hat band
    for s in (-1, 1):
        ex, ey, ez = hp(s * 50, 50, 0.92)
        head.cone_blob(0.13, 0.31, (ex, 0.01, ez), F, 'matte', n=8, rot=(0, s * 30, 0), smooth=True, scale=(1, 0.62, 1))
        head.cone_blob(0.085, 0.23, (ex + s * 0.006, -0.035, ez + 0.03), '#ffb3a6', 'matte', n=8, rot=(0, s * 30, 0),
                       smooth=True, scale=(1, 0.5, 1))
    head.done()
    eyes(head, az=24, el=7, r=0.105, iris='#7fd957')
    toque(head)
    paws(root, F, FL)
    tail = Part('tail', parent=root, loc=(0, 0.2, 0.26))
    pts = [(0, 0.0, 0.0), (0, 0.09, 0.04), (0, 0.17, 0.12), (0, 0.21, 0.23), (0, 0.19, 0.34), (0, 0.13, 0.42),
           (0, 0.05, 0.44)]
    for i, pt in enumerate(pts):
        tail.sphere(0.07 - i * 0.004, pt, FD if i in (2, 4) else (FL if i == 6 else F), 'matte', u=10, v=7)
    tail.done()
    animate(root)


@model('chef_raccoon', anim=True)
def chef_raccoon():
    F, FD, FL, DK = '#9aa1ab', '#6b727d', '#f1f4f8', '#2d3139'
    root = empty('chef')
    body_part(root, '#ff4d5e', F)
    head = Part('head', parent=root, loc=(0, 0, 0.56))
    head.sphere(R, (0, 0, CZ), F, 'matte', scale=(SX, 1.0, SZ), u=24, v=16, grad=('#b3b9c2', F))
    for s in (-1, 1):
        # cheek fluff
        head.cone_blob(0.1, 0.24, hp(s * 76, -18, 0.8), FL, 'matte', n=6, rot=(0, s * 104, 0), smooth=True)
        head.cone_blob(0.085, 0.2, hp(s * 68, -32, 0.82), '#d5dae1', 'matte', n=6, rot=(0, s * 120, 0), smooth=True)
        head.cone_blob(0.075, 0.17, hp(s * 80, -4, 0.84), F, 'matte', n=6, rot=(0, s * 90, 0), smooth=True)
        # bandit mask sweeping from the nose bridge out to the cheek
        head.sphere(0.17, hp(s * 30, 4, 0.955), DK, 'matte', scale=(1.25, 0.2, 0.74), rot=hr(s * 30, 4, s * 16), u=14, v=8)
        head.sphere(0.1, hp(s * 58, -5, 0.955), DK, 'matte', scale=(1.2, 0.2, 0.8), rot=hr(s * 58, -5, s * 24), u=10, v=6)
        # white brows above the mask
        head.sphere(0.12, hp(s * 27, 30, 0.965), FL, 'matte', scale=(1.25, 0.16, 0.42), rot=hr(s * 27, 30, s * 14), u=10, v=6)
        # round ears: dark rim, light centre
        ex, ey, ez = hp(s * 52, 50, 0.95)
        head.sphere(0.125, (ex, 0.0, ez + 0.06), DK, 'matte', scale=(1, 0.5, 1), rot=(0, s * 26, 0), u=12, v=8)
        head.sphere(0.08, (ex + s * 0.004, -0.045, ez + 0.062), FL, 'matte', scale=(1, 0.36, 1), rot=(0, s * 26, 0), u=10, v=6)
    # forehead blaze and snout
    head.sphere(0.1, hp(0, 36, 0.975), FD, 'matte', scale=(0.5, 0.16, 1.0), rot=hr(0, 36), u=10, v=6)
    head.sphere(0.115, hp(0, -21, 0.96), FL, 'matte', scale=(1.25, 1.0, 0.82), u=14, v=9)
    x, y, z = hp(0, -15, 1.0)
    head.sphere(0.042, (x, y - 0.085, z - 0.005), '#1d2026', 'gloss', scale=(1.25, 0.85, 0.85), u=10, v=6)
    head.torus(0.032, 0.009, (0.032, y - 0.07, z - 0.062), '#3a2f33', 'matte', rot=(-100, 0, 0), n=8, m=4, arc=180,
               smooth=False)
    head.torus(0.032, 0.009, (-0.032, y - 0.07, z - 0.062), '#3a2f33', 'matte', rot=(-100, 0, 0), n=8, m=4, arc=180,
               smooth=False)
    head.done()
    eyes(head, az=25, el=6, r=0.1, k=0.045)
    toque(head)
    paws(root, DK, '#3a3f49', pad='#8d93a0')
    tail = Part('tail', parent=root, loc=(0, 0.2, 0.26))
    pts = [(0, 0.0, 0.0), (0, 0.1, 0.03), (0, 0.2, 0.1), (0, 0.27, 0.2), (0, 0.29, 0.32), (0, 0.25, 0.43)]
    rad = [0.075, 0.095, 0.11, 0.115, 0.105, 0.08]
    for i, pt in enumerate(pts):
        tail.sphere(rad[i], pt, DK if i % 2 else F, 'matte', u=10, v=7)
    tail.done()
    animate(root)


# -- animation clips ('exhausted', 'victory') ---------------------------------
# Poses are sampled per frame (30 fps) into one NLA track per object per clip; the
# exporter merges same-named tracks into one glTF animation. Blender axes: front -Y, up +Z.
FPS = 30


def ss(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def keys(t, ks):
    """smoothstep through [(time, value | tuple)]"""
    if t <= ks[0][0]:
        return ks[0][1]
    for (t0, a), (t1, b) in zip(ks, ks[1:]):
        if t <= t1:
            u = ss((t - t0) / (t1 - t0))
            return tuple(x + (y - x) * u for x, y in zip(a, b)) if isinstance(a, tuple) else a + (b - a) * u
    return ks[-1][1]


def squash(q):
    """body scale for squash amount q (>0 squash, <0 stretch), volume kept"""
    z = 1 - 0.18 * q
    xy = 1 / math.sqrt(z)
    return (xy, xy, z)


def exhausted(t):
    w = 2 * math.pi / 2.4
    br = math.sin(2 * w * t)
    s = 0.985 + 0.055 * br
    r = keys(t, [(0, 0.0), (0.45, 1.0), (1.9, 1.0), (2.4, 0.0)])      # hand-to-brow amount
    ph = 2 * math.pi * 2 * (t - 0.45) / 1.45                          # two wipes
    wipe = math.sin(ph) if 0.45 <= t <= 1.9 else 0.0
    hang, brow = (0.36, 0.0, 0.25), (0.1 + 0.11 * wipe, -0.36, 1.0)
    hr_ = tuple(h + r * (b - h) for h, b in zip(hang, brow))
    sag = math.sin(w * t + 1)
    return {
        'chef': ((0, 0, 0), (0, 0, 0), (1, 1, 1)),
        'body': ((0, 0, 0.2), (8 + 2 * br, 0, 0), (1 / math.sqrt(s), 1 / math.sqrt(s), s)),
        'head': ((0, 0, 0.56 + 0.38 * (s - 1) - 0.03), (20 + 3 * math.sin(2 * w * t + 0.5), 0, 6 * math.sin(w * t)),
                 (1, 1, 1)),
        'hat': ((0.03, 0.05, 0.495), (-10 + 3 * sag, 20 + 3 * sag, 0), (1, 1, 1)),
        'handL': ((-0.36, 0.0, 0.25 + 0.01 * br), (6 * br, 0, 0), (1, 1, 1)),
        'handR': (hr_, (-75 * r, 0, 25 * r * wipe), (1, 1, 1)),
        'footL': ((-0.16, -0.02, 0), (0, 0, -9), (1, 1, 1)),
        'footR': ((0.16, -0.02, 0), (0, 0, 9), (1, 1, 1)),
        'tail': ((0, 0.2, 0.22), (-55 + 10 * math.sin(w * t), 12 * math.sin(w * t + 1.5), 0), (1, 1, 1)),
    }


def victory(t):
    if 19 <= t * FPS <= 20:
        t = 0.65                       # hold the apex pose across its two neighbour frames
    q = keys(t, [(0, 0.0), (0.25, 1.0), (0.4, -0.5), (0.65, 0.0), (1.0, 0.0), (1.12, 1.0), (1.3, -0.15), (1.6, 0.0)])
    qb = max(q, 0)
    if t < 0.65:
        h = 0.55 * (1 - (1 - max(0, (t - 0.25) / 0.4)) ** 2)
    else:
        h = 0.55 * (1 - min(1, (t - 0.65) / 0.35) ** 2)
    air = ss((t - 0.28) / 0.15) * (1 - ss((t - 0.95) / 0.07))
    env = ss((t - 0.25) / 0.2) * (1 - ss((t - 1.05) / 0.4))
    whip = env * math.sin(2 * math.pi * 3 * (t - 0.25))
    bounce = keys(t, [(0, 0.0), (0.4, 0.0), (0.55, 0.07), (0.8, 0.02), (1.0, 0.0), (1.6, 0.0)])
    R0, L0 = (0.31, -0.03, 0.4), (-0.31, -0.03, 0.4)
    hR = keys(t, [(0, R0), (0.25, (0.36, 0.12, 0.25)), (0.45, (0.38, -0.25, 0.78)), (0.65, (0.24, -0.5, 1.0)),
                  (1.0, (0.3, -0.3, 0.85)), (1.12, (0.36, 0.05, 0.28)), (1.3, (0.33, -0.03, 0.45)), (1.6, R0)])
    hL = keys(t, [(0, L0), (0.25, (-0.36, 0.12, 0.25)), (0.45, (-0.45, -0.1, 0.8)), (0.65, (-0.58, -0.08, 1.05)),
                  (1.0, (-0.5, -0.05, 0.9)), (1.12, (-0.36, 0.05, 0.28)), (1.3, (-0.33, -0.03, 0.45)), (1.6, L0)])
    rR = keys(t, [(0, (0, 0, 0)), (0.45, (-30, 0, 0)), (0.65, (-90, 0, 0)), (1.0, (-60, 0, 0)), (1.3, (0, 0, 0)),
                  (1.6, (0, 0, 0))])
    rL = keys(t, [(0, (0, 0, 0)), (0.65, (-15, 0, -35)), (1.0, (-10, 0, -25)), (1.3, (0, 0, 0)), (1.6, (0, 0, 0))])
    return {
        'chef': ((0, 0, h - 0.08 * qb), (0, 0, 0), (1, 1, 1)),
        'body': ((0, 0, 0.2), (10 * qb - 8 * air, 0, 0), squash(q)),
        'head': ((0, 0, 0.56 + 0.38 * (squash(q)[2] - 1)),
                 (8 * qb - 14 * keys(t, [(0, 0.0), (0.4, 0.0), (0.65, 1.0), (1.0, 0.0), (1.6, 0.0)]), 0, 5 * whip),
                 (1, 1, 1)),
        'hat': ((0, 0.05, 0.5252 + bounce), (-10 - 6 * whip, 0, 4 * whip), (1, 1, 1)),
        'handL': (hL, rL, (1, 1, 1)),
        'handR': (hR, rR, (1, 1, 1)),
        'footL': ((-0.125, -0.02, 0.08 * qb), (25 * air, 0, 0), (1 + 0.1 * qb, 1 + 0.1 * qb, 1 - 0.3 * qb)),
        'footR': ((0.125, -0.02, 0.08 * qb), (25 * air, 0, 0), (1 + 0.1 * qb, 1 + 0.1 * qb, 1 - 0.3 * qb)),
        'tail': ((0, 0.2, 0.26 - 0.04 * qb), (-20 * air + 10 * qb, 0, 40 * whip), (1, 1, 1)),
    }


def animate(root):
    """bake both clips onto the chef nodes as NLA tracks, then restore the rest pose"""
    bpy.context.scene.render.fps = FPS
    obs = {o.name: o for o in [root] + list(root.children_recursive)}
    rest = {n: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale)) for n, o in obs.items()}
    for clip, fn, secs in (('exhausted', exhausted, 2.4), ('victory', victory, 1.6)):
        n = round(secs * FPS)
        for name, ob in obs.items():
            if name not in fn(0):
                continue
            ob.animation_data_create()
            for f in range(n + 1):
                loc, rot, sc = fn(f / FPS if f < n else 0.0)[name]   # last frame == first frame
                ob.location, ob.scale = loc, sc
                ob.rotation_euler = [math.radians(a) for a in rot]
                for path in ('location', 'rotation_euler', 'scale'):
                    ob.keyframe_insert(path, frame=f)
            act = ob.animation_data.action
            act.name = f'{clip}.{name}'
            tr = ob.animation_data.nla_tracks.new()
            tr.name = clip
            tr.strips.new(clip, 0, act)
            ob.animation_data.action = None
    for n, o in obs.items():
        o.location, o.rotation_euler, o.scale = rest[n]
