export async function evaluateQuality(options: {
  before: File;
  after: File;
  exportTimeSeconds: number;
  weights?: { quality?: number; speed?: number; bitrate?: number };
  targetBitrateKbps?: number | null;
  targetRTF?: number | null;
  mode?: 'quality' | 'bitrate';
}): Promise<any> {
  const fd = new FormData();
  fd.append('beforeVideo', options.before);
  fd.append('afterVideo', options.after);
  fd.append('exportTimeSeconds', String(options.exportTimeSeconds));
  if (options.weights?.quality != null) fd.append('w_quality', String(options.weights.quality));
  if (options.weights?.speed != null) fd.append('w_speed', String(options.weights.speed));
  if (options.weights?.bitrate != null) fd.append('w_bitrate', String(options.weights.bitrate));
  if (options.targetBitrateKbps != null) fd.append('targetBitrateKbps', String(options.targetBitrateKbps));
  if (options.targetRTF != null) fd.append('targetRTF', String(options.targetRTF));
  if (options.mode) fd.append('mode', options.mode);
  const resp = await fetch('http://localhost:3000/evaluate', { method: 'POST', body: fd });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err?.error || '评估接口请求失败');
  }
  return resp.json();
}

export async function evaluateVMAF(before: File, after: File): Promise<any> {
  const fd = new FormData();
  fd.append('beforeVideo', before);
  fd.append('afterVideo', after);
  const resp = await fetch('http://localhost:3000/evaluate/vmaf', { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('VMAF计算失败');
  return resp.json();
}

export async function evaluatePSNR(before: File, after: File): Promise<any> {
  const fd = new FormData();
  fd.append('beforeVideo', before);
  fd.append('afterVideo', after);
  const resp = await fetch('http://localhost:3000/evaluate/psnr', { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('PSNR计算失败');
  return resp.json();
}

export async function evaluateSSIM(before: File, after: File): Promise<any> {
  const fd = new FormData();
  fd.append('beforeVideo', before);
  fd.append('afterVideo', after);
  const resp = await fetch('http://localhost:3000/evaluate/ssim', { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('SSIM计算失败');
  return resp.json();
}

export async function automationUpload(options: {
  serverIp: string;
  serverPort: number;
  file: File;
  command: string;
  outputFilename?: string;
}): Promise<{ status: string; message?: string; job_id?: string; input?: string; output?: string; download_path?: string }> {
  const fd = new FormData();
  fd.append('file', options.file);
  fd.append('command', options.command);
  if (options.outputFilename) fd.append('output_filename', options.outputFilename);
  fd.append('server_ip', options.serverIp);
  fd.append('server_port', String(options.serverPort));
  const resp = await fetch('http://localhost:3000/automation/upload', { method: 'POST', body: fd });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '自动化上传处理失败'));
  return data as any;
}

export async function automationSave(options: {
  fullDownloadUrl: string;
  localSaveDir: string;
  filename?: string;
}): Promise<{ status: string; saved_path?: string; message?: string }> {
  const body = {
    url: options.fullDownloadUrl,
    save_dir: options.localSaveDir,
    filename: options.filename,
  };
  const resp = await fetch('http://localhost:3000/automation/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '结果保存失败'));
  return data as any;
}
