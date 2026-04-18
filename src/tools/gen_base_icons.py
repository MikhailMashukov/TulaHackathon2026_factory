import json, base64, urllib.request, os, time

API = "http://192.168.0.80:6290/sdapi/v1/txt2img"
OUT = "/project/TulaHackathon/factory/static/img"
os.makedirs(OUT, exist_ok=True)

BASE = "isometric, pre-rendered 3D, Factorio-style industrial sprite, warm lighting from upper-left, 45-degree angle, orange safety stripes, metal wear, visible bolts and rivets, muted grey workshop background, centered"
NEG = "text, watermark, signature, blurry, low quality, photorealistic photo, pony, anime, dark background, cluttered background, multiple objects"
COMMON = "3/4 view, slight perspective, grounded object, muted grey 90%, orange accent, weathered steel, oil stains"

ICONS = {
    "lathe.png":         f"metal lathe machine, rotating chuck, cutting tool, horizontal spindle, metal chips, coolant stream, {COMMON}, {BASE}",
    "cnc_mill.png":      f"CNC milling center with control panel showing G-code on glowing screen, vertical spindle, end mill cutter above workpiece, coolant nozzle, protective enclosure, {COMMON}, {BASE}",
    "plasma.png":        f"plasma cutting torch over steel sheet, bright plasma arc, cutting sparks, flat metal table, sheet metal offcuts, {COMMON}, {BASE}",
    "weld.png":          f"MIG welding post with glowing weld bead, arc sparks, welding torch, protective screen, welded metal frame on table, {COMMON}, soot marks, {BASE}",
    "paint.png":         f"industrial powder coating spray booth interior, spray gun, metal part hanging on hook, paint mist, ventilation ducts, {COMMON}, {BASE}",
    "qc.png":            f"quality inspection station, digital caliper measuring shaft, inspection table, magnifying glass, finished machined part, measurement markings, {COMMON}, {BASE}",
    "pack.png":          f"packaging station, industrial cardboard box being sealed with tape dispenser, short conveyor section, wrapped metal part inside open box, {COMMON}, {BASE}",
    "shaft.png":         f"metallic cylindrical shaft with machined keyway groove, ground finish, lying horizontal, slight reflections, 3/4 view, slight perspective, muted grey 90%, orange accent highlight, weathered steel",
    "sheet_frame.png":   f"welded steel rectangular frame with mounting flanges and drilled holes, painted surface, 3/4 view, slight perspective, muted grey 90%, orange accent, weathered steel",
    "assembly_unit.png": f"assembled mechanical unit with bolts, shaft, machined housing, painted body, technical part feel, 3/4 view, slight perspective, muted grey 90%, orange accent, weathered steel",
    "bracket.png":       f"welded and painted steel bracket with bolt holes, L-shaped profile, clean painted surface, 3/4 view, slight perspective, muted grey 90%, orange accent, weathered steel",
}

def gen(fname, prompt):
    body = {
        "prompt": prompt,
        "negative_prompt": NEG,
        "width": 512, "height": 512,
        "steps": 25, "sampler_name": "Euler a", "cfg_scale": 7,
        "seed": -1,
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.load(r)
    info = json.loads(data.get("info", "{}"))
    seed = info.get("seed", "?")
    path = os.path.join(OUT, fname)
    with open(path, "wb") as f:
        f.write(base64.b64decode(data["images"][0]))
    print(f"{fname}: seed={seed} size={os.path.getsize(path)}")

for fname, prompt in ICONS.items():
    try:
        t0 = time.time()
        gen(fname, prompt)
        print(f"  took {time.time()-t0:.1f}s")
    except Exception as e:
        print(f"FAIL {fname}: {e}")
