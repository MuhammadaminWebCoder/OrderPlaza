"""Blender: quick Workbench preview of a model (3/4 view) to see what is inside.
blender -b --factory-startup --python tools/models_preview.py -- <model> <out.png>"""
import bpy, sys, os, math
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
path, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
if path.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=path)
elif path.lower().endswith('.glb'): bpy.ops.import_scene.gltf(filepath=path)
else: bpy.ops.wm.obj_import(filepath=path)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
ctr, size = (lo + hi) / 2, (hi - lo).length
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.scene.collection.objects.link(cam)
d = Vector((0.9, -1.4, 0.75)).normalized() * size * 1.25
cam.location = ctr + d; cam.data.clip_start = size * 0.01; cam.data.clip_end = size * 10
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
s = bpy.context.scene; s.camera = cam
s.render.engine = 'BLENDER_WORKBENCH'
s.display.shading.light = 'STUDIO'; s.display.shading.color_type = 'MATERIAL'
s.display.shading.show_cavity = True
s.render.resolution_x, s.render.resolution_y = 640, 480
s.render.filepath = out
bpy.ops.render.render(write_still=True)
