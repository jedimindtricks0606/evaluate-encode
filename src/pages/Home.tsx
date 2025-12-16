import { Layout, Row, Col, Typography, Button, Upload, Card, Space } from 'antd';
import { PlayCircleOutlined, UploadOutlined, InboxOutlined, VideoCameraOutlined, EyeOutlined } from '@ant-design/icons';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Layout/Header';
import QualityEvaluationCard from '@/components/Evaluation/QualityEvaluationCard';
import SpeedEvaluationCard from '@/components/Evaluation/SpeedEvaluationCard';
import BitrateAnalysisCard from '@/components/Evaluation/BitrateAnalysisCard';
import { useEvaluationStore } from '@/stores/evaluationStore';
import { EvaluationResults } from '@/types';
import { evaluateQuality } from '@/lib/api';
import { message } from 'antd';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Dragger } = Upload;

export default function Home() {
  const navigate = useNavigate();
  const { selectedTypes, setSelectedTypes, originalVideo, exportedVideo, setOriginalVideo, setExportedVideo } = useEvaluationStore();
  
  const [exportTime, setExportTime] = useState(30);
  const [benchmark, setBenchmark] = useState('标准测试');
  const [qualityResults, setQualityResults] = useState<EvaluationResults | null>(null);
  const [speedResults, setSpeedResults] = useState<{ rtf: number; exportTime: number } | null>(null);
  const [bitrateResults, setBitrateResults] = useState<{ ratio: number; original: number; exported: number } | null>(null);

  const originalNotifiedRef = useRef(false);
  const exportedNotifiedRef = useRef(false);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);

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

  const handleQualityEvaluate = async () => {
    try {
      if (!originalVideo?.raw || !exportedVideo?.raw) {
        message.warning('请先在下方上传原视频与导出视频');
        uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      message.loading({ content: '画质评估中...', key: 'eval', duration: 0 });
      const data = await evaluateQuality({
        before: originalVideo.raw,
        after: exportedVideo.raw,
        exportTimeSeconds: exportTime,
        weights: { quality: 0.6, speed: 0.2, bitrate: 0.2 },
        targetBitrateKbps: Math.round((originalVideo.bitrate || 0) / 1000) || undefined,
        targetRTF: 1.0,
      });
      const vmafScore = Number(data?.metrics?.vmaf ?? 0);
      const psnrAvg = Number(data?.metrics?.psnr_db ?? 0);
      const ssimScore = Number(data?.metrics?.ssim ?? 0);
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
      message.success({ content: '评估完成', key: 'eval', duration: 2 });
    } catch (err: any) {
      message.error({ content: String(err?.message || err), key: 'eval' });
    }
  };

  const handleSpeedEvaluate = () => {
    setSpeedResults({
      rtf: 1.5,
      exportTime: exportTime
    });
  };

  const handleBitrateAnalyze = async () => {
    try {
      if (!originalVideo?.raw || !exportedVideo?.raw) {
        message.warning('请先在下方上传原视频与导出视频');
        uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      message.loading({ content: '码率分析中...', key: 'bitrate', duration: 0 });
      const data = await evaluateQuality({
        before: originalVideo.raw,
        after: exportedVideo.raw,
        exportTimeSeconds: exportTime,
      });
      const original = Number(data?.metrics?.bitrate_before_bps ?? 0);
      const exported = Number(data?.metrics?.bitrate_after_bps ?? 0);
      setBitrateResults({ ratio: 0, original, exported });
      message.success({ content: '码率分析完成', key: 'bitrate', duration: 2 });
    } catch (err: any) {
      message.error({ content: String(err?.message || err), key: 'bitrate' });
    }
  };

  const handleOneClickEvaluate = () => {
    handleQualityEvaluate();
    handleSpeedEvaluate();
    handleBitrateAnalyze();
  };

  const handleUploadClick = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
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
              <Card title="原视频" className="shadow-sm" extra={originalVideo && <EyeOutlined />}>
                <Dragger {...uploadProps} onChange={handleOriginalUpload}>
                  <div className="p-8 text-center">
                    <InboxOutlined className="text-4xl text-blue-500 mb-4" />
                    <p className="text-lg font-medium mb-2">点击或拖拽上传原视频</p>
                    <p className="text-gray-500">支持 MP4, MOV, AVI 等格式</p>
                    <p className="text-gray-400 text-sm">文件大小不超过 500MB</p>
                  </div>
                </Dragger>
                {originalVideo && (
                  <div className="mt-4 p-3 bg-blue-50 rounded">
                    <Space>
                      <VideoCameraOutlined className="text-blue-600" />
                      <div>
                        <Text strong className="block">{originalVideo.name}</Text>
                        <Text type="secondary" className="text-sm">
                          {(originalVideo.size / 1024 / 1024).toFixed(1)} MB
                        </Text>
                      </div>
                    </Space>
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="导出视频" className="shadow-sm" extra={exportedVideo && <EyeOutlined />}>
                <Dragger {...uploadProps} onChange={handleExportedUpload}>
                  <div className="p-8 text-center">
                    <InboxOutlined className="text-4xl text-green-500 mb-4" />
                    <p className="text-lg font-medium mb-2">点击或拖拽上传导出视频</p>
                    <p className="text-gray-500">支持 MP4, MOV, AVI 等格式</p>
                    <p className="text-gray-400 text-sm">文件大小不超过 500MB</p>
                  </div>
                </Dragger>
                {exportedVideo && (
                  <div className="mt-4 p-3 bg-green-50 rounded">
                    <Space>
                      <VideoCameraOutlined className="text-green-600" />
                      <div>
                        <Text strong className="block">{exportedVideo.name}</Text>
                        <Text type="secondary" className="text-sm">
                          {(exportedVideo.size / 1024 / 1024).toFixed(1)} MB
                        </Text>
                      </div>
                    </Space>
                  </div>
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
              />
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  );
}
