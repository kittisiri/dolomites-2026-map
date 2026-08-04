"""Fetch driving routes from OSRM once, at build time, and bake them into routes.json.
The published page never calls a routing API."""
import json, time, urllib.request

OSRM = "https://router.project-osrm.org/route/v1/driving/"

BASES = {
    "margherita": (46.55799, 11.72324),  # Heritage House Margherita, S. Cristina  (7-9 Sep)
    "tyrolian":   (46.75763, 12.03882),  # Chalet Tyrolian, Valdaora / Olang        (9-11 Sep)
}

# id -> drive-to point (car park / valley station), NOT necessarily the pin
DESTS = {
    "tre_cime":      (46.61220, 12.29610),  # Rifugio Auronzo (via toll road)
    "sorapis":       (46.55703, 12.20185),  # Passo Tre Croci trailhead
    "cinque_torri":  (46.51868, 12.03873),  # Bai de Dones
    "seceda":        (46.57642, 11.67507),  # Ortisei, Seceda valley station
    "col_raiser":    (46.55907, 11.71549),  # Santa Cristina, Col Raiser valley station
    "adolf_munkel":  (46.63470, 11.76558),  # Zanser Alm / Malga Zannes car park
    "braies":        (46.69472, 12.08584),  # Lago di Braies
    "alpe_di_siusi": (46.53988, 11.56326),  # Siusi cable car valley station
    "val_di_funes":  (46.64472, 11.71932),  # Santa Maddalena
    "passo_gardena": (46.54982, 11.80839),
    "carezza":       (46.40931, 11.57587),
    "passo_sella":   (46.50892, 11.75731),
    "passo_pordoi":  (46.48755, 11.81219),
    "falzarego":     (46.51875, 12.00843),  # Passo Falzarego / Lagazuoi
    "bressanone":    (46.71641, 11.65779),
    "chiusa":        (46.63649, 11.56595),
}

def route(a, b, overview="simplified"):
    url = (f"{OSRM}{a[1]},{a[0]};{b[1]},{b[0]}"
           f"?overview={overview}&geometries=geojson&alternatives=false&steps=false")
    for attempt in range(4):
        try:
            r = json.load(urllib.request.urlopen(url, timeout=60))
            if r.get("code") == "Ok":
                rt = r["routes"][0]
                out = {"km": round(rt["distance"] / 1000, 1),
                       "min": int(round(rt["duration"] / 60))}
                geom = rt.get("geometry")
                if isinstance(geom, dict) and geom.get("coordinates"):
                    out["coords"] = [[round(c[1], 5), round(c[0], 5)] for c in geom["coordinates"]]
                return out
            print("   code:", r.get("code"))
        except Exception as e:
            print(f"   retry {attempt+1}: {type(e).__name__} {e}")
        time.sleep(3)
    return None

out = {"from_base": {}, "transit": {}}

print("== routes from each base (with geometry) ==")
for k, d in DESTS.items():
    r = route(BASES["hoferhof"], d)
    if r:
        out["from_hoferhof"][k] = r
        print(f"  {k:15s} {r['km']:6.1f} km  {r['min']:4d} min  ({len(r['coords'])} pts)")
    else:
        print(f"  {k:15s} FAILED")
    time.sleep(1.2)

print("== transit legs ==")
legs = {
    "temblhof_to_hoferhof": ((46.92130, 11.44494), BASES["hoferhof"]),
    "hoferhof_to_munich":   (BASES["hoferhof"], (48.13743, 11.57549)),
}
for name, (a, b) in legs.items():
    r = route(a, b)
    if r:
        out["transit"][name] = r
        print(f"  {name:24s} {r['km']:6.1f} km {r['min']:4d} min")
    time.sleep(1.2)

json.dump(out, open("routes.json", "w"), separators=(",", ":"))
import os
print("\nroutes.json:", round(os.path.getsize("routes.json")/1024, 1), "KB")
