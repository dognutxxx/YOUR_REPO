# สร้าง face-points.json จากรูป PNG

ใช้สคริปต์ `image_to_face_points.py` เพื่อสร้างไฟล์ point cloud จากรูปใบหน้าตัวการ์ตูน (PNG) แล้วนำไปใช้ในโปรเจกต์ 3D particle morph ได้ตรงกับรูป 100% (ตามความละเอียดของจุด)

## ติดตั้ง

```bash
cd scripts
pip install -r requirements.txt
```

หรือติดตั้งเอง:

```bash
pip install numpy pillow opencv-python
```

(`opencv-python` ใช้เมื่อเลือกวิธี `--method contour` หรือ `edge` เท่านั้น)

## วิธีใช้

### 1. รูป PNG มีช่อง alpha (พื้นหลังโปร่งใส) — แนะนำ

```bash
python image_to_face_points.py path/to/face.png --output ../assets/face-points.json
```

จะใช้พิกเซลที่ **ไม่โปร่งใส** เป็น mask แล้วสุ่ม 24,000 จุดภายในนั้น

### 2. รูปไม่มี alpha — ใช้ contour (ต้องมี OpenCV)

```bash
python image_to_face_points.py path/to/face.png --method contour -o ../assets/face-points.json
```

จะใช้รูปขาวดำจาก threshold หา contour หลักแล้ว fill เป็น mask

### 3. ปรับจำนวนจุดและ scale

```bash
python image_to_face_points.py face.png -o ../assets/face-points.json --count 24000 --scale 1.0
```

- `--count` ต้องเท่ากับ `PARTICLE_COUNT` ใน `js/main.js` (default 24000)
- `--scale 1.0` ให้พิกัด x,y อยู่ช่วงประมาณ [-0.5, 0.5] ตรงกับขนาดหน้าใน Three.js

### 4. ใช้ z จากความสว่าง (default) หรือ z=0

- ไม่ใส่อะไร: z มาจากความมืด/สว่างของพิกเซล (หน้าไม่แบน)
- `--no-z`: ใช้ z=0 ทุกจุด (หน้าแบน)

## ตัวอย่างคำสั่งเต็ม

```bash
cd c:\Users\User\Desktop\test3d\scripts
pip install -r requirements.txt
python image_to_face_points.py "C:\path\to\character_face.png" --output ../assets/face-points.json --count 24000 --scale 1.0
```

จากนั้นใน `js/main.js` ตั้ง `USE_FACE_FROM_FILE = true` แล้วรันเว็บ

## โครงสร้าง JSON

**แบบมีสี (default):** `[x, y, z, r, g, b]` — r,g,b อยู่ช่วง 0–1

```json
[[0.12, -0.05, -0.02, 0.95, 0.8, 0.72], ...]
```

**แบบไม่มีสี:** ใช้ `--no-color` จะได้แค่ `[x, y, z]`

โปรเจกต์จะใช้สีจาก vertex เมื่อโหลด JSON ที่มี 6 ค่าต่อจุด ทำให้ point cloud ตรงสีกับรูป
