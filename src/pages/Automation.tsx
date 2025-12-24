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
  const [serverStatus, setServerStatus] = useState<{
    cpu_percent: number;
    memory: { percent: number };
    gpus: Array<{
      name: string;
      utilization_percent: number;
      memory_used_mb: number;
      memory_total_mb: number;
    }>;
  } | null>(null);
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
  const [matrixBitrates, setMatrixBitrates] = useState<string>('0');
  const [matrixMaxrates, setMatrixMaxrates] = useState<string>('');
  const [matrixBufsizes, setMatrixBufsizes] = useState<string>('');
  const [matrixRcMode, setMatrixRcMode] = useState<string>('vbr');
  const [matrixCqValues, setMatrixCqValues] = useState<string>('23');
  const [matrixQpValues, setMatrixQpValues] = useState<string>('');
  const [matrixTemporalAQ, setMatrixTemporalAQ] = useState<boolean>(true);
  const [matrixSpatialAQ, setMatrixSpatialAQ] = useState<boolean>(true);
  const [matrixProfile, setMatrixProfile] = useState<string>('high');
  const [nvencCodec, setNvencCodec] = useState<'h264' | 'hevc'>('h264');
  const [nvencTune, setNvencTune] = useState<string>('');
  const [nvencRcLookahead, setNvencRcLookahead] = useState<string>('');
  const [nvencMinrate, setNvencMinrate] = useState<string>('');
  const [nvencMultipass, setNvencMultipass] = useState<'fullres' | 'qres' | ''>('');
  const [matrixSubmitting, setMatrixSubmitting] = useState(false);
  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const [matrixAllRunning, setMatrixAllRunning] = useState(false);
  const [matrixExported, setMatrixExported] = useState(false);
  const [matrixAllChosen, setMatrixAllChosen] = useState(false);
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [csvFilename, setCsvFilename] = useState<string>('');
  const [evalConcurrency, setEvalConcurrency] = useState<number>(2);
  const [qualityMetric, setQualityMetric] = useState<'vmaf' | 'psnr'>('vmaf');
  const [bgTaskPolling, setBgTaskPolling] = useState(false);
  const [taskQueueStatus, setTaskQueueStatus] = useState<{
    running: Array<{
      id: string;
      status: string;
      createdAt: string;
      progress: { total: number; exported: number; evaluated: number };
      config: { encoder: string; nvencCodec: string; presets: string; bitrates: string; rcMode: string; cqValues: string; qpValues: string; skipVmaf: boolean };
    }>;
    pending: Array<{
      id: string;
      status: string;
      createdAt: string;
      queuePosition: number;
      config: { encoder: string; nvencCodec: string; presets: string; bitrates: string; rcMode: string; cqValues: string; qpValues: string; skipVmaf: boolean };
    }>;
    isFrontendRunning?: boolean;
    submitting?: boolean; // 正在提交任务
  } | null>(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState('');
  const [historyTaskResult, setHistoryTaskResult] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [serverTaskHistory, setServerTaskHistory] = useState<Array<{ id: string; status: string; createdAt: string; encoder: string; taskCount: number; exported: number; evaluated: number; csvUrl?: string; error?: string }>>([]);
  const [historyListLoading, setHistoryListLoading] = useState(false);

  // 从后端加载历史任务列表
  const loadServerTaskHistory = async () => {
    setHistoryListLoading(true);
    try {
      const resp = await (await import('@/lib/api')).getMatrixTaskList(50);
      if (resp.status === 'success' && resp.tasks) {
        setServerTaskHistory(resp.tasks);
      }
    } catch (e) {
      console.warn('[history] 加载历史任务失败', e);
    } finally {
      setHistoryListLoading(false);
    }
  };

  // 打开历史弹窗时加载列表
  useEffect(() => {
    if (historyModalVisible) {
      loadServerTaskHistory();
    }
  }, [historyModalVisible]);

  // 轮询任务队列状态
  useEffect(() => {
    if (!bgTaskPolling) return;
    const poll = async () => {
      try {
        const [queueResp, lockResp] = await Promise.all([
          (await import('@/lib/api')).getTaskQueueStatus(),
          (await import('@/lib/api')).frontendLock('check')
        ]);
        if (queueResp.status === 'success') {
          setTaskQueueStatus({
            running: queueResp.running || [],
            pending: queueResp.pending || [],
            isFrontendRunning: lockResp.isFrontendRunning || false
          });
          // 如果没有运行中和等待中的任务，且没有前台执行，停止轮询
          if (queueResp.running.length === 0 && queueResp.pending.length === 0 && !lockResp.isFrontendRunning) {
            setBgTaskPolling(false);
          }
        }
      } catch (e) {
        console.warn('[task-queue] poll error', e);
      }
    };
    poll();
    const interval = setInterval(poll, 3000); // 每3秒轮询一次
    return () => clearInterval(interval);
  }, [bgTaskPolling]);

  // 周期性获取 FFmpeg 服务器状态
  useEffect(() => {
    // 只要有 IP 和端口就开始定时获取状态
    if (!serverIp || !serverPort) {
      setServerStatus(null);
      return;
    }
    const fetchStatus = async () => {
      try {
        const url = serverIp === '0'
          ? 'http://localhost:5000/status'
          : `http://${serverIp}:${serverPort}/status`;
        const resp = await fetch(url, { method: 'GET' });
        if (resp.ok) {
          const data = await resp.json();
          setServerStatus(data);
        } else {
          setServerStatus(null);
        }
      } catch (e) {
        setServerStatus(null);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // 每5秒获取一次
    return () => clearInterval(interval);
  }, [serverIp, serverPort]);

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
      if (serverIp === '0') {
        setServerHealth('ok');
        message.success('本地服务模式');
      } else {
        const url = `http://${serverIp}:${serverPort}/health`;
        const resp = await fetch(url, { method: 'GET' });
        if (resp.ok) {
          setServerHealth('ok');
          message.success('服务器正常');
        } else {
          setServerHealth('fail');
          message.error('服务器不可达');
        }
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
      const full = serverIp === '0' ? `http://localhost:3000${dp}` : `http://${serverIp}:${serverPort}${dp}`;
      setJobDownloadUrl(full);
      if (resp.duration_ms != null) setSingleExportDurationMs(Number(resp.duration_ms));
      message.success({ content: '任务已提交', key: 'auto', duration: 2 });
      // 自动下载并保存到本地
      try {
        setSavingAuto(true);
        const saveResp = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: full, localSaveDir: '', filename: outputFilename });
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
      const resp = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: jobDownloadUrl, localSaveDir: '', filename: outputFilename });
      if (resp.status !== 'success') throw new Error(String(resp.message || '保存失败'));
      message.success({ content: `已保存：${resp.saved_path || ''}`, key: 'save', duration: 2 });
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
            {/* FFmpeg 服务器状态 */}
            {serverStatus && (
              <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border shadow-sm">
                <div className="flex flex-wrap gap-6 items-center">
                  {/* CPU */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">CPU</span>
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          serverStatus.cpu_percent < 50 ? 'bg-green-500' :
                          serverStatus.cpu_percent < 80 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(serverStatus.cpu_percent, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-semibold ${
                      serverStatus.cpu_percent < 50 ? 'text-green-600' :
                      serverStatus.cpu_percent < 80 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{serverStatus.cpu_percent.toFixed(1)}%</span>
                  </div>
                  {/* 内存 */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">内存</span>
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          serverStatus.memory.percent < 60 ? 'bg-green-500' :
                          serverStatus.memory.percent < 85 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(serverStatus.memory.percent, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-semibold ${
                      serverStatus.memory.percent < 60 ? 'text-green-600' :
                      serverStatus.memory.percent < 85 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{serverStatus.memory.percent.toFixed(1)}%</span>
                  </div>
                  {/* GPU */}
                  {serverStatus.gpus?.map((gpu, idx) => {
                    const memPercent = gpu.memory_used_mb / gpu.memory_total_mb * 100;
                    return (
                      <div key={idx} className="flex items-center gap-3 pl-3 border-l border-gray-300">
                        <span className="text-gray-600 text-sm font-medium">{gpu.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs">利用率</span>
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                gpu.utilization_percent < 50 ? 'bg-blue-500' :
                                gpu.utilization_percent < 80 ? 'bg-purple-500' : 'bg-pink-500'
                              }`}
                              style={{ width: `${Math.min(gpu.utilization_percent, 100)}%` }}
                            />
                          </div>
                          <span className={`text-sm font-semibold ${
                            gpu.utilization_percent < 50 ? 'text-blue-600' :
                            gpu.utilization_percent < 80 ? 'text-purple-600' : 'text-pink-600'
                          }`}>{gpu.utilization_percent.toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs">显存</span>
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                memPercent < 60 ? 'bg-cyan-500' :
                                memPercent < 85 ? 'bg-orange-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(memPercent, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs ${
                            memPercent < 60 ? 'text-cyan-600' :
                            memPercent < 85 ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            <span className="font-semibold">{(gpu.memory_used_mb / 1024).toFixed(1)}</span>
                            <span className="text-gray-400">/{(gpu.memory_total_mb / 1024).toFixed(1)}G</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
              {matrixEncoder === 'nvenc' && (
              <Col span={6}>
                <Text className="block mb-1">NVENC 编码格式 (-c:v)</Text>
                <select value={nvencCodec} onChange={(e) => setNvencCodec(e.target.value as any)} className="border rounded px-2 py-1 w-full">
                  <option value="h264">h264</option>
                  <option value="hevc">hevc</option>
                </select>
              </Col>
              )}
              <Col span={6}>
                <Text className="block mb-1">preset（逗号分隔）</Text>
                <input type="text" value={matrixPresets} onChange={(e) => setMatrixPresets(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="p7,p6" />
              </Col>
              <Col span={6}>
                <Text className="block mb-1">profile</Text>
                <input type="text" value={matrixProfile} onChange={(e) => setMatrixProfile(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="high" />
              </Col>
            </Row>
            <Row gutter={16}>
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
              {matrixRcMode === 'constqp' && (
              <Col span={6}>
                <Text className="block mb-1">qp（逗号分隔）</Text>
                <input type="text" value={matrixQpValues} onChange={(e) => setMatrixQpValues(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="22,28" />
              </Col>
              )}
              {matrixEncoder === 'nvenc' && (
              <Col span={6}>
                <Text className="block mb-1">tune</Text>
                <input type="text" value={nvencTune} onChange={(e) => setNvencTune(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="hq,ll,ull,lossless" />
              </Col>
              )}
              {matrixEncoder === 'nvenc' && (
              <Col span={6}>
                <Text className="block mb-1">rc-lookahead（逗号分隔）</Text>
                <input type="text" value={nvencRcLookahead} onChange={(e) => setNvencRcLookahead(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="0,10,20" />
              </Col>
              )}
              {matrixEncoder === 'nvenc' && (
              <Col span={6}>
                <Text className="block mb-1">multipass</Text>
                <select value={nvencMultipass} onChange={(e) => setNvencMultipass(e.target.value as any)} className="border rounded px-2 py-1 w-full">
                  <option value="">关闭</option>
                  <option value="fullres">fullres</option>
                  <option value="qres">qres</option>
                </select>
              </Col>
              )}
            </Row>
            <Row gutter={16}>
              <Col span={6}>
                <Text className="block mb-1">b:v（逗号分隔）</Text>
                <input type="text" value={matrixBitrates} onChange={(e) => setMatrixBitrates(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="8M,10M" />
              </Col>
              <Col span={6}>
                <Text className="block mb-1">maxrate</Text>
                <input type="text" value={matrixMaxrates} onChange={(e) => setMatrixMaxrates(e.target.value)} className={`border rounded px-2 py-1 w-full ${matrixMaxrates ? '' : 'text-gray-400'}`} placeholder="12M" />
              </Col>
              {matrixEncoder === 'nvenc' && (
              <Col span={6}>
                <Text className="block mb-1">minrate</Text>
                <input type="text" value={nvencMinrate} onChange={(e) => setNvencMinrate(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="8M" />
              </Col>
              )}
              <Col span={6}>
                <Text className="block mb-1">bufsize（逗号分隔）</Text>
                <input type="text" value={matrixBufsizes} onChange={(e) => setMatrixBufsizes(e.target.value)} className={`border rounded px-2 py-1 w-full ${matrixBufsizes ? '' : 'text-gray-400'}`} placeholder="12M" />
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
                  if (!serverIp || !serverPort) { message.warning('请填写服务器 IP 与端口'); return; }
                  // 获取前台执行锁
                  const lockResp = await (await import('@/lib/api')).frontendLock('acquire');
                  if (lockResp.status === 'blocked') {
                    message.warning(lockResp.message || '当前有任务正在执行，请等待完成');
                    return;
                  }
                  // 开启轮询以显示前台执行状态
                  setBgTaskPolling(true);
                  setMatrixExported(true);
                  setMatrixAllChosen(false);
                  setMatrixSubmitting(true);
                  // upload input once
                  let jobId: string | null = null;
                  // benchmark
                  try {
                    const up = await (await import('@/lib/api')).automationUploadFile({ serverIp, serverPort, file: inputFile });
                    jobId = String(up?.job_id || '');
                    const codec = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : (nvencCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'));
                    const presetFast = matrixEncoder === 'nvenc' ? 'p1' : 'veryfast';
                    const hwaccel = matrixEncoder === 'nvenc' ? '-hwaccel cuda -hwaccel_output_format cuda ' : '';
                    const benchOut = `benchmark_${matrixEncoder}_${Date.now()}.mp4`;
                    const benchCmd = `ffmpeg -y ${hwaccel}-i {input} -c:v ${codec} -preset ${presetFast} -c:a copy {output}`;
                    if (jobId) {
                      const benchResp = await (await import('@/lib/api')).automationProcess({ serverIp, serverPort, jobId, command: benchCmd, outputFilename: benchOut });
                      if (benchResp?.status === 'success' && benchResp?.duration_ms != null) {
                        setBenchmarkDurationMs(Number(benchResp.duration_ms));
                      } else {
                        setBenchmarkDurationMs(null);
                      }
                    }
                  } catch (_) {
                    setBenchmarkDurationMs(null);
                  }
                  if (!jobId) { message.error('源视频上传失败，未获取到 job_id'); return; }
                  const presets = matrixPresets.split(',').map(s => s.trim()).filter(Boolean);
                  const bitrates = matrixBitrates.split(',').map(s => s.trim()).filter(Boolean);
                  const maxrates = matrixMaxrates.split(',').map(s => s.trim()).filter(Boolean);
                  const bufsizes = matrixBufsizes.split(',').map(s => s.trim()).filter(Boolean);
                  const cqs = matrixCqValues.split(',').map(s => s.trim()).filter(Boolean);
                  const qps = matrixQpValues.split(',').map(s => s.trim()).filter(Boolean);
                  const lookaheads = String(nvencRcLookahead || '').split(',').map(s => s.trim()).filter(Boolean);
                  const codec = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : (nvencCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'));
                  const jobs = [] as any[];
                  const now = Date.now();
                  for (const preset of (presets.length ? presets : [''])) {
                    for (const b of (bitrates.length ? bitrates : [''])) {
                      for (const mr of (maxrates.length ? maxrates : [''])) {
                        for (const bs of (bufsizes.length ? bufsizes : [''])) {
                          for (const cq of (cqs.length ? cqs : [''])) {
                            for (const qp of (qps.length ? qps : [''])) {
                              for (const la of (lookaheads.length ? lookaheads : [''])) {
                            const encTag = matrixEncoder === 'nvenc' ? (nvencCodec === 'hevc' ? 'nvhevc' : 'nvh264') : matrixEncoder;
                            const nameParts: string[] = ['auto', encTag];
                            if (preset) nameParts.push(`pre-${preset}`);
                            nameParts.push(`rc-${matrixRcMode}`);
                            // 始终包含所有循环变量，确保文件名唯一
                            if (b) nameParts.push(`b-${b}`);
                            if (mr) nameParts.push(`max-${mr}`);
                            if (bs) nameParts.push(`buf-${bs}`);
                            if (cq) nameParts.push(`cq-${cq}`);
                            if (qp) nameParts.push(`qp-${qp}`);
                            if (nvencTune) nameParts.push(`t-${nvencTune}`);
                            if (nvencMultipass) nameParts.push(`mp-${nvencMultipass}`);
                            if (la && la !== '0') nameParts.push(`la-${la}`);
                            if (nvencMinrate) nameParts.push(`min-${nvencMinrate}`);
                            if (matrixTemporalAQ) nameParts.push('ta-1');
                            if (matrixSpatialAQ) nameParts.push('sa-1');
                            let profTag = matrixProfile;
                            if (matrixEncoder === 'nvenc' && nvencCodec === 'hevc') {
                              const p = String(matrixProfile).toLowerCase();
                              if (p === 'high') profTag = 'main';
                              else if (!['main','main10','rext'].includes(p)) profTag = 'main';
                            }
                            if (profTag) nameParts.push(`pr-${profTag}`);
                            // 使用递增索引确保唯一性
                            const jobIndex = jobs.length;
                            const outfile = `${nameParts.join('_')}_${now}_${jobIndex}.mp4`;
                              const paramsList: string[] = [];
                              paramsList.push(`-c:v ${codec}`);
                              if (preset) paramsList.push(`-preset ${preset}`);
                            if (matrixRcMode !== 'constqp') {
                              if (matrixRcMode) paramsList.push(`-rc:v ${matrixRcMode}`);
                              if (b) paramsList.push(`-b:v ${b}`);
                              if (mr) paramsList.push(`-maxrate ${mr}`);
                              if (bs) paramsList.push(`-bufsize ${bs}`);
                              if (cq) paramsList.push(`-cq:v ${cq}`);
                            } else {
                                paramsList.push(`-rc constqp`);
                                if (qp) paramsList.push(`-qp ${qp}`);
                              }
                              if (matrixTemporalAQ) paramsList.push(`-temporal-aq 1`);
                              if (matrixSpatialAQ) paramsList.push(`-spatial-aq 1`);
                              {
                                let profileArg: string | null = null;
                                if (matrixProfile) {
                                if (matrixEncoder === 'nvenc' && nvencCodec === 'hevc') {
                                  const p = String(matrixProfile).toLowerCase();
                                  if (p === 'high') profileArg = 'main';
                                  else if (['main','main10','rext'].includes(p)) profileArg = matrixProfile;
                                  else profileArg = 'main';
                                } else {
                                  profileArg = matrixProfile;
                                }
                              }
                              if (profileArg) paramsList.push(`-profile:v ${profileArg}`);
                              }
                              paramsList.push(`-c:a copy`);
                              if (matrixEncoder === 'nvenc') {
                                if (nvencTune) paramsList.push(`-tune ${nvencTune}`);
                                if (nvencMultipass) paramsList.push(`-multipass ${nvencMultipass}`);
                                if (la && la !== '0') paramsList.push(`-rc-lookahead ${la}`);
                                if (nvencMinrate) paramsList.push(`-minrate ${nvencMinrate}`);
                              }
                              const params = paramsList.join(' ');
                              const hwaccelCmd = matrixEncoder === 'nvenc' ? '-hwaccel cuda -hwaccel_output_format cuda ' : '';
                              const command = `ffmpeg -y ${hwaccelCmd}-i {input} ${params} {output}`;
                              // 使用索引确保 id 唯一
                              jobs.push({ id: `${now}-${jobIndex}`, encoder: matrixEncoder, params: { preset, b, mr, bs, cq, qp, rc: matrixRcMode, temporal_aq: matrixTemporalAQ ? 1 : 0, spatial_aq: matrixSpatialAQ ? 1 : 0, profile: matrixProfile, nvenc_codec: nvencCodec, tune: nvencTune, multipass: nvencMultipass, rc_lookahead: la, minrate: nvencMinrate }, command, outputFilename: outfile });
                            }
                          }
                        }
                      }
                    }
                  }
                  }
                  addMatrixJobs(jobs);
                  // submit sequentially with save retry (process with existing job)
                  let processed = 0;
                  for (const job of jobs) {
                    try {
                      const resp = await (await import('@/lib/api')).automationProcess({ serverIp, serverPort, jobId, command: job.command, outputFilename: job.outputFilename });
                      if (resp.status === 'success') {
                        const dp = String(resp.download_path || '');
                        const full = serverIp === '0' ? `http://localhost:3000${dp}` : `http://${serverIp}:${serverPort}${dp}`;
                        const durMs = resp.duration_ms != null ? Number(resp.duration_ms) : null;
                        updateMatrixJob(job.id, { downloadUrl: full, exportDurationMs: durMs });
                        // auto save locally with simple retry
                        let saved: string | null = null;
                        for (let attempt = 0; attempt < 3 && !saved; attempt++) {
                          try {
                            const saveResp = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: full, localSaveDir: '', filename: job.outputFilename });
                            if (saveResp?.saved_path) saved = String(saveResp.saved_path);
                            if (!saved) await new Promise(r => setTimeout(r, 1500));
                          } catch (_) {
                            await new Promise(r => setTimeout(r, 1500));
                          }
                        }
                        updateMatrixJob(job.id, { savedPath: saved });
                        // 流式预览：直接使用远程 URL，浏览器边下边播
                        updateMatrixJob(job.id, { previewUrl: full });
                        processed++;
                      }
                    } catch (e) {
                      // ignore failed job
                    }
                  }
                  if (processed > 0) {
                    message.success('全部导出并下载完成');
                  } else {
                    message.error('未处理任何导出任务');
                  }
                } catch (e) {
                  message.error('提交失败');
                } finally {
                  setMatrixSubmitting(false);
                  // 释放前台执行锁
                  await (await import('@/lib/api')).frontendLock('release');
                }
              }}>矩阵导出</Button>
              {!matrixExported && (
              <Button loading={matrixAllRunning} onClick={async () => {
                try {
                  if (!inputFile) { message.warning('请先上传输入视频'); return; }
                  if (!serverIp || !serverPort) { message.warning('请填写服务器 IP 与端口'); return; }
                  // 获取前台执行锁
                  const lockResp = await (await import('@/lib/api')).frontendLock('acquire');
                  if (lockResp.status === 'blocked') {
                    message.warning(lockResp.message || '当前有任务正在执行，请等待完成');
                    return;
                  }
                  // 开启轮询以显示前台执行状态
                  setBgTaskPolling(true);
                  setMatrixAllChosen(true);
                  setMatrixExported(false);
                  setMatrixAllRunning(true);
                  let jobId0: string | null = null;
                  try {
                    const up0 = await (await import('@/lib/api')).automationUploadFile({ serverIp, serverPort, file: inputFile });
                    jobId0 = String(up0?.job_id || '');
                    const codec0 = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : (nvencCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'));
                    const presetFast0 = matrixEncoder === 'nvenc' ? 'p1' : 'veryfast';
                    const hwaccel0 = matrixEncoder === 'nvenc' ? '-hwaccel cuda -hwaccel_output_format cuda ' : '';
                    const benchOut0 = `benchmark_${matrixEncoder}_${Date.now()}.mp4`;
                    const benchCmd0 = `ffmpeg -y ${hwaccel0}-i {input} -c:v ${codec0} -preset ${presetFast0} -c:a copy {output}`;
                    if (jobId0) {
                      const benchResp0 = await (await import('@/lib/api')).automationProcess({ serverIp, serverPort, jobId: jobId0, command: benchCmd0, outputFilename: benchOut0 });
                      if (benchResp0?.status === 'success' && benchResp0?.duration_ms != null) {
                        setBenchmarkDurationMs(Number(benchResp0.duration_ms));
                      } else {
                        setBenchmarkDurationMs(null);
                      }
                    }
                  } catch (_) {
                    setBenchmarkDurationMs(null);
                  }
                  if (!jobId0) { message.error('源视频上传失败，未获取到 job_id'); setMatrixAllRunning(false); return; }
                  const presets0 = matrixPresets.split(',').map(s => s.trim()).filter(Boolean);
                  const bitrates0 = matrixBitrates.split(',').map(s => s.trim()).filter(Boolean);
                  const maxrates0 = matrixMaxrates.split(',').map(s => s.trim()).filter(Boolean);
                  const bufsizes0 = matrixBufsizes.split(',').map(s => s.trim()).filter(Boolean);
                  const cqs0 = matrixCqValues.split(',').map(s => s.trim()).filter(Boolean);
                  const qps0 = matrixQpValues.split(',').map(s => s.trim()).filter(Boolean);
                  const lookaheads0 = String(nvencRcLookahead || '').split(',').map(s => s.trim()).filter(Boolean);
                  const codec1 = matrixEncoder === 'x264' ? 'libx264' : (matrixEncoder === 'x265' ? 'libx265' : (nvencCodec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'));
                  const jobs0 = [] as any[];
                  const now0 = Date.now();
                  for (const preset of (presets0.length ? presets0 : [''])) {
                    for (const b of (bitrates0.length ? bitrates0 : [''])) {
                      for (const mr of (maxrates0.length ? maxrates0 : [''])) {
                        for (const bs of (bufsizes0.length ? bufsizes0 : [''])) {
                          for (const cq of (cqs0.length ? cqs0 : [''])) {
                            for (const qp of (qps0.length ? qps0 : [''])) {
                              for (const la of (lookaheads0.length ? lookaheads0 : [''])) {
                            const encTag2 = matrixEncoder === 'nvenc' ? (nvencCodec === 'hevc' ? 'nvhevc' : 'nvh264') : matrixEncoder;
                            const nameParts2: string[] = ['auto', encTag2];
                            if (preset) nameParts2.push(`pre-${preset}`);
                            nameParts2.push(`rc-${matrixRcMode}`);
                            // 始终包含所有循环变量，确保文件名唯一
                            if (b) nameParts2.push(`b-${b}`);
                            if (mr) nameParts2.push(`max-${mr}`);
                            if (bs) nameParts2.push(`buf-${bs}`);
                            if (cq) nameParts2.push(`cq-${cq}`);
                            if (qp) nameParts2.push(`qp-${qp}`);
                            if (nvencTune) nameParts2.push(`t-${nvencTune}`);
                            if (nvencMultipass) nameParts2.push(`mp-${nvencMultipass}`);
                            if (la && la !== '0') nameParts2.push(`la-${la}`);
                            if (nvencMinrate) nameParts2.push(`min-${nvencMinrate}`);
                            if (matrixTemporalAQ) nameParts2.push('ta-1');
                            if (matrixSpatialAQ) nameParts2.push('sa-1');
                            let profTag2 = matrixProfile;
                            if (matrixEncoder === 'nvenc' && nvencCodec === 'hevc') {
                              const p2 = String(matrixProfile).toLowerCase();
                              if (p2 === 'high') profTag2 = 'main';
                              else if (!['main','main10','rext'].includes(p2)) profTag2 = 'main';
                            }
                            if (profTag2) nameParts2.push(`pr-${profTag2}`);
                            // 使用递增索引确保唯一性
                            const jobIndex = jobs0.length;
                            const outfile = `${nameParts2.join('_')}_${now0}_${jobIndex}.mp4`;
                              const paramsList2: string[] = [];
                              paramsList2.push(`-c:v ${codec1}`);
                              if (preset) paramsList2.push(`-preset ${preset}`);
                            if (matrixRcMode !== 'constqp') {
                              if (matrixRcMode) paramsList2.push(`-rc:v ${matrixRcMode}`);
                              if (b) paramsList2.push(`-b:v ${b}`);
                              if (mr) paramsList2.push(`-maxrate ${mr}`);
                              if (bs) paramsList2.push(`-bufsize ${bs}`);
                              if (cq) paramsList2.push(`-cq:v ${cq}`);
                            } else {
                                paramsList2.push(`-rc constqp`);
                                if (qp) paramsList2.push(`-qp ${qp}`);
                              }
                              if (matrixTemporalAQ) paramsList2.push(`-temporal-aq 1`);
                              if (matrixSpatialAQ) paramsList2.push(`-spatial-aq 1`);
                              {
                                let profileArg2: string | null = null;
                                if (matrixProfile) {
                                if (matrixEncoder === 'nvenc' && nvencCodec === 'hevc') {
                                  const p = String(matrixProfile).toLowerCase();
                                  if (p === 'high') profileArg2 = 'main';
                                  else if (['main','main10','rext'].includes(p)) profileArg2 = matrixProfile;
                                  else profileArg2 = 'main';
                                } else {
                                  profileArg2 = matrixProfile;
                                }
                              }
                              if (profileArg2) paramsList2.push(`-profile:v ${profileArg2}`);
                              }
                              paramsList2.push(`-c:a copy`);
                              if (matrixEncoder === 'nvenc') {
                                if (nvencTune) paramsList2.push(`-tune ${nvencTune}`);
                                if (nvencMultipass) paramsList2.push(`-multipass ${nvencMultipass}`);
                                if (la && la !== '0') paramsList2.push(`-rc-lookahead ${la}`);
                                if (nvencMinrate) paramsList2.push(`-minrate ${nvencMinrate}`);
                              }
                              const params = paramsList2.join(' ');
                              const hwaccelCmd2 = matrixEncoder === 'nvenc' ? '-hwaccel cuda -hwaccel_output_format cuda ' : '';
                              const command = `ffmpeg -y ${hwaccelCmd2}-i {input} ${params} {output}`;
                              // 使用索引确保 id 唯一
                              jobs0.push({ id: `${now0}-${jobIndex}`, encoder: matrixEncoder, params: { preset, b, mr, bs, cq, qp, rc: matrixRcMode, temporal_aq: matrixTemporalAQ ? 1 : 0, spatial_aq: matrixSpatialAQ ? 1 : 0, profile: matrixProfile, nvenc_codec: nvencCodec, tune: nvencTune, multipass: nvencMultipass, rc_lookahead: la, minrate: nvencMinrate }, command, outputFilename: outfile });
                            }
                          }
                        }
                    }
                  }
                  }
                  }
                  addMatrixJobs(jobs0);
                  // 记录导出信息，评估时从本地读取
                  const exportedList: { id: string; localUrl: string; durMs: number | null; name: string }[] = [];
                  let processed0 = 0;
                  for (const job of jobs0) {
                    try {
                      const resp2 = await (await import('@/lib/api')).automationProcess({ serverIp, serverPort, jobId: jobId0, command: job.command, outputFilename: job.outputFilename });
                      if (resp2.status === 'success') {
                        const dp2 = String(resp2.download_path || '');
                        const full2 = serverIp === '0' ? `http://localhost:3000${dp2}` : `http://${serverIp}:${serverPort}${dp2}`;
                        const durMs2 = resp2.duration_ms != null ? Number(resp2.duration_ms) : null;
                        updateMatrixJob(job.id, { downloadUrl: full2, exportDurationMs: durMs2 });
                        // auto save locally with simple retry
                        let saved2: string | null = null;
                        for (let attempt = 0; attempt < 3 && !saved2; attempt++) {
                          try {
                            const saveResp2 = await (await import('@/lib/api')).automationSave({ fullDownloadUrl: full2, localSaveDir: '', filename: job.outputFilename });
                            if (saveResp2?.saved_path) saved2 = String(saveResp2.saved_path);
                            if (!saved2) await new Promise(r => setTimeout(r, 1500));
                          } catch (_) {
                            await new Promise(r => setTimeout(r, 1500));
                          }
                        }
                        updateMatrixJob(job.id, { savedPath: saved2 });
                        // 流式预览：直接使用远程 URL
                        updateMatrixJob(job.id, { previewUrl: full2 });
                        // 记录导出信息，评估时从后端本地读取（已通过 automationSave 下载）
                        // 构造后端本地文件 URL：http://backend:3000/files/filename
                        const API_BASE = window.location.hostname === 'localhost'
                          ? 'http://localhost:3000'
                          : `http://${window.location.hostname}:3000`;
                        const localFileUrl = `${API_BASE}/files/${job.outputFilename}`;
                        exportedList.push({ id: job.id, localUrl: localFileUrl, durMs: durMs2, name: job.outputFilename });
                        processed0++;
                      }
                    } catch (_) {}
                  }
                  if (processed0 === 0) { message.error('未处理任何导出任务'); setMatrixAllRunning(false); return; }
                  console.log('[matrix-eval] exportedList count:', exportedList.length);
                  // 并行评估，限制并发数
                  const EVAL_CONCURRENCY = evalConcurrency;
                  const evaluateOne = async (ex: typeof exportedList[0]) => {
                    try {
                      console.log('[matrix-eval] start evaluating', ex.id, ex.localUrl);
                      // 从后端本地读取文件（已通过 automationSave 下载到后端）
                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
                      const resp = await fetch(ex.localUrl, { signal: controller.signal });
                      clearTimeout(timeoutId);
                      if (!resp.ok) {
                        console.warn('[matrix-eval] fetch not ok', ex.id, resp.status);
                        return;
                      }
                      const blob = await resp.blob();
                      console.log('[matrix-eval] blob loaded from local', ex.id, blob.size);
                      const afterFile3 = new File([blob], ex.name, { type: blob.type || 'video/mp4' });
                      const expSecVal = ex.durMs ? (ex.durMs / 1000) : (inputDuration || 30);
                      const benchSecVal = benchmarkDurationMs != null ? (Number(benchmarkDurationMs) / 1000) : expSecVal;
                      const tgtRTF = (inputDuration || 30) / Math.max(benchSecVal, 1e-6);
                      const evalResp3 = await (await import('@/lib/api')).evaluateQuality({ before: inputFile, after: afterFile3, exportTimeSeconds: expSecVal, targetRTF: tgtRTF, weights: { quality: 0.5, speed: 0.25, bitrate: 0.25 }, skipVmaf: qualityMetric === 'psnr' });
                      const saveJson3 = await (await import('@/lib/api')).automationSaveJson({ data: evalResp3, localSaveDir: '', filename: `${ex.name.replace(/\.mp4$/,'')}_evaluation.json` });
                      const summary3 = {
                        overall: Number(evalResp3?.final_score ?? 0),
                        vmaf: evalResp3?.metrics?.vmaf,
                        psnr: evalResp3?.metrics?.psnr_db,
                        ssim: evalResp3?.metrics?.ssim,
                        bitrate_after_kbps: (evalResp3?.metrics?.bitrate_after_bps ?? 0) / 1000,
                      };
                      updateMatrixJob(ex.id, { evalSavedJsonPath: saveJson3?.url || null, evalSummary: summary3 });
                      console.log('[matrix-eval] done', ex.id);
                    } catch (err) {
                      console.warn('[matrix-eval] evaluateOne failed for', ex.id, err);
                    }
                  };
                  // 分批并行执行
                  for (let i = 0; i < exportedList.length; i += EVAL_CONCURRENCY) {
                    const batch = exportedList.slice(i, i + EVAL_CONCURRENCY);
                    await Promise.all(batch.map(evaluateOne));
                  }
                  message.success('矩阵评估完成');

                  // 自动生成 CSV 并推送到飞书
                  try {
                    const header = [
                      'encoder','preset','b_v','maxrate','bufsize','rc','cq','qp','temporal_aq','spatial_aq','profile','nvenc_codec','tune','multipass','rc_lookahead','minrate','output_file','overall','vmaf','psnr_db','ssim','bitrate_after_kbps','export_duration_seconds','download_url','saved_path','eval_json_url','ffmpeg_command'
                    ];
                    // 需要从 store 获取最新的 matrixJobs
                    const latestJobs = useAutomationStore.getState().matrixJobs;
                    const evaledJobs = latestJobs.filter(j => j.evalSummary);
                    const rows = evaledJobs.map(j => {
                      const p = j.params || {} as any;
                      const v = [
                        j.encoder,
                        String(p.preset ?? ''),
                        String(p.b ?? ''),
                        String(p.mr ?? ''),
                        String(p.bs ?? ''),
                        String(p.rc ?? 'vbr'),
                        String(p.cq ?? ''),
                        String(p.qp ?? ''),
                        String((p.temporal_aq ?? 1)),
                        String((p.spatial_aq ?? 1)),
                        String(p.profile ?? ''),
                        String(p.nvenc_codec ?? ''),
                        String(p.tune ?? ''),
                        String(p.multipass ?? ''),
                        String(p.rc_lookahead ?? ''),
                        String(p.minrate ?? ''),
                        j.outputFilename,
                        Number(j.evalSummary?.overall ?? 0).toFixed(4),
                        String(j.evalSummary?.vmaf ?? ''),
                        String(j.evalSummary?.psnr ?? ''),
                        String(j.evalSummary?.ssim ?? ''),
                        String(j.evalSummary?.bitrate_after_kbps ?? ''),
                        j.exportDurationMs != null ? (Number(j.exportDurationMs)/1000).toFixed(2) : '',
                        j.downloadUrl || '',
                        j.savedPath || '',
                        j.evalSavedJsonPath || '',
                        j.command || ''
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
                    const csvFilename = `matrix_evaluation_${Date.now()}.csv`;
                    const saveResp = await (await import('@/lib/api')).automationSaveCsv({ csvText: csv, localSaveDir: '', filename: csvFilename });
                    // 使用后端返回的完整 URL（包含本机 IP）
                    const csvFullUrl = (saveResp as any)?.full_url || null;
                    const jobCount = evaledJobs.length;
                    const avgScore = evaledJobs.reduce((acc, j) => acc + Number(j.evalSummary?.overall ?? 0), 0) / jobCount;
                    const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/a2714380-7dcf-403e-924b-8af1aa146267';
                    await (await import('@/lib/api')).notifyFeishu({
                      webhookUrl: FEISHU_WEBHOOK,
                      title: '矩阵评估完成',
                      content: `共 ${jobCount} 个任务，平均得分 ${(avgScore * 100).toFixed(2)} 分`,
                      csvUrl: csvFullUrl || undefined
                    });
                    // 记录到历史
                    await (await import('@/lib/api')).recordFrontendTask({
                      encoder: matrixEncoder,
                      taskCount: latestJobs.length,
                      evaluated: jobCount,
                      csvUrl: csvFullUrl || undefined,
                      taskType: 'frontend-matrix'
                    });
                    message.success('已推送到飞书');
                  } catch (feishuErr) {
                    console.warn('[feishu] 推送失败', feishuErr);
                  }
                } catch (e) {
                  message.error('矩阵评估失败');
                } finally {
                  setMatrixAllRunning(false);
                  // 释放前台执行锁
                  await (await import('@/lib/api')).frontendLock('release');
                }
              }}>矩阵评估</Button>
              )}
              <Button type="default" loading={taskQueueStatus?.submitting} onClick={async () => {
                try {
                  if (!inputFile) { message.warning('请先上传输入视频'); return; }
                  if (!serverIp || !serverPort) { message.warning('请填写服务器 IP 与端口'); return; }
                  // 检查是否有前台任务正在执行
                  const lockCheck = await (await import('@/lib/api')).frontendLock('check');
                  if (lockCheck.isFrontendRunning) {
                    message.info('当前有前台任务正在执行，后台任务将排队等待');
                  }
                  // 立即显示"正在提交"状态
                  setBgTaskPolling(true);
                  setTaskQueueStatus(prev => ({
                    running: prev?.running || [],
                    pending: prev?.pending || [],
                    isFrontendRunning: prev?.isFrontendRunning,
                    submitting: true
                  }));
                  const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/a2714380-7dcf-403e-924b-8af1aa146267';
                  const resp = await (await import('@/lib/api')).submitMatrixTask({
                    file: inputFile,
                    config: {
                      serverIp,
                      serverPort,
                      encoder: matrixEncoder,
                      nvencCodec,
                      presets: matrixPresets,
                      bitrates: matrixBitrates,
                      maxrates: matrixMaxrates,
                      bufsizes: matrixBufsizes,
                      rcMode: matrixRcMode,
                      cqValues: matrixCqValues,
                      qpValues: matrixQpValues,
                      temporalAQ: matrixTemporalAQ,
                      spatialAQ: matrixSpatialAQ,
                      profile: matrixProfile,
                      tune: nvencTune,
                      multipass: nvencMultipass,
                      rcLookahead: nvencRcLookahead,
                      minrate: nvencMinrate,
                      evalConcurrency,
                      feishuWebhook: FEISHU_WEBHOOK,
                      inputDuration: inputDuration || undefined,
                      skipVmaf: qualityMetric === 'psnr'
                    }
                  });
                  // 提交完成，清除 submitting 状态
                  setTaskQueueStatus(prev => ({
                    running: prev?.running || [],
                    pending: prev?.pending || [],
                    isFrontendRunning: prev?.isFrontendRunning,
                    submitting: false
                  }));
                  if (resp.status === 'success' && resp.task_id) {
                    message.success(resp.message || `任务已提交到后台执行，任务ID: ${resp.task_id}`);
                  } else {
                    message.error(resp.message || '提交失败');
                  }
                } catch (e: any) {
                  // 提交失败，清除 submitting 状态
                  setTaskQueueStatus(prev => prev ? { ...prev, submitting: false } : null);
                  message.error(e.message || '提交失败');
                }
              }}>后台执行</Button>
              <Button onClick={() => setHistoryModalVisible(true)}>历史任务查询</Button>
              {matrixJobs.some(j => j.downloadUrl) && matrixExported && !matrixAllChosen && (
              <Button loading={batchEvaluating} onClick={async () => {
                try {
                  if (!inputFile) { message.warning('请先上传输入视频'); return; }
                  // 获取前台执行锁
                  const lockResp = await (await import('@/lib/api')).frontendLock('acquire');
                  if (lockResp.status === 'blocked') {
                    message.warning(lockResp.message || '当前有任务正在执行，请等待完成');
                    return;
                  }
                  // 开启轮询以显示前台执行状态
                  setBgTaskPolling(true);
                  setBatchEvaluating(true);
                  // 过滤出需要评估的任务
                  const jobsToEval = matrixJobs.filter(j => !j.evalSavedJsonPath && !j.evalSummary && j.downloadUrl);
                  console.log('[batch-eval] jobsToEval count:', jobsToEval.length, 'total matrixJobs:', matrixJobs.length);
                  console.log('[batch-eval] matrixJobs detail:', matrixJobs.map(j => ({ id: j.id, downloadUrl: j.downloadUrl, evalSummary: !!j.evalSummary, evalSavedJsonPath: j.evalSavedJsonPath })));
                  if (jobsToEval.length === 0) {
                    message.warning('没有需要评估的任务');
                    setBatchEvaluating(false);
                    // 释放前台执行锁
                    await (await import('@/lib/api')).frontendLock('release');
                    return;
                  }
                  // 并行评估，限制并发数
                  const EVAL_CONCURRENCY = evalConcurrency;
                  const evaluateJob = async (job: typeof matrixJobs[0]) => {
                    try {
                      // 从后端本地读取文件（矩阵导出时已通过 automationSave 下载到后端）
                      const API_BASE = window.location.hostname === 'localhost'
                        ? 'http://localhost:3000'
                        : `http://${window.location.hostname}:3000`;
                      const localFileUrl = `${API_BASE}/files/${job.outputFilename}`;
                      console.log('[batch-eval] start evaluating', job.id, localFileUrl);
                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
                      const resp = await fetch(localFileUrl, { signal: controller.signal });
                      clearTimeout(timeoutId);
                      if (!resp.ok) {
                        console.warn('[batch-eval] fetch not ok', job.id, resp.status);
                        return;
                      }
                      const blob = await resp.blob();
                      console.log('[batch-eval] blob loaded from local', job.id, blob.size);
                      const afterFile = new File([blob], job.outputFilename, { type: blob.type || 'video/mp4' });
                      const expSec = job.exportDurationMs ? (job.exportDurationMs / 1000) : (inputDuration || 30);
                      const benchSec = benchmarkDurationMs != null ? (Number(benchmarkDurationMs) / 1000) : expSec;
                      const tgtRTF2 = (inputDuration || 30) / Math.max(benchSec, 1e-6);
                      const evalResp = await (await import('@/lib/api')).evaluateQuality({ before: inputFile, after: afterFile, exportTimeSeconds: expSec, targetRTF: tgtRTF2, weights: { quality: 0.5, speed: 0.25, bitrate: 0.25 }, skipVmaf: qualityMetric === 'psnr' });
                      console.log('[batch-eval] evalResp', job.id, evalResp);
                      const saveJson = await (await import('@/lib/api')).automationSaveJson({ data: evalResp, localSaveDir: '', filename: `${job.outputFilename.replace(/\.mp4$/,'')}_evaluation.json` });
                      const summary = {
                        overall: Number(evalResp?.final_score ?? 0),
                        vmaf: evalResp?.metrics?.vmaf,
                        psnr: evalResp?.metrics?.psnr_db,
                        ssim: evalResp?.metrics?.ssim,
                        bitrate_after_kbps: (evalResp?.metrics?.bitrate_after_bps ?? 0) / 1000,
                      };
                      updateMatrixJob(job.id, { evalSavedJsonPath: saveJson?.url || null, evalSummary: summary });
                    } catch (err) {
                      console.warn('[batch-eval] evaluateJob failed for', job.id, err);
                    }
                  };
                  // 分批并行执行
                  for (let i = 0; i < jobsToEval.length; i += EVAL_CONCURRENCY) {
                    const batch = jobsToEval.slice(i, i + EVAL_CONCURRENCY);
                    await Promise.all(batch.map(evaluateJob));
                  }
                  message.success('批量评估完成');

                  // 自动生成 CSV 并推送到飞书
                  try {
                    const header = [
                      'encoder','preset','b_v','maxrate','bufsize','rc','cq','qp','temporal_aq','spatial_aq','profile','nvenc_codec','tune','multipass','rc_lookahead','minrate','output_file','overall','vmaf','psnr_db','ssim','bitrate_after_kbps','export_duration_seconds','download_url','saved_path','eval_json_url','ffmpeg_command'
                    ];
                    const latestJobs = useAutomationStore.getState().matrixJobs;
                    const evaledJobs = latestJobs.filter(j => j.evalSummary);
                    const rows = evaledJobs.map(j => {
                      const p = j.params || {} as any;
                      const v = [
                        j.encoder,
                        String(p.preset ?? ''),
                        String(p.b ?? ''),
                        String(p.mr ?? ''),
                        String(p.bs ?? ''),
                        String(p.rc ?? 'vbr'),
                        String(p.cq ?? ''),
                        String(p.qp ?? ''),
                        String((p.temporal_aq ?? 1)),
                        String((p.spatial_aq ?? 1)),
                        String(p.profile ?? ''),
                        String(p.nvenc_codec ?? ''),
                        String(p.tune ?? ''),
                        String(p.multipass ?? ''),
                        String(p.rc_lookahead ?? ''),
                        String(p.minrate ?? ''),
                        j.outputFilename,
                        Number(j.evalSummary?.overall ?? 0).toFixed(4),
                        String(j.evalSummary?.vmaf ?? ''),
                        String(j.evalSummary?.psnr ?? ''),
                        String(j.evalSummary?.ssim ?? ''),
                        String(j.evalSummary?.bitrate_after_kbps ?? ''),
                        j.exportDurationMs != null ? (Number(j.exportDurationMs)/1000).toFixed(2) : '',
                        j.downloadUrl || '',
                        j.savedPath || '',
                        j.evalSavedJsonPath || '',
                        j.command || ''
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
                    const csvFilename = `matrix_evaluation_${Date.now()}.csv`;
                    const saveResp = await (await import('@/lib/api')).automationSaveCsv({ csvText: csv, localSaveDir: '', filename: csvFilename });
                    // 使用后端返回的完整 URL（包含本机 IP）
                    const csvFullUrl = (saveResp as any)?.full_url || null;
                    const jobCount = evaledJobs.length;
                    const avgScore = evaledJobs.reduce((acc, j) => acc + Number(j.evalSummary?.overall ?? 0), 0) / jobCount;
                    const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/a2714380-7dcf-403e-924b-8af1aa146267';
                    await (await import('@/lib/api')).notifyFeishu({
                      webhookUrl: FEISHU_WEBHOOK,
                      title: '批量评估完成',
                      content: `共 ${jobCount} 个任务，平均得分 ${(avgScore * 100).toFixed(2)} 分`,
                      csvUrl: csvFullUrl || undefined
                    });
                    // 记录到历史
                    await (await import('@/lib/api')).recordFrontendTask({
                      encoder: matrixEncoder,
                      taskCount: jobCount,
                      evaluated: jobCount,
                      csvUrl: csvFullUrl || undefined,
                      taskType: 'frontend-batch'
                    });
                    message.success('已推送到飞书');
                  } catch (feishuErr) {
                    console.warn('[feishu] 推送失败', feishuErr);
                  }
                } catch (e) {
                  message.error('批量评估失败');
                } finally {
                  setBatchEvaluating(false);
                  // 释放前台执行锁
                  await (await import('@/lib/api')).frontendLock('release');
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
            <div className="mt-3 flex gap-6">
              <div>
                <Text className="block mb-1">评估并发数（1-8）</Text>
                <input type="number" min={1} max={8} value={evalConcurrency} onChange={(e) => setEvalConcurrency(Math.max(1, Math.min(8, Number(e.target.value) || 2)))} className="border rounded px-2 py-1 w-24" />
                <Text type="secondary" className="ml-2">同时进行的评估任务数量</Text>
              </div>
              <div>
                <Text className="block mb-1">画质评估标准</Text>
                <select value={qualityMetric} onChange={(e) => setQualityMetric(e.target.value as 'vmaf' | 'psnr')} className="border rounded px-2 py-1">
                  <option value="vmaf">VMAF（含 PSNR + SSIM）</option>
                  <option value="psnr">仅 PSNR + SSIM（跳过 VMAF）</option>
                </select>
              </div>
            </div>
            {/* 任务队列状态 */}
            {(taskQueueStatus?.running?.length > 0 || taskQueueStatus?.pending?.length > 0 || taskQueueStatus?.isFrontendRunning || taskQueueStatus?.submitting || bgTaskPolling) && (
            <div className="mt-3 p-3 border rounded bg-blue-50">
              <div className="flex justify-between items-center mb-2">
                <Text strong>任务队列</Text>
                <div className="flex gap-2">
                  {bgTaskPolling ? (
                    <Button size="small" onClick={() => setBgTaskPolling(false)}>暂停刷新</Button>
                  ) : (
                    <Button size="small" onClick={() => setBgTaskPolling(true)}>开始刷新</Button>
                  )}
                  {(taskQueueStatus?.running?.length > 0 || taskQueueStatus?.pending?.length > 0) && (
                    <Button
                      size="small"
                      danger
                      onClick={async () => {
                        try {
                          const resp = await (await import('@/lib/api')).clearTaskQueue();
                          if (resp.status === 'success') {
                            message.success(resp.message || '队列已清空');
                          } else {
                            message.error(resp.message || '清空失败');
                          }
                        } catch (e: any) {
                          message.error(e.message || '清空失败');
                        }
                      }}
                    >清空队列</Button>
                  )}
                  <Button size="small" onClick={() => { setTaskQueueStatus(null); setBgTaskPolling(false); }}>关闭</Button>
                </div>
              </div>

              {/* 正在提交任务 */}
              {taskQueueStatus?.submitting && (
                <div className="mb-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                    <Text className="text-yellow-600 font-medium">正在提交任务...</Text>
                    <Text type="secondary" className="text-xs">正在上传视频文件到服务器</Text>
                  </div>
                </div>
              )}

              {/* 前台执行状态 */}
              {taskQueueStatus?.isFrontendRunning && (
                <div className="mb-2 p-2 bg-green-50 rounded border border-green-200">
                  <div className="flex justify-between items-center">
                    <Text className="text-green-600 font-medium">前台执行中</Text>
                    <Text type="secondary" className="text-xs">前台任务正在执行，后台任务将排队等待</Text>
                  </div>
                </div>
              )}

              {/* 执行中的任务 */}
              {taskQueueStatus?.running?.map((task, idx) => (
                <div key={task.id} className="mb-2 p-2 bg-white rounded border border-blue-200">
                  <div className="flex justify-between items-center">
                    <Text className="text-blue-600 font-medium">后台执行中</Text>
                    <div className="flex items-center gap-2">
                      <Text type="secondary" className="text-xs">{task.id}</Text>
                      <Button
                        size="small"
                        danger
                        onClick={async () => {
                          try {
                            const resp = await (await import('@/lib/api')).cancelMatrixTask(task.id);
                            if (resp.status === 'success') {
                              message.success('任务已取消');
                            } else {
                              message.error(resp.message || '取消失败');
                            }
                          } catch (e: any) {
                            message.error(e.message || '取消失败');
                          }
                        }}
                      >取消</Button>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-1 flex-wrap">
                    <Text type="secondary">进度：<Text>{task.progress?.exported || 0}/{task.progress?.total || 0} 导出，{task.progress?.evaluated || 0} 评估</Text></Text>
                  </div>
                  <div className="flex gap-3 mt-1 flex-wrap text-xs text-gray-500">
                    <span>编码器: {task.config?.encoder}{task.config?.nvencCodec ? `(${task.config.nvencCodec})` : ''}</span>
                    {task.config?.presets && <span>presets: {task.config.presets}</span>}
                    {task.config?.rcMode && <span>rc: {task.config.rcMode}</span>}
                    {task.config?.cqValues && <span>cq: {task.config.cqValues}</span>}
                    {task.config?.qpValues && <span>qp: {task.config.qpValues}</span>}
                    {task.config?.bitrates && task.config.bitrates !== '0' && <span>bitrate: {task.config.bitrates}</span>}
                    {task.config?.skipVmaf && <span className="text-orange-500">跳过VMAF</span>}
                  </div>
                </div>
              ))}

              {/* 等待中的任务 */}
              {taskQueueStatus?.pending?.map((task, idx) => (
                <div key={task.id} className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="flex justify-between items-center">
                    <Text className="text-gray-500">等待中（队列位置：{idx + 1}）</Text>
                    <div className="flex items-center gap-2">
                      <Text type="secondary" className="text-xs">{task.id}</Text>
                      <Button
                        size="small"
                        danger
                        onClick={async () => {
                          try {
                            const resp = await (await import('@/lib/api')).cancelMatrixTask(task.id);
                            if (resp.status === 'success') {
                              message.success('任务已取消');
                            } else {
                              message.error(resp.message || '取消失败');
                            }
                          } catch (e: any) {
                            message.error(e.message || '取消失败');
                          }
                        }}
                      >取消</Button>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1 flex-wrap text-xs text-gray-500">
                    <span>编码器: {task.config?.encoder}{task.config?.nvencCodec ? `(${task.config.nvencCodec})` : ''}</span>
                    {task.config?.presets && <span>presets: {task.config.presets}</span>}
                    {task.config?.rcMode && <span>rc: {task.config.rcMode}</span>}
                    {task.config?.cqValues && <span>cq: {task.config.cqValues}</span>}
                    {task.config?.qpValues && <span>qp: {task.config.qpValues}</span>}
                    {task.config?.bitrates && task.config.bitrates !== '0' && <span>bitrate: {task.config.bitrates}</span>}
                    {task.config?.skipVmaf && <span className="text-orange-500">跳过VMAF</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">创建时间：{new Date(task.createdAt).toLocaleString()}</div>
                </div>
              ))}

              {/* 队列为空 */}
              {taskQueueStatus && taskQueueStatus.running?.length === 0 && taskQueueStatus.pending?.length === 0 && (
                <div className="text-center text-gray-400 py-2">当前没有后台任务</div>
              )}
            </div>
            )}
            <Modal
              open={historyModalVisible}
              title="历史任务查询"
              onCancel={() => { setHistoryModalVisible(false); setHistoryTaskResult(null); setHistoryTaskId(''); }}
              footer={null}
              width={1000}
              style={{ top: 20 }}
            >
              <div className="mb-4">
                <Text className="block mb-2">按任务ID查询：</Text>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={historyTaskId}
                    onChange={(e) => setHistoryTaskId(e.target.value)}
                    className="border rounded px-2 py-1 flex-1"
                    placeholder="task_1234567890_abc123"
                  />
                  <Button
                    type="primary"
                    loading={historyLoading}
                    onClick={async () => {
                      if (!historyTaskId.trim()) {
                        message.warning('请输入任务ID');
                        return;
                      }
                      setHistoryLoading(true);
                      try {
                        const resp = await (await import('@/lib/api')).getMatrixTaskStatus(historyTaskId.trim());
                        if (resp.status === 'success' && resp.task) {
                          setHistoryTaskResult(resp.task);
                        } else {
                          message.error(resp.message || '任务不存在');
                          setHistoryTaskResult(null);
                        }
                      } catch (e: any) {
                        message.error(e.message || '查询失败');
                        setHistoryTaskResult(null);
                      } finally {
                        setHistoryLoading(false);
                      }
                    }}
                  >查询</Button>
                </div>
              </div>
              {historyTaskResult && (
                <div className="p-3 border rounded bg-gray-50 mb-4">
                  <div className="mb-2">
                    <Text strong>任务ID：</Text>
                    <Text className="ml-2">{historyTaskResult.id}</Text>
                  </div>
                  <div className="mb-2">
                    <Text strong>状态：</Text>
                    <Text className={`ml-2 ${historyTaskResult.status === 'completed' ? 'text-green-600' : historyTaskResult.status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
                      {historyTaskResult.status === 'running' ? '执行中' : historyTaskResult.status === 'completed' ? '已完成' : historyTaskResult.status === 'failed' ? '失败' : historyTaskResult.status}
                    </Text>
                  </div>
                  <div className="mb-2">
                    <Text strong>创建时间：</Text>
                    <Text className="ml-2">{historyTaskResult.createdAt || '-'}</Text>
                  </div>
                  <div className="mb-2">
                    <Text strong>进度：</Text>
                    <Text className="ml-2">
                      总任务 {historyTaskResult.progress?.total || 0} / 已导出 {historyTaskResult.progress?.exported || 0} / 已评估 {historyTaskResult.progress?.evaluated || 0}
                    </Text>
                  </div>
                  {historyTaskResult.csvUrl && (
                    <div className="mb-2">
                      <Text strong>CSV文件：</Text>
                      <a href={historyTaskResult.csvUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:text-blue-800">{historyTaskResult.csvUrl}</a>
                      <Button size="small" className="ml-2" onClick={() => window.open(historyTaskResult.csvUrl, '_blank')}>下载CSV</Button>
                    </div>
                  )}
                  {historyTaskResult.error && (
                    <div className="mb-2">
                      <Text strong>错误信息：</Text>
                      <Text type="danger" className="ml-2">{historyTaskResult.error}</Text>
                    </div>
                  )}
                  {(historyTaskResult.status === 'running' || historyTaskResult.status === 'pending') && (
                    <Button
                      size="small"
                      className="mt-2"
                      onClick={() => {
                        setBgTaskPolling(true);
                        setHistoryModalVisible(false);
                        message.success('已开启队列监控');
                      }}
                    >开启队列监控</Button>
                  )}
                </div>
              )}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <Text strong>历史任务记录（最近50条）</Text>
                  <Button size="small" loading={historyListLoading} onClick={loadServerTaskHistory}>刷新</Button>
                </div>
                {historyListLoading ? (
                  <Text type="secondary">加载中...</Text>
                ) : serverTaskHistory.length === 0 ? (
                  <Text type="secondary">暂无历史记录</Text>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-100">
                          <th className="text-left py-2 px-2">任务ID</th>
                          <th className="text-left py-2 px-2">状态</th>
                          <th className="text-left py-2 px-2">编码器</th>
                          <th className="text-left py-2 px-2">进度</th>
                          <th className="text-left py-2 px-2">创建时间</th>
                          <th className="text-left py-2 px-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serverTaskHistory.map((record, idx) => (
                          <tr key={record.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="py-2 px-2 font-mono text-xs truncate max-w-[150px]" title={record.id}>{record.id}</td>
                            <td className="py-2 px-2">
                              <span className={record.status === 'completed' ? 'text-green-600' : record.status === 'failed' ? 'text-red-600' : 'text-blue-600'}>
                                {record.status === 'running' ? '执行中' : record.status === 'completed' ? '已完成' : record.status === 'failed' ? '失败' : record.status}
                              </span>
                            </td>
                            <td className="py-2 px-2">{record.encoder}</td>
                            <td className="py-2 px-2 text-xs">{record.evaluated}/{record.taskCount}</td>
                            <td className="py-2 px-2 text-xs">{new Date(record.createdAt).toLocaleString()}</td>
                            <td className="py-2 px-2 flex gap-1">
                              <Button
                                size="small"
                                type="link"
                                className="p-0"
                                onClick={async () => {
                                  setHistoryTaskId(record.id);
                                  setHistoryLoading(true);
                                  try {
                                    const resp = await (await import('@/lib/api')).getMatrixTaskStatus(record.id);
                                    if (resp.status === 'success' && resp.task) {
                                      setHistoryTaskResult(resp.task);
                                    } else {
                                      message.error(resp.message || '任务不存在');
                                      setHistoryTaskResult(null);
                                    }
                                  } catch (e: any) {
                                    message.error(e.message || '查询失败');
                                    setHistoryTaskResult(null);
                                  } finally {
                                    setHistoryLoading(false);
                                  }
                                }}
                              >详情</Button>
                              {record.csvUrl && (
                                <Button size="small" type="link" className="p-0" onClick={() => window.open(record.csvUrl, '_blank')}>CSV</Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Modal>
            <Modal open={csvModalVisible} title="导出评估CSV" onCancel={() => setCsvModalVisible(false)} onOk={() => {
              try {
                const header = [
                  'encoder','preset','b_v','maxrate','bufsize','rc','cq','qp','temporal_aq','spatial_aq','profile','nvenc_codec','tune','multipass','rc_lookahead','minrate','output_file','overall','vmaf','psnr_db','ssim','bitrate_after_kbps','export_duration_seconds','download_url','saved_path','eval_json_url','ffmpeg_command'
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
                    String(p.qp ?? ''),
                    String((p.temporal_aq ?? 1)),
                    String((p.spatial_aq ?? 1)),
                    String(p.profile ?? ''),
                    String(p.nvenc_codec ?? ''),
                    String(p.tune ?? ''),
                    String(p.multipass ?? ''),
                    String(p.rc_lookahead ?? ''),
                    String(p.minrate ?? ''),
                    j.outputFilename,
                    Number(j.evalSummary?.overall ?? 0).toFixed(4),
                    String(j.evalSummary?.vmaf ?? ''),
                    String(j.evalSummary?.psnr ?? ''),
                    String(j.evalSummary?.ssim ?? ''),
                    String(j.evalSummary?.bitrate_after_kbps ?? ''),
                    j.exportDurationMs != null ? (Number(j.exportDurationMs)/1000).toFixed(2) : '',
                    j.downloadUrl || '',
                    j.savedPath || '',
                    j.evalSavedJsonPath || '',
                    j.command || ''
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
                      {job.savedPath && (
                        <div className="p-2 bg-gray-50 rounded">
                          <Text type="secondary" className="block mb-1">已保存到</Text>
                          <Text className="break-all">{job.savedPath}</Text>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button type="dashed" onClick={() => {
                          if (!job.downloadUrl) { message.warning('该条目尚未完成导出'); return; }
                          const state: any = { outputUrl: job.downloadUrl, outputName: job.outputFilename };
                          if (inputFile) state.originalFile = inputFile;
                          if (job.evalSavedJsonPath) {
                            state.resultJsonUrl = `http://localhost:3000${job.evalSavedJsonPath.startsWith('/') ? job.evalSavedJsonPath : '/' + job.evalSavedJsonPath}`;
                          }
                          navigate('/', { state });
                        }}>质量评估</Button>
                      </div>
                      {job.command && (
                        <div className="p-2 bg-blue-50 rounded text-xs">
                          <Text type="secondary" className="block mb-1">FFmpeg 命令</Text>
                          <code className="break-all text-blue-700">{job.command}</code>
                        </div>
                      )}
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
