/**
 * 后处理 Shader + 排线纹理 — v3
 * 风格要点：
 *  - 暖米纸色 + 浅蓝横线（已取消红色装订线）
 *  - 线框渲染为主：物体用 wireframe 线条表现，透出背景纸张
 *  - 排线仅作用于极暗面，且排除边缘线（保持干净单像素线条）
 *  - 橙/黄/红暖色保留通道（彩笔高亮直接叠加在手绘蓝线之上）
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * 生成一张单向 45° 斜线排线纹理（无交叉网格）
 * @param {number} spacing 线间距（越大越疏）
 */
function createHatchingTexture(spacing, angle = -Math.PI / 4) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.2;

  // 轻微手绘抖动（保留笔触感，但不粗）
  const jitter = () => (Math.random() - 0.5) * 1.0;

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = spacing;
  const px = -dy, py = dx;
  for (let d = -size; d < size * 2; d += step) {
    const startX = d * px + (-size) * dx;
    const startY = d * py + (-size) * dy;
    const endX = d * px + (size) * dx;
    const endY = d * py + (size) * dy;
    const seg = 4;
    ctx.beginPath();
    ctx.moveTo(startX + jitter(), startY + jitter());
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      ctx.lineTo(
        startX + (endX - startX) * t + jitter(),
        startY + (endY - startY) * t + jitter(),
      );
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/** 4 张不同密度的单向排线纹理（亮 → 暗，密度比 v1 减半） */
export function createHatchingTextures() {
  return [
    createHatchingTexture(56), // 0 稀疏（v1 28 → 56，密度减半）
    createHatchingTexture(32), // 1 中疏（v1 16 → 32）
    createHatchingTexture(20), // 2 较密（v1 10 → 20）
    createHatchingTexture(10), // 3 最密（v1 5 → 10）
  ];
}

// ============ 后处理 Shader ============
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D hatchTex0;
  uniform sampler2D hatchTex1;
  uniform sampler2D hatchTex2;
  uniform sampler2D hatchTex3;
  uniform float time;
  uniform vec2 resolution;
  uniform float jitterStrength;

  varying vec2 vUv;

  const vec3 PAPER      = vec3(0.96, 0.94, 0.88); // 暖米色纸张
  const vec3 RULED_BLUE = vec3(0.75, 0.82, 0.93); // 浅蓝横向笔记本线
  const vec3 INK        = vec3(0.12, 0.22, 0.65); // 圆珠笔蓝（线条/排线）
  const vec3 INK_SOFT   = vec3(0.55, 0.62, 0.80); // 淡蓝墨水（物体底色）

  // ---- 伪随机 / 平滑噪声（仅用于横线、边距线的手绘微抖动） ----
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float luminance(vec2 uv) {
    return dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114));
  }

  // ---- Sobel 边缘（基于亮度，返回梯度幅值） ----
  float sobel(vec2 uv) {
    vec2 px = 1.0 / resolution;
    float tl = luminance(uv + vec2(-px.x,  px.y));
    float t  = luminance(uv + vec2(0.0,    px.y));
    float tr = luminance(uv + vec2( px.x,  px.y));
    float l  = luminance(uv + vec2(-px.x,  0.0));
    float r  = luminance(uv + vec2( px.x,  0.0));
    float bl = luminance(uv + vec2(-px.x, -px.y));
    float b  = luminance(uv + vec2(0.0,   -px.y));
    float br = luminance(uv + vec2( px.x, -px.y));
    float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
    float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
    return sqrt(gx*gx + gy*gy);
  }

  void main() {
    vec2 uv = vUv;

    // 直接采样：不做画面级按帧抖动，线条保持干净
    vec3 scene = texture2D(tDiffuse, uv).rgb;
    float lum = dot(scene, vec3(0.299, 0.587, 0.114));

    vec3 color = PAPER;

    // ---- 物体 vs 背景：地面/纸张为背景（干净留白） ----
    float objectMask = 1.0 - smoothstep(0.70, 0.86, lum);

    // ---- 排线阴影：仅暗面(lum<0.35) 且仅物体区域；单向斜线 ----
    vec2 huv = uv * vec2(1.6, 1.6);
    float h0 = texture2D(hatchTex0, huv).r;
    float h1 = texture2D(hatchTex1, huv).r;
    float h2 = texture2D(hatchTex2, huv).r;
    float h3 = texture2D(hatchTex3, huv).r;

    // ---- 细蓝墨边缘：二值化阈值 → 干净单像素线条（先算，供排线排除使用） ----
    float edge = sobel(uv);
    float edgeLine = smoothstep(0.10, 0.15, edge);

    // ---- 排线阴影：仅暗面(lum<0.35)，排除边缘线保持线条干净 ----
    float hatch = 0.0;
    if (lum < 0.35) {
      if (lum > 0.27)      hatch = h0;
      else if (lum > 0.19) hatch = mix(h0, h1, smoothstep(0.27, 0.19, lum));
      else if (lum > 0.10) hatch = mix(h1, h2, smoothstep(0.19, 0.10, lum));
      else                 hatch = mix(h2, h3, smoothstep(0.10, 0.0, lum));
    }
    float hatchAmt = hatch * 0.45 * objectMask * (1.0 - edgeLine * 0.7);
    color = mix(color, INK, hatchAmt);

    // 物体淡蓝底色（极淡，仅暗面区域）
    color = mix(color, INK_SOFT, objectMask * 0.04);

    // 细蓝墨边缘叠加
    float edgeLineMask = edgeLine * (0.35 + objectMask);
    color = mix(color, INK, edgeLineMask * 0.9);

    // ---- 浅蓝横向笔记本线（间距约 28px，静态手绘微弯） ----
    float ruledFreq = resolution.y / 28.0;
    float wiggle = (noise(vec2(uv.x * 90.0, 7.31)) - 0.5) * 0.006;
    float linePos = fract((uv.y + wiggle) * ruledFreq);
    float ruled = smoothstep(0.988, 1.0, linePos) * (1.0 - smoothstep(1.0, 1.012, linePos));
    color = mix(color, RULED_BLUE, ruled * 0.55);

    // ---- 暖色保留通道（橙/黄/红）：原色直接叠加在手绘蓝线之上 ----
    // 抗高光溢出判定：r 为最大通道 + b 显著低于 r + 饱和度足够
    // （纯 hue 检测在 r 通道 clamp 溢出后色相会漂移，导致橙色丢失）
    float maxc = max(scene.r, max(scene.g, scene.b));
    float minc = min(scene.r, min(scene.g, scene.b));
    float sat = maxc - minc;
    float warmMask = smoothstep(0.12, 0.22, sat)          // 饱和度门槛（排除纸色/灰）
                   * step(maxc, scene.r + 1e-4)           // r 是最大通道
                   * (1.0 - smoothstep(0.55, 0.75, scene.b / max(scene.r, 1e-4))); // 蓝分量低
    warmMask *= (0.15 + objectMask * 0.85);               // 以物体区域为主
    color = mix(color, scene, warmMask * 0.92);
    // 暖色物体上仍保留蓝墨轮廓勾勒
    color = mix(color, INK, edgeLine * warmMask * 0.55);

    // 无颗粒：移除 grain，保证干净圆珠笔线条

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * 创建后处理 ShaderPass
 * @param {THREE.Texture[]} hatchTextures 4 张排线纹理
 */
export function createDoodleShaderPass(hatchTextures) {
  return new ShaderPass({
    vertexShader,
    fragmentShader,
    uniforms: {
      tDiffuse:   { value: null },
      hatchTex0:  { value: hatchTextures[0] },
      hatchTex1:  { value: hatchTextures[1] },
      hatchTex2:  { value: hatchTextures[2] },
      hatchTex3:  { value: hatchTextures[3] },
      time:       { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      jitterStrength: { value: 0.0 },
    },
  });
}

export { vertexShader, fragmentShader };
