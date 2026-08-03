"""เพิ่มจุดหมายใหม่ที่โผล่ในแผนเที่ยวแผน A"""
import json, time, urllib.request
OSRM = "https://router.project-osrm.org/route/v1/driving/"
NEW = {
    "passo_giau":    (46.48282, 12.05349),
    "misurina":      (46.58220, 12.25376),
    "cortina_town":  (46.53994, 12.13486),
    "wagenbruchsee": (47.49277, 11.22106),
}
BASES = {
    "margherita": (46.55799, 11.72324),
    "tyrolian":   (46.75763, 12.03882),
    "hoferhof":   (46.66876, 11.60971),
}
def route(a, b):
    url = (f"{OSRM}{a[1]},{a[0]};{b[1]},{b[0]}"
           f"?overview=simplified&geometries=geojson&alternatives=false&steps=false")
    for i in range(4):
        try:
            r = json.load(urllib.request.urlopen(url, timeout=60))
            if r.get("code") == "Ok":
                rt = r["routes"][0]
                return {"km": round(rt["distance"]/1000,1), "min": int(round(rt["duration"]/60)),
                        "coords": [[round(c[1],5), round(c[0],5)] for c in rt["geometry"]["coordinates"]]}
        except Exception as e:
            print(f"   retry {i+1}: {type(e).__name__}")
        time.sleep(3)
    return None

out = json.load(open("routes.json"))
for bk, bll in BASES.items():
    print(f"== {bk} ==")
    for k, d in NEW.items():
        r = route(bll, d)
        if r:
            out["from_base"][bk][k] = r
            out["matrix"][bk][k] = {"km": r["km"], "min": r["min"]}
            print(f"  {k:14s} {r['km']:6.1f} km {r['min']:4d} min")
        else:
            print(f"  {k:14s} FAILED")
        time.sleep(1.1)
json.dump(out, open("routes.json","w"), separators=(",",":"))
open("assets/routes.js","w").write(
  "/* เส้นทางขับรถคำนวณล่วงหน้าด้วย OSRM ตอนสร้างหน้าเว็บ — หน้านี้ไม่เรียก API ใด ๆ ตอนรัน */\n"
  "const ROUTES = " + json.dumps(out, separators=(",",":"), ensure_ascii=False) + ";\n")
import os; print("\nroutes.js:", round(os.path.getsize("assets/routes.js")/1024,1), "KB")
