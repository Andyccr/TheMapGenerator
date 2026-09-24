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

1. 第一次打开会先出现欢迎层：**快速开始**（中幅粗略，大约一两秒）、**看范例**，或按左侧设置生成。刷新页面会**恢复自动存档**。地址栏带 `?seed=` 时按链接生成。默认画幅 **3840×2400**、精细（格距 5，约 14 万格）；也可改回宽幅或放到超大陆。超过约 20 万格时会自动略微放粗格距。生成在后台线程跑，可随时 **取消** 或按 Esc。阶段：格网 → 板块 → 水文 → 气候 → 文明 → 商路。
2. 滚轮平滑缩放（对准光标），双击放大，Shift+双击缩小；右下角 **+ / − / 适应**。缩放只改**绘制**：全图合并色块与干流，近景才画晕渲、细河和村落。格子数据不变。侧栏可用 **[** / **]** 或页头 **左栏 / 右栏** 折叠，**H** 全屏看图。
3. **陆形** 决定海岸轮廓：诸大陆、盘古、群岛、大岛、半岛、地峡、内海、湖区。每个模板是一串可编辑步骤（丘、洼、岭、海峡），叠在板块造山之上。
4. **抬升 / 降低** 是主要编辑工具：在陆地上涂抹，松手后河流会按重力重算，手绘商路、地标与外交会留下。**印戳** 点击放下丘、洼或岭；**涂色** 改群系、文化、信仰、国度、行省（空颜料点击吸取）；**连路** 点两座城画出商路。右侧检视可以直接改这些层，也能改名称、颜色与外交，并新建文化 / 信仰 / 国度。
5. **河流** 从高地拖向大海；**建城 / 擦除 / 地标** 种城镇和兴趣点，擦除也可以点掉商路格子（不会整网重掷）；**移动** 把城镇拖到陆地上；**命名** 点击改名；**测距** 量直线里格。**行程** 逐站点选，沿商路走更省时，两岸可航且海路更快时改走海路；回车封存后天数、里格和途经停靠写进存档。改风向后点 **应用风向** 只重算气候。
6. **图层** 在图集、地势、政治、文化、行省、信仰、气温、降水、人口之间切换；商路与地标可单独关掉。底部状态栏显示当前格子。
7. **重掷文明** 只重做人名与国家，地形不动。名册与检索用来跳转到聚落、国度、行省、文化、信仰、地貌、河流、商路、地标。检视里可以写战役笔记。
8. **F1** 打开说明。**范例** 打开几张现成陆形。**链接** 复制可分享地址。**导出 JSON** 保存完整世界；**槽位** 把最多六张图存在本机 IndexedDB；**导出图集 PNG** 出带图名与图例的战役图。陆形步骤可「应用到当前图」。

### 功能一览

- 板块造山、重力河流、雨影气候、Whittaker 生物群系
- 陆形模板（群岛 / 大岛 / 半岛 / 盘古 / 内海…），步骤可加丘、洼、岭、海峡
- 生成后印戳（丘 / 洼 / 岭）、涂色（群系 / 文化 / 信仰 / 国度 / 行省）、点选连路、检视改层与外交、新建文化 / 信仰 / 立国、改色、单条删路、应用风向
- 文化扩张与语音、国度、行省、信仰、外交、命名地貌、商路、地标、战役行程（天数与停靠）、人口疏密图层
- 图层预设、全图国名与大陆名、地名防撞、比例尺、测距、状态栏
- 范例世界、可分享链接、自动存档恢复（IndexedDB）、命名槽位（覆盖确认）、撤销/重做、可取消的 Web Worker 生成
- 拖放导入 JSON、Ctrl+S 立即保存、图集 PNG（图名 + 图例）、纯静态，GitHub Pages 可直接打开

参与修改见 [CONTRIBUTING.md](CONTRIBUTING.md)。版本记录见 [CHANGELOG.md](CHANGELOG.md)。

### 地理规则（为什么看起来像真的地图）

- 大陆来自**板块**（边界带噪声弯曲），不是噪声色块。挤压带长出有宽度的山链；山前有浅的前陆盆地；大洋板块俯冲处是海沟和岛弧；板块内部远离边界处有少量热点火山。高程曲线让大部分陆地偏低，只有少数高峰。
- 近海是平原与陆架，远海更深。高纬高山会做一次有上限的冰蚀，把冰斗刻进山体，冰碛堆在下方。河流按河流功率下切后从高地汇入海洋，缓坡河段会蜿蜒，**不会翻山**。
- 气候看纬度带和海拔：赤道湿、副热带干、西风带再转湿，北方冷，山上更冷；离海越远季节差越大。湿气在迎风坡增加，在背风面形成雨影沙漠。干流按河口流量和河级变粗。
- 城镇优先靠近河流与海岸，名称来自当地文化；国度再分成行省；民俗信仰跟文化走，建制宗教从大城市扩出去；大陆、岛屿与海域有名字；都城之间有商路，荒原上有废墟与龙巢一类地标。
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
  data/worldData.js     # 纯 JSON 数据，不含方法
  data/catalogs.js      # 群系 / 地标 / 陆形 / 外交姿态等共用名称
  data/diplomacy.js     # 外交 JSON 读写（不是生成算法）
  data/landforms.js     # 陆形配方（步骤列表，不含算法）
  data/routes.js        # 删路 / 修剪无效商路
  generators/           # 种子 → 世界（含陆形、文化、信仰、商路、地标；不转出 catalogs）
  editors/              # 受控修改（建城、连路、涂色、立国、地标）
  renderers/            # Canvas 只读绘制（不引用 generators）；HUD 在 hud.js
  ui/app.js             # 控制器（UI 里唯一可引用 MapGenerator）
  ui/bindings.js        # DOM 事件绑定
  ui/format.js          # 检视 / 名册 HTML，只引用 data/
  ui/dialogs.js         # 确认、输入、欢迎、说明
  workers/              # 生成管线（不碰 DOM）
```

### 部署细节

见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。根目录已放 `.nojekyll`，避免 GitHub 用 Jekyll 处理站点。

---

## English

A static, client-side fantasy atlas. One seed builds continents, mountain belts, rivers, climate, biomes, realms, and towns. You then paint, rename, and export in the browser. There is no backend and no external API.

**GitHub Pages serves the site as-is. You do not need Node, and you do not need `npm run build`.**

License: [GNU Affero General Public License v3](LICENSE)

### Use it online

After this repo is on `main`, set Pages once. Later pushes update the site.

1. Open **Settings → Pages**.
2. **Build and deployment → Source** (the first option needs no build):
   - **Deploy from a branch**: Branch `main`, Folder `/ (root)`.
   - Or **GitHub Actions**, which runs `.github/workflows/pages.yml` and publishes `index.html` plus `src/`.
3. Open **https://andyccr.github.io/TheMapGenerator/**

The repository must be **Public** for free Pages. Use a browser. Do not double-click `index.html`: `file://` blocks ES modules.

If the page is blank, check the network panel. `./src/main.js` and `./src/styles.css` must return 200. Paths stay relative (`./src/...`).

### Local preview

```bash
python3 -m http.server 8080
# or
npx --yes serve -p 8080
```

Open http://localhost:8080/ . For hot reload: `npm install`, `npm test`, `npm run dev`.

### How to use the map

1. The first visit opens a welcome: **quick start** (medium, coarse, about a second or two), **examples**, or generate with the left-hand settings. Refresh restores the autosave. A `?seed=` link generates that world. The default sheet is **3840×2400** at fine spacing (cell size 5, about 140k cells). Wider and smaller sheets are in the same menu. Past about 200k cells the grid coarsens slightly. Generation runs in a worker and can be **cancelled** or stopped with Esc. Stages: mesh → plates → water → climate → society → roads.
2. Scroll to zoom toward the cursor. Double-click zooms in; Shift+double-click zooms out. **+ / − / fit** sit at the lower right. Zoom changes drawing only: the overview uses baked color and trunk rivers; hillshade, minor rivers, and villages appear up close. **[** / **]** or the header buttons fold the side panels. **H** hides both.
3. **Landform** sets the coastline: several continents, Pangaea, archipelago, island, peninsula, isthmus, inland sea, lakes. Each preset is an editable stack of hills, pits, ranges, and straits on top of the plates.
4. **Raise / lower** is the main brush. Release the pointer and rivers recompute from gravity. Hand-drawn roads, markers, and diplomacy stay. **Stamp** drops a hill, pit, or range. **Paint** edits biome, culture, faith, realm, or province (an empty pigment eyedrops). **Road** links two towns. The inspector edits those layers, plus names, colors, diplomacy, and new cultures, faiths, and realms.
5. **River** drags a channel downhill. **Town / erase / marker** place or remove places; erase can cut one road cell without rerolling the network. **Move** drags a town onto land. **Rename** and **measure** do what they say. **Journey** clicks waypoints, prefers roads, and takes a sea lane when both ends are coastal and the voyage is faster. Enter stores days, leagues, and stops. **Apply wind** restamps climate only.
6. **Layers** switch atlas, relief, political, culture, provinces, faith, temperature, precipitation, and population. Roads and markers can be hidden. The status bar describes the cell under the cursor.
7. **Reroll society** rebuilds peoples and states and leaves the terrain. The roster and search jump to towns, realms, provinces, cultures, faiths, features, rivers, roads, and markers. The inspector holds campaign notes.
8. **F1** opens help. **Examples** opens ready-made coastlines. **Link** copies a share URL. **Export JSON** saves the world. **Slots** keep up to six worlds in IndexedDB. **Export atlas PNG** writes a titled sheet with a legend. Landform steps can be applied to the current map.

### What it includes

- Plate orogeny, gravity-obeying rivers, rain-shadow climate, Whittaker biomes
- Landform recipes (archipelago, island, peninsula, Pangaea, inland sea, and others)
- Stamps, paint, roads, inspector edits, new cultures and faiths, recolor, delete one road, apply wind
- Cultures and phonologies, realms, provinces, faiths, diplomacy, named features, roads, markers, campaign journeys, a population layer
- Layer presets, realm and continent labels, label collision, scale bar, measure, status bar
- Examples, share links, autosave, named slots, undo/redo, cancellable generation in a worker
- Drag-and-drop JSON, Ctrl+S, atlas PNG, and a fully static GitHub Pages build

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

### Why the terrain looks geographic

- Continents come from **plates** with warped boundaries, not from a noise threshold. Convergent belts become mountain chains of finite width, with a shallow foreland basin in front. Oceanic subduction cuts a trench and can raise an island arc. A few hotspots sit far from plate edges. The hypsometric curve keeps most land low and leaves a short high tail.
- Coasts grade into plains and a shelf; the far ocean is deeper. Cold highlands take one capped glacial pass: a cirque is cut into the peak and a moraine is left downhill. Rivers incise by stream power, meander on gentle slopes, and **never climb a ridge**.
- Climate follows latitude bands and elevation: a wet equator, a dry subtropics, a wet storm track, and a cold north. Seasonal range grows inland. Moisture rises on the windward slope and deserts form in the rain shadow. Surface wind turns with latitude (trades, westerlies, polar easterlies); the wind control is a bias on that field. Trunk rivers are wider at the mouth, and the inspector names the drainage basin.
- Towns prefer rivers and coasts. Names follow the local culture. Realms split into provinces. Folk faiths follow culture; organized creeds spread from large cities. Continents, islands, and seas are named. Capitals are linked by roads. Wild country holds ruins, lights, and similar markers.
- Hillshade appears when you zoom in. Minor labels hide when you zoom out. The layer presets follow the playable layers of Azgaar’s Fantasy Map Generator; drawing stays on Canvas 2D.

The algorithms follow Martin O’Leary, Amit Patel, and Scott Turner. See [docs/ALGORITHMS.md](docs/ALGORITHMS.md).

### Why Canvas 2D

A medium map is tens of thousands of polygons, edited while you pan and zoom. One canvas transform and a fill is enough. SVG would create a DOM node per cell and stall on every brush stroke. Hit tests use a spatial hash. The fit view skips hillshade. PNG export uses `canvas.toBlob`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Layout

```
index.html              # GitHub Pages entry (relative paths, no bundle)
src/
  main.js
  styles.css
  data/worldData.js     # plain JSON, no methods
  data/catalogs.js      # shared labels
  data/diplomacy.js     # diplomacy JSON, not placement
  data/landforms.js     # recipe steps, not the algorithm
  data/routes.js        # drop or prune roads
  generators/           # seed → world
  editors/              # controlled edits
  renderers/            # canvas, read-only; HUD in hud.js
  ui/app.js             # the only UI module that may import MapGenerator
  ui/bindings.js        # DOM listeners
  ui/format.js          # inspector and roster HTML
  ui/dialogs.js
  workers/              # generation, no DOM
```

Deployment notes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). `.nojekyll` is in the repo root so GitHub does not run Jekyll on the site.
