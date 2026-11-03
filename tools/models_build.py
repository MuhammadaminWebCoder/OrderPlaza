"""Blender: turn the heavy 3ds Max exports from _manba into small Draco GLBs for the maket.
blender -b --factory-startup --python tools/models_build.py -- <name> [<name> ...]
Every GLB: metres, origin at the bottom centre, front facing +z (glTF), plain PBR materials, no textures."""
import bpy, bmesh, sys, os
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_manba', '42-', '3D MAX', '3D max 2')
OUT = os.path.join(ROOT, 'assets', 'models')

def mat(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    for n in [n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE']: m.node_tree.nodes.remove(n)
    p.inputs['Base Color'].default_value = (*[pow(int(color[i:i + 2], 16) / 255, 2.2) for i in (1, 3, 5)], 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m

# per part (loose piece) material choice: f(lo, hi, size) -> material name, or None to drop the part
def bed_cls(lo, hi, s):
    c = (lo + hi) / 2
    if abs(c.x) > 1.35 or abs(c.y) > 1.5: return None            # nightstand, lamp, rug
    if lo.y > 1.0: return 'upholstery'                           # channel-tufted headboard
    if hi.z < 0.42 and s.x > 2.0: return 'upholstery'            # base
    return 'linen'

def leaf_cls(lo, hi, s):
    c = (lo + hi) / 2
    if not (-0.02 < lo.x and hi.x < 0.8): return None           # keep the third leaf only, no jambs
    if s.y > 0.06: return None
    return 'leaf'

MODELS = {
    'bed': dict(src='3DS MAX/OBJ.obj', unit=0.001, cls=bed_cls, tris=36000, size_x=2.0,
                mats={'upholstery': ('#8C8579', 0.95), 'linen': ('#EEEBE4', 0.9)}),
    'door': dict(src='3DS MAX/textures/Door_Vogue/vogue.obj', unit=0.001, cls=leaf_cls, tris=4000,
                 mats={'leaf': ('#FFFFFF', 0.6)}),
    'fridge': dict(src='3DS MAX/SMEG_FA55PCIL.FBX', unit=1, tris=9000, recolor='steel'),
    'garden': dict(src='Interyer/2023 25 10 new/3DS MAX/Vertical Garden 07.fbx', unit=1, tris=26000,
                   recolor='garden', front='+x', size_y=1.3),
}

def load(cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = os.path.join(SRC, cfg['src'])
    if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
    else: bpy.ops.wm.obj_import(filepath=path)
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in bpy.context.scene.objects: o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.data.transform(Matrix.Scale(cfg['unit'], 4))
    return ob

def classify(ob, cfg):
    """split into loose parts, give each a material from cfg['cls'] or drop it"""
    names = list(cfg['mats'])
    ob.data.materials.clear()
    for n in names: ob.data.materials.append(mat(n, *cfg['mats'][n]))
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    seen, drop = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        island, stack = [], [f]; seen.add(f.index)
        while stack:
            g = stack.pop(); island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        vs = {v for g in island for v in g.verts}
        lo = Vector([min(v.co[i] for v in vs) for i in range(3)]); hi = Vector([max(v.co[i] for v in vs) for i in range(3)])
        k = cfg['cls'](lo, hi, hi - lo)
        if k is None: drop += island
        else:
            for g in island: g.material_index = names.index(k)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(ob.data); bm.free()

def recolor(ob, kind):
    area = [0.0] * len(ob.data.materials)
    for p in ob.data.polygons: area[p.material_index] += p.area
    backing = area.index(max(area))                          # the garden's round board is the biggest surface
    for i, m in enumerate(ob.data.materials):
        if kind == 'garden' and i == backing:
            ob.data.materials[i] = mat(f'gr{i}', '#2B302B', 0.9); continue
        if kind == 'steel':
            dark = 'display' in m.name.lower() or i in (0, 1, 2)
            ob.data.materials[i] = mat(f'fr{i}', '#2A2D31' if dark else '#C4C8CC', 0.25 if dark else 0.38, 0.0 if dark else 0.85)
        elif kind == 'garden':
            greens = ['#3E5A2E', '#55703A', '#2F4A2A', '#6B7F3F', '#466B3B', '#7A8C4A', '#38542F']
            ob.data.materials[i] = mat(f'gr{i}', greens[i % len(greens)], 0.95)

def decimate(ob, tris):
    ob.data.calc_loop_triangles(); n = len(ob.data.loop_triangles)
    if n > tris:
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = tris / n; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.calc_loop_triangles(); return n, len(ob.data.loop_triangles)

def normalise(ob, cfg):
    # front to Blender -Y (glTF +z), then origin to bottom centre, then optional target size
    rot = {'-y': 0, '+y': 180, '+x': -90, '-x': 90}[cfg.get('front', '-y')]
    ob.data.transform(Matrix.Rotation(rot * 3.14159265 / 180, 4, 'Z'))
    pts = [v.co for v in ob.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    ob.data.transform(Matrix.Translation(Vector(((lo.x + hi.x) / -2, (lo.y + hi.y) / -2, -lo.z))))
    s = hi - lo
    k = cfg['size_x'] / s.x if 'size_x' in cfg else cfg['size_y'] / s.z if 'size_y' in cfg else 1
    ob.data.transform(Matrix.Scale(k, 4))
    return [round(v * k, 3) for v in s]

for name in sys.argv[sys.argv.index('--') + 1:]:
    cfg = MODELS[name]
    ob = load(cfg)
    if 'cls' in cfg: classify(ob, cfg)
    if 'recolor' in cfg: recolor(ob, cfg['recolor'])
    before, after = decimate(ob, cfg['tris'])
    size = normalise(ob, cfg)
    bpy.ops.object.shade_auto_smooth(angle=0.6) if hasattr(bpy.ops.object, 'shade_auto_smooth') else None
    out = os.path.join(OUT, f'{name}.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True,
                              export_yup=True, export_texcoords=False, export_materials='EXPORT',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10)
    print('BUILT', name, f'tris {before} -> {after}', 'size', size, f'{os.path.getsize(out) / 1024:.0f} KB')
