# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

视频导出质量评估 + 自动化测试系统。用于对比原始视频与导出视频的质量指标（VMAF、PSNR、SSIM），并支持批量矩阵导出测试不同编码参数组合。

## Common Commands

```bash
# 安装依赖
npm install

# 启动后端服务（端口3000）
node server.js
# 或
npm start

# 启动前端开发服务器（端口5173）
npm run dev

# 类型检查
npm run check

# ESLint 检查
npm run lint

# 构建生产版本
npm run build
```

## Architecture

### Frontend (React + Vite + TypeScript)

- **入口**: `src/main.tsx` → `src/App.tsx`
- **页面路由**:
  - `/` - Home：视频质量评估（手动上传原/导出视频比对）
  - `/automation` - Automation：自动化测试（单点导出 / 矩阵导出）

- **状态管理** (Zustand):
  - `src/stores/evaluationStore.ts` - 评估任务状态（原视频、导出视频、评估结果缓存）
  - `src/stores/automationStore.ts` - 自动化测试状态（服务器配置、矩阵任务列表、benchmark时间）

- **API 层**: `src/lib/api.ts` - 封装所有后端接口调用
- **类型定义**: `src/types/index.ts` - VideoFile、EvaluationTask、EvaluationType 等核心类型
- **UI 框架**: Ant Design 6 + TailwindCSS

### Backend (Express + Node.js)

- **入口**: `server.js` (端口 3000)
- **核心功能**:
  - 通过 ffmpeg/ffprobe 计算视频质量指标（VMAF、PSNR、SSIM）
  - 代理转发请求到外部 FFmpeg 服务器（解决 CORS）
  - 支持本地执行 ffmpeg（serverIp 设为 `0`）

- **主要接口**:
  - `POST /evaluate` - 综合评估（上传 beforeVideo/afterVideo，返回 VMAF/PSNR/SSIM/综合分数）
  - `POST /evaluate/vmaf|psnr|ssim` - 单项指标计算
  - `POST /automation/upload` - 代理上传到外部 FFmpeg 服务器
  - `POST /automation/upload_file` - 仅上传源视频，返回 job_id
  - `POST /automation/process` - 用已有 job_id 执行导出
  - `POST /automation/save` - 下载并保存导出结果到本地
  - `POST /automation/save-json|save-csv` - 保存评估结果

- **本地存储路径**:
  - macOS/Linux: `~/evaluate-server`
  - Windows: `E:\evaluate-server`

### FFmpeg 命令格式

自动化导出命令必须：
- 以 `ffmpeg` 开头
- 包含 `{input}` 和 `{output}` 占位符

示例：`ffmpeg -y -i {input} -c:v h264_nvenc -preset p7 -rc:v vbr -b:v 8M -c:a copy {output}`

### 评估算法

综合分数 = quality × w_quality + speed × w_speed + bitrate × w_bitrate

**画质分数 (quality)**：0~1
- 公式: 0.7 × (vmaf/100) + 0.3 × ((psnr-20)/30)
- VMAF: 0~100 归一化到 0~1
- PSNR: 20~50dB 归一化到 0~1

**速度分数 (speed)**：0~1
- 公式: clamp01((视频时长/导出时间) / targetRTF)
- RTF > targetRTF 时得高分

**码率分数 (bitrate)**：0~1（三段式）
- R = actualBps / targetBps（实际码率 / 目标码率）
- R ≤ 0.25：满分 1.0（极致压缩）
- 0.25 < R ≤ 1.5：线性区间，从 1.0 降至 0.6
- R > 1.5：指数惩罚，0.6 × exp(-3 × (R - 1.5)²)
- 目标码率根据分辨率、帧率、编码格式自动计算（HEVC 比 H.264 低 40%）

## Key Dependencies

- **ffmpeg/ffprobe**: 必须安装在系统 PATH 中，用于视频分析和质量指标计算
- **libvmaf**: ffmpeg 需编译启用 libvmaf 支持才能计算 VMAF

## Development Notes

- 前端调用后端 `localhost:3000` 进行代理转发，规避浏览器跨域限制
- 矩阵导出支持 x264/x265/nvenc 编码器，可配置 preset、bitrate、cq、rc 模式等参数组合
- serverIp 设为 `0` 时，ffmpeg 在本地执行而非转发到远程服务器
