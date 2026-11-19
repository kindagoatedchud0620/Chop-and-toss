"""Modelling kit for CHOP & TOSS. Runs inside headless Blender (bpy).

Every model is a function registered with @model("name"). build() resets the
scene, runs the function and exports assets/models/<name>.glb.

Geometry is assembled with bmesh into named Parts (one glTF node each, so the
game can animate heads, hands, cleavers and so on). Colour is stored per face
corner in a linear float colour attribute, so a whole part renders with one
material per surface class (matte / satin / gloss / metal) and very few draws.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'models'))
MODELS = {}
ANIMATED = set()  # models that export their NLA tracks as glTF animations

# surface classes: roughness, metallic
CLASSES = {
    'matte': (0.86, 0.0),
    'satin': (0.55, 0.0),
    'gloss': (0.22, 0.0),
    'metal': (0.30, 1.0),
    'brushed': (0.48, 0.85),
}


def model(name, anim=False):
    def deco(fn):
        MODELS[name] = fn
        if anim:
            ANIMATED.add(name)
        return fn
    return deco


def lin(c):
    """'#rrggbb' or (r,g,b) sRGB -> linear rgba tuple"""
    if isinstance(c, str):
        c = c.lstrip('#')
        c = tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def shade(c, k):
    """scale an sRGB hex colour's brightness by k (returns rgb tuple, sRGB)"""
    c = c.lstrip('#')
    r, g, b = (int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (min(1, r * k), min(1, g * k), min(1, b * k))


def _material(cls):
    name = cls if isinstance(cls, str) else cls[0]
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if isinstance(cls, str):
        rough, metal = CLASSES[cls]
        bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
    else:  # glow material: ('glow_name', hex, strength)
        _, col, strength = cls
        bsdf.inputs['Base Color'].default_value = lin(col)
        bsdf.inputs['Roughness'].default_value = 0.6
        bsdf.inputs['Emission Color'].default_value = lin(col)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m


def glow(col, strength=2.0, name=None):
    """returns a material spec for an emissive surface"""
    return (name or ('glow_' + col.lstrip('#') + '_' + str(strength).replace('.', '_')), col, strength)


def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    e = Euler([math.radians(a) for a in rot], 'XYZ')
    return Matrix.LocRotScale(Vector(loc), e, Vector(scale))


class Part:
    """One named glTF node. Add primitives, then call done()."""

    def __init__(self, name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        self.name = name
        self.parent = parent
        self.loc, self.rot, self.scale = loc, rot, scale
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.mats = []
        self.obj = None

    # -- internal -----------------------------------------------------------
    def _mat_index(self, cls):
        key = cls if isinstance(cls, str) else cls[0]
        for i, (k, _) in enumerate(self.mats):
            if k == key:
                return i
        self.mats.append((key, cls))
        return len(self.mats) - 1

    def _merge(self, tbm, color, mat='matte', smooth=False, sharp=38, m=None, grad=None):
        """copy temp bmesh into the part. grad=(hex_bottom, hex_top) gives a vertical colour ramp."""
        if m is None:
            m = Matrix.Identity(4)
        tbm.normal_update()
        mi = self._mat_index(mat)
        c = lin(color)
        vmap = {}
        zs = [(m @ v.co).z for v in tbm.verts]
        zmin, zmax = (min(zs), max(zs)) if zs else (0, 1)
        for v in tbm.verts:
            vmap[v] = self.bm.verts.new(m @ v.co)
        flip = m.determinant() < 0
        if grad:
            g0, g1 = lin(grad[0]), lin(grad[1])
        for f in tbm.faces:
            vs = [vmap[v] for v in f.verts]
            if flip:
                vs.reverse()
            try:
                nf = self.bm.faces.new(vs)
            except ValueError:
                continue
            nf.material_index = mi
            nf.smooth = smooth
            for lp in nf.loops:
                if grad:
                    t = (lp.vert.co.z - zmin) / max(1e-6, zmax - zmin)
                    lp[self.col] = tuple(g0[i] * (1 - t) + g1[i] * t for i in range(4))
                else:
                    lp[self.col] = c
        if smooth:
            lim = math.radians(sharp)
            for e in tbm.edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
                    ne = self.bm.edges.get((vmap[e.verts[0]], vmap[e.verts[1]]))
                    if ne:
                        ne.smooth = False
        tbm.free()
        return self

    # -- primitives ---------------------------------------------------------
    def box(self, size, loc=(0, 0, 0), color='#ffffff', mat='matte', rot=(0, 0, 0), bevel=0.0, segs=1,
            smooth=False, taper=None, grad=None, sharp=38):
        """taper=(sx, sy): scale of the top face relative to the bottom"""
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        for v in t.verts:
            v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
            if taper and v.co.z > 0:
                v.co.x *= taper[0]; v.co.y *= taper[1]
        if bevel > 0:
            bmesh.ops.bevel(t, geom=t.edges[:], offset=bevel, segments=segs, profile=0.5, affect='EDGES')
        return self._merge(t, color, mat, smooth, sharp, xf(loc, rot), grad)

    def sphere(self, r, loc=(0, 0, 0), color='#ffffff', mat='matte', scale=(1, 1, 1), rot=(0, 0, 0), u=20, v=12,
               smooth=True, grad=None):
        t = bmesh.new()
        bmesh.ops.create_uvsphere(t, u_segments=u, v_segments=v, radius=r)
        return self._merge(t, color, mat, smooth, 80, xf(loc, rot, scale), grad)

    def ico(self, r, loc=(0, 0, 0), color='#ffffff', mat='matte', scale=(1, 1, 1), rot=(0, 0, 0), sub=1,
            smooth=False, grad=None):
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=sub, radius=r)
        return self._merge(t, color, mat, smooth, 80, xf(loc, rot, scale), grad)

    def cyl(self, r, h, loc=(0, 0, 0), color='#ffffff', mat='matte', r2=None, n=12, rot=(0, 0, 0), smooth=False,
            bevel=0.0, segs=2, scale=(1, 1, 1), grad=None, sharp=38, caps=True):
        """cylinder / cone along +Z, centred on loc"""
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=caps, cap_tris=False, segments=n, radius1=r,
                              radius2=r if r2 is None else r2, depth=h)
        if bevel > 0:
            lim = math.radians(60)
            es = [e for e in t.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim]
            bmesh.ops.bevel(t, geom=es, offset=bevel, segments=segs, profile=0.5, affect='EDGES')
        return self._merge(t, color, mat, smooth, sharp, xf(loc, rot, scale), grad)

    def torus(self, R, r, loc=(0, 0, 0), color='#ffffff', mat='matte', n=16, m=8, rot=(0, 0, 0), smooth=True,
              scale=(1, 1, 1), arc=360):
        t = bmesh.new()
        rings = []
        full = arc >= 360
        cnt = n if full else n + 1
        for i in range(cnt):
            a = math.radians(arc) * i / n
            ring = []
            for j in range(m):
                b = 2 * math.pi * j / m
                rr = R + r * math.cos(b)
                ring.append(t.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
            rings.append(ring)
        for i in range(n):
            a, b = rings[i], rings[(i + 1) % cnt]
            for j in range(m):
                t.faces.new((a[j], b[j], b[(j + 1) % m], a[(j + 1) % m]))
        if not full:
            t.faces.new(list(reversed(rings[0])))
            t.faces.new(rings[-1])
        return self._merge(t, color, mat, smooth, 80, xf(loc, rot, scale))

    def lathe(self, profile, loc=(0, 0, 0), color='#ffffff', mat='matte', n=16, rot=(0, 0, 0), smooth=True,
              sharp=38, scale=(1, 1, 1), grad=None):
        """revolve [(radius, z), ...] (listed bottom-up on the outside) around Z"""
        t = bmesh.new()
        rings = []
        for (r, z) in profile:
            if r <= 1e-6:
                rings.append([t.verts.new((0, 0, z))])
            else:
                rings.append([t.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z))
                              for i in range(n)])
        for k in range(len(rings) - 1):
            a, b = rings[k], rings[k + 1]
            for i in range(n):
                j = (i + 1) % n
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    t.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1:
                    t.faces.new((a[i], a[j], b[0]))
                else:
                    t.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(t, faces=t.faces[:])
        return self._merge(t, color, mat, smooth, sharp, xf(loc, rot, scale), grad)

    def prism(self, pts, h, loc=(0, 0, 0), color='#ffffff', mat='matte', rot=(0, 0, 0), smooth=False, bevel=0.0,
              segs=2, scale=(1, 1, 1), sharp=38, grad=None):
        """extrude a 2D outline [(x, y), ...] (counter-clockwise) by h along +Z, centred in Z"""
        t = bmesh.new()
        bot = [t.verts.new((x, y, -h / 2)) for (x, y) in pts]
        top = [t.verts.new((x, y, h / 2)) for (x, y) in pts]
        n = len(pts)
        t.faces.new(list(reversed(bot)))
        t.faces.new(top)
        for i in range(n):
            j = (i + 1) % n
            t.faces.new((bot[i], bot[j], top[j], top[i]))
        bmesh.ops.recalc_face_normals(t, faces=t.faces[:])
        if bevel > 0:
            bmesh.ops.bevel(t, geom=t.edges[:], offset=bevel, segments=segs, profile=0.5, affect='EDGES')
        return self._merge(t, color, mat, smooth, sharp, xf(loc, rot, scale), grad)

    def cone_blob(self, r, h, loc=(0, 0, 0), color='#ffffff', mat='matte', n=6, rot=(0, 0, 0), smooth=False,
                  scale=(1, 1, 1), grad=None, twist=0.0):
        """teardrop / flame shape: rounded base rising to a point"""
        prof = [(0, 0), (r * 0.75, h * 0.08), (r, h * 0.28), (r * 0.8, h * 0.52), (r * 0.42, h * 0.78), (0, h)]
        t = bmesh.new()
        rings = []
        for k, (rr, z) in enumerate(prof):
            if rr <= 1e-6:
                rings.append([t.verts.new((0, 0, z))])
            else:
                off = twist * k
                rings.append([t.verts.new((rr * math.cos(2 * math.pi * i / n + off),
                                           rr * math.sin(2 * math.pi * i / n + off), z)) for i in range(n)])
        for k in range(len(rings) - 1):
            a, b = rings[k], rings[k + 1]
            for i in range(n):
                j = (i + 1) % n
                if len(a) == 1:
                    t.faces.new((a[0], b[j], b[i]))
                elif len(b) == 1:
                    t.faces.new((a[i], a[j], b[0]))
                else:
                    t.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(t, faces=t.faces[:])
        return self._merge(t, color, mat, smooth, 80, xf(loc, rot, scale), grad)

    # -- finish -------------------------------------------------------------
    def done(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        if 'Col' in me.color_attributes:
            me.color_attributes.active_color = me.color_attributes['Col']
            me.color_attributes.render_color_index = me.color_attributes.find('Col')
        for key, cls in self.mats:
            me.materials.append(_material(cls))
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        self._place(ob)
        self.obj = ob
        return ob

    def _place(self, ob):
        if self.parent is not None:
            ob.parent = self.parent.obj if isinstance(self.parent, Part) else self.parent
        ob.location = self.loc
        ob.rotation_euler = Euler([math.radians(a) for a in self.rot], 'XYZ')
        s = self.scale
        ob.scale = (s, s, s) if isinstance(s, (int, float)) else s


def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent.obj if isinstance(parent, Part) else parent
    ob.location = loc
    ob.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    return ob


def reset():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


def build(names=None):
    os.makedirs(OUT, exist_ok=True)
    todo = names or sorted(MODELS)
    for name in todo:
        reset()
        MODELS[name]()
        path = os.path.join(OUT, name + '.glb')
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_selection=False, export_apply=False, export_yup=True,
            export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE',
            export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
            export_animations=name in ANIMATED, export_animation_mode='NLA_TRACKS',
            export_optimize_animation_size=False, export_skins=False, export_morph=False, export_extras=False,
            export_tangents=False, export_cameras=False, export_lights=False)
        tris = sum(len(o.data.loop_triangles) if (o.type == 'MESH' and not o.data.calc_loop_triangles()) else 0
                   for o in bpy.data.objects)
        print(f'  {name}.glb  {os.path.getsize(path) / 1024:.1f} kB  {tris} tris')
