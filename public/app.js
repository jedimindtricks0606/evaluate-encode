const form = document.getElementById('eval-form');
const result = document.getElementById('result');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  result.innerHTML = '评估中...';
  const fd = new FormData(form);
  try {
    const resp = await fetch('/evaluate', { method: 'POST', body: fd });
    const data = await resp.json();
    if (!resp.ok) {
      result.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      return;
    }
    const { weights, metrics, scores, final_score } = data;
    const kbps = v => v ? Math.round(v / 1000) : null;
    result.innerHTML = `
      <pre>${JSON.stringify({
        weights,
        metrics: {
          duration_seconds: metrics.duration_seconds,
          bitrate_before_kbps: kbps(metrics.bitrate_before_bps),
          bitrate_after_kbps: kbps(metrics.bitrate_after_bps),
          target_bitrate_kbps: kbps(metrics.target_bitrate_bps),
          psnr_db: metrics.psnr_db,
          vmaf: metrics.vmaf,
          speed_export_seconds: metrics.speed_export_seconds,
          target_rtf: metrics.target_rtf
        },
        scores,
        final_score
      }, null, 2)}</pre>
    `;
  } catch (err) {
    result.innerHTML = `<pre>${String(err)}</pre>`;
  }
});

