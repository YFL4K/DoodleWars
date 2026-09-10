# DOODLE_FPS_DEMO — 第一人称草稿本/圆珠笔手绘涂鸦风 DEMO

## 目标（只做视觉验证，不做完整游戏）
- [ ] 3D 场景（Geodesic Dome 穹顶 + 极简几何建筑 + 云朵/几何块点缀）
- [ ] 第一人称持枪视角（FPP 几何化步枪 + 方框瞄准镜）
- [ ] 后处理 Shader：纸张纹理 + 蓝墨水 Sobel 边缘 + Cross-Hatching 排线阴影 + 手绘抖动
- [ ] 4 张不同密度斜线纹理（hatching textures）按亮度分层混合
- [ ] HUD：手写字体 + 斜线填充血条 + Tally Marks 子弹计数 + 手绘红点准星
- [ ] 少量橙红色高亮元素

## 技术路线
- Three.js (WebGL) + EffectComposer + ShaderPass 自定义后处理
- 场景渲染为蓝墨水线框/面 → 后处理转为纸张+蓝墨水手绘风

## 后续再完善（非本 DEMO 范围）
- 完整游戏逻辑、敌人 AI、波次、升级、音效
- 深度贴图 + 法线贴图边缘检测（当前先用颜色 Sobel 边缘）
- 加载 .gltf Low-Poly 枪模
