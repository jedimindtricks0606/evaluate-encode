import { Layout, Typography, Card, Space, Button, Upload, Row, Col, message, Segmented, Input, Modal } from 'antd';
import { InboxOutlined, PlayCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Layout/Header';
import { useEvaluationStore } from '@/stores/evaluationStore';
import { useAutomationStore } from '@/stores/automationStore';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Dragger } = Upload;
const { TextArea } = Input;

export default function Automation() {
  const navigate = useNavigate();
  const { setOriginalVideo } = useEvaluationStore();
  const {
    serverIp, setServerIp,
    serverPort, setServerPort,
    ffmpegCommand, setFfmpegCommand,
    outputFilename, setOutputFilename,
    inputFile, setInputFile,
    jobDownloadUrl, setJobDownloadUrl,
    autoSavedPath, setAutoSavedPath,
    mode, setMode,
    matrixJobs, addMatrixJobs, updateMatrixJob,
    benchmarkDurationMs, setBenchmarkDurationMs,
  } = useAutomationStore();
  const [pingLoading, setPingLoading] = useState(false);
  const [serverHealth, setServerHealth] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputPreviewUrl, setInputPreviewUrl] = useState<string | null>(null);
  const [inputDuration, setInputDuration] = useState<number | null>(null);
  const [inputResolution, setInputResolution] = useState<string | null>(null);
  const [inputBitrateKbps, setInputBitrateKbps] = useState<number | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);
  const [singleExportDurationMs, setSingleExportDurationMs] = useState<number | null>(null);
  const [matrixEncoder, setMatrixEncoder] = useState<'x264' | 'x265' | 'nvenc'>('nvenc');
  const [matrixPresets, setMatrixPresets] = useState<string>('p7,p6');
  const [matrixBitrates, setMatrixBitrates] = useState<string>('8M,10M');
  const [matrixMaxrates, setMatrixMaxrates] = useState<string>('10M');
  const [matrixBufsizes, setMatrixBufsizes] = useState<string>('12M');
  const [matrixRcMode, setMatrixRcMode] = useState<string>('vbr');
  const [matrixCqValues, setMatrixCqValues] = useState<string>('23');
  const [matrixTemporalAQ, setMatrixTemporalAQ] = useState<boolean>(true);
  const [matrixSpatialAQ, setMatrixSpatialAQ] = useState<boolean>(true);
  const [matrixProfile, setMatrixProfile] = useState<string>('high');
  const [matrixSubmitting, setMatrixSubmitting] = useState(false);
  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const [matrixAllRunning, setMatrixAllRunning] = useState(false);
  const [matrixExported, setMatrixExported] = useState(false);
  const [matrixAllChosen, setMatrixAllChosen] = useState(false);
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [csvFilename, setCsvFilename] = useState<string>('');

  const automationUploadProps = {
    multiple: false,
    accept: 'video/*',
    beforeUpload: (file: File) => {
      if (!file.type.startsWith('video/')) {
        message.error('只能上传视频文件！');
        return Upload.LIST_IGNORE;
      }
      const isLt500M = file.size / 1024 / 1024 < 500;
      if (!isLt500M) {
        message.error('视频文件大小不能超过 500MB！');
        return Upload.LIST_IGNORE;
      }
      setInputFile(file);
      message.success('已选择输入视频');
      return false;
    },
    maxCount: 1,
    showUploadList: false,
  } as const;

  useEffect(() => {
    if (inputPreviewUrl) URL.revokeObjectURL(inputPreviewUrl);
    if (inputFile) {
      const url = URL.createObjectURL(inputFile);
      setInputPreviewUrl(url);
      setInputDuration(null);
      setInputResolution(null);
      setInputBitrateKbps(null);
    } else {
      setInputPreviewUrl(null);
      setInputDuration(null);
      setInputResolution(null);
      setInputBitrateKbps(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputFile]);

  const handlePingServer = async () => {
    try {
      if (!serverIp || !serverPort) { message.warning('请填写服务器 IP 与端口'); return; }
      setPingLoading(true);
      const url = `http://${serverIp}:${serverPort}/health`;
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        setServerHealth('ok');
        message.success('服务器正常');
      } else {
        setServerHealth('fail');
        message.error('服务器不可达');
      }
    } catch (e) {
      setServerHealth('fail');
      message.error('服务器不可达');
    } finally {
      setPingLoading(false);
    }
  };

  const handleSubmitJob = async () => {
    try {
      if (!inputFile) { message.warning('请先上传输入视频'); return; }
      if (!serverIp || !serverPort) { message.warning('请填写服务器 IP 与端口'); return; }
      const cmd = String(ffmpegCommand || '').trim();
      if (!cmd.startsWith('ffmpeg')) { message.error('命令必须以 ffmpeg 开头'); return; }
      if (!cmd.includes('{input}') || !cmd.includes('{output}')) { message.error('命令必须包含 {input} 与 {output}'); return; }
      setSubmitting(true);
      message.loading({ content: '任务提交中...', key: 'auto', duration: 0 });
      const resp = await (await import('@/lib/api')).automationUpload({ serverIp, serverPort, file: inputFile, command: cmd, outputFilename });
      if (resp.status !== 'success') throw new Error(String(resp.message || '服务器返回失败'));
      const dp = String(resp.download_path || '');
      const full = `http://${serverIp}:${serverPort}${dp}`;
      setJobDownloadUrl(full);
      if (resp.duration_ms != null) setSingleExportDurationMs(Number(resp.duration_ms));
      message.success({ content: '任务已提交', key: 'auto', duration: 2 });
      // 自动下载并保存到本地
      try {
        setSavingAuto(true);
        const saveResp = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: full, localSaveDir: '/Users/jinghuan/evaluate-server', filename: outputFilename });
        if (saveResp.status === 'success') {
          setAutoSavedPath(String(saveResp.saved_path || ''));
        } else {
          setAutoSavedPath(null);
        }
      } catch (_) {
        setAutoSavedPath(null);
      } finally {
        setSavingAuto(false);
      }
      // 预置原视频到评估 Store，便于后续比对
      const originalVideo = {
        id: 'auto-original',
        url: URL.createObjectURL(inputFile),
        name: inputFile.name,
        size: inputFile.size,
        duration: 0,
        resolution: '',
        codec: '',
        bitrate: 0,
        uploadTime: new Date().toISOString(),
        raw: inputFile,
      };
      setOriginalVideo(originalVideo);
    } catch (e: any) {
      message.error({ content: String(e?.message || e), key: 'auto' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveResult = async () => {
    try {
      if (!jobDownloadUrl) { message.warning('暂无下载地址'); return; }
      setSaving(true);
      message.loading({ content: '结果保存中...', key: 'save', duration: 0 });
      const resp = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: jobDownloadUrl, localSaveDir: '/Users/jinghuan/evaluate-server', filename: outputFilename });
      if (resp.status !== 'success') throw new Error(String(resp.message || '保存失败'));
      message.success({ content: `已保存：${resp.saved_path || '/Users/jinghuan/evaluate-server'}`, key: 'save', duration: 2 });
    } catch (e: any) {
      message.error({ content: String(e?.message || e), key: 'save' });
    } finally {
      setSaving(false);
    }
  };

  const handleGoEvaluate = () => {
    if (!jobDownloadUrl) { message.warning('请先提交并获得下载地址'); return; }
    const params = new URLSearchParams({ outputUrl: jobDownloadUrl, outputName: outputFilename });
    navigate(`/?${params.toString()}`);
  };

  return (
    <Layout className="min-h-screen bg-gray-50">
      <Header showOneClickEvaluate={false} />
      <Content className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Title level={2} className="!mb-0">自动化测试</Title>
          <Segmented options={[{ label: '单点导出', value: 'single' }, { label: '矩阵导出', value: 'matrix' }]} value={mode} onChange={(v) => setMode(v as any)} size="large" />
        </div>
        <Card className="shadow-sm">
          <Space className="w-full" orientation="vertical" size="large">
            
            <Row gutter={16}>
              <Col span={12}>
                <div className="flex items-center justify-between">
                  <Text className="block mb-1">FFmpeg 服务器 IP</Text>
                  <Button size="small" onClick={handlePingServer} loading={pingLoading}>Ping</Button>
                </div>
                <input type="text" value={serverIp} onChange={(e) => setServerIp(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="例如：192.168.1.10" />
                {serverHealth !== 'unknown' && (
                  <Text type="secondary" className="block text-xs mt-1">{serverHealth === 'ok' ? '服务器正常' : '服务器不可达'}</Text>
                )}
              </Col>
              <Col span={6}>
                <Text className="block mb-1">端口</Text>
                <input type="number" step="1" value={serverPort} onChange={(e) => setServerPort(Number(e.target.value))} className="border rounded px-2 py-1 w-full" placeholder="5000" />
              </Col>
              
            </Row>
            <div>
              <Text className="block mb-1">上传输入视频</Text>
              {!inputFile && (
                <Dragger {...automationUploadProps}>
                  <div className="p-6 text-center">
                    <InboxOutlined className="text-3xl text-blue-500 mb-3" />
                    <p className="text-gray-500">点击或拖拽上传自动化测试输入视频</p>
                  </div>
                </Dragger>
              )}
            </div>

            {inputPreviewUrl && (
              <div className="grid grid-cols-12 gap-16">
                <div className="col-span-8">
                  <video src={inputPreviewUrl} controls className="w-full h-64 rounded"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget as HTMLVideoElement;
                      const d = v.duration;
                      const w = v.videoWidth;
                      const h = v.videoHeight;
                      setInputDuration(isFinite(d) && d > 0 ? Math.round(d) : null);
                      setInputResolution((w && h) ? `${w}x${h}` : null);
                      if (inputFile && d && d > 0) {
                        const kbps = Math.round((inputFile.size * 8) / d / 1000);
                        setInputBitrateKbps(kbps);
                      }
                    }}
                  />
                  <div className="mt-2 text-right">
                    <Button type="text" icon={<CloseOutlined />} onClick={() => setInputFile(null)}>重新上传</Button>
                  </div>
                </div>
                <div className="col-span-4">
                  <Space className="w-full" orientation="vertical" size="middle">
                    <div>
                      <Text type="secondary" className="block mb-1">文件名</Text>
                      <Text strong>{inputFile?.name || ''}</Text>
                    </div>
                    <div>
                      <Text type="secondary" className="block mb-1">清晰度</Text>
                      <Text strong>{inputResolution || '-'}</Text>
                    </div>
                    <div>
                      <Text type="secondary" className="block mb-1">时长（秒）</Text>
                      <Text strong>{inputDuration != null ? String(inputDuration) : '-'}</Text>
                    </div>
                    <div>
                      <Text type="secondary" className="block mb-1">估算码率（kbps）</Text>
                      <Text strong>{inputBitrateKbps != null ? String(inputBitrateKbps) : '-'}</Text>
                    </div>
                  </Space>
                </div>
              </div>
            )}

            

            
          </Space>
        </Card>

        {mode === 'single' && (
        <Card className="shadow-sm mt-4" title="单点导出">
          <Space className="w-full" orientation="vertical" size="large">
            <div>
              <Text className="block mb-1">输出文件名</Text>
              <input type="text" value={outputFilename} onChange={(e) => setOutputFilename(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="out.mp4" />
            </div>
            <div>
              <Text className="block mb-1">FFmpeg 命令</Text>
              <textarea value={ffmpegCommand} onChange={(e) => setFfmpegCommand(e.target.value)} className="border rounded px-2 py-2 w-full h-24" placeholder="ffmpeg -y -i {input} -c:v libx264 -crf 23 -c:a aac {output}" />
              <Text type="secondary" className="block text-xs mt-1">命令需要以 ffmpeg 开头，并包含 {`{input}`} 与 {`{output}`}</Text>
            </div>
            <div className="flex gap-3">
              <Button type="primary" icon={<PlayCircleOutlined />} loading={submitting} onClick={handleSubmitJob}>开启自动化测试</Button>
              {jobDownloadUrl && (
                <>
                  <Button loading={saving} onClick={handleSaveResult}>保存处理结果到本地</Button>
                  <Button type="dashed" onClick={handleGoEvaluate}>去质量评估</Button>
                </>
              )}
            </div>
            <div>
              {savingAuto && (
                <Text type="secondary">结果保存中...</Text>
              )}
              {!savingAuto && autoSavedPath && (
                <Text type="success">已保存：{autoSavedPath}</Text>
              )}
              {!savingAuto && autoSavedPath === null && jobDownloadUrl && (
                <Text type="danger">保存失败，请重试或使用上方按钮手动保存</Text>
              )}
              {jobDownloadUrl && (
                <div className="p-3 bg-gray-50 rounded mt-2">
                  <Text type="secondary" className="block mb-1">下载地址</Text>
                  <Text className="break-all">{jobDownloadUrl}</Text>
                </div>
              )}
              {singleExportDurationMs != null && (
                <div className="mt-2">
                  <Text type="secondary" className="block mb-1">导出时间</Text>
                  <Text strong>{(singleExportDurationMs / 1000).toFixed(2)} 秒</Text>
                </div>
              )}
            </div>
          </Space>
        </Card>
        )}

        {mode === 'matrix' && (
        <Card className="shadow-sm mt-4" title="矩阵导出">
          <Space className="w-full" orientation="vertical" size="large">
            <Row gutter={16}>
              <Col span={6}>
                <Text className="block mb-1">编码器</Text>
                <select value={matrixEncoder} onChange={(e) => setMatrixEncoder(e.target.value as any)} className="border rounded px-2 py-1 w-full">
                  <option value="x264">x264</option>
                  <option value="x265">x265</option>
                  <option value="nvenc">nvenc</option>
                </select>
              </Col>
              <Col span={6}>
                <Text className="block mb-1">preset（逗号分隔）</Text>
                <input type="text" value={matrixPresets} onChange={(e) => setMatrixPresets(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="p7,p6" />
              </Col>
              <Col span={6}>
                <Text className="block mb-1">b:v（逗号分隔）</Text>
                <input type="text" value={matrixBitrates} onChange={(e) => setMatrixBitrates(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="8M,10M" />
              </Col>
              <Col span={6}>
                <Text className="block mb-1">maxrate（逗号分隔）</Text>
                <input type="text" value={matrixMaxrates} onChange={(e) => setMatrixMaxrates(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="10M" />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}>
                <Text className="block mb-1">bufsize（逗号分隔）</Text>
                <input type="text" value={matrixBufsizes} onChange={(e) => setMatrixBufsizes(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="12M" />
              </Col>
              <Col span={6}>
                <Text className="block mb-1">rc 模式</Text>
                <select value={matrixRcMode} onChange={(e) => setMatrixRcMode(e.target.value)} className="border rounded px-2 py-1 w-full">
                  <option value="vbr">vbr</option>
                  <option value="cbr">cbr</option>
                  <option value="constqp">constqp</option>
                </select>
              </Col>
              <Col span={6}>
                <Text className="block mb-1">cq（逗号分隔）</Text>
                <input type="text" value={matrixCqValues} onChange={(e) => setMatrixCqValues(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="23,28" />
              </Col>
              <Col span={6}>
                <Text className="block mb-1">profile</Text>
                <input type="text" value={matrixProfile} onChange={(e) => setMatrixProfile(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="high" />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={6}>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={matrixTemporalAQ} onChange={(e) => setMatrixTemporalAQ(e.target.checked)} />
                  <Text>temporal-aq</Text>
                </label>
              </Col>
              <Col span={6}>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={matrixSpatialAQ} onChange={(e) => setMatrixSpatialAQ(e.target.checked)} />
                  <Text>spatial-aq</Text>
                </label>
              </Col>
            </Row>
            <div className="flex gap-3">
              <Button type="primary" loading={matrixSubmitting} onClick={async () => {
                try {
                  if (!inputFile) { message.warning('请先上传输入视频'); return; }
                  setMatrixExported(true);
                  setMatrixAllChosen(false);
                  setMatrixSubmitting(true);
                  // benchmark
                  try {
                    const codec = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : 'h264_nvenc');
                    const presetFast = matrixEncoder === 'nvenc' ? 'p1' : 'veryfast';
                    const benchOut = `benchmark_${matrixEncoder}_${Date.now()}.mp4`;
                    const benchCmd = `ffmpeg -y -i {input} -c:v ${codec} -preset ${presetFast} -c:a copy {output}`;
                    const benchResp = await (await import('@/lib/api')).automationUpload({ serverIp, serverPort, file: inputFile, command: benchCmd, outputFilename: benchOut });
                    if (benchResp?.status === 'success' && benchResp?.duration_ms != null) {
                      setBenchmarkDurationMs(Number(benchResp.duration_ms));
                    } else {
                      setBenchmarkDurationMs(null);
                    }
                  } catch (_) {
                    setBenchmarkDurationMs(null);
                  }
                  const presets = matrixPresets.split(',').map(s => s.trim()).filter(Boolean);
                  const bitrates = matrixBitrates.split(',').map(s => s.trim()).filter(Boolean);
                  const maxrates = matrixMaxrates.split(',').map(s => s.trim()).filter(Boolean);
                  const bufsizes = matrixBufsizes.split(',').map(s => s.trim()).filter(Boolean);
                  const cqs = matrixCqValues.split(',').map(s => s.trim()).filter(Boolean);
                  const codec = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : 'h264_nvenc');
                  const jobs = [] as any[];
                  const now = Date.now();
                  for (const preset of (presets.length ? presets : ['p7'])) {
                    for (const b of (bitrates.length ? bitrates : ['8M'])) {
                      for (const mr of (maxrates.length ? maxrates : [b])) {
                        for (const bs of (bufsizes.length ? bufsizes : ['12M'])) {
                          for (const cq of (cqs.length ? cqs : ['23'])) {
                            const outfile = `auto_${matrixEncoder}_${preset}_${b}_${cq}_${now}.mp4`;
                            const params = [
                              `-c:v ${codec}`,
                              `-preset ${preset}`,
                              `-b:v ${b}`,
                              `-maxrate ${mr}`,
                              `-bufsize ${bs}`,
                              `-rc:v ${matrixRcMode}`,
                              `-cq:v ${cq}`,
                              `-temporal-aq ${matrixTemporalAQ ? 1 : 0}`,
                              `-spatial-aq ${matrixSpatialAQ ? 1 : 0}`,
                              `-profile:v ${matrixProfile}`,
                              `-c:a copy`,
                            ].join(' ');
                            const command = `ffmpeg -y -i {input} ${params} {output}`;
                            jobs.push({ id: `${now}-${preset}-${b}-${cq}`, encoder: matrixEncoder, params: { preset, b, mr, bs, cq }, command, outputFilename: outfile });
                          }
                        }
                      }
                    }
                  }
                  addMatrixJobs(jobs);
                  // submit sequentially
                  for (const job of jobs) {
                    try {
                      const resp = await (await import('@/lib/api')).automationUpload({ serverIp, serverPort, file: inputFile, command: job.command, outputFilename: job.outputFilename });
                      if (resp.status === 'success') {
                        const dp = String(resp.download_path || '');
                        const full = `http://${serverIp}:${serverPort}${dp}`;
                        const durMs = resp.duration_ms != null ? Number(resp.duration_ms) : null;
                        updateMatrixJob(job.id, { downloadUrl: full, exportDurationMs: durMs });
                        // auto save locally
                        const saveResp = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: full, localSaveDir: '/Users/jinghuan/evaluate-server', filename: job.outputFilename });
                        updateMatrixJob(job.id, { savedPath: saveResp.saved_path || null });
                        // preview URL
                        try {
                          const f = await fetch(full);
                          const blob = await f.blob();
                          const obj = URL.createObjectURL(blob);
                          updateMatrixJob(job.id, { previewUrl: obj });
                        } catch (_) {}
                      }
                    } catch (e) {
                      // ignore failed job
                    }
                  }
                  message.success('矩阵任务已提交');
                } catch (e) {
                  message.error('提交失败');
                } finally {
                  setMatrixSubmitting(false);
                }
              }}>矩阵导出</Button>
              {!matrixExported && (
              <Button loading={matrixAllRunning} onClick={async () => {
                try {
                  if (!inputFile) { message.warning('请先上传输入视频'); return; }
                  setMatrixAllChosen(true);
                  setMatrixExported(false);
                  setMatrixAllRunning(true);
                  try {
                    const codec0 = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : 'h264_nvenc');
                    const presetFast0 = matrixEncoder === 'nvenc' ? 'p1' : 'veryfast';
                    const benchOut0 = `benchmark_${matrixEncoder}_${Date.now()}.mp4`;
                    const benchCmd0 = `ffmpeg -y -i {input} -c:v ${codec0} -preset ${presetFast0} -c:a copy {output}`;
                    const benchResp0 = await (await import('@/lib/api')).automationUpload({ serverIp, serverPort, file: inputFile, command: benchCmd0, outputFilename: benchOut0 });
                    if (benchResp0?.status === 'success' && benchResp0?.duration_ms != null) {
                      setBenchmarkDurationMs(Number(benchResp0.duration_ms));
                    } else {
                      setBenchmarkDurationMs(null);
                    }
                  } catch (_) {
                    setBenchmarkDurationMs(null);
                  }
                  const presets0 = matrixPresets.split(',').map(s => s.trim()).filter(Boolean);
                  const bitrates0 = matrixBitrates.split(',').map(s => s.trim()).filter(Boolean);
                  const maxrates0 = matrixMaxrates.split(',').map(s => s.trim()).filter(Boolean);
                  const bufsizes0 = matrixBufsizes.split(',').map(s => s.trim()).filter(Boolean);
                  const cqs0 = matrixCqValues.split(',').map(s => s.trim()).filter(Boolean);
                  const codec1 = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : 'h264_nvenc');
                  const jobs0 = [] as any[];
                  const now0 = Date.now();
                  for (const preset of (presets0.length ? presets0 : ['p7'])) {
                    for (const b of (bitrates0.length ? bitrates0 : ['8M'])) {
                      for (const mr of (maxrates0.length ? maxrates0 : [b])) {
                        for (const bs of (bufsizes0.length ? bufsizes0 : ['12M'])) {
                          for (const cq of (cqs0.length ? cqs0 : ['23'])) {
                            const outfile = `auto_${matrixEncoder}_${preset}_${b}_${cq}_${now0}.mp4`;
                            const params = [
                              `-c:v ${codec1}`,
                              `-preset ${preset}`,
                              `-b:v ${b}`,
                              `-maxrate ${mr}`,
                              `-bufsize ${bs}`,
                              `-rc:v ${matrixRcMode}`,
                              `-cq:v ${cq}`,
                              `-temporal-aq ${matrixTemporalAQ ? 1 : 0}`,
                              `-spatial-aq ${matrixSpatialAQ ? 1 : 0}`,
                              `-profile:v ${matrixProfile}`,
                              `-c:a copy`,
                            ].join(' ');
                            const command = `ffmpeg -y -i {input} ${params} {output}`;
                            jobs0.push({ id: `${now0}-${preset}-${b}-${cq}`, encoder: matrixEncoder, params: { preset, b, mr, bs, cq }, command, outputFilename: outfile });
                          }
                        }
                      }
                    }
                  }
                  addMatrixJobs(jobs0);
                  const evalPromises: Promise<void>[] = [];
                  for (const job of jobs0) {
                    try {
                      const resp2 = await (await import('@/lib/api')).automationUpload({ serverIp, serverPort, file: inputFile, command: job.command, outputFilename: job.outputFilename });
                      if (resp2.status === 'success') {
                        const dp2 = String(resp2.download_path || '');
                        const full2 = `http://${serverIp}:${serverPort}${dp2}`;
                        const durMs2 = resp2.duration_ms != null ? Number(resp2.duration_ms) : null;
                        updateMatrixJob(job.id, { downloadUrl: full2, exportDurationMs: durMs2 });
                        const saveResp2 = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: full2, localSaveDir: '/Users/jinghuan/evaluate-server', filename: job.outputFilename });
                        updateMatrixJob(job.id, { savedPath: saveResp2.saved_path || null });
                        try {
                          const f2 = await fetch(full2);
                          const blob2 = await f2.blob();
                          const obj2 = URL.createObjectURL(blob2);
                          updateMatrixJob(job.id, { previewUrl: obj2 });
                        } catch (_) {}
                        const p = (async () => {
                          try {
                            const f3 = await fetch(full2);
                            if (f3.ok) {
                              const blob3 = await f3.blob();
                              const afterFile3 = new File([blob3], job.outputFilename, { type: blob3.type || 'video/mp4' });
                              const expSecVal = durMs2 ? (durMs2 / 1000) : (inputDuration || 30);
                              const evalResp3 = await (await import('@/lib/api')).evaluateQuality({ before: inputFile, after: afterFile3, exportTimeSeconds: expSecVal, weights: { quality: 0.5, speed: 0.25, bitrate: 0.25 } });
                              const saveJson3 = await (await import('@/lib/api')).automationSaveJson({ data: evalResp3, localSaveDir: '/Users/jinghuan/evaluate-server', filename: `${job.outputFilename.replace(/\.mp4$/,'')}_evaluation.json` });
                              const summary3 = {
                                overall: Number(evalResp3?.final_score ?? 0),
                                vmaf: evalResp3?.metrics?.vmaf,
                                psnr: evalResp3?.metrics?.psnr_db,
                                ssim: evalResp3?.metrics?.ssim,
                                bitrate_after_kbps: (evalResp3?.metrics?.bitrate_after_bps ?? 0) / 1000,
                              };
                              updateMatrixJob(job.id, { evalSavedJsonPath: saveJson3?.url || null, evalSummary: summary3 });
                            }
                          } catch (_) {}
                        })();
                        evalPromises.push(p);
                      }
                    } catch (_) {}
                  }
                  await Promise.all(evalPromises);
                  message.success('矩阵评估完成');
                } catch (e) {
                  message.error('矩阵评估失败');
                } finally {
                  setMatrixAllRunning(false);
                }
              }}>矩阵评估</Button>
              )}
              {matrixJobs.some(j => j.downloadUrl) && matrixExported && !matrixAllChosen && (
              <Button loading={batchEvaluating} onClick={async () => {
                try {
                  if (!inputFile) { message.warning('请先上传输入视频'); return; }
                  setBatchEvaluating(true);
                  for (const job of matrixJobs) {
                    try {
                      if (!job.downloadUrl) continue;
                      // fetch exported file
                      const resp = await fetch(job.downloadUrl);
                      if (!resp.ok) continue;
                      const blob = await resp.blob();
                      const afterFile = new File([blob], job.outputFilename, { type: blob.type || 'video/mp4' });
                      const expSec = job.exportDurationMs ? (job.exportDurationMs / 1000) : (inputDuration || 30);
                      const evalResp = await (await import('@/lib/api')).evaluateQuality({ before: inputFile, after: afterFile, exportTimeSeconds: expSec, weights: { quality: 0.5, speed: 0.25, bitrate: 0.25 } });
                      const saveJson = await (await import('@/lib/api')).automationSaveJson({ data: evalResp, localSaveDir: '/Users/jinghuan/evaluate-server', filename: `${job.outputFilename.replace(/\.mp4$/,'')}_evaluation.json` });
                      const summary = {
                        overall: Number(evalResp?.final_score ?? 0),
                        vmaf: evalResp?.metrics?.vmaf,
                        psnr: evalResp?.metrics?.psnr_db,
                        ssim: evalResp?.metrics?.ssim,
                        bitrate_after_kbps: (evalResp?.metrics?.bitrate_after_bps ?? 0) / 1000,
                      };
                      updateMatrixJob(job.id, { evalSavedJsonPath: saveJson?.url || null, evalSummary: summary });
                    } catch (_) {}
                  }
                  message.success('批量评估完成');
                } catch (e) {
                  message.error('批量评估失败');
                } finally {
                  setBatchEvaluating(false);
                }
              }}>批量评估</Button>
              )}
              {matrixJobs.some(j => j.evalSummary) && (
              <Button onClick={() => {
                const ts = Date.now();
                setCsvFilename(`matrix_evaluation_${ts}.csv`);
                setCsvModalVisible(true);
              }}>导出评估CSV</Button>
              )}
            </div>
            <Modal open={csvModalVisible} title="导出评估CSV" onCancel={() => setCsvModalVisible(false)} onOk={async () => {
              try {
                  const header = [
                    'encoder','preset','b_v','maxrate','bufsize','rc','cq','temporal_aq','spatial_aq','profile','output_file','overall','vmaf','psnr_db','ssim','bitrate_after_kbps','export_duration_seconds','download_url','saved_path','eval_json_url'
                  ];
                const rows = matrixJobs.filter(j => j.evalSummary).map(j => {
                  const p = j.params || {} as any;
                  const v = [
                    j.encoder,
                    String(p.preset ?? ''),
                    String(p.b ?? ''),
                    String(p.mr ?? ''),
                    String(p.bs ?? ''),
                    String(p.rc ?? 'vbr'),
                    String(p.cq ?? ''),
                    String((p.temporal_aq ?? 1)),
                    String((p.spatial_aq ?? 1)),
                    String(p.profile ?? ''),
                    j.outputFilename,
                    Number(j.evalSummary?.overall ?? 0).toFixed(4),
                    String(j.evalSummary?.vmaf ?? ''),
                    String(j.evalSummary?.psnr ?? ''),
                    String(j.evalSummary?.ssim ?? ''),
                      String(j.evalSummary?.bitrate_after_kbps ?? ''),
                      j.exportDurationMs != null ? (Number(j.exportDurationMs)/1000).toFixed(2) : '',
                      j.downloadUrl || '',
                      j.savedPath || '',
                      j.evalSavedJsonPath || ''
                    ];
                  return v.map(s => {
                    const str = String(s ?? '');
                    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                      return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                  }).join(',');
                });
                const csv = [header.join(','), ...rows].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = csvFilename || `matrix_evaluation_${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                message.success('CSV 已下载');
                setCsvModalVisible(false);
              } catch (e) {
                message.error('导出失败');
              }
            }}>
              <Space className="w-full" direction="vertical" size="middle">
                <div>
                  <Text className="block mb-1">文件名</Text>
                  <input type="text" value={csvFilename} onChange={(e) => setCsvFilename(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder={`matrix_evaluation_${Date.now()}.csv`} />
                </div>
              </Space>
            </Modal>

            <div className="grid grid-cols-12 gap-6">
              {benchmarkDurationMs != null && (
                <div className="col-span-12">
                  <div className="p-3 bg-gray-50 rounded">
                    <Text strong>Benchmark 导出时间：{(Number(benchmarkDurationMs)/1000).toFixed(2)} 秒</Text>
                  </div>
                </div>
              )}
              {matrixJobs.map(job => (
                <div key={job.id} className="col-span-6">
                  <Card size="small" title={job.outputFilename} extra={job.downloadUrl ? <a href={job.downloadUrl} target="_blank" rel="noreferrer">下载</a> : null}>
                    <Space className="w-full" orientation="vertical" size="small">
                      {job.previewUrl && (
                        <video src={job.previewUrl || ''} controls className="w-full h-48 rounded" />
                      )}
                      <div className="flex gap-2">
                        <Button type="dashed" onClick={async () => {
                          try {
                            // 优先读取已保存 JSON
                            if (job.evalSavedJsonPath && !job.evalSummary) {
                              const url = `http://localhost:3000${job.evalSavedJsonPath.startsWith('/') ? job.evalSavedJsonPath : '/' + job.evalSavedJsonPath}`;
                              const r = await fetch(url);
                              if (r.ok) {
                                const j = await r.json();
                                const summary = {
                                  overall: Number(j?.final_score ?? 0),
                                  vmaf: j?.metrics?.vmaf,
                                  psnr: j?.metrics?.psnr_db,
                                  ssim: j?.metrics?.ssim,
                                  bitrate_after_kbps: (j?.metrics?.bitrate_after_bps ?? 0) / 1000,
                                };
                                updateMatrixJob(job.id, { evalSummary: summary });
                                return;
                              }
                            }
                            // 若无预存结果，则在线评估并保存
                            if (!job.downloadUrl) { message.warning('该条目尚未完成导出'); return; }
                            if (!inputFile) { message.warning('请先上传输入视频'); return; }
                            const resp = await fetch(job.downloadUrl);
                            if (!resp.ok) { message.error('导出视频下载失败'); return; }
                            const blob = await resp.blob();
                            const afterFile = new File([blob], job.outputFilename, { type: blob.type || 'video/mp4' });
                            const evalResp = await (await import('@/lib/api')).evaluateQuality({ before: inputFile, after: afterFile, exportTimeSeconds: inputDuration || 30, weights: { quality: 0.5, speed: 0.25, bitrate: 0.25 } });
                            const saveJson = await (await import('@/lib/api')).automationSaveJson({ data: evalResp, localSaveDir: '/Users/jinghuan/evaluate-server', filename: `${job.outputFilename.replace(/\.mp4$/,'')}_evaluation.json` });
                            const summary = {
                              overall: Number(evalResp?.final_score ?? 0),
                              vmaf: evalResp?.metrics?.vmaf,
                              psnr: evalResp?.metrics?.psnr_db,
                              ssim: evalResp?.metrics?.ssim,
                              bitrate_after_kbps: (evalResp?.metrics?.bitrate_after_bps ?? 0) / 1000,
                            };
                            updateMatrixJob(job.id, { evalSavedJsonPath: saveJson?.url || null, evalSummary: summary });
                            message.success('评估完成并已保存');
                          } catch (e) {
                            message.error('评估失败');
                          }
                        }}>质量评估</Button>
                      </div>
                      {job.evalSummary && (
                        <table className="w-full text-sm">
                          <tbody>
                            <tr><td>总体</td><td>{Number(job.evalSummary.overall).toFixed(2)}</td></tr>
                            <tr><td>VMAF</td><td>{job.evalSummary.vmaf ?? '-'}</td></tr>
                            <tr><td>PSNR(dB)</td><td>{job.evalSummary.psnr ?? '-'}</td></tr>
                            <tr><td>SSIM</td><td>{job.evalSummary.ssim ?? '-'}</td></tr>
                            <tr><td>码率(kbps)</td><td>{job.evalSummary.bitrate_after_kbps ?? '-'}</td></tr>
                            {job.exportDurationMs != null && (<tr><td>导出时间(秒)</td><td>{(Number(job.exportDurationMs)/1000).toFixed(2)}</td></tr>)}
                          </tbody>
                        </table>
                      )}
                    </Space>
                  </Card>
                </div>
              ))}
            </div>
          </Space>
        </Card>
        )}

      </Content>
    </Layout>
  );
}
