/**
 * 3D Particle Morphing on Scroll
 * Stack: Three.js (particles + BufferGeometry) | GLSL shaders | Lenis + GSAP ScrollTrigger
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/+esm';

// ========== DOM & Container ==========
const container = document.getElementById('canvas-container');

// ========== Three.js: Scene, Camera, Renderer ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a14);

const CAMERA_BASE_Z = 1;
const CAMERA_FOV = 60;

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = CAMERA_BASE_Z;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// ========== Particle Count & Shapes ==========
const PARTICLE_COUNT = 100_000;
const MIN_CHUNKS = 1;
const MAX_CHUNKS = 20;

let numChunks = 4;
let loadedFacePoints = null;
let loadedFaceColors = null;

const TARGET_SCALE_X = 1;
const TARGET_SCALE_Y = 1;
const TARGET_SCALE_Z = 1;

function sphereChunk(count, radius, centerX, centerY, centerZ) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    pos[i * 3] = centerX + radius * Math.cos(theta) * Math.sin(phi);
    pos[i * 3 + 1] = centerY + radius * Math.sin(theta) * Math.sin(phi);
    pos[i * 3 + 2] = centerZ + radius * Math.cos(phi);
  }
  return pos;
}

function boxChunk(count, halfSize, centerX, centerY, centerZ) {
  const pos = new Float32Array(count * 3);
  const grid = Math.ceil(Math.pow(count, 1 / 3));
  for (let i = 0; i < count; i++) {
    const x = (i % grid) / (grid - 1 || 1) * 2 - 1;
    const y = (Math.floor(i / grid) % grid) / (grid - 1 || 1) * 2 - 1;
    const z = (Math.floor(i / (grid * grid)) % grid) / (grid - 1 || 1) * 2 - 1;
    pos[i * 3] = centerX + x * halfSize;
    pos[i * 3 + 1] = centerY + y * halfSize;
    pos[i * 3 + 2] = centerZ + z * halfSize;
  }
  return pos;
}

const USE_FACE_FROM_FILE = false;
const FACE_POINTS_URL = 'assets/face-points.json';
const DEFAULT_IMAGE_URL = 'assets/default.png';

async function loadFacePointsFromFile() {
  try {
    const res = await fetch(FACE_POINTS_URL);
    if (!res.ok) return null;
    const data = await res.json();
    const arr = Array.isArray(data[0]) ? data : data.points || data;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const hasColor = arr[0] && (Array.isArray(arr[0]) ? arr[0].length >= 6 : (arr[0].r != null));
    const n = Math.min(arr.length, PARTICLE_COUNT);
    for (let i = 0; i < n; i++) {
      const p = arr[i];
      const x = Array.isArray(p) ? p[0] : p.x;
      const y = Array.isArray(p) ? p[1] : p.y;
      const z = Array.isArray(p) ? (p[2] ?? 0) : (p.z ?? 0);
      positions[i * 3] = x * TARGET_SCALE_X;
      positions[i * 3 + 1] = y * TARGET_SCALE_Y;
      positions[i * 3 + 2] = z * TARGET_SCALE_Z;
      if (hasColor) {
        const r = Array.isArray(p) ? (p[3] ?? 1) : (p.r ?? 1);
        const g = Array.isArray(p) ? (p[4] ?? 1) : (p.g ?? 1);
        const b = Array.isArray(p) ? (p[5] ?? 1) : (p.b ?? 1);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
    }
    if (!hasColor) for (let i = 0; i < PARTICLE_COUNT * 3; i++) colors[i] = 1;
    for (let i = n; i < PARTICLE_COUNT; i++) {
      const j = i % n;
      positions[i * 3] = positions[j * 3];
      positions[i * 3 + 1] = positions[j * 3 + 1];
      positions[i * 3 + 2] = positions[j * 3 + 2];
      colors[i * 3] = colors[j * 3];
      colors[i * 3 + 1] = colors[j * 3 + 1];
      colors[i * 3 + 2] = colors[j * 3 + 2];
    }
    return { positions, colors };
  } catch (_) {
    return null;
  }
}

function getLayoutScale(n) {
  const ringRadius = 0.4 + 0.065 * n;
  const chunkRadius = Math.max(0.1, 0.55 / Math.sqrt(n));
  const boxHalf = Math.max(0.05, 0.28 / Math.sqrt(n));
  return { ringRadius, chunkRadius, boxHalf };
}

function fillChunkPositions(n, outA, outB) {
  const { ringRadius, chunkRadius, boxHalf } = getLayoutScale(n);
  const countPerChunk = Math.floor(PARTICLE_COUNT / n);
  for (let c = 0; c < n; c++) {
    const cnt = c === n - 1 ? PARTICLE_COUNT - (n - 1) * countPerChunk : countPerChunk;
    const angle = n === 1 ? 0 : (c / n) * Math.PI * 2;
    const cx = n === 1 ? 0 : ringRadius * Math.cos(angle);
    const cy = n === 1 ? 0 : ringRadius * Math.sin(angle);
    const cz = 0;
    const sa = sphereChunk(cnt, chunkRadius, cx, cy, cz);
    const ba = boxChunk(cnt, boxHalf, cx, cy, cz);
    for (let i = 0; i < cnt; i++) {
      const base = (c * countPerChunk + i) * 3;
      outA[base] = sa[i * 3]; outA[base + 1] = sa[i * 3 + 1]; outA[base + 2] = sa[i * 3 + 2];
      outB[base] = ba[i * 3]; outB[base + 1] = ba[i * 3 + 1]; outB[base + 2] = ba[i * 3 + 2];
    }
  }
  if (loadedFacePoints) {
    outB.set(loadedFacePoints.subarray(0, PARTICLE_COUNT * 3));
  }
}

const positionsA = new Float32Array(PARTICLE_COUNT * 3);
const positionsB = new Float32Array(PARTICLE_COUNT * 3);
fillChunkPositions(numChunks, positionsA, positionsB);

// ========== BufferGeometry + Shaders ==========
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positionsA, 3));
geometry.setAttribute('targetPosition', new THREE.BufferAttribute(positionsB, 3));
const defaultColors = new Float32Array(PARTICLE_COUNT * 3);
defaultColors.fill(1);
geometry.setAttribute('color', new THREE.BufferAttribute(defaultColors, 3));

const vertexShader = `
  uniform float uMix;
  attribute vec3 targetPosition;
  attribute vec3 color;
  varying float vMix;
  varying vec3 vColor;
  void main() {
    vMix = uMix;
    vColor = color;
    vec3 pos = mix(position, targetPosition, uMix);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = 2.5;
  }
`;

const fragmentShader = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uGlow;
  uniform float uBrightness;
  uniform float uUseVertexColor;
  varying float vMix;
  varying vec3 vColor;
  void main() {
    vec3 baseCol = mix(uColorA, uColorB, vMix);
    vec3 col = mix(baseCol, vColor, vMix * uUseVertexColor);
    float d = length(gl_PointCoord - 0.5);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    col += vec3(1.0) * (uGlow * (1.0 - d * 2.0));
    col *= uBrightness;
    gl_FragColor = vec4(col, a);
  }
`;

const POINT_BRIGHTNESS = 0.65;
const POINT_BRIGHTNESS_WHEN_MANY = 0.08;

const material = new THREE.ShaderMaterial({
  uniforms: {
    uMix: { value: 0 },
    uColorA: { value: new THREE.Color(0xff88bb) },
    uColorB: { value: new THREE.Color(0xaaff88) },
    uGlow: { value: 0.12 },
    uBrightness: { value: POINT_BRIGHTNESS },
    uUseVertexColor: { value: 0 },
  },
  vertexShader,
  fragmentShader,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const points = new THREE.Points(geometry, material);
const pointsGroup = new THREE.Group();
pointsGroup.add(points);
scene.add(pointsGroup);

if (USE_FACE_FROM_FILE) {
  loadFacePointsFromFile().then((result) => {
    if (result) {
      loadedFacePoints = result.positions;
      loadedFaceColors = result.colors;
      if (geometry) {
        geometry.attributes.targetPosition.array.set(loadedFacePoints.subarray(0, PARTICLE_COUNT * 3));
        geometry.attributes.targetPosition.needsUpdate = true;
        if (loadedFaceColors) {
          geometry.attributes.color.array.set(loadedFaceColors.subarray(0, PARTICLE_COUNT * 3));
          geometry.attributes.color.needsUpdate = true;
          material.uniforms.uUseVertexColor.value = 1;
        }
      }
    }
  });
}

if (DEFAULT_IMAGE_URL) {
  const defaultImg = new Image();
  defaultImg.onload = () => {
    const data = imageToPointCloudData(defaultImg);
    if (data) {
      applyPointCloudFromImage(data);
      previewImg.src = DEFAULT_IMAGE_URL;
      previewBox.style.display = 'block';
    }
  };
  defaultImg.onerror = () => {};
  defaultImg.src = DEFAULT_IMAGE_URL;
}

// ========== Chunk UI ==========
const chunkLabelEl = document.createElement('span');
chunkLabelEl.textContent = numChunks;
chunkLabelEl.style.cssText = 'min-width:2ch;text-align:center;font-weight:600;';

function buildChunkLayout(n) {
  fillChunkPositions(n, geometry.attributes.position.array, geometry.attributes.targetPosition.array);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.targetPosition.needsUpdate = true;
  if (chunkLabelEl) chunkLabelEl.textContent = n;
  const t = Math.max(0, Math.min(1, (n - 1) / (MAX_CHUNKS - 1)));
  const tSmooth = t * t * (3 - 2 * t);
  material.uniforms.uBrightness.value = POINT_BRIGHTNESS + tSmooth * (POINT_BRIGHTNESS_WHEN_MANY - POINT_BRIGHTNESS);
  const { ringRadius } = getLayoutScale(n);
  camera.position.z = Math.max(CAMERA_BASE_Z, CAMERA_BASE_Z - 1 + ringRadius * 1.8);
}

const SWIPE_THRESHOLD = 50;
let pointerStartX = 0;

function onPointerStart(clientX) { pointerStartX = clientX; }
function onPointerEnd(clientX) {
  const delta = clientX - pointerStartX;
  if (Math.abs(delta) < SWIPE_THRESHOLD) return;
  if (delta > 0) numChunks = Math.min(MAX_CHUNKS, numChunks + 1);
  else numChunks = Math.max(MIN_CHUNKS, numChunks - 1);
  buildChunkLayout(numChunks);
}

container.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerStart(e.touches[0].clientX); }, { passive: false });
container.addEventListener('touchend', (e) => { if (e.changedTouches[0]) onPointerEnd(e.changedTouches[0].clientX); });
let mouseDown = false;
container.addEventListener('mousedown', (e) => { mouseDown = true; onPointerStart(e.clientX); });
container.addEventListener('mousemove', (e) => { if (mouseDown) onPointerEnd(e.clientX); });
container.addEventListener('mouseup', () => { mouseDown = false; });
container.addEventListener('mouseleave', () => { mouseDown = false; });

const HOLD_DELAY = 400;
const HOLD_INTERVAL = 80;
let holdTimer = null;
let holdIntervalId = null;

function clearHold() {
  if (holdTimer) clearTimeout(holdTimer);
  if (holdIntervalId) clearInterval(holdIntervalId);
  holdTimer = null;
  holdIntervalId = null;
}

function setupHoldRepeat(btn, step) {
  const tick = () => {
    if (step < 0) numChunks = Math.max(MIN_CHUNKS, numChunks - 1);
    else numChunks = Math.min(MAX_CHUNKS, numChunks + 1);
    buildChunkLayout(numChunks);
  };
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    tick();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdIntervalId = setInterval(tick, HOLD_INTERVAL);
    }, HOLD_DELAY);
  });
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    tick();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdIntervalId = setInterval(tick, HOLD_INTERVAL);
    }, HOLD_DELAY);
  }, { passive: false });
  for (const ev of ['mouseup', 'mouseleave', 'touchend', 'touchcancel']) btn.addEventListener(ev, clearHold);
  document.addEventListener('mouseup', clearHold);
  document.addEventListener('touchend', clearHold);
}

const btnLess = document.createElement('button');
btnLess.textContent = '−';
btnLess.setAttribute('aria-label', 'ลดจำนวนก้อน');
btnLess.style.cssText = 'width:44px;height:44px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.4);color:#fff;font-size:24px;line-height:1;cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;user-select:none;';
setupHoldRepeat(btnLess, -1);

const btnMore = document.createElement('button');
btnMore.textContent = '+';
btnMore.setAttribute('aria-label', 'เพิ่มจำนวนก้อน');
btnMore.style.cssText = 'width:44px;height:44px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.4);color:#fff;font-size:24px;line-height:1;cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center;user-select:none;';
setupHoldRepeat(btnMore, 1);

const chunkControls = document.createElement('div');
chunkControls.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:8px 12px;background:rgba(0,0,0,0.5);border-radius:12px;border:1px solid rgba(255,255,255,0.15);z-index:10;color:rgba(255,255,255,0.9);font-size:18px;font-family:system-ui;';
chunkControls.appendChild(btnLess);
chunkControls.appendChild(chunkLabelEl);
chunkControls.appendChild(btnMore);
document.body.appendChild(chunkControls);

// ========== Upload + Preview ==========
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
fileInput.setAttribute('aria-label', 'เลือกรูปภาพ');
document.body.appendChild(fileInput);

const uploadBtn = document.createElement('button');
uploadBtn.textContent = 'อัปโหลดรูป';
uploadBtn.setAttribute('aria-label', 'อัปโหลดรูป');
uploadBtn.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:10px 16px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.4);color:#fff;font-size:14px;cursor:pointer;border-radius:8px;z-index:10;font-family:system-ui;';
uploadBtn.addEventListener('click', () => fileInput.click());
document.body.appendChild(uploadBtn);

const previewBox = document.createElement('div');
previewBox.style.cssText = 'position:fixed;top:24px;right:24px;width:200px;max-height:280px;background:rgba(0,0,0,0.6);border-radius:12px;border:1px solid rgba(255,255,255,0.2);z-index:10;overflow:hidden;display:none;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
const previewLabel = document.createElement('div');
previewLabel.textContent = 'รูปที่อัปโหลด';
previewLabel.style.cssText = 'padding:8px 12px;font-size:12px;color:rgba(255,255,255,0.8);border-bottom:1px solid rgba(255,255,255,0.1);font-family:system-ui;';
const previewImg = document.createElement('img');
previewImg.alt = 'Preview';
previewImg.style.cssText = 'display:block;width:100%;height:auto;max-height:240px;object-fit:contain;background:#111;';
previewBox.appendChild(previewLabel);
previewBox.appendChild(previewImg);
document.body.appendChild(previewBox);

function imageToPointCloudData(img) {
  const w = Math.min(img.width, 512);
  const h = Math.min(img.height, 512);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const indices = [];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const visible = a >= 20 && (a < 255 || brightness < 0.98);
      if (visible) indices.push({ px, py, i });
    }
  }
  if (indices.length === 0) return null;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const cx = w / 2, cy = h / 2, size = Math.max(w, h);
  for (let n = 0; n < PARTICLE_COUNT; n++) {
    const idx = indices[Math.floor(Math.random() * indices.length)];
    const { px, py } = idx;
    const i = idx.i;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    const x = (px - cx) / size;
    const y = -(py - cy) / size;
    const z = -brightness * 0.2;
    positions[n * 3] = x * TARGET_SCALE_X;
    positions[n * 3 + 1] = y * TARGET_SCALE_Y;
    positions[n * 3 + 2] = z * TARGET_SCALE_Z;
    colors[n * 3] = r;
    colors[n * 3 + 1] = g;
    colors[n * 3 + 2] = b;
  }
  return { positions, colors };
}

function applyPointCloudFromImage(data) {
  if (!data || !geometry) return;
  loadedFacePoints = data.positions;
  loadedFaceColors = data.colors;
  geometry.attributes.targetPosition.array.set(data.positions.subarray(0, PARTICLE_COUNT * 3));
  geometry.attributes.targetPosition.needsUpdate = true;
  geometry.attributes.color.array.set(data.colors.subarray(0, PARTICLE_COUNT * 3));
  geometry.attributes.color.needsUpdate = true;
  material.uniforms.uUseVertexColor.value = 1;
}

let previewObjectURL = null;
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (previewObjectURL) URL.revokeObjectURL(previewObjectURL);
  previewObjectURL = URL.createObjectURL(file);
  previewImg.src = previewObjectURL;
  previewBox.style.display = 'block';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const data = imageToPointCloudData(img);
    if (data) applyPointCloudFromImage(data);
  };
  img.src = previewObjectURL;
});

// ========== Lenis + GSAP ScrollTrigger ==========
const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.scrollerProxy(document.documentElement, {
  scrollTop(value) {
    if (arguments.length) lenis.scrollTo(value);
    return lenis.scroll;
  },
  getBoundingClientRect() {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  },
});

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => { lenis.raf(time * 1000); });
gsap.ticker.lagSmoothing(0);

/** ค่า scroll progress (0–1) ใช้เช็คตอนเลื่อนลงสุดแล้ว */
let scrollProgress = 0;
/** ความเร็วหมุนต่อเฟรมเมื่อเลื่อนลงสุดแล้ว (rad/frame) */
const IDLE_ROTATE_SPEED = 0.008;
const characterNameEl = document.getElementById('character-name');

ScrollTrigger.create({
  trigger: '.scroll-content',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 1,
  onUpdate: (self) => {
    scrollProgress = self.progress;
    material.uniforms.uMix.value = self.progress;
    if (self.progress < 1) {
      points.rotation.y = self.progress * Math.PI * 2;
    }
    // เลื่อนลงสุดแล้ว → แสดงชื่อตัวละคร (ไทย / Eng / ญี่ปุ่น)
    if (characterNameEl) {
      if (self.progress >= 0.99) characterNameEl.classList.add('visible');
      else characterNameEl.classList.remove('visible');
    }
  },
});

// ========== Resize ==========
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ScrollTrigger.refresh();
});

// ========== หมุนด้วยเมาส์ ==========
let isRotating = false;
let prevMouseX = 0;
let prevMouseY = 0;
const ROTATE_SPEED = 0.005;
const isButton = (el) => el && (el.tagName === 'BUTTON' || el.closest('button'));
const isUIControl = (el) => el && (previewBox.contains(el) || el === fileInput);

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || isButton(e.target) || isUIControl(e.target)) return;
  isRotating = true;
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  if (!isRotating) return;
  const dx = (e.clientX - prevMouseX) * ROTATE_SPEED;
  const dy = (e.clientY - prevMouseY) * ROTATE_SPEED;
  pointsGroup.rotation.y += dx;
  pointsGroup.rotation.x -= dy;
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
});
window.addEventListener('mouseup', () => { isRotating = false; });
window.addEventListener('mouseleave', () => { isRotating = false; });

document.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1 || isButton(e.target) || isUIControl(e.target)) return;
  isRotating = true;
  prevMouseX = e.touches[0].clientX;
  prevMouseY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!isRotating || e.touches.length !== 1) return;
  const dx = (e.touches[0].clientX - prevMouseX) * ROTATE_SPEED;
  const dy = (e.touches[0].clientY - prevMouseY) * ROTATE_SPEED;
  pointsGroup.rotation.y += dx;
  pointsGroup.rotation.x -= dy;
  prevMouseX = e.touches[0].clientX;
  prevMouseY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', () => { isRotating = false; });

// ========== Animation Loop ==========
function animate() {
  requestAnimationFrame(animate);
  // เลื่อนลงสุดแล้ว → หมุนรอบตัวเองต่อเนื่อง
  if (scrollProgress >= 0.999) {
    points.rotation.y += IDLE_ROTATE_SPEED;
  }
  renderer.render(scene, camera);
}
animate();
