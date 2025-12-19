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
}): Promise<{ status: string; message?: string; job_id?: string; input?: string; output?: string; download_path?: string; duration_ms?: number }> {
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

export async function automationUploadFile(options: {
  serverIp: string;
  serverPort: number;
  file: File;
}): Promise<{ status: string; message?: string; job_id?: string; input?: string }> {
  const fd = new FormData();
  fd.append('file', options.file);
  fd.append('server_ip', options.serverIp);
  fd.append('server_port', String(options.serverPort));
  const resp = await fetch('http://localhost:3000/automation/upload_file', { method: 'POST', body: fd });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '上传源视频失败'));
  return data as any;
}

export async function automationProcess(options: {
  serverIp: string;
  serverPort: number;
  jobId: string;
  command: string;
  outputFilename?: string;
}): Promise<{ status: string; message?: string; job_id?: string; input?: string; output?: string; download_path?: string; duration_ms?: number }> {
  const body = {
    server_ip: options.serverIp,
    server_port: options.serverPort,
    job_id: options.jobId,
    command: options.command,
    output_filename: options.outputFilename,
  } as any;
  const resp = await fetch('http://localhost:3000/automation/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '执行导出失败'));
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

export async function automationSaveJson(options: {
  data: any;
  localSaveDir: string;
  filename?: string;
}): Promise<{ status: string; saved_path?: string; url?: string; message?: string }> {
  const body = {
    data: options.data,
    save_dir: options.localSaveDir,
    filename: options.filename,
  };
  const resp = await fetch('http://localhost:3000/automation/save-json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '保存 JSON 失败'));
  return data as any;
}

export async function automationSaveCsv(options: {
  csvText: string;
  localSaveDir: string;
  filename?: string;
}): Promise<{ status: string; saved_path?: string; url?: string; message?: string }> {
  const body = {
    csv: options.csvText,
    save_dir: options.localSaveDir,
    filename: options.filename,
  };
  const resp = await fetch('http://localhost:3000/automation/save-csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '保存 CSV 失败'));
  return data as any;
}

export async function automationSaveUpload(options: {
  file: File;
  localSaveDir: string;
  filename?: string;
}): Promise<{ status: string; saved_path?: string; url?: string; message?: string }> {
  const fd = new FormData();
  fd.append('file', options.file);
  fd.append('save_dir', options.localSaveDir);
  if (options.filename) fd.append('filename', options.filename);
  const resp = await fetch('http://localhost:3000/automation/save-upload', { method: 'POST', body: fd });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '保存上传文件失败'));
  return data as any;
}

export async function notifyFeishu(options: {
  webhookUrl: string;
  title?: string;
  content?: string;
  csvUrl?: string;
}): Promise<{ status: string; message?: string }> {
  const body = {
    webhook_url: options.webhookUrl,
    title: options.title,
    content: options.content,
    csv_url: options.csvUrl,
  };
  const resp = await fetch('http://localhost:3000/automation/notify-feishu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '飞书推送失败'));
  return data as any;
}
