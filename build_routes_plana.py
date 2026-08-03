"""เพิ่มเส้นทางของแผน A (Val Gardena) ลงใน routes.json ที่มีอยู่แล้ว"""
import json, time, urllib.request
from build_routes import DESTS, BASES, route   # reuse

PLAN_A = {
    "margherita": (46.55799, 11.72324),   # Streda Dursan 5, S. Cristina
    "lores":      (46.55751, 11.75580),   # Streda Col da Lech 68, Selva
}

out = json.load(open("routes.json"))
out.setdefault("from_base", {})
out["from_base"]["hoferhof"] = out["from_hoferhof"]        # keep old key working

for name, ll in PLAN_A.items():
    print(f"== {name} ==")
    out["from_base"][name] = {}
    out["matrix"][name] = {}
    for k, d in DESTS.items():
        r = route(ll, d)
        if r:
            out["from_base"][name][k] = r
            out["matrix"][name][k] = {"km": r["km"], "min": r["min"]}
            print(f"  {k:15s} {r['km']:6.1f} km {r['min']:4d} min")
        else:
            print(f"  {k:15s} FAILED")
        time.sleep(1.1)

print("== transit ==")
legs = {
    "temblhof_to_margherita": ((46.92130, 11.44494), PLAN_A["margherita"]),
    "margherita_to_lores":    (PLAN_A["margherita"], PLAN_A["lores"]),
    "lores_to_munich":        (PLAN_A["lores"], (48.13743, 11.57549)),
}
for name, (a, b) in legs.items():
    r = route(a, b)
    if r:
        out["transit"][name] = r
        print(f"  {name:26s} {r['km']:6.1f} km {r['min']:4d} min")
    time.sleep(1.1)

json.dump(out, open("routes.json", "w"), separators=(",", ":"))
import os; print("\nroutes.json:", round(os.path.getsize("routes.json")/1024, 1), "KB")
