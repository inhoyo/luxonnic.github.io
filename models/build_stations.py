"""
Builds the two 3D stations of the landing page in Blender and exports them as GLB.

Run from the repo root:
  "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup \
      --python models/build_stations.py -- <output_dir>

Outputs power.glb and signal.glb. models/embed_models.py turns them into
assets/stations-models.js, so the page also works when opened from disk.

Design rules (why it looks like this):
- No enclosing boxes around things. The rack is an open frame, the transceiver is
  a bare circuit board, the power wall is stacked light rings, the core is a lattice.
- Every part that the page animates has a stable name:
    Shelf_i, Strip_i          rack shelves and their light strips (i = 0..8)
    Bar{b}_Seg{j}, Bar{b}_Cap  power-wall rings and caps (b = 0..2)
    DSP                       the processor on the transceiver
    Node_{x}_{y}, Edge_k      the LUXONNICore lattice
- Materials are named Metal, PCB, Chip, Ember, Photon, Iris; the page re-skins them.

Units: 1 unit = 200 CSS px on the landing page. Positions match the old scene.
Blender Z is up; glTF export converts to Y-up.
"""

import bpy
import math
import os
import sys
from mathutils import Vector

argv = sys.argv
out_dir = argv[argv.index("--") + 1] if "--" in argv else os.path.join(os.getcwd(), "models", "out")
os.makedirs(out_dir, exist_ok=True)


# ---------------------------------------------------------------- helpers

def fresh_scene():
    MATS.clear()  # datablocks are invalid after a factory reset
    bpy.ops.wm.read_factory_settings(use_empty=True)


MATS = {}


def material(name, base, metallic=0.0, roughness=0.4, emit=None, strength=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    MATS[name] = m
    return m


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.dimensions = size
    return assign(o, mat)


def cylinder(name, loc, radius, depth, mat, verts=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    return assign(o, mat)


def sphere(name, loc, radius, mat, seg=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=radius, location=loc)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    return assign(o, mat)


def link(a, b, radius, mat, name):
    a, b = Vector(a), Vector(b)
    d = b - a
    mid = (a + b) / 2
    o = cylinder(name, mid, radius, d.length, mat, verts=8)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o


def export(path, names):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        if o.name in names:
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_texcoords=False,
        export_tangents=False,
    )
    print("exported", path)


# ------------------------------------------------------------- materials

def palette():
    material("Metal", (0.10, 0.11, 0.14), metallic=0.85, roughness=0.32)
    material("PCB", (0.03, 0.07, 0.06), metallic=0.0, roughness=0.55)
    material("Chip", (0.10, 0.05, 0.03), metallic=0.6, roughness=0.4, emit=(1.0, 0.42, 0.21), strength=1.2)
    material("Ember", (1.0, 0.42, 0.21), metallic=0.0, roughness=0.3, emit=(1.0, 0.42, 0.21), strength=3.0)
    material("Photon", (0.78, 0.96, 1.0), metallic=0.0, roughness=0.2, emit=(0.78, 0.96, 1.0), strength=3.0)
    material("Iris", (0.48, 0.44, 1.0), metallic=0.0, roughness=0.3, emit=(0.48, 0.44, 1.0), strength=2.0)


# ------------------------------------------------------- station: power

def build_power():
    fresh_scene()
    palette()
    names = []

    # --- open rack frame: four posts, top and bottom rails, nine shelves -----
    rack_x, rack_w, rack_d, rack_h = -3.5, 1.5, 1.1, 2.9
    post_r = 0.035
    for sx in (-1, 1):
        for sy in (-1, 1):
            px = rack_x + sx * (rack_w / 2 - post_r)
            py = sy * (rack_d / 2 - post_r)
            name = f"Post_{sx}_{sy}"
            cylinder(name, (px, py, 0), post_r, rack_h, material("Metal", (0, 0, 0)), verts=16)
            names.append(name)
    for z in (-rack_h / 2 + 0.03, rack_h / 2 - 0.03):
        name = f"Rail_{z:.1f}"
        box(name, (rack_x, 0, z), (rack_w, rack_d, 0.05), material("Metal", (0, 0, 0)))
        names.append(name)

    for s in range(9):
        z = -1.2 + s * 0.3
        name = f"Shelf_{s}"
        box(name, (rack_x, 0, z), (rack_w - 0.1, rack_d - 0.1, 0.02), material("Metal", (0, 0, 0)))
        names.append(name)
        mat = material("Ember", (0, 0, 0)) if s % 3 == 0 else material("Iris", (0, 0, 0))
        strip = f"Strip_{s}"
        box(strip, (rack_x, rack_d / 2 - 0.08, z + 0.02), (rack_w - 0.3, 0.02, 0.035), mat)
        names.append(strip)

    # --- transceiver: a bare circuit board with a processor on it -------------
    xcvr_x = -0.8
    box("PCB", (xcvr_x, 0, 0), (0.95, 0.6, 0.03), material("PCB", (0, 0, 0)))
    names.append("PCB")
    for k, (px, py) in enumerate([(-0.36, -0.2), (-0.36, 0.2), (0.36, -0.2), (0.36, 0.2)]):
        cylinder(f"Port_{k}", (xcvr_x + px, py, 0.03), 0.03, 0.02, material("Metal", (0, 0, 0)), verts=16)
        names.append(f"Port_{k}")
    box("DSP", (xcvr_x, 0, 0.055), (0.34, 0.34, 0.05), material("Chip", (0, 0, 0)))
    names.append("DSP")
    for k, py in enumerate((-0.12, 0.12)):
        cylinder(f"Ferrule_{k}", (xcvr_x + 0.5, py, 0), 0.05, 0.14, material("Metal", (0, 0, 0)), verts=24, rot=(0, math.pi / 2, 0))
        names.append(f"Ferrule_{k}")
    box("EdgeConn", (xcvr_x - 0.5, 0, 0), (0.06, 0.32, 0.07), material("Metal", (0, 0, 0)))
    names.append("EdgeConn")

    # --- power wall: stacked light rings that grow, one column per generation --
    bars_x = [1.9, 2.8, 3.7]
    bars_h = [1.0, 1.6, 2.4]
    base_z = -1.45
    ring_h = 0.07
    gap = 0.02
    for b, (bx, bh) in enumerate(zip(bars_x, bars_h)):
        count = int(round(bh / (ring_h + gap)))
        for j in range(count):
            z = base_z + ring_h / 2 + j * (ring_h + gap)
            r = 0.24 - 0.02 * (j / max(1, count - 1))  # slight taper toward the top
            name = f"Bar{b}_Seg{j}"
            cylinder(name, (bx, 0, z), r, ring_h, material("Ember", (0, 0, 0)), verts=24)
            names.append(name)
        cap = f"Bar{b}_Cap"
        sphere(cap, (bx, 0, base_z + bh + 0.08), 0.1, material("Photon", (0, 0, 0)), seg=24, rings=12)
        names.append(cap)

    export(os.path.join(out_dir, "power.glb"), names)


# ------------------------------------------------------- station: signal

def build_signal():
    fresh_scene()
    palette()
    names = []

    xs = [-0.9 + i * 0.45 for i in range(5)]
    zs = [-0.4 + j * 0.4 for j in range(3)]
    pos = {}
    for i, x in enumerate(xs):
        for j, z in enumerate(zs):
            name = f"Node_{i}_{j}"
            sphere(name, (x, 0, z), 0.095, material("Photon", (0, 0, 0)), seg=28, rings=14)
            names.append(name)
            pos[(i, j)] = (x, 0, z)

    k = 0
    edge_mat = material("Iris", (0, 0, 0))
    for (i, j), p in pos.items():
        for (di, dj) in ((1, 0), (0, 1)):
            q = pos.get((i + di, j + dj))
            if q is None:
                continue
            name = f"Edge_{k}"
            link(p, q, 0.02, edge_mat, name)
            names.append(name)
            k += 1

    export(os.path.join(out_dir, "signal.glb"), names)


build_power()
build_signal()
