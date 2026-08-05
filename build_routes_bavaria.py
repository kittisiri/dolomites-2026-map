"""เพิ่มเส้นทางขับรถช่วงบาวาเรีย 2–6 ก.ย. (แท็บ Walnut) ลงใน routes.json
แล้วเขียน assets/routes.js ใหม่ทั้งไฟล์

ต่างจาก build_routes_*.py ตัวเดิมตรงที่สคริปต์นี้อ่าน routes.json ที่มีอยู่แล้ว
เติมเฉพาะคีย์ของตัวเอง และไม่แตะคีย์ของโดโลไมต์เลย — รันซ้ำได้ปลอดภัย

รัน:  python3 build_routes_bavaria.py
"""
import json, pathlib, sys, time, urllib.request

OSRM = "https://router.project-osrm.org/route/v1/driving/"

# ที่พักแต่ละคืน — คีย์นี้ต้องตรงกับ field `base` ใน PLACES และคีย์ใน BASES
BASES = {
    "schwan_locke": (48.1362918, 11.5550598),   # 31 ส.ค.–2 ก.ย. · Munich
    "mueller":      (47.5549748, 10.7387348),   # 2 ก.ย. · Hohenschwangau
    "quellenhof":   (47.4761692, 11.0476850),   # 3 ก.ย. · Grainau
    "hohenried":    (47.8769180, 11.2855390),   # 4–5 ก.ย. · Bernried
    "temblhof":     (46.9217520, 11.4456571),   # 6 ก.ย. · Vipiteno
}

# จุดหมาย → ที่พักที่ใช้วัดระยะ  (routeKey, base, lat, lng)
DESTS = [
    # --- 2 ก.ย. วัดจาก Hotel Müller ---
    ("wieskirche",           "mueller",    47.6805535, 10.9004346),
    ("fuessen",              "mueller",    47.5705845, 10.6973285),
    ("alpsee",               "mueller",    47.5463715, 10.7243724),
    ("hohenschwangau",       "mueller",    47.5556743, 10.7363804),
    # --- 3 ก.ย. เช้า ยังนอนที่ Müller อยู่ ---
    ("neuschwanstein",       "mueller",    47.5575740, 10.7498004),
    ("marienbruecke",        "mueller",    47.5585154, 10.7508345),
    # --- 3–4 ก.ย. วัดจาก Quellenhof (Grainau) ---
    ("eibsee",               "quellenhof", 47.4560890, 10.9914240),
    ("zugspitze",            "quellenhof", 47.4210660, 10.9853652),
    ("garmisch",             "quellenhof", 47.4919023, 11.0947806),
    ("mittenwald",           "quellenhof", 47.4413018, 11.2640301),
    ("linderhof",            "quellenhof", 47.5716123, 10.9608242),
    ("ettal",                "quellenhof", 47.5697000, 11.0946000),
    ("oberammergau",         "quellenhof", 47.5980000, 11.0670000),
    # --- 5 ก.ย. วัดจาก Schloss Höhenried (ส่วนใหญ่เดินถึง) ---
    ("buchheim",             "hohenried",  47.8728420, 11.2890040),
    ("bernried_park",        "hohenried",  47.8615340, 11.3007050),
    ("marina_seerestaurant", "hohenried",  47.8696106, 11.2926197),
    ("weisse_hirsche",       "hohenried",  47.8788739, 11.2864687),
    ("waldtherapiepfad",     "hohenried",  47.8804932, 11.2825921),
    ("momo",                 "hohenried",  47.9044620, 11.2772372),
    ("suedbad_tutzing",      "hohenried",  47.8967600, 11.2747600),
    ("boot_sebald",          "hohenried",  47.9065000, 11.3355737),
    # --- 6 ก.ย. จุดแวะระหว่างทางลงใต้ วัดจากจุดออกเดินทาง ---
    # Eibsee ย้ายมาวันที่ 6 (เดินกับแต๊ก+แอน) จึงวัดจาก Höhenried ไม่ใช่ Quellenhof
    ("eibsee",               "hohenried",  47.4560890, 10.9914240),
    # Partnachklamm วัดถึง "ลานจอด Olympia-Skistadion" ไม่ใช่ปากช่องเขา — ขับเข้าไปไม่ได้
    ("partnachklamm",        "hohenried",  47.4903000, 11.1160000),
    ("murnau",               "hohenried",  47.6781942, 11.2009226),
    ("seefeld",              "hohenried",  47.3300017, 11.1877742),
    ("europabruecke",        "hohenried",  47.2002845, 11.4004247),
]

# ช่วงขับย้ายที่พัก — วาดเป็นเส้นประบนแผนที่
TRANSIT = [
    ("munich_to_hohenschwangau", "schwan_locke", "mueller"),
    ("mueller_to_quellenhof",    "mueller",      "quellenhof"),
    ("quellenhof_to_hohenried",  "quellenhof",   "hohenried"),
    ("hohenried_to_temblhof",    "hohenried",    "temblhof"),
]


def route(a, b, tries=4):
    """a, b = (lat, lng) — คืน {km, min, coords} · coords เป็น [lat, lng]"""
    url = "{}{},{};{},{}?overview=simplified&geometries=geojson".format(
        OSRM, a[1], a[0], b[1], b[0])
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                d = json.load(r)
            if d.get("code") != "Ok":
                raise RuntimeError(d.get("code"))
            r0 = d["routes"][0]
            return {
                "km": round(r0["distance"] / 1000, 1),
                "min": round(r0["duration"] / 60),
                "coords": [[c[1], c[0]] for c in r0["geometry"]["coordinates"]],
            }
        except Exception as e:
            if i == tries - 1:
                print("  !! ยอมแพ้:", e)
                return None
            time.sleep(1.5 * (i + 1))


here = pathlib.Path(__file__).parent
out = json.loads((here / "routes.json").read_text())
out.setdefault("from_base", {})
out.setdefault("transit", {})

fails = []

for key, base, lat, lng in DESTS:
    out["from_base"].setdefault(base, {})
    print("{:22s} ← {}".format(key, base), end=" ")
    r = route(BASES[base], (lat, lng))
    if r:
        out["from_base"][base][key] = r
        print("{:6.1f} กม. {:3d} นาที".format(r["km"], r["min"]))
    else:
        fails.append(key)
    time.sleep(0.4)

for name, a, b in TRANSIT:
    print("{:28s}".format(name), end=" ")
    r = route(BASES[a], BASES[b])
    if r:
        out["transit"][name] = r
        print("{:6.1f} กม. {:3d} นาที".format(r["km"], r["min"]))
    else:
        fails.append(name)
    time.sleep(0.4)

(here / "routes.json").write_text(json.dumps(out, ensure_ascii=False))

js = (here / "assets" / "routes.js")
js.write_text(
    "/* สร้างอัตโนมัติ — อย่าแก้ด้วยมือ · ดู build_routes_*.py */\n"
    "const ROUTES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")

print("\nเขียน routes.json และ assets/routes.js แล้ว")
print("from_base:", {k: len(v) for k, v in out["from_base"].items()})
print("transit:", list(out["transit"].keys()))
if fails:
    print("\n⚠️  ไม่ได้เส้นทาง — ต้องตั้ง routeKey: null ให้จุดพวกนี้:", fails)
    sys.exit(1)
