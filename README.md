# 第一人称草稿本 · 圆珠笔手绘涂鸦 DEMO

WebGL（Three.js）+ **G-buffer 延迟渲染管线**，把 3D 画面实时转为
「纸张 + 蓝墨描边 + 世界空间排线阴影」的第一人称草稿本风格。
画风复刻自 [Doodle District](https://doodleshooter.vercel.app/)。

## 运行方式（需本地服务器，不能用 file:// 直接打开）

```bash
cd doodle-fps-demo
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`，**点击画面**进入指针锁定（鼠标环顾视角）。

**操作**：WASD 移动 · 鼠标环顾 · 左键/F 开火 · 数字键 1-4 切换武器（RIFLE/SHOTGUN/SNIPER/KATANA）

> Three.js 通过 CDN（jsdelivr）加载，需联网。需 WebGL2（Float 深度纹理）。

## 渲染管线（核心）

```
物体材质 inkMaterial（ShaderMaterial）
   输出 G-buffer：vec4( shade, inkId, normalView.x, normalView.y )
   shade = dot(N, L)*0.5+0.5 分级；fill=true 时 shade=-1（实心彩笔高亮）
     ↓ 渲染进 HalfFloat RenderTarget + Float DepthTexture（NearestFilter）
全屏 post quad（后处理 Shader）解码：
   · 逆深度拉普拉斯算子 → 尺度不变的轮廓描边（含掠射地面）
   · 法线突变 → 结构边缘
   · 从深度重建世界坐标 → 表面切平面铺三向排线，随距离按 2 的幂 LOD
   · 纸张：暖米色 + 噪声颗粒 + 浅蓝横向笔记本线（已按要求取消红色装订线）
   · 墨色通道：inkId 索引 6 色（蓝/红/黑/橙/绿/粉），橙红彩笔高亮保留
   · 距离 fade + hurt 暗角 + flash + slow-mo
```

## 已实现

- ✅ **暖米纸张背景** + 噪声颗粒 + 浅蓝横向划线（无红色装订线）
- ✅ **深度边缘描边**：逆深度拉普拉斯，轮廓锐利、远近一致
- ✅ **世界空间排线**：三方向 45°/135°/15° 斜线，锚定在表面，随移动保持不爬动
- ✅ **半球经纬穹顶**：大 SphereGeometry 内壁，弧线网格
- ✅ **极简几何建筑** + 外置楼梯（背光面自动排线）
- ✅ **彩笔高亮**：橙色廊桥/管道、红色敌人方块（fill 实心，墨色通道保留）
- ✅ **第一人称步枪**：几何拼装（枪身/枪管/方框瞄准镜/弹匣/握把/枪托/红准星），缩小偏右下
- ✅ **HUD（纯 CSS 复刻）**：大字号弹药 35/175 + Tally 打卡记数 + 斜线纹理血条 + 中央红色准星 + 右下武器槽位
- ✅ **第一人称控制**：WASD + Pointer Lock 鼠标环顾 + 武器切换

## 项目结构

```
doodle-fps-demo/
├── index.html              # 入口 + import map(CDN) + HUD DOM
├── style.css               # HUD 样式（复刻参考配色/字体/斜线血条/准星）
└── src/
    ├── main.js             # 场景构建 + FPP 控制 + 主循环
    ├── doodle-renderer.js  # G-buffer 材质 + 后处理 Shader + 两遍渲染管线
    └── hud.js              # HUD（DOM 驱动：弹药/血条/tally/武器槽/准星）
```

## 后续可完善

- 加载 .gltf Low-Poly 枪模替换几何拼装
- 完整游戏逻辑：敌人 AI、波次、升级、音效、钩爪
- 狙击开镜（参考 .scope）、武士刀 focus 槽等武器特性
