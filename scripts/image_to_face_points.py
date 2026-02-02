#!/usr/bin/env python3
"""
สร้าง face-points.json จากรูป PNG (ใบหน้าตัวการ์ตูน)
ใช้ mask จาก alpha หรือ contour แล้ว sample จุด N จุด → export เป็น JSON สำหรับโปรเจกต์ 3D particle morph

Usage:
  python image_to_face_points.py input.png [--output face-points.json] [--count 24000] [--scale 0.5]
"""

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    print("ต้องติดตั้ง: pip install numpy pillow")
    sys.exit(1)

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


def load_image(path: str) -> np.ndarray:
    """โหลดรูปเป็น RGB + alpha ถ้ามี"""
    img = Image.open(path).convert("RGBA")
    return np.array(img)


def mask_from_alpha(rgba: np.ndarray, threshold: int = 128) -> np.ndarray:
    """ใช้ alpha เป็น mask: 1 ที่ไม่โปร่งใส, 0 ที่โปร่งใส"""
    return (rgba[:, :, 3] >= threshold).astype(np.uint8)


def mask_from_contour(rgb: np.ndarray) -> np.ndarray:
    """ใช้ OpenCV หา contour หลัก (รูปใหญ่สุด) เป็น mask"""
    if not HAS_CV2:
        return None
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [largest], -1, 1, -1)
    return mask


def mask_from_edges(rgb: np.ndarray, blur: int = 5) -> np.ndarray:
    """ใช้ edge แล้ว fill ภายในเป็น mask (ต้องมี OpenCV)"""
    if not HAS_CV2:
        return None
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (blur, blur), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [largest], -1, 1, -1)
    return mask


def sample_points_from_mask(
    mask: np.ndarray,
    count: int,
    rgb: np.ndarray,
    use_brightness_for_z: bool = True,
    include_color: bool = True,
) -> list[list[float]]:
    """
    สุ่มจุดจากพิกเซลที่ mask == 1 จำนวน count จุด
    แปลง (px, py) → (x, y, z) และเก็บสี RGB (0–1) ถ้า include_color=True
    คืนค่า [[x,y,z,r,g,b], ...] หรือ [[x,y,z], ...]
    """
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        raise ValueError("mask ไม่มีพิกเซล — ลองใช้รูปที่มี alpha หรือ contour ชัด")

    n_need = min(count, len(xs))
    rng = np.random.default_rng(42)
    idx = rng.choice(len(xs), size=n_need, replace=(n_need > len(xs)))

    h, w = mask.shape[:2]
    cx, cy = w / 2.0, h / 2.0
    size = max(w, h)

    points = []
    for i in idx:
        px, py = xs[i], ys[i]
        x = (px - cx) / size
        y = -(py - cy) / size
        if rgb is not None:
            r, g, b = float(rgb[py, px, 0]), float(rgb[py, px, 1]), float(rgb[py, px, 2])
            z = -(0.299 * r + 0.587 * g + 0.114 * b) / 255.0 * 0.2 if use_brightness_for_z else 0.0
            if include_color:
                points.append([float(x), float(y), float(z), r / 255.0, g / 255.0, b / 255.0])
            else:
                points.append([float(x), float(y), float(z)])
        else:
            z = 0.0
            points.append([float(x), float(y), float(z)])

    if n_need < count:
        extra = count - n_need
        for _ in range(extra):
            j = rng.integers(0, len(points))
            points.append(list(points[j]))

    return points[:count]


def main():
    parser = argparse.ArgumentParser(description="สร้าง face-points.json จาก PNG")
    parser.add_argument("input", help="path ไปที่รูป PNG (ใบหน้าตรง)")
    parser.add_argument(
        "--output", "-o", default="face-points.json", help="path ไฟล์ JSON ที่จะเขียน (default: face-points.json)"
    )
    parser.add_argument("--count", "-n", type=int, default=24_000, help="จำนวนจุด (default: 24000)")
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="ขยายพิกัด x,y ให้อยู่ช่วงประมาณ [-scale*0.5, scale*0.5] (default: 1.0 = ตรงกับ Three.js)",
    )
    parser.add_argument(
        "--method",
        choices=["alpha", "contour", "edge"],
        default="alpha",
        help="วิธีได้ mask: alpha=ใช้ช่อง alpha, contour=รูปขาวดำ, edge=ขอบ (default: alpha)",
    )
    parser.add_argument("--no-z", action="store_true", help="ใช้ z=0 ทุกจุด (ไม่ใช้ความสว่าง)")
    parser.add_argument("--no-color", action="store_true", help="ไม่ export สี RGB (ใช้แค่ x,y,z)")
    args = parser.parse_args()

    path_in = Path(args.input)
    if not path_in.exists():
        print(f"ไม่พบไฟล์: {path_in}")
        sys.exit(1)

    img = load_image(str(path_in))
    rgb = img[:, :, :3]
    rgba = img

    if args.method == "alpha":
        mask = mask_from_alpha(rgba)
    elif args.method == "contour":
        mask = mask_from_contour(rgb)
        if mask is None:
            print("หา contour ไม่ได้ — ลอง --method alpha หรือใช้รูปที่มี contrast ชัด")
            sys.exit(1)
    else:
        mask = mask_from_edges(rgb)
        if mask is None:
            print("หา edge ไม่ได้ — ลอง --method alpha")
            sys.exit(1)

    points = sample_points_from_mask(
        mask,
        args.count,
        rgb,
        use_brightness_for_z=not args.no_z,
        include_color=not args.no_color,
    )

    for p in points:
        p[0] *= args.scale
        p[1] *= args.scale

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(points, f, separators=(",", ":"))

    print(f"Wrote {len(points)} points -> {out_path}")


if __name__ == "__main__":
    main()
