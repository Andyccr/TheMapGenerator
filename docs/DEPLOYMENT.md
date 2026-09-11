# 部署到 GitHub Pages

本项目是**纯静态网站**：仓库里的 `index.html` 和 `src/` 就是可运行的应用，不需要 `npm run build`。

## 推荐：从分支根目录发布（零构建）

1. 把改动合并进 `main`。
2. 仓库 **Settings → Pages → Source** 选 **Deploy from a branch**。
3. Branch = `main`，Folder = `/ (root)`，Save。
4. 打开 `https://<用户名>.github.io/<仓库名>/`。

本仓库对应地址：https://andyccr.github.io/TheMapGenerator/

仓库需为 Public。根目录的 `.nojekyll` 会关掉 Jekyll，避免脚本路径被吃掉。

## 备选：GitHub Actions

**Settings → Pages → Source = GitHub Actions**。推送 `main` 后，`.github/workflows/pages.yml` 会先跑 `npm test`，再把 `index.html`、`src/`、`icon.svg` 与 `manifest.webmanifest` 发布出去（同样不打包）。

## 本地

```bash
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/
```

可选开发服务器：`npm install && npm run dev`。

**不要**用 `file://` 双击打开 `index.html`，浏览器会拦截 ES 模块。

## 路径说明

页面使用相对路径 `./src/main.js`、`./src/styles.css`。GitHub 项目站（`username.github.io/TheMapGenerator/`）下绝对路径 `/src/main.js` 会 404，这是之前无法直接打开的原因。

## AGPL

本程序以 GNU Affero GPL v3 发布。在 Pages 上公开提供即构成远程网络交互，请保持源码可获取（仓库公开即可）。
