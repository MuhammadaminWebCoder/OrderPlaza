"""Blender: import one FBX/OBJ and print what is inside (objects, triangles, materials, textures, size).
blender -b --factory-startup --python tools/models_inspect.py -- <model file>"""
import bpy, sys, os, json
from mathutils import Vector

path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(path)[1].lower()
if ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=path)
else:
    bpy.ops.wm.obj_import(filepath=path)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
tris = 0
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
mats = {}
for m in bpy.data.materials:
    texs = []
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                p = bpy.path.abspath(n.image.filepath)
                texs.append((os.path.basename(p), os.path.exists(p)))
    mats[m.name] = texs
print('INSPECT', json.dumps({
    'file': os.path.basename(path), 'objects': len(meshes), 'tris': tris,
    'size': [round(v, 3) for v in (hi - lo)], 'names': [o.name for o in meshes][:12],
    'materials': mats,
}, ensure_ascii=False))
