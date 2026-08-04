"""ติดหมายเลขเวอร์ชันท้าย URL ของไฟล์ assets ใน index.html
เพื่อให้เบราว์เซอร์โหลดไฟล์ใหม่ทันทีหลัง deploy (GitHub Pages แคช 10 นาที)"""
import re, subprocess, sys, pathlib

def build_id():
    try:
        n = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], text=True).strip()
        h = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
        return f"{n}-{h}"
    except Exception:
        import time; return str(int(time.time()))

p = pathlib.Path("index.html")
s = p.read_text(encoding="utf-8")
v = build_id()
# assets/xxx.js|css  ->  assets/xxx.js?v=<build>
s2 = re.sub(r'(assets/[A-Za-z0-9_.-]+\.(?:js|css))(\?v=[^"\']*)?', r'\1?v=' + v, s)
p.write_text(s2, encoding="utf-8")
n = len(re.findall(r'\?v=' + re.escape(v), s2))
print(f"stamped {n} asset links with v={v}")
if n == 0: sys.exit("nothing stamped — check the pattern")
