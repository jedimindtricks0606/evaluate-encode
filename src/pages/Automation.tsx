import { Layout, Typography, Card, Space, Button, Upload, Row, Col, message } from 'antd';
import { InboxOutlined, PlayCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Layout/Header';
import { useEvaluationStore } from '@/stores/evaluationStore';
import { useAutomationStore } from '@/stores/automationStore';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Dragger } = Upload;

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
        <Title level={2} className="!mb-4">自动化测试</Title>
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
            </div>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
