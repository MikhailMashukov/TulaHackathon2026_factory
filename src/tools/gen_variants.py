import json, base64, urllib.request, os, time

API = "http://192.168.0.80:6290/sdapi/v1/txt2img"
OUT = "/project/TulaHackathon/factory/static/img"

COMMON = "3/4 view, slight perspective, grounded object, muted grey 90%, orange accent, weathered steel, oil stains"
BASE = "isometric, pre-rendered 3D, Factorio-style industrial sprite, warm lighting from upper-left, 45-degree angle, orange safety stripes, metal wear, visible bolts and rivets, muted grey workshop background, centered"
NEG = "text, watermark, signature, blurry, low quality, photorealistic photo, pony, anime, dark background, cluttered background, multiple objects"

TARGETS = {
    "lathe":    f"metal lathe machine, rotating chuck, cutting tool, horizontal spindle, metal chips, coolant stream, {COMMON}, {BASE}",
    "cnc_mill": f"CNC milling center with control panel showing G-code on glowing screen, vertical spindle, end mill cutter above workpiece, coolant nozzle, protective enclosure, {COMMON}, {BASE}",
    "plasma":   f"plasma cutting torch over steel sheet, bright plasma arc, cutting sparks, flat metal table, sheet metal offcuts, {COMMON}, {BASE}",
    "paint":    f"industrial powder coating spray booth interior, spray gun, metal part hanging on hook, paint mist, ventilation ducts, {COMMON}, {BASE}",
}

def gen_batch(name, prompt, n=8):
    body = {
        "prompt": prompt, "negative_prompt": NEG,
        "width": 512, "height": 512, "steps": 25, "sampler_name": "Euler a", "cfg_scale": 7,
        "n_iter": n, "batch_size": 1, "seed": -1,
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        data = json.load(r)
    info = json.loads(data.get("info", "{}"))
    seeds = info.get("all_seeds", [])
    for i, img in enumerate(data["images"][:n]):
        seed = seeds[i] if i < len(seeds) else "x"
        path = os.path.join(OUT, f"_{name}_v{i+1}_seed{seed}.png")
        with open(path, "wb") as f:
            f.write(base64.b64decode(img))
    print(f"{name}: {n} variants, seeds={seeds}")

for name, prompt in TARGETS.items():
    t0 = time.time()
    gen_batch(name, prompt, 8)
    print(f"  took {time.time()-t0:.1f}s")
