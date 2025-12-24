// 后端 API 基础地址，优先使用当前页面的 host（适配不同部署环境）
// 如果前端和后端部署在同一台机器，使用同一个 IP，只是端口不同（前端 5173，后端 3000）
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : `http://${window.location.hostname}:3000`;

export async function evaluateQuality(options: {
  before: File;
  after: File;
  exportTimeSeconds: number;
  weights?: { quality?: number; speed?: number; bitrate?: number };
  targetBitrateKbps?: number | null;
  targetRTF?: number | null;
  mode?: 'quality' | 'bitrate';
  skipVmaf?: boolean;
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
  if (options.skipVmaf) fd.append('skipVmaf', '1');
  const resp = await fetch(`${API_BASE}/evaluate`, { method: 'POST', body: fd });
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
  const resp = await fetch(`${API_BASE}/evaluate/vmaf`, { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('VMAF计算失败');
  return resp.json();
}

export async function evaluatePSNR(before: File, after: File): Promise<any> {
  const fd = new FormData();
  fd.append('beforeVideo', before);
  fd.append('afterVideo', after);
  const resp = await fetch(`${API_BASE}/evaluate/psnr`, { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('PSNR计算失败');
  return resp.json();
}

export async function evaluateSSIM(before: File, after: File): Promise<any> {
  const fd = new FormData();
  fd.append('beforeVideo', before);
  fd.append('afterVideo', after);
  const resp = await fetch(`${API_BASE}/evaluate/ssim`, { method: 'POST', body: fd });
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
  const resp = await fetch(`${API_BASE}/automation/upload`, { method: 'POST', body: fd });
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
  const resp = await fetch(`${API_BASE}/automation/upload_file`, { method: 'POST', body: fd });
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
  const resp = await fetch(`${API_BASE}/automation/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const resp = await fetch(`${API_BASE}/automation/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const resp = await fetch(`${API_BASE}/automation/save-json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const resp = await fetch(`${API_BASE}/automation/save-csv`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const resp = await fetch(`${API_BASE}/automation/save-upload`, { method: 'POST', body: fd });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '保存上传文件失败'));
  return data as any;
}

export async function submitMatrixTask(options: {
  file: File;
  config: {
    serverIp: string;
    serverPort: number;
    encoder: string;
    nvencCodec?: string;
    presets?: string;
    bitrates?: string;
    maxrates?: string;
    bufsizes?: string;
    rcMode?: string;
    cqValues?: string;
    qpValues?: string;
    temporalAQ?: boolean;
    spatialAQ?: boolean;
    profile?: string;
    tune?: string;
    multipass?: string;
    rcLookahead?: string;
    minrate?: string;
    evalConcurrency?: number;
    feishuWebhook?: string;
    inputDuration?: number;
    skipVmaf?: boolean;
  };
}): Promise<{ status: string; task_id?: string; message?: string }> {
  const fd = new FormData();
  fd.append('file', options.file);
  fd.append('config', JSON.stringify(options.config));
  const resp = await fetch(`${API_BASE}/automation/matrix-task`, { method: 'POST', body: fd });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '提交任务失败'));
  return data as any;
}

export async function getMatrixTaskStatus(taskId: string): Promise<{ status: string; task?: any; message?: string }> {
  const resp = await fetch(`${API_BASE}/automation/matrix-task/${taskId}`);
  const data = await resp.json().catch(() => ({}));
  return data as any;
}

export interface TaskConfig {
  encoder: string;
  nvencCodec: string;
  presets: string;
  bitrates: string;
  rcMode: string;
  cqValues: string;
  qpValues: string;
  skipVmaf: boolean;
}

export async function getTaskQueueStatus(): Promise<{
  status: string;
  isProcessing: boolean;
  queueLength: number;
  running: Array<{
    id: string;
    status: string;
    createdAt: string;
    progress: { total: number; exported: number; evaluated: number };
    config: TaskConfig;
  }>;
  pending: Array<{
    id: string;
    status: string;
    createdAt: string;
    queuePosition: number;
    config: TaskConfig;
  }>;
}> {
  const resp = await fetch(`${API_BASE}/automation/task-queue`);
  const data = await resp.json().catch(() => ({}));
  return data as any;
}

export async function cancelMatrixTask(taskId: string): Promise<{ status: string; message?: string }> {
  const resp = await fetch(`${API_BASE}/automation/matrix-task/${taskId}/cancel`, { method: 'POST' });
  const data = await resp.json().catch(() => ({}));
  return data as any;
}

export async function clearTaskQueue(): Promise<{ status: string; message?: string; cancelledCount?: number }> {
  const resp = await fetch(`${API_BASE}/automation/task-queue/clear`, { method: 'POST' });
  const data = await resp.json().catch(() => ({}));
  return data as any;
}

export async function getMatrixTaskList(limit?: number): Promise<{ status: string; tasks?: Array<{
  id: string;
  status: string;
  createdAt: string;
  encoder: string;
  taskCount: number;
  exported: number;
  evaluated: number;
  csvUrl?: string;
  error?: string;
  taskType?: string;
}>; message?: string }> {
  const resp = await fetch(`${API_BASE}/automation/matrix-tasks?limit=${limit || 50}`);
  const data = await resp.json().catch(() => ({}));
  return data as any;
}

export async function recordFrontendTask(options: {
  encoder: string;
  taskCount: number;
  evaluated: number;
  csvUrl?: string;
  taskType?: string;
}): Promise<{ status: string; task_id?: string; message?: string }> {
  const resp = await fetch(`${API_BASE}/automation/matrix-task-record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });
  const data = await resp.json().catch(() => ({}));
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
  const resp = await fetch(`${API_BASE}/automation/notify-feishu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String((data as any)?.message || '飞书推送失败'));
  return data as any;
}

export async function frontendLock(action: 'acquire' | 'release' | 'check'): Promise<{
  status: string;
  message?: string;
  isBackendRunning?: boolean;
  isFrontendRunning?: boolean;
  queueLength?: number;
}> {
  const resp = await fetch(`${API_BASE}/automation/frontend-lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  const data = await resp.json().catch(() => ({}));
  return data as any;
}
