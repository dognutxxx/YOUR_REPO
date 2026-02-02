# 3D Particle Morphing on Scroll

หน้าเว็บ 3D ที่อนุภาคเปลี่ยนรูปร่างตามการเลื่อน (ทรงกลม → ทรงกล่อง) ใช้ **Three.js**, **GLSL Shaders**, **Lenis** และ **GSAP ScrollTrigger**.

## Stack

1. **Three.js** — Particle system ด้วย BufferGeometry + custom attribute `targetPosition`
2. **GLSL** — Vertex shader ทำ morph บน GPU (smooth 60fps)
3. **Lenis** — Smooth scroll แบบมี inertia
4. **GSAP ScrollTrigger** — ผูก progress การเลื่อนกับค่า `uMix` ใน shader

## วิธีรัน

ต้องรันผ่าน **local server** (เพราะใช้ ES modules + import จาก CDN):

```bash
# ใช้ Python
python -m http.server 8000

# หรือใช้ Node (npx)
npx serve .

# หรือใช้ VS Code extension "Live Server"
```

จากนั้นเปิด `http://localhost:8000` (หรือพอร์ตที่ใช้)

## Deploy ขึ้น Vercel

โปรเจกต์นี้เป็น **static site** (HTML + JS + assets) deploy ขึ้น Vercel ได้เลย ไม่ต้อง build

### วิธีที่ 1: ผ่าน Vercel Dashboard (แนะนำ)

1. สร้าง repo บน **GitHub** แล้ว push โปรเจกต์ขึ้นไป
2. ไปที่ [vercel.com](https://vercel.com) → ล็อกอิน → **Add New Project**
3. เลือก repo ที่ push ไว้
4. **Framework Preset** เลือก **Other** (หรือปล่อยให้ Vercel detect)
5. **Build Command** ว่างไว้ได้ (ไม่ต้อง build)
6. **Output Directory** ว่างไว้ หรือใส่ `.`
7. กด **Deploy** — เสร็จแล้วจะได้ URL เช่น `https://xxx.vercel.app`

### วิธีที่ 2: ใช้ Vercel CLI

```bash
# ติดตั้ง (ครั้งเดียว)
npm i -g vercel

# ในโฟลเดอร์โปรเจกต์
cd path/to/test3d
vercel
```

ตอบคำถาม (link กับบัญชี, โปรเจกต์ใหม่) แล้วจะได้ URL

### หมายเหตุ

- ไฟล์ `vercel.json` อยู่แล้วในโปรเจกต์ (config พื้นฐาน)
- `.vercelignore` ใช้ไม่ส่งโฟลเดอร์ `.cursor` และ `scripts` ขึ้นไป (ไม่จำเป็นบน production)

## โครงไฟล์

- `index.html` — โครงหน้า, CDN (Three, GSAP, ScrollTrigger), เนื้อหาเลื่อน
- `js/main.js` — Scene, particles, shaders, Lenis, ScrollTrigger

## ปรับแต่ง

- **จำนวนอนุภาค:** แก้ `PARTICLE_COUNT` ใน `js/main.js`
- **รูปร่าง A/B:** แก้ฟังก์ชัน `spherePoints` / `boxPoints` หรือเพิ่ม shape ใหม่
- **สี:** แก้ `uColorA`, `uColorB` ใน uniforms ของ ShaderMaterial
