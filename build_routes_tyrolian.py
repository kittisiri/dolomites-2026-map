"""เพิ่มเส้นทางจาก Chalet Tyrolian (Valdaora/Olang) และลบเส้นทางของ Lores ที่ไม่ใช้แล้ว"""
import json, time, urllib.request

OSRM = "https://router.project-osrm.org/route/v1/driving/"
DESTS = {
    "tre_cime": (46.61220, 12.29610), "sorapis": (46.55703, 12.20185),
    "cinque_torri": (46.51868, 12.03873), "seceda": (46.57642, 11.67507),
    "col_raiser": (46.55907, 11.71549), "adolf_munkel": (46.63470, 11.76558),
    "braies": (46.69472, 12.08584), "alpe_di_siusi": (46.53988, 11.56326),
    "val_di_funes": (46.64472, 11.71932), "passo_gardena": (46.54982, 11.80839),
    "carezza": (46.40931, 11.57587), "passo_sella": (46.50892, 11.75731),
    "passo_pordoi": (46.48755, 11.81219), "falzarego": (46.51875, 12.00843),
    "bressanone": (46.71641, 11.65779), "chiusa": (46.63649, 11.56595),
}
TYROLIAN   = (46.75763, 12.03882)   # Hans-von-Perthaler-Str. 22, Oberolang
MARGHERITA = (46.55799, 11.72324)
TEMBLHOF   = (46.9084507, 11.4306238)
MUNICH     = (48.13743, 11.57549)

def route(a, b):
    url = (f"{OSRM}{a[1]},{a[0]};{b[1]},{b[0]}"
           f"?overview=simplified&geometries=geojson&alternatives=false&steps=false")
    for i in range(4):
        try:
            r = json.load(urllib.request.urlopen(url, timeout=60))
            if r.get("code") == "Ok":
                rt = r["routes"][0]
                return {"km": round(rt["distance"]/1000, 1), "min": int(round(rt["duration"]/60)),
                        "coords": [[round(c[1],5), round(c[0],5)] for c in rt["geometry"]["coordinates"]]}
        except Exception as e:
            print(f"   retry {i+1}: {type(e).__name__}")
        time.sleep(3)
    return None

out = json.load(open("routes.json"))
out["from_base"].pop("lores", None)
out["matrix"].pop("lores", None)
out["transit"].pop("margherita_to_lores", None)
out["transit"].pop("lores_to_munich", None)

print("== Chalet Tyrolian (Valdaora) ==")
out["from_base"]["tyrolian"] = {}
out["matrix"]["tyrolian"] = {}
for k, d in DESTS.items():
    r = route(TYROLIAN, d)
    if r:
        out["from_base"]["tyrolian"][k] = r
        out["matrix"]["tyrolian"][k] = {"km": r["km"], "min": r["min"]}
        print(f"  {k:15s} {r['km']:6.1f} km {r['min']:4d} min")
    else:
        print(f"  {k:15s} FAILED")
    time.sleep(1.1)

print("== transit ==")
for name, (a, b) in {
    "margherita_to_tyrolian": (MARGHERITA, TYROLIAN),
    "tyrolian_to_munich":     (TYROLIAN, MUNICH),
    "temblhof_to_margherita": (TEMBLHOF, MARGHERITA),
}.items():
    r = route(a, b)
    if r:
        out["transit"][name] = r
        print(f"  {name:24s} {r['km']:6.1f} km {r['min']:4d} min")
    time.sleep(1.1)

json.dump(out, open("routes.json", "w"), separators=(",", ":"))
import os; print("\nroutes.json:", round(os.path.getsize("routes.json")/1024,1), "KB")
print("bases:", list(out["from_base"].keys()))
