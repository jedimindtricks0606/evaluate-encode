# 视频导出质量评估 + 自动化测试

## 安装依赖
- 安装 Node.js（建议 18+）
- 在项目根目录执行：
```
npm install
```

## 启动后端（转发与评估服务）
- 启动命令：
```
node server.js
```
- 默认监听：`http://localhost:3000`
- 提供的接口：
  - `POST /automation/upload`：代理转发到 FFmpeg 服务器的 `/upload`
  - `POST /automation/save`：下载并保存导出结果到本地目录
  - `POST /evaluate`、`/evaluate/vmaf`、`/evaluate/psnr`、`/evaluate/ssim`：本地计算评估指标（需要本机安装 ffmpeg/ffprobe）

## 启动前端（Vite 开发服务器）
- 启动命令：
```
npm run dev
```
- 默认地址：`http://localhost:5173/`
- 页面入口：
  - `/`：视频导出质量评估（可手动上传原/导出视频进行比对）
  - `/automation`：自动化测试（配置服务器、上传输入视频、下发 FFmpeg 命令批量产出）

## 外部 FFmpeg 服务器说明
- 健康检查：
```
curl http://<服务器IP>:<端口>/health
```
- 上传处理接口（由后端代理调用）：
  - `POST /upload`（multipart/form-data）
  - 表单字段：`file`、`command`（必须以 `ffmpeg` 开头并包含 `{input}`/`{output}`）、`output_filename`
- 下载接口：`GET /download/<job_id>/<filename>`

## 自动化页面默认配置
- 服务器默认地址：`10.23.172.47`
- 服务器默认端口：`5000`
- 输出文件名默认：`out.mp4`

## 本地保存路径
- 自动化保存接口将把下载的文件写入：`/Users/jinghuan/evaluate-server`
- 可通过接口 `save_dir` 参数自定义保存目录

## 常见问题
- 跨域问题：前端调用我们的后端（`http://localhost:3000/automation/upload`）进行转发，已规避浏览器跨域限制
- ffmpeg/ffprobe：如需在后端计算 VMAF/PSNR/SSIM，请确保本机已安装 ffmpeg/ffprobe，并在环境变量路径可用

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
