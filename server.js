import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawnSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(morgan('dev'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

app.use(express.static(path.join(__dirname, 'public')));

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
  // Use scale2ref to match dimensions; parse stderr for "average:" value
  const args = [
    '-hide_banner',
    '-i', afterPath,
    '-i', beforePath,
    '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[dist][ref];[dist][ref]psnr',
    '-f', 'null', '-'
  ];
  try {
    const proc = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    const text = (proc.stderr || '') + (proc.stdout || '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    let avg = null;
    for (const line of lines) {
      const m = line.match(/average\s*:\s*([0-9]+\.?[0-9]*)/i);
      if (m) avg = Number(m[1]);
    }
    return isNaN(avg) ? null : avg;
  } catch (e) {
    return null;
  }
}

function computeSSIM(beforePath, afterPath) {
  // Parse stderr for "All:" average SSIM value (0..1)
  const args = [
    '-hide_banner',
    '-i', afterPath,
    '-i', beforePath,
    '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[dist][ref];[dist][ref]ssim',
    '-f', 'null', '-'
  ];
  try {
    const proc = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    const text = (proc.stderr || '') + (proc.stdout || '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    let all = null;
    for (const line of lines) {
      const m = line.match(/All\s*:\s*([0-9]+\.?[0-9]*)/i);
      if (m) {
        all = Number(m[1]);
      }
    }
    return isNaN(all) ? null : all;
  } catch (e) {
    return null;
  }
}

function computeVMAF(beforePath, afterPath) {
  // Try libvmaf with JSON log; return mean VMAF if available
  const tmpJson = path.join(uploadDir, `vmaf_${Date.now()}.json`);
  const args = [
    '-hide_banner',
    '-i', afterPath,
    '-i', beforePath,
    '-lavfi', `[0:v][1:v]scale2ref=flags=bicubic[dist][ref];[dist][ref]libvmaf=log_fmt=json:log_path=${tmpJson}`,
    '-f', 'null', '-'
  ];
  try {
    spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (fs.existsSync(tmpJson)) {
      const j = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
      // Prefer pooled_metrics.mean.vmaf if present
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
      fs.unlinkSync(tmpJson);
      return isNaN(mean) ? null : mean;
    }
    return null;
  } catch (e) {
    try { if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson); } catch (_) {}
    // Fallback: parse console "VMAF score:" if any
    try {
      const args2 = [
        '-hide_banner', '-i', afterPath, '-i', beforePath,
        '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[dist][ref];[dist][ref]libvmaf',
        '-f', 'null', '-'
      ];
      const proc = spawnSync('ffmpeg', args2, { encoding: 'utf8' });
      const text = (proc.stderr || '') + (proc.stdout || '');
      const m = text.match(/VMAF\s*score\s*:\s*([0-9]+\.?[0-9]*)/i);
      if (m) return Number(m[1]);
    } catch (_) {}
    return null;
  }
}

function normalizeQuality(vmaf, psnr) {
  const vmafNorm = vmaf != null ? clamp01(vmaf / 100) : null;
  const psnrNorm = psnr != null ? clamp01((psnr - 20) / 30) : null; // 20–50dB -> 0–1
  if (vmafNorm != null && psnrNorm != null) return 0.7 * vmafNorm + 0.3 * psnrNorm;
  if (vmafNorm != null) return vmafNorm;
  if (psnrNorm != null) return psnrNorm;
  return 0;
}

function computeBitrateScore(targetBps, afterBps) {
  if (!afterBps || afterBps <= 0) return 0;
  if (!targetBps || targetBps <= 0) return 0;
  const ratio = targetBps / afterBps;
  return clamp01(ratio);
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

    let psnr = null, vmaf = null, ssim = null;
    if (mode !== 'bitrate') {
      psnr = computePSNR(beforePath, afterPath);
      vmaf = computeVMAF(beforePath, afterPath);
      ssim = computeSSIM(beforePath, afterPath);
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
    const vmaf = computeVMAF(beforePath, afterPath);
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
    const psnr = computePSNR(beforePath, afterPath);
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
    const ssim = computeSSIM(beforePath, afterPath);
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
    if (!serverIp || !serverPort) return res.status(400).json({ status: 'error', message: 'missing server address' });
    if (!command) return res.status(400).json({ status: 'error', message: 'missing command' });
    if (!(String(command).startsWith('ffmpeg') && command.includes('{input}') && command.includes('{output}'))) {
      return res.status(400).json({ status: 'error', message: 'invalid command, require ffmpeg with {input} and {output}' });
    }

    const buffer = fs.readFileSync(file.path);
    const blob = new Blob([buffer]);
    const fd = new FormData();
    fd.append('file', blob, file.originalname || 'input.mp4');
    fd.append('command', String(command));
    fd.append('output_filename', String(outputFilename));

    const url = `http://${serverIp}:${serverPort}/upload`;
    const resp = await fetch(url, { method: 'POST', body: fd });
    const data = await resp.json().catch(() => ({}));
    // Cleanup temp upload
    try { fs.unlinkSync(file.path); } catch (_) {}
    if (!resp.ok) {
      return res.status(resp.status).json(data);
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'proxy upload failed', detail: String(e && e.message || e) });
  }
});

// Automation: save downloaded file to local storage path
app.post('/automation/save', express.json(), async (req, res) => {
  try {
    const url = req.body?.url;
    const saveDir = req.body?.save_dir || '/Users/jinghuan/evaluate-server';
    const filename = req.body?.filename || null;
    if (!url) return res.status(400).json({ status: 'error', message: 'missing url' });
    const resp = await fetch(String(url));
    if (!resp.ok) return res.status(resp.status).json({ status: 'error', message: `download failed: ${resp.status}` });
    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const name = filename || path.basename(new URL(String(url)).pathname);
    const outPath = path.join(saveDir, name);
    fs.writeFileSync(outPath, buf);
    return res.json({ status: 'success', saved_path: outPath });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'save failed', detail: String(e && e.message || e) });
  }
});

// serve saved files directory for easy access
try {
  const SAVED_DIR = '/Users/jinghuan/evaluate-server';
  if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
  app.use('/files', express.static(SAVED_DIR));
} catch (_) {}

// save arbitrary JSON content
app.post('/automation/save-json', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const data = req.body?.data;
    const saveDir = req.body?.save_dir || '/Users/jinghuan/evaluate-server';
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
    const saveDir = req.body?.save_dir || '/Users/jinghuan/evaluate-server';
    const filename = req.body?.filename || `matrix_evaluation_${Date.now()}.csv`;
    if (!csv) return res.status(400).json({ status: 'error', message: 'missing csv' });
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const outPath = path.join(saveDir, filename);
    fs.writeFileSync(outPath, String(csv), 'utf8');
    return res.json({ status: 'success', saved_path: outPath, url: `/files/${filename}` });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'save csv failed', detail: String(e && e.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
