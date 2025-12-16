import { Layout, Row, Col, Typography, Button, Upload, Card, Space } from 'antd';
import { PlayCircleOutlined, UploadOutlined, InboxOutlined, VideoCameraOutlined, EyeOutlined, CloseOutlined } from '@ant-design/icons';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Layout/Header';
import QualityEvaluationCard from '@/components/Evaluation/QualityEvaluationCard';
import SpeedEvaluationCard from '@/components/Evaluation/SpeedEvaluationCard';
import BitrateAnalysisCard from '@/components/Evaluation/BitrateAnalysisCard';
import ResultsPanel from '@/components/Evaluation/ResultsPanel';
import { useEvaluationStore } from '@/stores/evaluationStore';
import { EvaluationResults } from '@/types';
import { evaluateQuality, evaluateVMAF, evaluatePSNR, evaluateSSIM } from '@/lib/api';
import { message } from 'antd';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function Home() {
  const navigate = useNavigate();
  const { selectedTypes, setSelectedTypes, originalVideo, exportedVideo, setOriginalVideo, setExportedVideo, qualityCache, upsertQualityCache } = useEvaluationStore();
  
  const [exportTime, setExportTime] = useState(30);
  const [benchmark, setBenchmark] = useState(60);
  const [qualityResults, setQualityResults] = useState<EvaluationResults | null>(null);
  const [speedResults, setSpeedResults] = useState<{ rtf: number; exportTime: number; relative: number } | null>(null);
  const [bitrateResults, setBitrateResults] = useState<{ ratio: number; original: number; exported: number } | null>(null);
  const [originalFps, setOriginalFps] = useState<number | undefined>(undefined);
  const [exportedFps, setExportedFps] = useState<number | undefined>(undefined);
  const [bitrateLoading, setBitrateLoading] = useState(false);
  const [weights, setWeights] = useState<{ wq: number; ws: number; wb: number }>({ wq: 0.65, ws: 0.25, wb: 0.10 });
  const [qualityParams, setQualityParams] = useState<{ V0: number; k: number }>({ V0: 70, k: 0.2 });
  const [finalScore, setFinalScore] = useState<{ overall: number; quality: number; speed: number; bitrate: number; bitrateRational: number } | null>(null);
  const [efficiencyRatio, setEfficiencyRatio] = useState<number | null>(null);

  const originalNotifiedRef = useRef(false);
  const exportedNotifiedRef = useRef(false);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);
  const autoBitrateTriggeredRef = useRef<string | null>(null);

  const uploadProps = {
    multiple: false,
    accept: 'video/*',
    beforeUpload: (file: File) => {
      const isVideo = file.type.startsWith('video/');
      if (!isVideo) {
        message.error('只能上传视频文件！');
        return Upload.LIST_IGNORE;
      }
      const isLt500M = file.size / 1024 / 1024 < 500;
      if (!isLt500M) {
        message.error('视频文件大小不能超过 500MB！');
        return Upload.LIST_IGNORE;
      }
      return false; // 阻止自动上传
    },
    maxCount: 1,
    showUploadList: false,
  } as const;

  const handleOriginalUpload = (info: any) => {
    const raw: File | undefined = info?.file?.originFileObj || info?.file || info?.fileList?.[info.fileList.length - 1]?.originFileObj;
    if (raw) {
      const v = {
        id: 'original-1',
        url: URL.createObjectURL(raw),
        name: raw.name,
        size: raw.size,
        duration: 0,
        resolution: '',
        codec: '',
        bitrate: 0,
        uploadTime: new Date().toISOString(),
        raw,
      };
      setOriginalVideo(v);
      if (!originalNotifiedRef.current) {
        originalNotifiedRef.current = true;
        message.success('原视频选择成功！');
      }
    }
  };

  const handleExportedUpload = (info: any) => {
    const raw: File | undefined = info?.file?.originFileObj || info?.file || info?.fileList?.[info.fileList.length - 1]?.originFileObj;
    if (raw) {
      const v = {
        id: 'exported-1',
        url: URL.createObjectURL(raw),
        name: raw.name,
        size: raw.size,
        duration: 0,
        resolution: '',
        codec: '',
        bitrate: 0,
        uploadTime: new Date().toISOString(),
        raw,
      };
      setExportedVideo(v);
      if (!exportedNotifiedRef.current) {
        exportedNotifiedRef.current = true;
        message.success('导出视频选择成功！');
      }
    }
  };

  useEffect(() => {
    if (originalVideo?.raw && exportedVideo?.raw) {
      const key = `${originalVideo.name}:${originalVideo.size}|${exportedVideo.name}:${exportedVideo.size}`;
      if (autoBitrateTriggeredRef.current !== key) {
        autoBitrateTriggeredRef.current = key;
        handleBitrateAnalyze();
      }
    }
  }, [originalVideo, exportedVideo]);

  const handleQualityEvaluate = async () => {
    try {
      if (!originalVideo?.raw || !exportedVideo?.raw) {
        message.warning('请先在下方上传原视频与导出视频');
        uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      message.loading({ content: '画质评估中...', key: 'eval', duration: 0 });
      const key = `${originalVideo.name}:${originalVideo.size}|${exportedVideo.name}:${exportedVideo.size}`;
      let vmafScore = qualityCache[key]?.vmaf;
      let psnrAvg = qualityCache[key]?.psnr;
      let ssimScore = qualityCache[key]?.ssim;
      const tasks: Promise<void>[] = [];
      if (selectedTypes.includes('vmaf' as any) && (vmafScore == null)) {
        tasks.push((async () => {
          const d = await evaluateVMAF(originalVideo.raw, exportedVideo.raw);
          vmafScore = Number(d?.metrics?.vmaf ?? 0);
          upsertQualityCache(key, { vmaf: vmafScore });
        })());
      }
      if (selectedTypes.includes('psnr' as any) && (psnrAvg == null)) {
        tasks.push((async () => {
          const d = await evaluatePSNR(originalVideo.raw, exportedVideo.raw);
          psnrAvg = Number(d?.metrics?.psnr_db ?? 0);
          upsertQualityCache(key, { psnr: psnrAvg });
        })());
      }
      if (selectedTypes.includes('ssim' as any) && (ssimScore == null)) {
        tasks.push((async () => {
          const d = await evaluateSSIM(originalVideo.raw, exportedVideo.raw);
          ssimScore = Number(d?.metrics?.ssim ?? 0);
          upsertQualityCache(key, { ssim: ssimScore });
        })());
      }
      if (tasks.length) await Promise.all(tasks);
      vmafScore = vmafScore ?? qualityCache[key]?.vmaf ?? 0;
      psnrAvg = psnrAvg ?? qualityCache[key]?.psnr ?? 0;
      ssimScore = ssimScore ?? qualityCache[key]?.ssim ?? 0;
      const next: EvaluationResults = {} as any;
      if (selectedTypes.includes('vmaf' as any)) {
        next.vmaf = { score: isNaN(vmafScore) ? 0 : vmafScore, histogram: [], frameScores: [] };
      }
      if (selectedTypes.includes('psnr' as any)) {
        next.psnr = { avg: isNaN(psnrAvg) ? 0 : psnrAvg, min: 0, max: 0, frameScores: [] };
      }
      if (selectedTypes.includes('ssim' as any)) {
        next.ssim = { score: isNaN(ssimScore) ? 0 : ssimScore, frameScores: [] };
      }
      setQualityResults(next);

      // 计算效率比（按像素归一）
      const data = await evaluateQuality({
        before: originalVideo.raw,
        after: exportedVideo.raw,
        exportTimeSeconds: Number(exportTime || 0),
        mode: 'bitrate'
      });
      const afterBps = Number(data?.metrics?.bitrate_after_bps ?? 0);
      const afterKbps = afterBps > 0 ? afterBps / 1000 : 0;
      const fpsAfter = Number(data?.metrics?.fps_after ?? exportedFps ?? 0);
      const resStr = exportedVideo?.resolution || originalVideo?.resolution || '';
      const m = resStr.match(/(\d+)x(\d+)/i);
      const W = m ? Number(m[1]) : 0;
      const H = m ? Number(m[2]) : 0;
      const V0 = Number(qualityParams.V0 || 70);
      const k = Number(qualityParams.k || 0.2);
      const vmafClamped = Math.max(0, Math.min(100, Number(vmafScore || 0)));
      const numerator = Math.log(1 + k * Math.max(0, vmafClamped - V0));
      const denominator = Math.log(1 + k * Math.max(0, 100 - V0));
      const Q = denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
      const BPF = (afterKbps > 0 && fpsAfter > 0) ? ((afterKbps * 1000) / fpsAfter) : 0;
      const pixels = (W > 0 && H > 0) ? (W * H) : 0;
      const BPF_per_pixel = (BPF > 0 && pixels > 0) ? (BPF / pixels) : 0;
      const E_raw = (BPF_per_pixel > 0) ? (Q / (BPF_per_pixel + 1e-12)) : 0;
      setEfficiencyRatio(E_raw);

      message.success({ content: '评估完成', key: 'eval', duration: 2 });
    } catch (err: any) {
      message.error({ content: String(err?.message || err), key: 'eval' });
    }
  };

  const handleSpeedEvaluate = () => {
    const duration = (exportedVideo?.duration || originalVideo?.duration || 0);
    const time = Number(exportTime || 0);
    const rtf = (duration > 0 && time > 0) ? (duration / time) : 0;
    const relative = (benchmark > 0 && time > 0) ? (benchmark / time) : 0;
    setSpeedResults({ rtf, exportTime: time, relative });
  };

  const handleBitrateAnalyze = async () => {
    try {
      if (!originalVideo?.raw || !exportedVideo?.raw) {
        message.warning('请先在下方上传原视频与导出视频');
        uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      setBitrateLoading(true);
      message.loading({ content: '码率分析中...', key: 'bitrate', duration: 0 });
      const data = await evaluateQuality({
        before: originalVideo.raw,
        after: exportedVideo.raw,
        exportTimeSeconds: exportTime,
        mode: 'bitrate'
      });
      const original = Number(data?.metrics?.bitrate_before_bps ?? 0);
      const exported = Number(data?.metrics?.bitrate_after_bps ?? 0);
      setBitrateResults({ ratio: 0, original, exported });
      setOriginalFps(data?.metrics?.fps_before != null ? Number(data.metrics.fps_before) : undefined);
      setExportedFps(data?.metrics?.fps_after != null ? Number(data.metrics.fps_after) : undefined);
      message.success({ content: '码率分析完成', key: 'bitrate', duration: 2 });
    } catch (err: any) {
      message.error({ content: String(err?.message || err), key: 'bitrate' });
    } finally {
      setBitrateLoading(false);
    }
  };

  const handleOneClickEvaluate = () => {
    (async () => {
      try {
        if (!originalVideo?.raw || !exportedVideo?.raw) {
          message.warning('请先在下方上传原视频与导出视频');
          uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
          return;
        }
        message.loading({ content: '一键评估中...', key: 'one', duration: 0 });

        // 1) 画质评估：强制计算 VMAF；其他勾选项按需计算（使用缓存）
        const key = `${originalVideo.name}:${originalVideo.size}|${exportedVideo.name}:${exportedVideo.size}`;
        let vmafScore = qualityCache[key]?.vmaf;
        if (vmafScore == null) {
          const d = await evaluateVMAF(originalVideo.raw, exportedVideo.raw);
          vmafScore = Number(d?.metrics?.vmaf ?? 0);
          upsertQualityCache(key, { vmaf: vmafScore });
        }
        // 可选：如果用户勾选了其它质量指标，则并行计算并更新 UI（不影响综合评分）
        const sideTasks: Promise<void>[] = [];
        if (selectedTypes.includes('psnr' as any) && (qualityCache[key]?.psnr == null)) {
          sideTasks.push((async () => {
            const d2 = await evaluatePSNR(originalVideo.raw, exportedVideo.raw);
            const ps = Number(d2?.metrics?.psnr_db ?? 0);
            upsertQualityCache(key, { psnr: ps });
          })());
        }
        if (selectedTypes.includes('ssim' as any) && (qualityCache[key]?.ssim == null)) {
          sideTasks.push((async () => {
            const d3 = await evaluateSSIM(originalVideo.raw, exportedVideo.raw);
            const ss = Number(d3?.metrics?.ssim ?? 0);
            upsertQualityCache(key, { ssim: ss });
          })());
        }

        // 2) 速度评分 S：若无编码耗时，设为 1.0
        const timeSec = Number(exportTime || 0);
        const hasTime = timeSec > 0;
        const S = hasTime ? 1.0 : 1.0; // 单视频场景：只有一个耗时时，T_min = t -> ratio = 1 -> S = 1

        // 3) 码率分析与效率评分 E
        const data = await evaluateQuality({
          before: originalVideo.raw,
          after: exportedVideo.raw,
          exportTimeSeconds: timeSec || 0,
          mode: 'bitrate'
        });
        const beforeBps = Number(data?.metrics?.bitrate_before_bps ?? 0);
        const afterBps = Number(data?.metrics?.bitrate_after_bps ?? 0);
        const beforeKbps = beforeBps > 0 ? beforeBps / 1000 : 0;
        const afterKbps = afterBps > 0 ? afterBps / 1000 : 0;
        const fpsAfter = Number(data?.metrics?.fps_after ?? exportedFps ?? 0);
        const resStr = exportedVideo?.resolution || originalVideo?.resolution || '';
        const m = resStr.match(/(\d+)x(\d+)/i);
        const W = m ? Number(m[1]) : 0;
        const H = m ? Number(m[2]) : 0;
        const Q = (() => {
          const V0 = Number(qualityParams.V0 || 70);
          const k = Number(qualityParams.k || 0.2);
          const vmafClamped = Math.max(0, Math.min(100, Number(vmafScore || 0)));
          const numerator = Math.log(1 + k * Math.max(0, vmafClamped - V0));
          const denominator = Math.log(1 + k * Math.max(0, 100 - V0));
          return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
        })();
        // bits per frame（效率）
        const BPF = (afterKbps > 0 && fpsAfter > 0) ? ((afterKbps * 1000) / fpsAfter) : 0;
        const E_raw = (BPF > 0) ? (Q / (BPF + 1e-6)) : 0;
        const E_log = Math.log(E_raw + 1e-8);
        // 单视频场景下的归一化：直接设为 1.0；多视频场景需要在列表上做 min-max 归一
        const E = (E_raw > 0) ? 1.0 : 0.0;

        // 3b) 码率合理性评分 B：MABR 计算（默认 codec=h264，短视频平台 1080p=3000）
        const approx = (a: number, b: number, tol = 0.08) => {
          if (!a || !b) return false;
          return Math.abs(a - b) / Math.max(a, b) <= tol;
        };
        let MABR_base = 0; // kbps @30fps
        if (approx(W, 854) && approx(H, 480)) MABR_base = 1200;
        else if (approx(W, 960) && approx(H, 540)) MABR_base = 1600;
        else if (approx(W, 1280) && approx(H, 720)) MABR_base = 2500;
        else if (approx(W, 1920) && approx(H, 1080)) MABR_base = 3000; // 短视频平台
        else if (approx(W, 2560) && approx(H, 1440)) MABR_base = 9000;
        else if (approx(W, 3840) && approx(H, 2160)) MABR_base = 18000;
        else {
          const pixels_per_sec_30 = W * H * 30;
          MABR_base = Math.max(500, Math.min(50000, Math.floor(36 * pixels_per_sec_30 / 1_000_000)));
        }
        const fpsReal = fpsAfter > 0 ? fpsAfter : 30;
        let MABR = MABR_base * (fpsReal / 30.0);
        let codec: string = 'h264';
        if (codec === 'h265') MABR *= (20 / 36);
        if (codec === 'av1') MABR *= (18 / 36);
        const R = afterKbps; // kbps
        const ratio = (MABR > 0 && R > 0) ? (R / MABR) : 0;
        const B = (ratio > 0) ? (1.0 / (1.0 + Math.pow(ratio, 2.5))) : 0.0;

        // 4) 画质感知映射 Q
        const Q_percept = Q;

        // 5) 权重归一并组合
        const wq = Number(weights.wq || 0);
        const ws = Number(weights.ws || 0);
        const wb = Number(weights.wb || 0);
        const sumW = (wq + ws + wb) || 1;
        const overall01 = (wq / sumW) * Q_percept + (ws / sumW) * S + (wb / sumW) * B;

        // 显示数值（百分制）
        const qualityPct = Q_percept * 100;
        const speedPct = S * 100;
        const bitratePct = E * 100; // 效率展示（独立）
        const bitrateRationalPct = B * 100; // 合理性展示
        const overallPct = overall01 * 100;
        setFinalScore({ overall: overallPct, quality: qualityPct, speed: speedPct, bitrate: bitratePct, bitrateRational: bitrateRationalPct });

        // 更新各独立模块的展示但不改变其逻辑
        const next: EvaluationResults = {} as any;
        const durationSec = (exportedVideo?.duration || originalVideo?.duration || 0);
        next.vmaf = { score: Math.max(0, Math.min(100, Number(vmafScore || 0))), histogram: [], frameScores: [] };
        if (selectedTypes.includes('psnr' as any) && qualityCache[key]?.psnr != null) {
          next.psnr = { avg: Number(qualityCache[key].psnr), min: 0, max: 0, frameScores: [] };
        }
        if (selectedTypes.includes('ssim' as any) && qualityCache[key]?.ssim != null) {
          next.ssim = { score: Number(qualityCache[key].ssim), frameScores: [] };
        }
        setQualityResults(next);
        setSpeedResults((durationSec > 0 && timeSec > 0) ? { rtf: durationSec / timeSec, exportTime: timeSec, relative: benchmark / timeSec } : null);
        setBitrateResults({ ratio: beforeBps > 0 ? afterBps / beforeBps : 0, original: beforeBps, exported: afterBps });

        await Promise.all(sideTasks);
        message.success({ content: '一键评估完成', key: 'one', duration: 2 });
      } catch (e: any) {
        message.error({ content: String(e?.message || e), key: 'one' });
      }
    })();
  };


  const buildReportData = () => {
    const src = originalVideo ? {
      name: originalVideo.name,
      size: originalVideo.size,
      duration: originalVideo.duration,
      resolution: originalVideo.resolution
    } : null;
    const dst = exportedVideo ? {
      name: exportedVideo.name,
      size: exportedVideo.size,
      duration: exportedVideo.duration,
      resolution: exportedVideo.resolution
    } : null;
    const key = (originalVideo && exportedVideo) ? `${originalVideo.name}:${originalVideo.size}|${exportedVideo.name}:${exportedVideo.size}` : '';
    const vmaf = qualityResults?.vmaf?.score ?? (key ? qualityCache[key]?.vmaf : undefined) ?? 0;
    const psnr = qualityResults?.psnr?.avg ?? (key ? qualityCache[key]?.psnr : undefined) ?? undefined;
    const ssim = qualityResults?.ssim?.score ?? (key ? qualityCache[key]?.ssim : undefined) ?? undefined;
    const V0 = Number(qualityParams.V0 || 70);
    const k = Number(qualityParams.k || 0.2);
    const vmafClamped = Math.max(0, Math.min(100, Number(vmaf || 0)));
    const qNum = Math.log(1 + k * Math.max(0, vmafClamped - V0));
    const qDen = Math.log(1 + k * Math.max(0, 100 - V0));
    const Q = qDen > 0 ? Math.max(0, Math.min(1, qNum / qDen)) : 0;
    const beforeBps = bitrateResults?.original ?? 0;
    const afterBps = bitrateResults?.exported ?? 0;
    const beforeKbps = beforeBps > 0 ? beforeBps / 1000 : 0;
    const afterKbps = afterBps > 0 ? afterBps / 1000 : 0;
    const fpsBefore = originalFps ?? undefined;
    const fpsAfter = exportedFps ?? undefined;
    const BPF = (afterKbps > 0 && (fpsAfter ?? 0) > 0) ? ((afterKbps * 1000) / Number(fpsAfter)) : 0;
    const E_raw = (BPF > 0) ? (Q / (BPF + 1e-6)) : 0;
    const E_log = Math.log(E_raw + 1e-8);
    const E = (E_raw > 0) ? 1.0 : 0.0;
    const durationSec = (exportedVideo?.duration || originalVideo?.duration || 0);
    const timeSec = Number(exportTime || 0);
    const hasTime = timeSec > 0 && durationSec > 0;
    const S = hasTime ? 1.0 : 1.0;
    const resStr = dst?.resolution || src?.resolution || '';
    const mm = resStr ? resStr.match(/(\d+)x(\d+)/i) : null;
    const W = mm ? Number(mm[1]) : 0;
    const H = mm ? Number(mm[2]) : 0;
    const approx = (a: number, b: number, tol = 0.08) => {
      if (!a || !b) return false;
      return Math.abs(a - b) / Math.max(a, b) <= tol;
    };
    let MABR_base = 0; // kbps @30fps
    if (approx(W, 854) && approx(H, 480)) MABR_base = 1200;
    else if (approx(W, 960) && approx(H, 540)) MABR_base = 1600;
    else if (approx(W, 1280) && approx(H, 720)) MABR_base = 2500;
    else if (approx(W, 1920) && approx(H, 1080)) MABR_base = 3000;
    else if (approx(W, 2560) && approx(H, 1440)) MABR_base = 9000;
    else if (approx(W, 3840) && approx(H, 2160)) MABR_base = 18000;
    else {
      const pixels_per_sec_30 = W * H * 30;
      MABR_base = Math.max(500, Math.min(50000, Math.floor(36 * pixels_per_sec_30 / 1_000_000)));
    }
    const fpsReal = (fpsAfter ?? 0) > 0 ? Number(fpsAfter) : 30;
    let MABR = MABR_base * (fpsReal / 30.0);
    let codec: string = 'h264';
    if (codec === 'h265') MABR *= (20 / 36);
    if (codec === 'av1') MABR *= (18 / 36);
    const R = afterKbps; // kbps
    const ratio = (MABR > 0 && R > 0) ? (R / MABR) : 0;
    const B = (ratio > 0) ? (1.0 / (1.0 + Math.pow(ratio, 2.5))) : 0.0;
    const report = {
      timestamp: new Date().toISOString(),
      weights,
      quality_params: { V0, k },
      source: src,
      encoded: dst,
      metrics: {
        vmaf,
        psnr,
        ssim,
        bitrate_before_bps: beforeBps,
        bitrate_after_bps: afterBps,
        bitrate_before_kbps: beforeKbps,
        bitrate_after_kbps: afterKbps,
        fps_before: fpsBefore,
        fps_after: fpsAfter,
        per_frame_bits: BPF,
      },
      scores: {
        Q,
        E_raw,
        E_log,
        E,
        B,
        MABR_base,
        MABR,
        ratio,
        S,
        overall01: finalScore ? (finalScore.overall / 100) : (() => { const wq = Number(weights.wq||0); const ws = Number(weights.ws||0); const wb = Number(weights.wb||0); const sumW = (wq+ws+wb)||1; return (wq/sumW)*Q + (ws/sumW)*S + (wb/sumW)*B; })(),
        breakdown_pct: finalScore ? {
          quality: finalScore.quality,
          speed: finalScore.speed,
          efficiency: finalScore.bitrate,
          overall: finalScore.overall,
        } : {
          quality: Q * 100,
          speed: S * 100,
          efficiency: E * 100,
          bitrate_rational: B * 100,
          overall: (() => { const wq = Number(weights.wq||0); const ws = Number(weights.ws||0); const wb = Number(weights.wb||0); const sumW = (wq+ws+wb)||1; return ((wq/sumW)*Q + (ws/sumW)*S + (wb/sumW)*B) * 100; })(),
        }
      }
    };
    return report;
  };

  const handleDownloadReport = () => {
    const data = buildReportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = exportedVideo?.name || originalVideo?.name || 'report';
    a.download = `${base.replace(/\s+/g, '_')}_evaluation_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('报告已下载');
  };

  const handleShareReport = async () => {
    try {
      const data = buildReportData();
      const json = JSON.stringify(data, null, 2);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        message.success('结果 JSON 已复制到剪贴板');
      } else {
        const ta = document.createElement('textarea');
        ta.value = json;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        message.success('结果 JSON 已复制到剪贴板');
      }
    } catch (e) {
      message.error('复制失败');
    }
  };

  const handleUploadClick = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleClearOriginal = () => {
    if (originalVideo?.url) URL.revokeObjectURL(originalVideo.url);
    setOriginalVideo(null);
    originalNotifiedRef.current = false;
  };

  const handleClearExported = () => {
    if (exportedVideo?.url) URL.revokeObjectURL(exportedVideo.url);
    setExportedVideo(null);
    exportedNotifiedRef.current = false;
  };

  

  return (
    <Layout className="min-h-screen bg-gray-50">
      <Header />
      
      <Content className="p-6">

        {/* 上传模块 */}
        <div ref={uploadSectionRef} className="mb-6">
          <Title level={2} className="!mb-4">上传视频</Title>
          <Row gutter={24}>
            <Col span={12}>
              <Card 
                title="原视频" 
                className="shadow-sm" 
                extra={originalVideo ? (
                  <Button type="text" icon={<CloseOutlined />} onClick={handleClearOriginal}>关闭</Button>
                ) : <EyeOutlined />}
              >
                {originalVideo ? (
                  <div className="p-2">
                    <video 
                      src={originalVideo.url} 
                      controls 
                      className="w-full h-64 rounded"
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget as HTMLVideoElement;
                        setOriginalVideo({
                          ...originalVideo,
                          duration: Math.round(v.duration) || originalVideo.duration,
                          resolution: `${v.videoWidth}x${v.videoHeight}`
                        });
                      }}
                    />
                  </div>
                ) : (
                  <Dragger {...uploadProps} onChange={handleOriginalUpload}>
                    <div className="p-8 text-center">
                      <InboxOutlined className="text-4xl text-blue-500 mb-4" />
                      <p className="text-lg font-medium mb-2">点击或拖拽上传原视频</p>
                      <p className="text-gray-500">支持 MP4, MOV, AVI 等格式</p>
                      <p className="text-gray-400 text-sm">文件大小不超过 500MB</p>
                    </div>
                  </Dragger>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card 
                title="导出视频" 
                className="shadow-sm" 
                extra={exportedVideo ? (
                  <Button type="text" icon={<CloseOutlined />} onClick={handleClearExported}>关闭</Button>
                ) : <EyeOutlined />}
              >
                {exportedVideo ? (
                  <div className="p-2">
                    <video 
                      src={exportedVideo.url} 
                      controls 
                      className="w-full h-64 rounded"
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget as HTMLVideoElement;
                        setExportedVideo({
                          ...exportedVideo,
                          duration: Math.round(v.duration) || exportedVideo.duration,
                          resolution: `${v.videoWidth}x${v.videoHeight}`
                        });
                      }}
                    />
                  </div>
                ) : (
                  <Dragger {...uploadProps} onChange={handleExportedUpload}>
                    <div className="p-8 text-center">
                      <InboxOutlined className="text-4xl text-green-500 mb-4" />
                      <p className="text-lg font-medium mb-2">点击或拖拽上传导出视频</p>
                      <p className="text-gray-500">支持 MP4, MOV, AVI 等格式</p>
                      <p className="text-gray-400 text-sm">文件大小不超过 500MB</p>
                    </div>
                  </Dragger>
                )}
              </Card>
            </Col>
          </Row>
        </div>

        {/* 评估模块 */}
        <div className="mb-6">
          <Title level={2} className="!mb-4">评估模块</Title>
          <Row gutter={16}>
            <Col span={8}>
              <QualityEvaluationCard 
                selectedTypes={selectedTypes}
                onTypeChange={setSelectedTypes}
                onEvaluate={handleQualityEvaluate}
                results={qualityResults}
                efficiencyRatio={efficiencyRatio}
              />
            </Col>
            <Col span={8}>
              <SpeedEvaluationCard 
                exportTime={exportTime}
                onExportTimeChange={setExportTime}
                benchmark={benchmark}
                onBenchmarkChange={setBenchmark}
                onEvaluate={handleSpeedEvaluate}
                results={speedResults}
              />
            </Col>
            <Col span={8}>
              <BitrateAnalysisCard 
                originalBitrate={bitrateResults?.original}
                exportedBitrate={bitrateResults?.exported}
                onAnalyze={handleBitrateAnalyze}
                results={bitrateResults}
                originalResolution={originalVideo?.resolution}
                exportedResolution={exportedVideo?.resolution}
                originalFps={originalFps}
                exportedFps={exportedFps}
                loading={bitrateLoading}
              />
            </Col>
          </Row>

          <div className="mt-6">
            <Row gutter={16}>
              <Col span={12}>
                <Card className="shadow-sm">
                  <Title level={4} className="!mb-4">权重与画质映射</Title>
                  <Space className="w-full" orientation="vertical" size="large">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Text className="block mb-1">w_q（画质）</Text>
                        <input type="number" step="0.01" value={weights.wq} onChange={(e) => setWeights({ ...weights, wq: Number(e.target.value) })} className="border rounded px-2 py-1 w-full" />
                      </div>
                      <div>
                        <Text className="block mb-1">w_s（速度）</Text>
                        <input type="number" step="0.01" value={weights.ws} onChange={(e) => setWeights({ ...weights, ws: Number(e.target.value) })} className="border rounded px-2 py-1 w-full" />
                      </div>
                      <div>
                        <Text className="block mb-1">w_bitrate（码率合理性）</Text>
                        <input type="number" step="0.01" value={weights.wb} onChange={(e) => setWeights({ ...weights, wb: Number(e.target.value) })} className="border rounded px-2 py-1 w-full" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Text className="block mb-1">V0（画质底线）</Text>
                        <input type="number" step="1" value={qualityParams.V0} onChange={(e) => setQualityParams({ ...qualityParams, V0: Number(e.target.value) })} className="border rounded px-2 py-1 w-full" />
                      </div>
                      <div>
                        <Text className="block mb-1">k（饱和速度）</Text>
                        <input type="number" step="0.01" value={qualityParams.k} onChange={(e) => setQualityParams({ ...qualityParams, k: Number(e.target.value) })} className="border rounded px-2 py-1 w-full" />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button type="primary" onClick={handleOneClickEvaluate}>综合评估</Button>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                {finalScore && (
                  <ResultsPanel 
                    overallScore={finalScore.overall}
                    qualityScore={finalScore.quality}
                    speedScore={finalScore.speed}
                    bitrateScore={finalScore.bitrate}
                    bitrateRationalScore={finalScore.bitrateRational}
                    onDownloadReport={handleDownloadReport}
                    onShare={handleShareReport}
                  />
                )}
                
              </Col>
            </Row>
          </div>
        </div>
      </Content>
    </Layout>
  );
}
