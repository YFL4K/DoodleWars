# 第一人称草稿本 · 圆珠笔手绘涂鸦 DEMO

WebGL（Three.js）+ 片元着色器后处理滤镜，把普通 3D 画面实时转为
「纸张 + 蓝墨水边缘 + 排线阴影 + 手绘抖动」的第一人称草稿本风格。

## 运行方式（需本地服务器，不能用 file:// 直接打开）

```bash
cd doodle-fps-demo
python3 -m http.server 8080
# 或 npx serve .
```

浏览器打开 `http://localhost:8080`，**点击画面**进入指针锁定（鼠标环顾视角）。

> 注意：Three.js 通过 CDN（jsdelivr）加载，需联网。

## 已实现（视觉 DEMO 核心）

- ✅ **纸张纹理背景**：米白底 + 等距浅蓝横向划线 + 左侧红色手绘装订线（Shader 内 UV 计算）
- ✅ **蓝墨水边缘提取**：Sobel 算子对画面亮度做边缘检测 → 蓝色圆珠笔轮廓
- ✅ **Cross-Hatching 排线阴影**：4 张不同密度斜线纹理，按明暗分层混合（亮→稀疏单斜线，暗→密集交叉排线）
- ✅ **手绘抖动**：低频噪声扰动 UV，线条产生手绘弯曲/按帧抖动
- ✅ **Geodesic Dome 穹顶**：Icosahedron 线框球
- ✅ **极简几何建筑**：立方体楼房 + 外置楼梯 + 蓝墨水描边
- ✅ **点缀元素**：悬浮云朵、几何立体块（四面体/八面体/圆环）
- ✅ **第一人称持枪视角（FPP）**：几何化步枪（枪身/枪管/方框瞄准镜/弹匣/握把/枪托）+ 枪身侧面斜线剖面 + 橙红准星高亮
- ✅ **HUD**：手写字体（Architects Daughter / Kalam）、斜线填充血条 + 旁红高亮线、Tally Marks 打卡记数符号计弹药、SCORE/WAVE
- ✅ **第一人称控制**：WASD 移动 + 鼠标环顾（Pointer Lock）

## 技术要点

```
3D 场景（蓝墨水线框/面 + 光照）
   → EffectComposer
      → RenderPass（渲染场景）
      → ShaderPass（自定义后处理 Shader）：
          纸张横线 + 红装订线（UV）
          Sobel 边缘检测 → 蓝墨水轮廓
          luminance 分级 → 混合 4 张排线纹理
          Perlin/Simplex 噪声 → 手绘抖动
   → 2D Canvas HUD 叠加（手绘字体 + 血条 + Tally Marks 弹药）
```

## 项目结构

```
doodle-fps-demo/
├── index.html          # 入口 + import map(CDN) + HUD DOM
├── style.css           # HUD 样式 + 手写字体
└── src/
    ├── main.js         # 场景构建 + 渲染管线 + FPP 控制 + 主循环
    ├── postprocess.js  # 后处理 Shader + 4 张排线纹理生成
    └── hud.js          # 手绘血条 + Tally Marks 弹药计数
```

## 后续可完善（非本 DEMO 范围）

- 深度贴图 + 法线贴图边缘检测（当前用颜色 Sobel 边缘，更精确的轮廓需 depth/normal）
- 加载 .gltf Low-Poly 枪模（当前为几何体拼装）
- 完整游戏逻辑：敌人 AI、波次、升级、音效
- 右键瞄准减速/收束、开枪后坐力动画
