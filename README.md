# 幻想世界地图生成器 / Fantasy World Map Generator

纯静态、纯前端的幻想地图工坊：用一个种子生成地理上说得通的大陆、山脉、河流、气候、生物群系、国度与城镇，然后在浏览器里涂改、改名、导出。没有后端，也没有外部 API。

**GitHub Pages 打开即可使用，不必安装 Node、也不必执行 `npm run build`。**

许可证：[GNU Affero General Public License v3](LICENSE)

---

## 中文说明

### 在线直接使用（GitHub Pages）

合并到 `main` 之后，按下面做一次仓库设置，以后每次推送都会自动更新网站。

1. 打开仓库 **Settings → Pages**。
2. **Build and deployment → Source** 选一种即可（推荐第一种，零构建）：
   - **Deploy from a branch**：Branch 选 `main`，Folder 选 `/ (root)`，保存。
   - 或 **GitHub Actions**：使用本仓库的 `.github/workflows/pages.yml`（同样发布 `index.html` + `src/`，不打包）。
3. 等一两分钟，打开：

**https://andyccr.github.io/TheMapGenerator/**

仓库必须是 **Public**（免费 Pages 的要求）。请用浏览器访问上述网址，**不要**在资源管理器里双击 `index.html`：`file://` 协议下 ES 模块会被浏览器拦截。

若网页空白，打开开发者工具 Network，确认 `./src/main.js` 和 `./src/styles.css` 返回 200 而不是 404。项目站路径必须是相对路径（`./src/...`），不能写成网站根上的 `/src/...`。

### 本地预览（可选）

任意静态服务器都可以，因为页面就是普通 HTML + ES Module：

```bash
# 任选一种
python3 -m http.server 8080
# 或
npx --yes serve -p 8080
```

浏览器打开 http://localhost:8080/ 。

开发时若想热更新，仍可使用 Vite：

```bash
npm install
npm test
npm run dev
```

### 怎么用地图

1. 点 **生成世界** 或 **随机种子**。刷新页面会**恢复自动存档**，不会悄悄换一张新图。默认画幅 **2560×1600**、精细度中等（格距 7，约 3 万格）；可选洲际 / 超大陆，以及精细 / 极细。超过约 11 万格时会自动略微放粗格距。生成在后台线程跑，界面会显示阶段（格网 → 板块 → 水文 → 文明 → 商路）。
2. 滚轮平滑缩放（对准光标），双击放大，Shift+双击缩小；右下角 **+ / − / 适应**。缩放只改**绘制**：全图合并色块与干流，近景才画晕渲、细河和村落。格子数据不变。侧栏可用 **[** / **]** 折叠，**H** 全屏看图。
3. **抬升 / 降低** 是主要编辑工具：在陆地上涂抹，松手后河流会按重力重算。
4. **河流** 从高地拖向大海；**建城 / 擦除 / 地标** 种城镇和兴趣点；**移动** 把城镇拖到陆地上；**命名** 点击改名；**测距** 量里格。
5. **图层** 在图集、地势、政治、文化、行省、气温、降水之间切换；商路与地标可单独关掉。
6. **重掷文明** 只重做人名与国家，地形不动。名册与检索用来跳转到聚落、国度、行省、文化、地标。检视里可以写战役笔记。
7. **F1** 打开说明。**导出 JSON** 保存完整世界；**导出 PNG** 出图。

### 功能一览

- 板块造山、重力河流、雨影气候、Whittaker 生物群系
- 文化扩张与语音、国度、行省、商路、地标
- 图层预设、地名防撞、比例尺、测距
- 自动存档恢复、撤销/重做、Web Worker 生成
- 纯静态，GitHub Pages 可直接打开

参与修改见 [CONTRIBUTING.md](CONTRIBUTING.md)。版本记录见 [CHANGELOG.md](CHANGELOG.md)。

### 地理规则（为什么看起来像真的地图）

- 大陆来自**板块**（边界带噪声弯曲），不是噪声色块。山脉出现在板块挤压带，有宽度的山链与山麓。
- 近海是平原与陆架，远海更深；还有岛弧。河流经轻度侵蚀后从高地汇入海洋，**不会翻山**。
- 气候看纬度和海拔：北方冷，山上更冷；湿气在迎风坡增加，在背风面形成雨影沙漠。
- 城镇优先靠近河流与海岸，名称来自当地文化；国度再分成行省；都城之间有商路，荒原上有废墟与龙巢一类地标。
- 放大后可见坡向晕渲；缩小后隐藏次要地名。图层预设对照 Azgaar FMG 的玩法层，但绘制仍是 Canvas 2D。

算法参考 Martin O’Leary、Amit Patel、Scott Turner。详见 [docs/ALGORITHMS.md](docs/ALGORITHMS.md)。

### 渲染为什么用 Canvas 2D

中等地图有数万个多边形，还要边画边改、平移缩放。Canvas 一次变换再填色即可；SVG 会制造成千上万个 DOM 节点，刷子一动就卡。点选用空间哈希。缩小到适应窗口时跳过晕渲；PNG 导出用 `canvas.toBlob`。说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

### 四层目录

```
index.html              # GitHub Pages 入口（相对路径，无需打包）
src/
  main.js
  styles.css
  data/worldData.js     # 纯 JSON 数据，不含逻辑
    generators/           # 种子 → 世界（含文化、商路、地标）
  editors/              # 受控修改
  renderers/            # Canvas 只读绘制
    ui/app.js             # 控制器
    workers/              # 生成管线（不碰 DOM）
```

### 部署细节

见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。根目录已放 `.nojekyll`，避免 GitHub 用 Jekyll 处理站点。

---

## English

A **static**, client-side atlas workshop. GitHub Pages serves `index.html` and `src/` **directly** — no Vite build is required to run the app.

Live site (after Pages is enabled on `main`): https://andyccr.github.io/TheMapGenerator/

```bash
python3 -m http.server 8080   # open http://localhost:8080/
npm test && npm run dev       # optional hot reload
```

Do not open `index.html` via `file://`. Enable Pages: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**, or use the included GitHub Actions workflow.

Architecture, algorithms, and MVP notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ALGORITHMS.md](docs/ALGORITHMS.md), [docs/MVP.md](docs/MVP.md).
