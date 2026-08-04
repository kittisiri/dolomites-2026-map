"""เก็บรูปจาก assets/photos/<NN_id>/ → ย่อขนาดลง assets/photos_web/ → เขียน assets/photos.js

ดุ๊กวางรูปไว้ในโฟลเดอร์ตามชื่อสถานที่ ชื่อไฟล์อะไรก็ได้ สคริปต์นี้จะ
  1. หยิบ 2 ใบแรกของแต่ละโฟลเดอร์ (เรียงตามชื่อไฟล์)
  2. ย่อให้กว้างไม่เกิน 1400 px แล้วเซฟเป็น .jpg ลง assets/photos_web/
  3. เขียน assets/photos.js ให้หน้าเว็บอ่าน

ไฟล์ต้นฉบับไม่ถูกแตะเลย — ย่อใส่โฟลเดอร์ใหม่เสมอ
assets/photos/ ถูก .gitignore ไว้ (รูปจากมือถือใบละหลาย MB ถ้า commit เข้าไปด้วย
repo จะบวมถาวรเพราะ git เก็บทุกเวอร์ชัน) ตัวที่ deploy จริงคือ assets/photos_web/
"""
import json, pathlib, re, shutil, subprocess, sys

SRC = pathlib.Path("assets/photos")
OUT = pathlib.Path("assets/photos_web")
MAX_W = 1400          # กว้างพอสำหรับจอ retina ที่ความกว้างช่องราว 400–700 px
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
PER_PLACE = 2

if not SRC.is_dir():
    sys.exit(f"ไม่มีโฟลเดอร์ {SRC} — รันสคริปต์นี้จากรากของ repo")
if not shutil.which("sips"):
    sys.exit("ไม่พบคำสั่ง sips (มากับ macOS) — ต้องใช้ย่อรูป")

OUT.mkdir(parents=True, exist_ok=True)

manifest, empty, partial, kept = {}, [], [], set()

for folder in sorted(p for p in SRC.iterdir() if p.is_dir()):
    place_id = re.sub(r"^\d+_", "", folder.name)
    photos = sorted(
        (f for f in folder.iterdir() if f.suffix.lower() in EXTS and not f.name.startswith(".")),
        key=lambda f: f.name.lower(),
    )[:PER_PLACE]

    if not photos:
        empty.append(folder.name)
        continue
    if len(photos) < PER_PLACE:
        partial.append(f"{folder.name} ({len(photos)} ใบ)")

    entries = []
    for i, f in enumerate(photos, 1):
        dest = OUT / f"{place_id}-{i}.jpg"
        kept.add(dest.name)
        # ย่อเฉพาะตอนต้นฉบับใหม่กว่าไฟล์ที่ย่อไว้แล้ว — รันซ้ำจะได้ไม่ช้า
        if not dest.exists() or f.stat().st_mtime > dest.stat().st_mtime:
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80",
                 "-Z", str(MAX_W), str(f), "--out", str(dest)],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            )
        entries.append({"src": f"{OUT.as_posix()}/{dest.name}"})
    manifest[place_id] = entries

# ลบไฟล์ย่อที่ไม่มีต้นฉบับแล้ว (ดุ๊กเอารูปออกจากโฟลเดอร์)
for stale in OUT.glob("*.jpg"):
    if stale.name not in kept:
        stale.unlink()
        print(f"ลบรูปที่ไม่มีต้นฉบับแล้ว: {stale.name}")

pathlib.Path("assets/photos.js").write_text(
    "/* สร้างอัตโนมัติโดย build_photos.py — อย่าแก้ด้วยมือ */\n"
    "const PHOTOS = " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n",
    encoding="utf-8",
)

total = sum(len(v) for v in manifest.values())
size = sum(f.stat().st_size for f in OUT.glob("*.jpg")) / 1e6
print(f"เขียน assets/photos.js — {len(manifest)} สถานที่ · {total} รูป · {size:.1f} MB")
if partial:
    print("มีรูปไม่ครบ 2 ใบ: " + ", ".join(partial))
if empty:
    print(f"ยังไม่มีรูป {len(empty)} สถานที่: " + ", ".join(empty))
