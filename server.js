import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(morgan('dev'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

app.use(express.static(path.join(__dirname, 'public')));

function getBaseDir() {
  const platform = os.platform();
  if (platform === 'win32') return 'E:\\evaluate-server';
  const home = os.homedir() || process.env.HOME || '';
  return path.join(home || '~', 'evaluate-server');
}

// 获取本机局域网 IP 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // 跳过内部地址和非 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
const BASE_DIR = getBaseDir();
const FFMPEG_DIR = path.join(BASE_DIR, 'ffmpeg');
try {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  if (!fs.existsSync(FFMPEG_DIR)) fs.mkdirSync(FFMPEG_DIR, { recursive: true });
} catch (_) {}

function clamp01(x) {
  if (isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normalizeWeights(w) {
  const q = Number(w?.quality ?? 0.6);
  const s = Number(w?.speed ?? 0.2);
  const b = Number(w?.bitrate ?? 0.2);
  const sum = q + s + b;
  if (sum <= 0) return { quality: 0.6, speed: 0.2, bitrate: 0.2 };
  return { quality: q / sum, speed: s / sum, bitrate: b / sum };
}

function ffprobeJson(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      file
    ], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

function ffprobeFps(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=avg_frame_rate,r_frame_rate',
      '-of', 'default=nokey=1:noprint_wrappers=1',
      file
    ], { encoding: 'utf8' });
    const lines = (out || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const s of lines) {
      if (s && s !== 'N/A') {
        if (s.includes('/')) {
          const [n, d] = s.split('/').map(Number);
          if (d && d > 0) return Number((n / d).toFixed(2));
        } else {
          const val = Number(s);
          if (!isNaN(val) && val > 0) return val;
        }
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

function getDurationSeconds(meta) {
  const d = Number(meta?.format?.duration ?? 0);
  return isNaN(d) ? 0 : d;
}

function getBitrateBps(meta) {
  // Prefer video stream bitrate, fallback to format bitrate, fallback to file size/duration
  const vStream = (meta?.streams || []).find(s => s.codec_type === 'video');
  let bps = Number(vStream?.bit_rate ?? meta?.format?.bit_rate ?? 0);
  if (!bps || isNaN(bps) || bps <= 0) {
    try {
      const sizeBytes = fs.statSync(meta?._filePath).size;
      const dur = getDurationSeconds(meta);
      if (dur > 0) bps = Math.round((sizeBytes * 8) / dur);
    } catch (_) {}
  }
  return isNaN(bps) ? 0 : bps;
}

function getFps(meta) {
  const vStream = (meta?.streams || []).find(s => s.codec_type === 'video');
  const afr = vStream?.avg_frame_rate || vStream?.r_frame_rate || null;
  try {
    if (afr) {
      if (typeof afr === 'string') {
        if (afr.includes('/')) {
          const [n, d] = afr.split('/').map(Number);
          if (d && d > 0) return Number((n / d).toFixed(2));
        } else {
          const val = Number(afr);
          if (!isNaN(val)) return val;
        }
      } else {
        const val = Number(afr);
        if (!isNaN(val)) return val;
      }
    }
    // Fallback: use nb_frames / duration
    const nbFrames = Number(vStream?.nb_frames || 0);
    const dur = Number(vStream?.duration || meta?.format?.duration || 0);
    if (nbFrames > 0 && dur > 0) {
      return Number((nbFrames / dur).toFixed(2));
    }
    // Fallback: codec_time_base (e.g., 1/60)
    const tbase = vStream?.codec_time_base || vStream?.time_base || null;
    if (typeof tbase === 'string' && tbase.includes('/')) {
      const [n, d] = tbase.split('/').map(Number);
      if (n > 0 && d > 0) return Number((d / n).toFixed(2));
    }
    return null;
  } catch (_) {
    return null;
  }
}

function computePSNR(beforePath, afterPath) {
  return new Promise((resolve) => {
    // Use scale2ref to match dimensions; parse stderr for "average:" value
    const args = [
      '-hide_banner',
      '-i', afterPath,
      '-i', beforePath,
      '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[dist][ref];[dist][ref]psnr',
      '-f', 'null', '-'
    ];
    try {
      console.log('[psnr] ffmpeg args', args.join(' '));
      const proc = spawn('ffmpeg', args, { encoding: 'utf8' });
      let stderr = '';
      let stdout = '';
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.on('close', (code) => {
        console.log('[psnr] ffmpeg status', { status: code, stderr_head: stderr.split(/\r?\n/).slice(0, 5) });
        const text = stderr + stdout;
        const lines = text.split(/\r?\n/).filter(Boolean);
        let avg = null;
        for (const line of lines) {
          const m = line.match(/average\s*:\s*([0-9]+\.?[0-9]*)/i);
          if (m) avg = Number(m[1]);
        }
        resolve(isNaN(avg) ? null : avg);
      });
      proc.on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

function computeSSIM(beforePath, afterPath) {
  return new Promise((resolve) => {
    // Parse stderr for "All:" average SSIM value (0..1)
    const args = [
      '-hide_banner',
      '-i', afterPath,
      '-i', beforePath,
      '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[dist][ref];[dist][ref]ssim',
      '-f', 'null', '-'
    ];
    try {
      console.log('[ssim] ffmpeg args', args.join(' '));
      const proc = spawn('ffmpeg', args, { encoding: 'utf8' });
      let stderr = '';
      let stdout = '';
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.on('close', (code) => {
        console.log('[ssim] ffmpeg status', { status: code, stderr_head: stderr.split(/\r?\n/).slice(0, 5) });
        const text = stderr + stdout;
        const lines = text.split(/\r?\n/).filter(Boolean);
        let all = null;
        for (const line of lines) {
          const m = line.match(/All\s*:\s*([0-9]+\.?[0-9]*)/i);
          if (m) {
            all = Number(m[1]);
          }
        }
        resolve(isNaN(all) ? null : all);
      });
      proc.on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

function computeVMAF(beforePath, afterPath) {
  return new Promise((resolve) => {
    const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const tmpJsonRel = path.join('uploads', `vmaf_${stamp}.json`).replace(/\\/g, '/');
    const tmpJsonAbs = path.join(__dirname, tmpJsonRel);
    const lavfi = `[0:v][1:v]scale2ref=flags=bicubic[dist][ref];` +
                  `[dist]format=pix_fmts=yuv420p[distf];` +
                  `[ref]format=pix_fmts=yuv420p[reff];` +
                  `[distf][reff]libvmaf=log_fmt=json:log_path=${tmpJsonRel}:n_threads=4`;
    const args = [
      '-hide_banner',
      '-i', afterPath,
      '-i', beforePath,
      '-lavfi', lavfi,
      '-f', 'null', '-'
    ];

    const t0 = Date.now();
    console.log('[vmaf] compute start', { beforePath, afterPath, log_path: tmpJsonRel });
    console.log('[vmaf] ffmpeg args', args.join(' '));

    const proc = spawn('ffmpeg', args, { cwd: __dirname });
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      console.log('[vmaf] ffmpeg status', { status: code, stderr_head: stderr.split(/\r?\n/).slice(0, 5) });
      const existsAbs = fs.existsSync(tmpJsonAbs);
      console.log('[vmaf] log exist', { tmpJsonAbs, existsAbs, cost_ms: Date.now() - t0 });

      if (existsAbs) {
        try {
          const j = JSON.parse(fs.readFileSync(tmpJsonAbs, 'utf8'));
          const pooled = j?.pooled_metrics || j?.pooled_metrics?.vmaf;
          let mean = null;
          if (j?.pooled_metrics?.vmaf?.mean) {
            mean = Number(j.pooled_metrics.vmaf.mean);
          } else if (j?.pooled_metrics?.mean) {
            mean = Number(j.pooled_metrics.mean.vmaf ?? j.pooled_metrics.mean.VMAF);
          } else if (Array.isArray(j?.frames)) {
            const vals = j.frames.map(f => Number(f.metrics?.vmaf)).filter(v => !isNaN(v));
            if (vals.length) mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          }
          try { fs.unlinkSync(tmpJsonAbs); } catch (_) {}
          console.log('[vmaf] parsed result', { pooled: !!pooled, frames: Array.isArray(j?.frames) ? j.frames.length : 0, mean });
          resolve(isNaN(mean) ? null : mean);
        } catch (e) {
          try { fs.unlinkSync(tmpJsonAbs); } catch (_) {}
          resolve(null);
        }
      } else {
        // Fallback: parse console "VMAF score:" if any
        const m = stderr.match(/VMAF\s*score\s*:\s*([0-9]+\.?[0-9]*)/i);
        const val = m ? Number(m[1]) : null;
        console.log('[vmaf] fallback parsed from stderr', { matched: !!m, value: val });
        resolve(isNaN(val) ? null : val);
      }
    });

    proc.on('error', (err) => {
      console.log('[vmaf] process error', err);
      try { if (fs.existsSync(tmpJsonAbs)) fs.unlinkSync(tmpJsonAbs); } catch (_) {}
      resolve(null);
    });
  });
}

function normalizeQuality(vmaf, psnr) {
  const vmafNorm = vmaf != null ? clamp01(vmaf / 100) : null;
  const psnrNorm = psnr != null ? clamp01((psnr - 20) / 30) : null; // 20–50dB -> 0–1
  if (vmafNorm != null && psnrNorm != null) return 0.7 * vmafNorm + 0.3 * psnrNorm;
  if (vmafNorm != null) return vmafNorm;
  if (psnrNorm != null) return psnrNorm;
  return 0;
}

/**
 * 码率合理性评估函数（三段式）
 *
 * R = actualBps / baseBps (实际码率 / 基准码率)
 *
 * 区间定义:
 * 1. R <= 0.25: 极致压缩，满分 1.0
 * 2. 0.25 < R <= 1.5: 线性区间，分数从 1.0 降至 0.6
 * 3. R > 1.5: 指数惩罚区间，从 0.6 开始快速衰减
 *
 * @param baseBps - 基准码率 (bps)
 * @param actualBps - 实际码率 (bps)
 */
function computeBitrateScore(baseBps, actualBps) {
  if (!baseBps || baseBps <= 0) return 0;
  if (!actualBps || actualBps <= 0) return 0;

  const r = actualBps / baseBps;

  // 配置参数
  const pivotR = 1.5;       // 转折点
  const pivotScore = 0.6;   // 转折点得分
  const alpha = 3.0;        // 惩罚强度
  const beta = 2.0;         // 平滑度

  if (r <= 0.25) {
    // 极致压缩，满分
    return 1.0;
  } else if (r <= pivotR) {
    // 线性映射: 将 [0.25, 1.5] 映射到 [1.0, 0.6]
    const k = -0.4 / 1.25;  // 斜率 = (0.6 - 1.0) / (1.5 - 0.25)
    const score = 1.0 + (r - 0.25) * k;
    return Number(score.toFixed(4));
  } else {
    // 指数惩罚: 以 pivotScore 为基数衰减
    const score = pivotScore * Math.exp(-alpha * Math.pow(r - pivotR, beta));
    return Number(score.toFixed(4));
  }
}

function computeSpeedScore(durationSec, exportTimeSec, targetRTF = 1.0) {
  const d = Number(durationSec || 0);
  const t = Number(exportTimeSec || 0);
  const tr = Number(targetRTF || 1.0);
  if (d <= 0 || t <= 0 || tr <= 0) return 0;
  const rtf = d / t; // real-time factor: >1 is faster-than-real-time
  return clamp01(rtf / tr);
}

app.post('/evaluate', upload.fields([
  { name: 'beforeVideo', maxCount: 1 },
  { name: 'afterVideo', maxCount: 1 }
]), async (req, res) => {
  try {
    const before = req.files?.beforeVideo?.[0];
    const after = req.files?.afterVideo?.[0];
    const exportTimeSeconds = Number(req.body?.exportTimeSeconds || 0);
    const mode = req.body?.mode || null;
    const targetBitrateKbps = req.body?.targetBitrateKbps ? Number(req.body.targetBitrateKbps) : null;
    const targetRTF = req.body?.targetRTF ? Number(req.body.targetRTF) : 1.0;
    const skipVmaf = req.body?.skipVmaf === '1' || req.body?.skipVmaf === 'true';
    const weights = normalizeWeights({
      quality: req.body?.w_quality,
      speed: req.body?.w_speed,
      bitrate: req.body?.w_bitrate
    });

    if (!before || !after) {
      return res.status(400).json({ error: '必须上传导出前与导出后视频' });
    }

    const beforePath = before.path;
    const afterPath = after.path;

    const metaBefore = ffprobeJson(beforePath) || {};
    const metaAfter = ffprobeJson(afterPath) || {};
    metaBefore._filePath = beforePath;
    metaAfter._filePath = afterPath;

    const duration = getDurationSeconds(metaAfter) || getDurationSeconds(metaBefore);
    const bitrateBefore = getBitrateBps(metaBefore);
    const bitrateAfter = getBitrateBps(metaAfter);
    let fpsBefore = getFps(metaBefore);
    let fpsAfter = getFps(metaAfter);
    if (fpsBefore == null) fpsBefore = ffprobeFps(beforePath);
    if (fpsAfter == null) fpsAfter = ffprobeFps(afterPath);
    // 获取视频编码格式
    const vStreamBefore = (metaBefore?.streams || []).find(s => s.codec_type === 'video');
    const vStreamAfter = (metaAfter?.streams || []).find(s => s.codec_type === 'video');
    const codecBefore = vStreamBefore?.codec_name || null;
    const codecAfter = vStreamAfter?.codec_name || null;

    let psnr = null, vmaf = null, ssim = null;
    if (mode !== 'bitrate') {
      // 根据 skipVmaf 参数决定是否跳过 VMAF 计算
      if (skipVmaf) {
        // 仅计算 PSNR 和 SSIM
        [psnr, ssim] = await Promise.all([
          computePSNR(beforePath, afterPath),
          computeSSIM(beforePath, afterPath)
        ]);
      } else {
        // 并行执行 PSNR、VMAF、SSIM 计算
        [psnr, vmaf, ssim] = await Promise.all([
          computePSNR(beforePath, afterPath),
          computeVMAF(beforePath, afterPath),
          computeSSIM(beforePath, afterPath)
        ]);
      }
    }

    const qualityScore = normalizeQuality(vmaf, psnr);
    const targetBps = targetBitrateKbps ? Math.round(targetBitrateKbps * 1000) : bitrateBefore;
    const bitrateScore = computeBitrateScore(targetBps, bitrateAfter);
    const speedScore = computeSpeedScore(duration, exportTimeSeconds, targetRTF);

    const finalScore = (
      weights.quality * qualityScore +
      weights.speed * speedScore +
      weights.bitrate * bitrateScore
    );
    console.log('[evaluate] summary', {
      mode,
      duration,
      fps_before: fpsBefore,
      fps_after: fpsAfter,
      bitrate_before: bitrateBefore,
      bitrate_after: bitrateAfter,
      psnr,
      vmaf,
      ssim,
      exportTimeSeconds,
      weights,
      scores: { quality: qualityScore, speed: speedScore, bitrate: bitrateScore },
      final: finalScore
    });

    // Cleanup temp files
    try { fs.unlinkSync(beforePath); } catch (_) {}
    try { fs.unlinkSync(afterPath); } catch (_) {}

      return res.json({
        weights,
        metrics: {
          duration_seconds: duration,
          bitrate_before_bps: bitrateBefore,
          bitrate_after_bps: bitrateAfter,
          target_bitrate_bps: targetBps,
          psnr_db: psnr,
          vmaf: vmaf,
          ssim: ssim,
          fps_before: fpsBefore,
          fps_after: fpsAfter,
          codec_before: codecBefore,
          codec_after: codecAfter,
          speed_export_seconds: exportTimeSeconds,
          target_rtf: targetRTF
        },
      scores: {
        quality: Number(qualityScore.toFixed(4)),
        speed: Number(speedScore.toFixed(4)),
        bitrate: Number(bitrateScore.toFixed(4))
      },
      final_score: Number(finalScore.toFixed(4))
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '评估失败', detail: String(e && e.message || e) });
  }
});

app.post('/evaluate/vmaf', upload.fields([
  { name: 'beforeVideo', maxCount: 1 },
  { name: 'afterVideo', maxCount: 1 }
]), async (req, res) => {
  try {
    const before = req.files?.beforeVideo?.[0];
    const after = req.files?.afterVideo?.[0];
    if (!before || !after) return res.status(400).json({ error: '必须上传导出前与导出后视频' });
    const beforePath = before.path;
    const afterPath = after.path;
    const vmaf = await computeVMAF(beforePath, afterPath);
    try { fs.unlinkSync(beforePath); } catch (_) {}
    try { fs.unlinkSync(afterPath); } catch (_) {}
    return res.json({ metrics: { vmaf } });
  } catch (e) {
    return res.status(500).json({ error: 'VMAF计算失败', detail: String(e && e.message || e) });
  }
});

app.post('/evaluate/psnr', upload.fields([
  { name: 'beforeVideo', maxCount: 1 },
  { name: 'afterVideo', maxCount: 1 }
]), async (req, res) => {
  try {
    const before = req.files?.beforeVideo?.[0];
    const after = req.files?.afterVideo?.[0];
    if (!before || !after) return res.status(400).json({ error: '必须上传导出前与导出后视频' });
    const beforePath = before.path;
    const afterPath = after.path;
    const psnr = await computePSNR(beforePath, afterPath);
    try { fs.unlinkSync(beforePath); } catch (_) {}
    try { fs.unlinkSync(afterPath); } catch (_) {}
    return res.json({ metrics: { psnr_db: psnr } });
  } catch (e) {
    return res.status(500).json({ error: 'PSNR计算失败', detail: String(e && e.message || e) });
  }
});

app.post('/evaluate/ssim', upload.fields([
  { name: 'beforeVideo', maxCount: 1 },
  { name: 'afterVideo', maxCount: 1 }
]), async (req, res) => {
  try {
    const before = req.files?.beforeVideo?.[0];
    const after = req.files?.afterVideo?.[0];
    if (!before || !after) return res.status(400).json({ error: '必须上传导出前与导出后视频' });
    const beforePath = before.path;
    const afterPath = after.path;
    const ssim = await computeSSIM(beforePath, afterPath);
    try { fs.unlinkSync(beforePath); } catch (_) {}
    try { fs.unlinkSync(afterPath); } catch (_) {}
    return res.json({ metrics: { ssim } });
  } catch (e) {
    return res.status(500).json({ error: 'SSIM计算失败', detail: String(e && e.message || e) });
  }
});

// Automation: proxy upload to external FFmpeg server to avoid CORS
app.post('/automation/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const serverIp = req.body?.server_ip || req.body?.serverIp;
    const serverPort = Number(req.body?.server_port || req.body?.serverPort || 5000);
    const command = req.body?.command;
    const outputFilename = req.body?.output_filename || req.body?.outputFilename || 'output.mp4';
    if (!file) return res.status(400).json({ status: 'error', message: 'missing file' });
    if (!command) return res.status(400).json({ status: 'error', message: 'missing command' });
    if (!(String(command).startsWith('ffmpeg') && command.includes('{input}') && command.includes('{output}'))) {
      return res.status(400).json({ status: 'error', message: 'invalid command, require ffmpeg with {input} and {output}' });
    }

    if (String(serverIp) === '0') {
      const start = Date.now();
      const inPath = file.path;
      const outPath = path.join(FFMPEG_DIR, outputFilename);
      const cmd = String(command).replace('{input}', `"${inPath}"`).replace('{output}', `"${outPath}"`);
      const proc = spawnSync(cmd, { shell: true, encoding: 'utf8' });
      const dur = Date.now() - start;
      try { fs.unlinkSync(inPath); } catch (_) {}
      if (proc.status !== 0) {
        return res.status(500).json({ status: 'error', message: 'ffmpeg local run failed' });
      }
      const dp = `/files/ffmpeg/${outputFilename}`;
      return res.json({ status: 'success', download_path: dp, duration_ms: dur });
    } else {
      if (!serverIp || !serverPort) return res.status(400).json({ status: 'error', message: 'missing server address' });
      const buffer = fs.readFileSync(file.path);
      const blob = new Blob([buffer]);
      const fd = new FormData();
      fd.append('file', blob, file.originalname || 'input.mp4');
      fd.append('command', String(command));
      fd.append('output_filename', String(outputFilename));
      const url = `http://${serverIp}:${serverPort}/upload`;
      const resp = await fetch(url, { method: 'POST', body: fd });
      const data = await resp.json().catch(() => ({}));
      try { fs.unlinkSync(file.path); } catch (_) {}
      if (!resp.ok) {
        return res.status(resp.status).json(data);
      }
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'proxy upload failed', detail: String(e && e.message || e) });
  }
});

// Automation: save downloaded file to local storage path
app.post('/automation/save', express.json(), async (req, res) => {
  try {
    const url = req.body?.url;
    const saveDirReq = req.body?.save_dir;
    const saveDir = saveDirReq && String(saveDirReq).trim().length > 0 ? String(saveDirReq) : BASE_DIR;
    const filename = req.body?.filename || null;
    if (!url) return res.status(400).json({ status: 'error', message: 'missing url' });
    const resp = await fetch(String(url));
    if (!resp.ok) return res.status(resp.status).json({ status: 'error', message: `download failed: ${resp.status}` });
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const name = filename || path.basename(new URL(String(url)).pathname);
    const outPath = path.join(saveDir, name);
    const body = resp.body;
    if (!body) return res.status(500).json({ status: 'error', message: 'empty response body' });
    const readable = Readable.fromWeb(body);
    const ws = fs.createWriteStream(outPath, { flags: 'w' });
    await pipeline(readable, ws);
    return res.json({ status: 'success', saved_path: outPath });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'save failed', detail: String(e && e.message || e) });
  }
});

// serve saved files directory for easy access
try {
  const SAVED_DIR = BASE_DIR;
  if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
  app.use('/files', express.static(SAVED_DIR));
} catch (_) {}

// save arbitrary JSON content
app.post('/automation/save-json', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const data = req.body?.data;
    const saveDirReq = req.body?.save_dir;
    const saveDir = saveDirReq && String(saveDirReq).trim().length > 0 ? String(saveDirReq) : BASE_DIR;
    const filename = req.body?.filename || `evaluation_${Date.now()}.json`;
    if (!data) return res.status(400).json({ status: 'error', message: 'missing data' });
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const outPath = path.join(saveDir, filename);
    fs.writeFileSync(outPath, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
    return res.json({ status: 'success', saved_path: outPath, url: `/files/${filename}` });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'save json failed', detail: String(e && e.message || e) });
  }
});

app.post('/automation/save-csv', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const csv = req.body?.csv;
    const saveDirReq = req.body?.save_dir;
    const saveDir = saveDirReq && String(saveDirReq).trim().length > 0 ? String(saveDirReq) : BASE_DIR;
    const filename = req.body?.filename || `matrix_evaluation_${Date.now()}.csv`;
    if (!csv) return res.status(400).json({ status: 'error', message: 'missing csv' });
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const outPath = path.join(saveDir, filename);
    fs.writeFileSync(outPath, String(csv), 'utf8');
    // 返回完整的下载 URL，使用本机 IP
    const localIP = getLocalIP();
    const port = process.env.PORT || 3000;
    const fullUrl = `http://${localIP}:${port}/files/${filename}`;
    return res.json({ status: 'success', saved_path: outPath, url: `/files/${filename}`, full_url: fullUrl });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'save csv failed', detail: String(e && e.message || e) });
  }
});

// Upload input file once to external FFmpeg server
app.post('/automation/upload_file', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const serverIp = req.body?.server_ip || req.body?.serverIp;
    const serverPort = Number(req.body?.server_port || req.body?.serverPort || 5000);
    if (!file) return res.status(400).json({ status: 'error', message: 'missing file' });
    if (String(serverIp) === '0') {
      const name = file.originalname || `input_${Date.now()}.mp4`;
      const outPath = path.join(FFMPEG_DIR, `${Date.now()}_${name}`);
      const buf = fs.readFileSync(file.path);
      fs.writeFileSync(outPath, buf);
      try { fs.unlinkSync(file.path); } catch (_) {}
      return res.json({ status: 'success', job_id: outPath, input: `/files/ffmpeg/${path.basename(outPath)}` });
    } else {
      if (!serverIp || !serverPort) return res.status(400).json({ status: 'error', message: 'missing server address' });
      const buffer = fs.readFileSync(file.path);
      const blob = new Blob([buffer]);
      const fd = new FormData();
      fd.append('file', blob, file.originalname || 'input.mp4');
      const url = `http://${serverIp}:${serverPort}/upload_file`;
      const resp = await fetch(url, { method: 'POST', body: fd });
      const data = await resp.json().catch(() => ({}));
      try { fs.unlinkSync(file.path); } catch (_) {}
      if (!resp.ok) return res.status(resp.status).json(data);
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'proxy upload_file failed', detail: String(e && e.message || e) });
  }
});

// Process export using previously uploaded input
app.post('/automation/process', express.json(), async (req, res) => {
  try {
    const serverIp = req.body?.server_ip || req.body?.serverIp;
    const serverPort = Number(req.body?.server_port || req.body?.serverPort || 5000);
    const jobId = req.body?.job_id || req.body?.jobId;
    const command = req.body?.command;
    const outputFilename = req.body?.output_filename || req.body?.outputFilename || 'output.mp4';
    if (!jobId) return res.status(400).json({ status: 'error', message: 'missing job_id' });
    if (!command) return res.status(400).json({ status: 'error', message: 'missing command' });
    if (String(serverIp) === '0') {
      const start = Date.now();
      const inPath = String(jobId);
      const outPath = path.join(FFMPEG_DIR, outputFilename);
      const cmd = String(command).replace('{input}', `"${inPath}"`).replace('{output}', `"${outPath}"`);
      const proc = spawnSync(cmd, { shell: true, encoding: 'utf8' });
      const dur = Date.now() - start;
      if (proc.status !== 0) {
        return res.status(500).json({ status: 'error', message: 'ffmpeg local run failed' });
      }
      const dp = `/files/ffmpeg/${outputFilename}`;
      return res.json({ status: 'success', job_id: inPath, output: outPath, download_path: dp, duration_ms: dur });
    } else {
      if (!serverIp || !serverPort) return res.status(400).json({ status: 'error', message: 'missing server address' });
      const fd = new FormData();
      fd.append('job_id', String(jobId));
      fd.append('command', String(command));
      fd.append('output_filename', String(outputFilename));
      const url = `http://${serverIp}:${serverPort}/process`;
      const resp = await fetch(url, { method: 'POST', body: fd });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return res.status(resp.status).json(data);
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'proxy process failed', detail: String(e && e.message || e) });
  }
});
app.post('/automation/save-upload', upload.single('file'), async (req, res) => {
  try {
    const saveDirReq = req.body?.save_dir;
    const saveDir = saveDirReq && String(saveDirReq).trim().length > 0 ? String(saveDirReq) : BASE_DIR;
    const filename = req.body?.filename || (req.file?.originalname || `upload_${Date.now()}`);
    const tmpPath = req.file?.path;
    if (!tmpPath) return res.status(400).json({ status: 'error', message: 'missing file' });
    const buf = fs.readFileSync(tmpPath);
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const outPath = path.join(saveDir, filename);
    fs.writeFileSync(outPath, buf);
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return res.json({ status: 'success', saved_path: outPath, url: `/files/${filename}` });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'save upload failed', detail: String(e && e.message || e) });
  }
});

// 飞书 Webhook 推送
app.post('/automation/notify-feishu', express.json(), async (req, res) => {
  try {
    const webhookUrl = req.body?.webhook_url;
    const title = req.body?.title || '评估结果通知';
    const content = req.body?.content || '';
    const csvUrl = req.body?.csv_url || '';

    if (!webhookUrl) {
      return res.status(400).json({ status: 'error', message: 'missing webhook_url' });
    }

    // 构建富文本消息
    const msgContent = [];
    if (content) {
      msgContent.push([{ tag: 'text', text: content }]);
    }
    if (csvUrl) {
      msgContent.push([
        { tag: 'text', text: 'CSV 下载链接：' },
        { tag: 'a', text: csvUrl, href: csvUrl }
      ]);
    }

    const payload = {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: title,
            content: msgContent
          }
        }
      }
    };

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));

    if (data?.code === 0 || data?.StatusCode === 0) {
      return res.json({ status: 'success', message: '推送成功' });
    } else {
      return res.status(500).json({ status: 'error', message: data?.msg || '推送失败', detail: data });
    }
  } catch (e) {
    return res.status(500).json({ status: 'error', message: '推送失败', detail: String(e && e.message || e) });
  }
});

// 存储后台运行的矩阵评估任务（持久化到文件）
const matrixTasks = new Map();
const TASKS_FILE = path.join(BASE_DIR, 'matrix_tasks.json');

// 任务队列
const taskQueue = [];
let isProcessingQueue = false;
// 前台执行锁：当前台执行时设置，后台队列会等待
let isFrontendExecuting = false;
let frontendExecutionTimeout = null;

// 从文件加载历史任务
function loadTasksFromFile() {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(task => matrixTasks.set(task.id, task));
        console.log(`[matrix-task] 已加载 ${data.length} 条历史任务记录`);
      }
    }
  } catch (e) {
    console.warn('[matrix-task] 加载历史任务失败:', e.message);
  }
}

// 保存任务到文件
function saveTasksToFile() {
  try {
    const tasks = Array.from(matrixTasks.values());
    // 只保留最近100条记录，避免文件过大
    const recentTasks = tasks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(recentTasks, null, 2), 'utf8');
  } catch (e) {
    console.warn('[matrix-task] 保存任务失败:', e.message);
  }
}

// 执行单个任务
async function executeMatrixTask(taskJson) {
  const taskInfo = matrixTasks.get(taskJson.id);
  if (!taskInfo) return;

  taskInfo.status = 'running';
  saveTasksToFile();

  const {
    serverIp, serverPort, encoder, nvencCodec, presets, bitrates, maxrates, bufsizes,
    rcMode, cqValues, qpValues, temporalAQ, spatialAQ, profile, tune, multipass,
    rcLookahead, minrate, evalConcurrency, feishuWebhook, inputDuration, skipVmaf
  } = taskJson.config;

  try {
    const inputBuffer = fs.readFileSync(taskJson.inputFile.path);
    const inputFilename = taskJson.inputFile.originalname || 'input.mp4';

    // 1. 上传源视频到 FFmpeg 服务器
    let jobId = null;
    if (String(serverIp) === '0') {
      const name = `${Date.now()}_${inputFilename}`;
      const outPath = path.join(FFMPEG_DIR, name);
      fs.writeFileSync(outPath, inputBuffer);
      jobId = outPath;
    } else {
      const blob = new Blob([inputBuffer]);
      const fd = new FormData();
      fd.append('file', blob, inputFilename);
      const upResp = await fetch(`http://${serverIp}:${serverPort}/upload_file`, { method: 'POST', body: fd });
      const upData = await upResp.json().catch(() => ({}));
      jobId = upData?.job_id || null;
    }
    if (!jobId) throw new Error('源视频上传失败');

    // 2. 生成所有任务组合
    const presetArr = (presets || '').split(',').map(s => s.trim()).filter(Boolean);
    const bitrateArr = (bitrates || '').split(',').map(s => s.trim()).filter(Boolean);
    const maxrateArr = (maxrates || '').split(',').map(s => s.trim()).filter(Boolean);
    const bufsizeArr = (bufsizes || '').split(',').map(s => s.trim()).filter(Boolean);
    const cqArr = (cqValues || '').split(',').map(s => s.trim()).filter(Boolean);
    const qpArr = (qpValues || '').split(',').map(s => s.trim()).filter(Boolean);
    const lookaheadArr = (rcLookahead || '').split(',').map(s => s.trim()).filter(Boolean);

    const codec = encoder === 'x264' ? 'libx264' : (encoder === 'x265' ? 'libx265' : (nvencCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'));
    const hwaccel = encoder === 'nvenc' ? '-hwaccel cuda -hwaccel_output_format cuda ' : '';
    const jobs = [];
    const now = Date.now();

    for (const preset of (presetArr.length ? presetArr : [''])) {
      for (const b of (bitrateArr.length ? bitrateArr : [''])) {
        for (const mr of (maxrateArr.length ? maxrateArr : [''])) {
          for (const bs of (bufsizeArr.length ? bufsizeArr : [''])) {
            for (const cq of (cqArr.length ? cqArr : [''])) {
              for (const qp of (qpArr.length ? qpArr : [''])) {
                for (const la of (lookaheadArr.length ? lookaheadArr : [''])) {
                  const encTag = encoder === 'nvenc' ? (nvencCodec === 'hevc' ? 'nvhevc' : 'nvh264') : encoder;
                  const nameParts = ['auto', encTag];
                  if (preset) nameParts.push(`pre-${preset}`);
                  nameParts.push(`rc-${rcMode || 'vbr'}`);
                  if (b) nameParts.push(`b-${b}`);
                  if (mr) nameParts.push(`max-${mr}`);
                  if (bs) nameParts.push(`buf-${bs}`);
                  if (cq) nameParts.push(`cq-${cq}`);
                  if (qp) nameParts.push(`qp-${qp}`);
                  if (tune) nameParts.push(`t-${tune}`);
                  if (multipass) nameParts.push(`mp-${multipass}`);
                  if (la && la !== '0') nameParts.push(`la-${la}`);
                  if (minrate) nameParts.push(`min-${minrate}`);
                  if (temporalAQ) nameParts.push('ta-1');
                  if (spatialAQ) nameParts.push('sa-1');
                  let profTag = profile;
                  if (encoder === 'nvenc' && nvencCodec === 'hevc') {
                    const p = String(profile || '').toLowerCase();
                    if (p === 'high') profTag = 'main';
                    else if (!['main', 'main10', 'rext'].includes(p)) profTag = 'main';
                  }
                  if (profTag) nameParts.push(`pr-${profTag}`);
                  const jobIndex = jobs.length;
                  const outfile = `${nameParts.join('_')}_${now}_${jobIndex}.mp4`;

                  const paramsList = [];
                  paramsList.push(`-c:v ${codec}`);
                  if (preset) paramsList.push(`-preset ${preset}`);
                  if (rcMode !== 'constqp') {
                    if (rcMode) paramsList.push(`-rc:v ${rcMode}`);
                    if (b) paramsList.push(`-b:v ${b}`);
                    if (mr) paramsList.push(`-maxrate ${mr}`);
                    if (bs) paramsList.push(`-bufsize ${bs}`);
                    if (cq) paramsList.push(`-cq:v ${cq}`);
                  } else {
                    paramsList.push(`-rc constqp`);
                    if (qp) paramsList.push(`-qp ${qp}`);
                  }
                  if (temporalAQ) paramsList.push(`-temporal-aq 1`);
                  if (spatialAQ) paramsList.push(`-spatial-aq 1`);
                  if (profTag) paramsList.push(`-profile:v ${profTag}`);
                  paramsList.push(`-c:a copy`);
                  if (encoder === 'nvenc') {
                    if (tune) paramsList.push(`-tune ${tune}`);
                    if (multipass) paramsList.push(`-multipass ${multipass}`);
                    if (la && la !== '0') paramsList.push(`-rc-lookahead ${la}`);
                    if (minrate) paramsList.push(`-minrate ${minrate}`);
                  }
                  const params = paramsList.join(' ');
                  const command = `ffmpeg -y ${hwaccel}-i {input} ${params} {output}`;

                  jobs.push({
                    id: `${now}-${jobIndex}`,
                    encoder,
                    nvencCodec: nvencCodec || '',
                    preset, b, mr, bs, cq, qp, la,
                    temporalAQ: temporalAQ ? 1 : 0,
                    spatialAQ: spatialAQ ? 1 : 0,
                    profile: profTag || '',
                    tune: tune || '',
                    multipass: multipass || '',
                    minrate: minrate || '',
                    command,
                    outputFilename: outfile,
                    downloadUrl: null,
                    savedPath: null,
                    exportDurationMs: null,
                    evalResult: null
                  });
                }
              }
            }
          }
        }
      }
    }

    taskInfo.progress.total = jobs.length;
    console.log(`[matrix-task] ${taskJson.id} 开始执行，共 ${jobs.length} 个任务`);

    // 3. 顺序执行导出
    for (const job of jobs) {
      try {
        let resp;
        if (String(serverIp) === '0') {
          const start = Date.now();
          const outPath = path.join(FFMPEG_DIR, job.outputFilename);
          const cmd = job.command.replace('{input}', `"${jobId}"`).replace('{output}', `"${outPath}"`);
          const proc = spawnSync(cmd, { shell: true, encoding: 'utf8' });
          const dur = Date.now() - start;
          if (proc.status === 0) {
            job.downloadUrl = `/files/ffmpeg/${job.outputFilename}`;
            job.savedPath = outPath;
            job.exportDurationMs = dur;
          }
        } else {
          const fd = new FormData();
          fd.append('job_id', String(jobId));
          fd.append('command', job.command);
          fd.append('output_filename', job.outputFilename);
          const procResp = await fetch(`http://${serverIp}:${serverPort}/process`, { method: 'POST', body: fd });
          resp = await procResp.json().catch(() => ({}));
          if (resp?.status === 'success') {
            const dp = resp.download_path || '';
            job.downloadUrl = `http://${serverIp}:${serverPort}${dp}`;
            job.exportDurationMs = resp.duration_ms || null;
            // 下载到本地
            try {
              const dlResp = await fetch(job.downloadUrl);
              if (dlResp.ok) {
                const buf = Buffer.from(await dlResp.arrayBuffer());
                const localPath = path.join(BASE_DIR, job.outputFilename);
                fs.writeFileSync(localPath, buf);
                job.savedPath = localPath;
              }
            } catch (_) {}
          }
        }
        if (job.savedPath) taskInfo.progress.exported++;
      } catch (e) {
        console.warn(`[matrix-task] 导出失败 ${job.id}:`, e.message);
      }
    }

    console.log(`[matrix-task] ${taskJson.id} 导出完成 ${taskInfo.progress.exported}/${jobs.length}`);

    // 4. 并行评估
    const concurrency = evalConcurrency || 2;
    const inputFileForEval = path.join(BASE_DIR, `input_${taskJson.id}.mp4`);
    fs.writeFileSync(inputFileForEval, inputBuffer);

    const evaluateJob = async (job) => {
      if (!job.savedPath) return;
      try {
        const afterPath = job.savedPath;
        let psnr = null, vmaf = null, ssim = null;
        if (skipVmaf) {
          [psnr, ssim] = await Promise.all([
            computePSNR(inputFileForEval, afterPath),
            computeSSIM(inputFileForEval, afterPath)
          ]);
        } else {
          [psnr, vmaf, ssim] = await Promise.all([
            computePSNR(inputFileForEval, afterPath),
            computeVMAF(inputFileForEval, afterPath),
            computeSSIM(inputFileForEval, afterPath)
          ]);
        }

        const metaAfter = ffprobeJson(afterPath) || {};
        metaAfter._filePath = afterPath;
        const bitrateAfter = getBitrateBps(metaAfter);
        const duration = getDurationSeconds(metaAfter) || inputDuration || 30;
        const exportSec = job.exportDurationMs ? job.exportDurationMs / 1000 : duration;

        const qualityScore = normalizeQuality(vmaf, psnr);
        const bitrateScore = computeBitrateScore(bitrateAfter, bitrateAfter);
        const speedScore = computeSpeedScore(duration, exportSec, 1.0);
        const weights = { quality: 0.5, speed: 0.25, bitrate: 0.25 };
        const finalScore = weights.quality * qualityScore + weights.speed * speedScore + weights.bitrate * bitrateScore;

        job.evalResult = {
          vmaf, psnr, ssim,
          bitrate_after_kbps: Math.round(bitrateAfter / 1000),
          final_score: Number(finalScore.toFixed(4))
        };
        taskInfo.progress.evaluated++;
      } catch (e) {
        console.warn(`[matrix-task] 评估失败 ${job.id}:`, e.message);
      }
    };

    // 分批并行执行评估
    for (let i = 0; i < jobs.length; i += concurrency) {
      const batch = jobs.slice(i, i + concurrency);
      await Promise.all(batch.map(evaluateJob));
    }

    console.log(`[matrix-task] ${taskJson.id} 评估完成 ${taskInfo.progress.evaluated}/${jobs.length}`);

    // 5. 生成 CSV
    const header = [
      'encoder', 'nvenc_codec', 'preset', 'b_v', 'maxrate', 'bufsize', 'rc', 'cq', 'qp',
      'temporal_aq', 'spatial_aq', 'profile', 'tune', 'multipass', 'rc_lookahead', 'minrate',
      'output_file', 'overall', 'vmaf', 'psnr_db', 'ssim', 'bitrate_after_kbps',
      'export_duration_seconds', 'download_url', 'saved_path', 'ffmpeg_command'
    ];
    const rows = jobs.filter(j => j.evalResult).map(j => {
      const v = [
        j.encoder || '',
        j.nvencCodec || '',
        j.preset || '',
        j.b || '',
        j.mr || '',
        j.bs || '',
        rcMode || 'vbr',
        j.cq || '',
        j.qp || '',
        j.temporalAQ ?? '',
        j.spatialAQ ?? '',
        j.profile || '',
        j.tune || '',
        j.multipass || '',
        j.la || '',
        j.minrate || '',
        j.outputFilename || '',
        j.evalResult?.final_score ?? '',
        j.evalResult?.vmaf ?? '',
        j.evalResult?.psnr ?? '',
        j.evalResult?.ssim ?? '',
        j.evalResult?.bitrate_after_kbps ?? '',
        j.exportDurationMs ? (j.exportDurationMs / 1000).toFixed(2) : '',
        j.downloadUrl || '',
        j.savedPath || '',
        j.command || ''
      ];
      return v.map(s => {
        const str = String(s ?? '');
        if (str.includes(',') || str.includes('\n') || str.includes('"')) return '"' + str.replace(/"/g, '""') + '"';
        return str;
      }).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const csvFilename = `matrix_task_${taskJson.id}.csv`;
    const csvPath = path.join(BASE_DIR, csvFilename);
    fs.writeFileSync(csvPath, csv, 'utf8');

    const localIP = getLocalIP();
    const port = process.env.PORT || 3000;
    const csvFullUrl = `http://${localIP}:${port}/files/${csvFilename}`;
    taskInfo.csvUrl = csvFullUrl;
    taskInfo.results = [];
    taskInfo.status = 'completed';
    saveTasksToFile();

    console.log(`[matrix-task] ${taskJson.id} CSV 已生成: ${csvFullUrl}`);

    // 6. 推送飞书
    if (feishuWebhook) {
      try {
        const evaledCount = jobs.filter(j => j.evalResult).length;
        const avgScore = evaledCount > 0
          ? jobs.filter(j => j.evalResult).reduce((acc, j) => acc + (j.evalResult?.final_score || 0), 0) / evaledCount
          : 0;

        // 构建参数组合信息
        const paramInfo = [];
        paramInfo.push(`编码器: ${encoder}${nvencCodec ? `(${nvencCodec})` : ''}`);
        if (presets) paramInfo.push(`presets: ${presets}`);
        if (rcMode) paramInfo.push(`rc: ${rcMode}`);
        if (cqValues) paramInfo.push(`cq: ${cqValues}`);
        if (qpValues) paramInfo.push(`qp: ${qpValues}`);
        if (bitrates && bitrates !== '0') paramInfo.push(`bitrate: ${bitrates}`);
        if (maxrates) paramInfo.push(`maxrate: ${maxrates}`);
        if (bufsizes) paramInfo.push(`bufsize: ${bufsizes}`);
        if (temporalAQ) paramInfo.push('temporal-aq: 1');
        if (spatialAQ) paramInfo.push('spatial-aq: 1');
        if (profile) paramInfo.push(`profile: ${profile}`);
        if (tune) paramInfo.push(`tune: ${tune}`);
        if (multipass) paramInfo.push(`multipass: ${multipass}`);
        if (rcLookahead) paramInfo.push(`rc-lookahead: ${rcLookahead}`);
        if (minrate) paramInfo.push(`minrate: ${minrate}`);
        if (skipVmaf) paramInfo.push('跳过VMAF');

        const payload = {
          msg_type: 'post',
          content: {
            post: {
              zh_cn: {
                title: '矩阵评估任务完成',
                content: [
                  [{ tag: 'text', text: `任务ID: ${taskJson.id}` }],
                  [{ tag: 'text', text: `参数组合: ${paramInfo.join(', ')}` }],
                  [{ tag: 'text', text: `共 ${evaledCount} 个任务完成评估，平均得分 ${(avgScore * 100).toFixed(2)} 分` }],
                  [{ tag: 'text', text: 'CSV 下载链接：' }, { tag: 'a', text: csvFullUrl, href: csvFullUrl }]
                ]
              }
            }
          }
        };
        await fetch(feishuWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(payload)
        });
        console.log(`[matrix-task] ${taskJson.id} 飞书推送成功`);
      } catch (e) {
        console.warn(`[matrix-task] 飞书推送失败:`, e.message);
      }
    }

    // 清理临时文件
    try { fs.unlinkSync(taskJson.inputFile.path); } catch (_) {}
    try { fs.unlinkSync(inputFileForEval); } catch (_) {}

  } catch (e) {
    taskInfo.status = 'failed';
    taskInfo.error = e.message;
    taskInfo.results = [];
    saveTasksToFile();
    console.error(`[matrix-task] ${taskJson.id} 执行失败:`, e);

    // 失败也推送飞书
    if (taskJson.config.feishuWebhook) {
      try {
        const payload = {
          msg_type: 'post',
          content: {
            post: {
              zh_cn: {
                title: '矩阵评估任务失败',
                content: [[{ tag: 'text', text: `任务ID: ${taskJson.id}\n错误: ${e.message}` }]]
              }
            }
          }
        };
        await fetch(taskJson.config.feishuWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(payload)
        });
      } catch (_) {}
    }
  }
}

// 处理任务队列
async function processTaskQueue() {
  if (isProcessingQueue) return;
  if (taskQueue.length === 0) return;
  // 如果前台正在执行，等待前台完成（前台释放锁时会重新触发队列处理）
  if (isFrontendExecuting) {
    console.log(`[task-queue] 前台正在执行，等待前台完成后再处理队列`);
    return;
  }

  isProcessingQueue = true;
  console.log(`[task-queue] 开始处理队列，当前队列长度: ${taskQueue.length}`);

  while (taskQueue.length > 0) {
    // 再次检查前台锁（防止在处理过程中前台开始执行）
    if (isFrontendExecuting) {
      console.log(`[task-queue] 前台开始执行，暂停队列处理`);
      break;
    }
    const taskJson = taskQueue.shift();
    console.log(`[task-queue] 开始执行任务: ${taskJson.id}，剩余队列: ${taskQueue.length}`);
    await executeMatrixTask(taskJson);
    console.log(`[task-queue] 任务完成: ${taskJson.id}`);
  }

  isProcessingQueue = false;
  console.log(`[task-queue] 队列处理完毕`);
}

// 添加任务到队列
function enqueueTask(taskJson) {
  taskQueue.push(taskJson);
  console.log(`[task-queue] 任务入队: ${taskJson.id}，当前队列长度: ${taskQueue.length}`);
  // 异步启动队列处理（不阻塞）
  setImmediate(() => processTaskQueue());
}

// 启动时加载历史任务
loadTasksFromFile();

// 矩阵评估后台任务接口
app.post('/automation/matrix-task', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const config = JSON.parse(req.body?.config || '{}');
    const { serverIp } = config;

    if (!file) return res.status(400).json({ status: 'error', message: '缺少源视频文件' });
    if (!serverIp) return res.status(400).json({ status: 'error', message: '缺少 FFmpeg 服务器地址' });

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 计算队列位置
    const queuePosition = taskQueue.length;
    const statusText = queuePosition > 0 ? 'pending' : 'pending';

    const taskInfo = {
      id: taskId,
      status: statusText,
      createdAt: new Date().toISOString(),
      config,
      progress: { total: 0, exported: 0, evaluated: 0 },
      results: [],
      csvUrl: null,
      error: null,
      queuePosition: queuePosition
    };
    matrixTasks.set(taskId, taskInfo);
    saveTasksToFile();

    // 构建任务 JSON
    const taskJson = {
      id: taskId,
      config,
      inputFile: {
        path: file.path,
        originalname: file.originalname || 'input.mp4'
      }
    };

    // 加入队列
    enqueueTask(taskJson);

    // 返回任务信息
    const message = queuePosition > 0
      ? `任务已加入队列，前面有 ${queuePosition} 个任务等待执行`
      : '任务已提交，即将开始执行';

    res.json({
      status: 'success',
      task_id: taskId,
      message,
      queue_position: queuePosition
    });

  } catch (e) {
    return res.status(500).json({ status: 'error', message: '提交任务失败', detail: String(e?.message || e) });
  }
});

// 查询任务状态
app.get('/automation/matrix-task/:id', (req, res) => {
  const taskId = req.params.id;
  const task = matrixTasks.get(taskId);
  if (!task) return res.status(404).json({ status: 'error', message: '任务不存在' });
  return res.json({ status: 'success', task });
});

// 获取当前队列状态
app.get('/automation/task-queue', (req, res) => {
  // 获取当前正在执行的任务和队列中等待的任务
  const runningTasks = [];
  const pendingTasks = [];

  // 提取关键配置信息
  const extractConfig = (config) => ({
    encoder: config?.encoder || '',
    nvencCodec: config?.nvencCodec || '',
    presets: config?.presets || '',
    bitrates: config?.bitrates || '',
    rcMode: config?.rcMode || '',
    cqValues: config?.cqValues || '',
    qpValues: config?.qpValues || '',
    skipVmaf: config?.skipVmaf || false
  });

  // 遍历 matrixTasks 找到 running 和 pending 状态的任务
  for (const [id, task] of matrixTasks) {
    if (task.status === 'running') {
      runningTasks.push({
        id: task.id,
        status: task.status,
        createdAt: task.createdAt,
        progress: task.progress,
        config: extractConfig(task.config)
      });
    } else if (task.status === 'pending') {
      pendingTasks.push({
        id: task.id,
        status: task.status,
        createdAt: task.createdAt,
        queuePosition: task.queuePosition,
        config: extractConfig(task.config)
      });
    }
  }

  // 按创建时间排序
  runningTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  pendingTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return res.json({
    status: 'success',
    isProcessing: isProcessingQueue,
    queueLength: taskQueue.length,
    running: runningTasks,
    pending: pendingTasks
  });
});

// 取消任务
app.post('/automation/matrix-task/:id/cancel', (req, res) => {
  const taskId = req.params.id;
  const task = matrixTasks.get(taskId);

  if (!task) {
    return res.status(404).json({ status: 'error', message: '任务不存在' });
  }

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return res.status(400).json({ status: 'error', message: `任务已${task.status === 'completed' ? '完成' : task.status === 'failed' ? '失败' : '取消'}，无法取消` });
  }

  // 从队列中移除
  const queueIndex = taskQueue.findIndex(t => t.id === taskId);
  if (queueIndex !== -1) {
    taskQueue.splice(queueIndex, 1);
    console.log(`[task-queue] 任务已从队列中移除: ${taskId}`);
  }

  // 更新任务状态
  task.status = 'cancelled';
  task.error = '用户取消';
  saveTasksToFile();

  console.log(`[matrix-task] 任务已取消: ${taskId}`);
  return res.json({ status: 'success', message: '任务已取消' });
});

// 取消所有任务（清空队列）
app.post('/automation/task-queue/clear', (req, res) => {
  let cancelledCount = 0;

  // 取消所有 running 和 pending 状态的任务
  for (const [id, task] of matrixTasks) {
    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'cancelled';
      task.error = '用户清空队列';
      cancelledCount++;
    }
  }

  // 清空队列
  const queueLength = taskQueue.length;
  taskQueue.length = 0;

  saveTasksToFile();

  console.log(`[task-queue] 队列已清空，取消了 ${cancelledCount} 个任务`);
  return res.json({
    status: 'success',
    message: `已取消 ${cancelledCount} 个任务`,
    cancelledCount
  });
});

// 记录前台任务完成
app.post('/automation/matrix-task-record', express.json(), (req, res) => {
  try {
    const { encoder, taskCount, evaluated, csvUrl, taskType } = req.body;
    const taskId = `frontend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const taskInfo = {
      id: taskId,
      status: 'completed',
      createdAt: new Date().toISOString(),
      config: { encoder },
      progress: { total: taskCount || 0, exported: taskCount || 0, evaluated: evaluated || 0 },
      results: [],
      csvUrl: csvUrl || null,
      error: null,
      taskType: taskType || 'frontend' // 'frontend' 或 'backend'
    };
    matrixTasks.set(taskId, taskInfo);
    saveTasksToFile();
    return res.json({ status: 'success', task_id: taskId });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: '记录失败', detail: String(e?.message || e) });
  }
});

// 前台执行锁：获取或设置锁状态
app.post('/automation/frontend-lock', express.json(), (req, res) => {
  const { action } = req.body; // 'acquire', 'release', 'check'

  if (action === 'acquire') {
    // 检查是否有后台任务正在执行
    if (isProcessingQueue) {
      return res.json({
        status: 'blocked',
        message: '当前有后台任务正在执行，请等待完成或取消后再执行前台任务',
        isBackendRunning: true,
        isFrontendRunning: false
      });
    }
    // 检查是否有其他前台任务正在执行
    if (isFrontendExecuting) {
      return res.json({
        status: 'blocked',
        message: '当前有其他前台任务正在执行，请等待完成',
        isBackendRunning: false,
        isFrontendRunning: true
      });
    }
    // 获取锁
    isFrontendExecuting = true;
    // 设置超时（30分钟后自动释放锁，防止前端崩溃导致死锁）
    if (frontendExecutionTimeout) clearTimeout(frontendExecutionTimeout);
    frontendExecutionTimeout = setTimeout(() => {
      isFrontendExecuting = false;
      console.log('[frontend-lock] 前台锁超时自动释放');
    }, 30 * 60 * 1000);
    console.log('[frontend-lock] 前台锁已获取');
    return res.json({ status: 'success', message: '锁已获取' });

  } else if (action === 'release') {
    // 释放锁
    isFrontendExecuting = false;
    if (frontendExecutionTimeout) {
      clearTimeout(frontendExecutionTimeout);
      frontendExecutionTimeout = null;
    }
    console.log('[frontend-lock] 前台锁已释放');
    // 尝试启动队列处理（如果有等待的后台任务）
    setImmediate(() => processTaskQueue());
    return res.json({ status: 'success', message: '锁已释放' });

  } else if (action === 'check') {
    // 检查锁状态
    return res.json({
      status: 'success',
      isBackendRunning: isProcessingQueue,
      isFrontendRunning: isFrontendExecuting,
      queueLength: taskQueue.length
    });

  } else {
    return res.status(400).json({ status: 'error', message: '无效的 action' });
  }
});

// 获取历史任务列表
app.get('/automation/matrix-tasks', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const tasks = Array.from(matrixTasks.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map(t => ({
      id: t.id,
      status: t.status,
      createdAt: t.createdAt,
      encoder: t.config?.encoder || '',
      taskCount: t.progress?.total || 0,
      exported: t.progress?.exported || 0,
      evaluated: t.progress?.evaluated || 0,
      csvUrl: t.csvUrl,
      error: t.error,
      taskType: t.taskType || 'backend' // 'frontend' 或 'backend'
    }));
  return res.json({ status: 'success', tasks });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
