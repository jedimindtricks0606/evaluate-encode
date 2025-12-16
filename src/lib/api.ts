export async function evaluateQuality(options: {
  before: File;
  after: File;
  exportTimeSeconds: number;
  weights?: { quality?: number; speed?: number; bitrate?: number };
  targetBitrateKbps?: number | null;
  targetRTF?: number | null;
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
  const resp = await fetch('http://localhost:3000/evaluate', { method: 'POST', body: fd });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err?.error || '评估接口请求失败');
  }
  return resp.json();
}

