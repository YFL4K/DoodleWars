/**
 * 后处理 Shader + 排线纹理
 * 核心：把 3D 渲染结果转为「纸张 + 蓝墨水边缘 + 排线阴影 + 手绘抖动」风格
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * 生成一张斜线排线纹理
 * @param {number} spacing 线间距（越小越密）
 * @param {number} angle   斜线角度（弧度）
 * @param {boolean} cross  是否叠加交叉斜线
 */
function createHatchingTexture(spacing, angle = -Math.PI / 4, cross = false) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;

  // 手绘抖动：每条线加微小偏移
  const drawHatch = (offAngle) => {
    const dx = Math.cos(offAngle);
    const dy = Math.sin(offAngle);
    // 用足够多的平行线覆盖画布
    const step = spacing;
    for (let d = -size; d < size * 2; d += step) {
      ctx.beginPath();
      // 垂直于线的方向偏移
      const px = -dy, py = dx;
      // 找到线上两个端点
      const startX = d * px + (-size) * dx;
      const startY = d * py + (-size) * dy;
      const endX = d * px + (size) * dx;
      const endY = d * py + (size) * dy;
      // 分 4 段画，每段加抖动
      const seg = 4;
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
  };

  const jitter = () => (Math.random() - 0.5) * 2.2;

  drawHatch(angle);
  if (cross) drawHatch(angle + Math.PI / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/** 4 张不同密度的排线纹理（亮 → 暗） */
export function createHatchingTextures() {
  return [
    createHatchingTexture(28, -Math.PI / 4, false), // 0 稀疏单斜线
    createHatchingTexture(16, -Math.PI / 4, false), // 1 中等单斜线
    createHatchingTexture(10, -Math.PI / 4, true),  // 2 交叉排线
    createHatchingTexture(5,  -Math.PI / 4, true),  // 3 密集交叉排线
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

  const vec3 PAPER    = vec3(0.955, 0.935, 0.862); // 米白纸色
  const vec3 INK      = vec3(0.10, 0.14, 0.40);    // 蓝墨水
  const vec3 INK_LIGHT= vec3(0.25, 0.30, 0.55);    // 淡蓝墨水
  const vec3 MARGIN   = vec3(0.82, 0.32, 0.30);    // 红色装订线

  // ---- 噪声（手绘抖动用） ----
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

  // ---- Sobel 边缘检测（基于亮度） ----
  float luminance(vec2 uv) {
    return dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114));
  }
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
    return clamp(sqrt(gx*gx + gy*gy) * 2.0, 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;

    // 手绘抖动：低频噪声让整个画面轻微弯曲
    float jx = (noise(uv * vec2(420.0, 610.0) + time * 0.35) - 0.5) * jitterStrength;
    float jy = (noise(uv * vec2(610.0, 420.0) + time * 0.28) - 0.5) * jitterStrength;
    vec2 suv = uv + vec2(jx, jy);

    vec3 scene = texture2D(tDiffuse, suv).rgb;
    float lum = dot(scene, vec3(0.299, 0.587, 0.114));

    // 边缘
    float edge = sobel(suv);

    // 判断「物体 vs 背景」：背景接近纸色（亮度高），物体偏暗
    float objectMask = 1.0 - smoothstep(0.75, 0.95, lum);

    // 排线阴影：根据亮度分 4 层混合（暗 → 密集排线）
    vec2 huv = suv * vec2(1.6, 1.6);
    float h0 = texture2D(hatchTex0, huv).r;
    float h1 = texture2D(hatchTex1, huv).r;
    float h2 = texture2D(hatchTex2, huv).r;
    float h3 = texture2D(hatchTex3, huv).r;

    float hatch = 0.0;
    if (lum > 0.62) hatch = 0.0;
    else if (lum > 0.45) hatch = h0;
    else if (lum > 0.28) hatch = mix(h0, h1, smoothstep(0.45, 0.28, lum));
    else if (lum > 0.12) hatch = mix(h1, h2, smoothstep(0.28, 0.12, lum));
    else hatch = mix(h2, h3, smoothstep(0.12, 0.0, lum));

    // 合成：从纸张开始
    vec3 color = PAPER;

    // 物体区域：排线阴影（蓝色排线） + 保留物体轮廓色
    color = mix(color, INK, hatch * 0.55 * objectMask);
    // 物体本身底色（淡蓝墨水）
    color = mix(color, INK_LIGHT, objectMask * 0.18);

    // 蓝墨水边缘勾勒（物体轮廓 + 结构线）
    color = mix(color, INK, edge * 0.85 * (0.3 + objectMask));

    // 纸张横向划线（等间距浅蓝横线）
    float ruledFreq = 46.0;
    float lineY = fract(uv.y * ruledFreq + jy * ruledFreq * 0.5);
    float ruled = smoothstep(0.965, 1.0, lineY) * (1.0 - smoothstep(1.0, 1.01, lineY));
    color = mix(color, INK_LIGHT, ruled * 0.30);

    // 红色装订线（左侧，带手绘弯曲）
    float marginX = 0.085 + (noise(vec2(uv.y * 60.0, 3.7)) - 0.5) * 0.006;
    float marginLine = smoothstep(marginX - 0.0022, marginX, uv.x + jx * 0.3)
                     * (1.0 - smoothstep(marginX, marginX + 0.0022, uv.x + jx * 0.3));
    color = mix(color, MARGIN, marginLine * 0.85);

    // 轻微陈旧感：整体加一点噪点
    float grain = (hash(uv * resolution + time) - 0.5) * 0.03;
    color += grain;

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
      jitterStrength: { value: 0.004 },
    },
  });
}

export { vertexShader, fragmentShader };
