"""ติดหมายเลขเวอร์ชันท้าย URL ของไฟล์ assets ใน index.html
เพื่อให้เบราว์เซอร์โหลดไฟล์ใหม่ทันทีหลัง deploy (GitHub Pages แคช 10 นาที)
และเขียนวันเวลาที่อัปเดตล่าสุดลงมุมขวาบนของหน้า"""
import re, subprocess, sys, pathlib
from datetime import datetime

def build_id():
    try:
        n = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], text=True).strip()
        h = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
        return f"{n}-{h}"
    except Exception:
        import time; return str(int(time.time()))

TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
             "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

def updated_at():
    """วันเวลาที่อัปเดตล่าสุด ตามเวลาเครื่องที่รัน deploy (กรุงเทพฯ)"""
    t = datetime.now()
    return f"อัปเดต {t.day} {TH_MONTHS[t.month - 1]} {t.year} · {t:%H:%M}"

p = pathlib.Path("index.html")
s = p.read_text(encoding="utf-8")
v = build_id()
# assets/xxx.js|css  ->  assets/xxx.js?v=<build>
s2 = re.sub(r'(assets/[A-Za-z0-9_.-]+\.(?:js|css))(\?v=[^"\']*)?', r'\1?v=' + v, s)
# มุมขวาบน: เขียนทับด้วยวันเวลาที่ deploy รอบนี้
stamp = updated_at()
s2, n_meta = re.subn(r'(<div class="hdr-meta">).*?(</div>)',
                     lambda m: m.group(1) + stamp + m.group(2), s2, flags=re.S)
p.write_text(s2, encoding="utf-8")
n = len(re.findall(r'\?v=' + re.escape(v), s2))
print(f"stamped {n} asset links with v={v}")
print(f"header updated-at set to: {stamp}")
if n == 0: sys.exit("nothing stamped — check the pattern")
if n_meta != 1: sys.exit(f"expected 1 hdr-meta div, found {n_meta} — check index.html")
