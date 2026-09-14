/**
 * Doodle District 渲染管线复刻
 * 架构：G-buffer 延迟风格
 *   1) 物体材质把 vec4(shade, inkId, normal.xy) 写入 HalfFloat render target（+ Float 深度图）
 *   2) 全屏 post quad 解码 G-buffer：逆深度拉普拉斯边缘 + 世界空间 LOD 排线 + 纸张/横线 + 墨色
 * 已按用户要求：取消左侧红色装订线（margin）。
 */
import * as THREE from 'three';

// ===== 墨色配置（复刻参考） =====
export const INK = { BLUE: 0, RED: 1, BLACK: 2, ORANGE: 3, GREEN: 4, PINK: 5 };
export const INK_COLORS = [
  new THREE.Vector3(.1, .19, .76),   // BLUE  圆珠笔蓝
  new THREE.Vector3(.86, .12, .2),   // RED
  new THREE.Vector3(.18, .2, .26),   // BLACK
  new THREE.Vector3(.92, .55, .08),  // ORANGE 彩笔橙
  new THREE.Vector3(.12, .6, .3),    // GREEN
  new THREE.Vector3(.9, .4, .66),    // PINK
];
const PAPER = new THREE.Vector3(.965, .955, .905);
const LIGHT_DIR = new THREE.Vector3(.38, .82, .42).normalize();

// 共享 uniforms（所有物体材质引用同一对象，render 时统一更新）
const shared = {
  uLightDir: { value: new THREE.Vector3(0, 1, 0) },
  uTime: { value: 0 },
};

// ===== 物体 G-buffer 材质 =====
const objectVert = /* glsl */ `
varying vec3 vNormalV;
varying vec4 vColorData;
uniform float uTime;
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    objectNormal = mat3(instanceMatrix) * objectNormal;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vColorData = vec4(instanceColor, 1.0);
  #else
    vColorData = vec4(0.0, 0.0, 0.0, -1.0);
  #endif
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vNormalV = normalize(normalMatrix * objectNormal);
  gl_Position = projectionMatrix * mvPosition;
}`;

const objectFrag = /* glsl */ `
precision highp float;
uniform float uInk;
uniform float uFill;
uniform float uShadeScale;
uniform float uShadeBias;
uniform vec3 uLightDir;
varying vec3 vNormalV;
varying vec4 vColorData;
void main() {
  vec3 n = normalize(vNormalV);
  if (!gl_FrontFacing) n = -n;
  float ndl = dot(n, uLightDir) * 0.5 + 0.5;
  float ink = uInk; float fill = uFill;
  if (vColorData.a > 0.0) { ink = vColorData.r; fill = vColorData.g; }
  float shade = clamp(ndl * uShadeScale + uShadeBias, 0.0, 1.0);
  if (fill > 0.5) shade = -1.0;
  gl_FragColor = vec4(shade, ink, n.x, n.y);
}`;

/**
 * 创建 G-buffer 物体材质
 * @param {object} o { ink, fill, shadeScale, shadeBias, side }
 */
export function inkMaterial(o = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uInk:        { value: o.ink ?? INK.BLUE },
      uFill:       { value: o.fill ? 1 : 0 },
      uShadeScale: { value: o.shadeScale ?? 1 },
      uShadeBias:  { value: o.shadeBias ?? 0 },
      uLightDir:   shared.uLightDir,
      uTime:       shared.uTime,
    },
    vertexShader: objectVert,
    fragmentShader: objectFrag,
    side: o.side ?? THREE.FrontSide,
  });
  mat.inkId = o.ink ?? INK.BLUE;
  return mat;
}

// ===== 后处理 =====
const postVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const postFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uAspect;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uHurt;
uniform float uFlash;
uniform float uSlow;
uniform float uLineSpacing;
uniform float uLineMode;
uniform float uLowHp;
uniform vec3 uPaper;
uniform vec3 uInks[6];
uniform mat4 uInvProj;
uniform mat4 uInvView;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float linDepth(float z) { float zn = z * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }
vec3 inkColor(float id) {
  int i = int(id + 0.5);
  if (i <= 0) return uInks[0]; if (i == 1) return uInks[1]; if (i == 2) return uInks[2];
  if (i == 3) return uInks[3]; if (i == 4) return uInks[4]; return uInks[5];
}
float stripes(vec2 p, vec2 dir, float spacing, float width) {
  float t = dot(p, vec2(-dir.y, dir.x));
  float f = abs(fract(t / spacing) - 0.5) * spacing;
  float soft = width * 0.6;
  return 1.0 - smoothstep(width * 0.5 - soft, width * 0.5 + soft, f);
}
void main() {
  vec2 px = 1.0 / uRes;
  float sc = uRes.y / 900.0;
  vec2 nuv = vUv * vec2(uAspect, 1.0);
  vec2 wob = vec2(vnoise(nuv * 6.0 + 11.3), vnoise(nuv * 6.0 + 37.0)) - 0.5;
  vec2 suv = vUv + wob * 2.0 * sc * px;
  vec4 s = texture2D(tScene, suv);
  float z = texture2D(tDepth, suv).x;
  float d = linDepth(z);
  float o = 1.15 * sc;
  vec2 ox = vec2(o, 0.0) * px, oy = vec2(0.0, o) * px;
  float zl = texture2D(tDepth, suv - ox).x, zr = texture2D(tDepth, suv + ox).x;
  float zu = texture2D(tDepth, suv + oy).x, zd = texture2D(tDepth, suv - oy).x;
  vec4 sl = texture2D(tScene, suv - ox), sr = texture2D(tScene, suv + ox);
  vec4 su = texture2D(tScene, suv + oy), sd = texture2D(tScene, suv - oy);
  // 逆深度拉普拉斯边缘：对任意平面（含掠射地面）尺度不变，只认真实轮廓
  float iw = 1.0 / d;
  float lap = abs(1.0 / linDepth(zl) + 1.0 / linDepth(zr) - 2.0 * iw)
            + abs(1.0 / linDepth(zu) + 1.0 / linDepth(zd) - 2.0 * iw);
  float edge = smoothstep(0.07, 0.30, lap / (iw + 1e-7));
  float nEdge = length(sl.ba - sr.ba) + length(su.ba - sd.ba);
  edge = max(edge, smoothstep(0.42, 0.85, nEdge));
  float zmin = z; float inkId = s.g;
  if (zl < zmin) { zmin = zl; inkId = sl.g; }
  if (zr < zmin) { zmin = zr; inkId = sr.g; }
  if (zu < zmin) { zmin = zu; inkId = su.g; }
  if (zd < zmin) { zmin = zd; inkId = sd.g; }
  float dFront = linDepth(zmin);
  bool sky = z >= 0.99999;

  // 世界空间排线：从深度重建世界坐标，沿表面切平面铺线，随距离按 2 的幂 LOD
  float shade = s.r;
  float hatch = 0.0;
  if (!sky) {
    if (shade < 0.0) hatch = 1.0;
    else {
      vec2 hp; float sp, w;
      if (d < 2.0) {
        hp = gl_FragCoord.xy + wob * 5.0 * sc;
        sp = 8.5 * sc; w = 1.5 * sc;
      } else {
        vec4 clip = vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
        vec4 vpos = uInvProj * clip; vpos /= vpos.w;
        vec3 wpos = (uInvView * vec4(vpos.xyz, 1.0)).xyz;
        vec2 nxy = s.ba;
        vec3 nView = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
        vec3 wn = normalize(mat3(uInvView) * nView);
        vec3 an = abs(wn);
        hp = an.y > max(an.x, an.z) ? wpos.xz : (an.x > an.z ? wpos.zy : wpos.xy);
        float lod = exp2(floor(log2(max(1e-4, (0.0165 * d) / 0.16))));
        sp = 0.16 * lod; w = sp * 0.17;
        hp += (vnoise(hp * (2.5 / sp)) - 0.5) * sp * 0.4;
      }
      const vec2 d1 = vec2(0.7071, 0.7071);
      const vec2 d2 = vec2(-0.7071, 0.7071);
      const vec2 d3 = vec2(0.2588, 0.9659);
      float h1 = stripes(hp, d1, sp, w);
      float h2 = stripes(hp, d2, sp * 1.15, w);
      float h3 = stripes(hp, d3, sp * 0.7, w);
      hatch = h1 * smoothstep(0.64, 0.5, shade);
      hatch = max(hatch, h2 * smoothstep(0.42, 0.32, shade));
      hatch = max(hatch, h3 * smoothstep(0.24, 0.14, shade));
      hatch = max(hatch, smoothstep(0.12, 0.0, shade) * 0.9);
    }
  }
  float fade = mix(1.0, 0.28, smoothstep(14.0, 110.0, d));
  float fadeE = mix(1.0, 0.45, smoothstep(30.0, 220.0, dFront));

  // 纸张：颗粒 + 浅蓝横线（已按用户要求移除红色装订线 margin）
  vec2 pp = gl_FragCoord.xy;
  float grain = vnoise(pp * 0.8) * 0.6 + vnoise(pp * 0.17) * 0.4;
  vec3 paper = uPaper * (0.95 + 0.06 * grain);
  float ls = uLineSpacing;
  if (uLineMode < 0.5) {
    float ly = mod(pp.y + ls * 0.5, ls);
    float rule = 1.0 - smoothstep(0.5 * sc, 1.7 * sc, abs(ly - ls * 0.5));
    paper = mix(paper, vec3(0.58, 0.70, 0.92), rule * 0.5);
  } else {
    float gs = ls * 0.62;
    float gx = mod(pp.x + gs * 0.5, gs), gy = mod(pp.y + gs * 0.5, gs);
    float g1 = 1.0 - smoothstep(0.35 * sc, 1.15 * sc, abs(gx - gs * 0.5));
    float g2 = 1.0 - smoothstep(0.35 * sc, 1.15 * sc, abs(gy - gs * 0.5));
    paper = mix(paper, vec3(0.58, 0.76, 0.63), max(g1, g2) * 0.19);
  }

  vec3 col = paper;
  col = mix(col, inkColor(s.g), hatch * 0.72 * fade);
  float ew = 0.75 + 0.35 * vnoise(pp * 0.35);
  col = mix(col, inkColor(inkId) * 0.92, clamp(edge * ew, 0.0, 1.0) * fadeE);

  // hurt 红色涂鸦暗角；低血量脉冲
  vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.32, 0.9, length(vc));
  float scr = 0.55 + 0.45 * stripes(pp + wob * 8.0, normalize(vec2(1.0, 0.8)), 7.0 * sc, 2.2 * sc);
  float hurt = clamp(uHurt + uLowHp * (0.35 + 0.25 * sin(uTime * 6.0)), 0.0, 1.0);
  col = mix(col, uInks[1] * 0.9, hurt * vig * scr);
  col = mix(col, uPaper, uFlash);
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(lum) * vec3(0.8, 0.86, 1.0), uSlow * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

export class DoodleRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    // 广角相机（FOV 80, near 0.08, far 420）
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.08, 420);

    // G-buffer render target（NearestFilter：不能线性插值编码值）
    const depth = new THREE.DepthTexture(2, 2);
    depth.format = THREE.DepthFormat;
    depth.type = THREE.FloatType;
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: depth, depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });

    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rt.texture },
        tDepth: { value: depth },
        uRes: { value: new THREE.Vector2(2, 2) },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uNear: { value: this.camera.near },
        uFar: { value: this.camera.far },
        uHurt: { value: 0 },
        uFlash: { value: 0 },
        uSlow: { value: 0 },
        uLowHp: { value: 0 },
        uLineSpacing: { value: 60 },
        uLineMode: { value: 0 },
        uPaper: { value: PAPER.clone() },
        uInks: { value: INK_COLORS },
        uInvProj: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
      },
      vertexShader: postVert,
      fragmentShader: postFrag,
      depthTest: false, depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));

    this._clear = new THREE.Color(1, 0, 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    const rw = Math.floor(w * this.pixelRatio), rh = Math.floor(h * this.pixelRatio);
    this.rt.setSize(rw, rh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const u = this.post.uniforms;
    u.uRes.value.set(rw, rh);
    u.uAspect.value = w / h;
    u.uLineSpacing.value = rh / 13.5;
  }

  /**
   * 两遍渲染：scene → G-buffer → post quad → 屏幕
   * @param {number} time 秒
   * @param {THREE.Scene} scene
   * @param {object} fx { hurt, flash, slow, lowHp }
   */
  render(time, scene, fx = {}) {
    shared.uTime.value = time;
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    shared.uLightDir.value.copy(LIGHT_DIR).transformDirection(cam.matrixWorldInverse);

    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(this._clear, 0);
    r.clear(true, true, false);
    r.render(scene, cam);
    r.setRenderTarget(null);

    const u = this.post.uniforms;
    u.uTime.value = time;
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uInvView.value.copy(cam.matrixWorld);
    u.uHurt.value = fx.hurt || 0;
    u.uFlash.value = fx.flash || 0;
    u.uSlow.value = fx.slow || 0;
    u.uLowHp.value = fx.lowHp || 0;
    r.render(this.postScene, this.postCam);
  }
}
