"""Blender: split a model into loose parts and print the biggest ones (metres, Blender Z-up).
blender -b --factory-startup --python tools/models_parts.py -- <model> <unit scale>"""
import bpy, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
path, unit = args[0], float(args[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
else: bpy.ops.wm.obj_import(filepath=path)
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    bpy.context.view_layer.objects.active = o; o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = []
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]) * unit
    hi = Vector([max(p[i] for p in pts) for i in range(3)]) * unit
    parts.append((len(o.data.polygons), lo, hi))
print('PARTS', len(parts))
for n, lo, hi in sorted(parts, key=lambda p: -(p[2] - p[1]).length)[:25]:
    print('PART %7d  lo %s  hi %s  size %s' % (n, [round(v, 2) for v in lo], [round(v, 2) for v in hi], [round(v, 2) for v in hi - lo]))
