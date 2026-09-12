# V3_WIREFRAME — 线框渲染重构 TODO

- [x] 阅读 main.js / postprocess.js / hud.js / index.html / style.css 现状
- [x] main.js：建筑/枪械/悬浮物改 wireframe + EdgesGeometry 描边（取消 solid fill）
- [x] main.js：天空穹顶改 SphereGeometry 半球经纬 wireframe（取消 Icosahedron）
- [x] main.js：相机 FOV 70→80，位置拉远；枪械 scale 0.55 + 右下平移
- [x] main.js：橙/红彩笔元素改 solid MeshBasicMaterial（保留高亮色块）
- [x] postprocess.js：取消红色装订线；hatch 排除边缘线、降低底色强度
- [x] hud.js + index.html + style.css：中央红准星 + 右下武器菜单 + 左下大字号子弹数/宽斜线HP
- [x] 本地验证：修复 GLSL edgeLine 未声明/重复声明 bug；线框8101px、纸张暖米色、穹顶经纬弧线、橙色保留、装订线0残留、准星146px、武器菜单正常
- [ ] git 提交推送
