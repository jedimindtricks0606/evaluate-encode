import { Card, Button, Typography, Row, Col, Modal } from 'antd';
import { VideoCameraOutlined, BarChartOutlined } from '@ant-design/icons';
import { useState, useMemo } from 'react';

const { Title, Text } = Typography;

interface BitrateAnalysisCardProps {
  originalBitrate?: number;
  exportedBitrate?: number;
  onAnalyze: () => void;
  results?: { ratio: number; original: number; exported: number };
  originalResolution?: string;
  exportedResolution?: string;
  originalFps?: number;
  exportedFps?: number;
  loading?: boolean;
}

export default function BitrateAnalysisCard({ 
  originalBitrate, 
  exportedBitrate, 
  onAnalyze,
  results,
  originalResolution,
  exportedResolution,
  originalFps,
  exportedFps,
  loading
}: BitrateAnalysisCardProps) {
  const [open, setOpen] = useState(false);
  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    } else if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)} Kbps`;
    }
    return `${bitrate} bps`;
  };

  const formatPerFrameSize = (bps?: number, fps?: number) => {
    const b = Number(bps || 0);
    const f = Number(fps || 0);
    if (!b || !f || f <= 0) return null;
    const bytes = b / f / 8;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB/帧`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/帧`;
    return `${Math.round(bytes)} B/帧`;
  };

  const parseHeight = (res?: string) => {
    if (!res) return undefined;
    const m = res.match(/(\d+)x(\d+)/i);
    if (m) return Number(m[2]);
    return undefined;
  };

  const resolutionMap = useMemo(() => ({
    '2160': '4K',
    '1440': '2K',
    '1080': '1080p',
    '720': '720p'
  }), []);

  const recommendedBase = useMemo(() => (
    [
      { h: 480, mbps: 1.5 },
      { h: 720, mbps: 4 },
      { h: 1080, mbps: 10 },
      { h: 1440, mbps: 16 },
      { h: 2160, mbps: 35 },
    ]
  ), []);

  const fpsSet = useMemo(() => {
    const set = new Set<number>();
    set.add(30);
    set.add(60);
    set.add(120);
    if (originalFps) set.add(Math.round(originalFps));
    if (exportedFps) set.add(Math.round(exportedFps));
    return Array.from(set).sort((a, b) => a - b);
  }, [originalFps, exportedFps]);

  const rows = useMemo(() => {
    const oMbps = originalBitrate ? originalBitrate / 1000000 : undefined;
    const eMbps = exportedBitrate ? exportedBitrate / 1000000 : undefined;
    const baseRows = recommendedBase.map(base => {
      const label = resolutionMap[String(base.h)] || `${base.h}p`;
      const cols = fpsSet.map(fps => {
        const rec = base.mbps * (fps / 30);
        return { fps, rec } as any;
      });
      return { h: base.h, label, cols } as any;
    });
    const oTargetFps = originalFps != null ? Math.round(originalFps) : null;
    const eTargetFps = exportedFps != null ? Math.round(exportedFps) : null;
    let oBest: { r: number; c: number; diff: number } | null = null;
    let eBest: { r: number; c: number; diff: number } | null = null;
    baseRows.forEach((row, rIdx) => {
      row.cols.forEach((c: any, cIdx: number) => {
        if (oMbps != null && oTargetFps != null && c.fps === oTargetFps) {
          const d = Math.abs(c.rec - oMbps);
          if (!oBest || d < oBest.diff) oBest = { r: rIdx, c: cIdx, diff: d };
        }
        if (eMbps != null && eTargetFps != null && c.fps === eTargetFps) {
          const d2 = Math.abs(c.rec - eMbps);
          if (!eBest || d2 < eBest.diff) eBest = { r: rIdx, c: cIdx, diff: d2 };
        }
      });
    });
    return baseRows.map((row, rIdx) => ({
      ...row,
      cols: row.cols.map((c: any, cIdx: number) => ({
        ...c,
        isOriginal: !!(oBest && oBest.r === rIdx && oBest.c === cIdx),
        isExported: !!(eBest && eBest.r === rIdx && eBest.c === cIdx)
      }))
    }));
  }, [recommendedBase, fpsSet, originalBitrate, exportedBitrate, originalFps, exportedFps, resolutionMap]);

  return (
    <Card 
      title="码率分析" 
      className="h-80 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="h-full flex flex-col">
        <div className="flex-1">
          <Text type="secondary" className="block mb-4">
            分析视频码率变化和压缩效率
          </Text>
          
          <div className="mb-4">
            <Row gutter={16} className="mb-3">
              <Col span={12}>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <Text type="secondary" className="text-sm">原始码率</Text>
                  <Title level={4} className="!mb-0">
                    {loading ? '计算中' : (originalBitrate != null ? formatBitrate(originalBitrate) : '未分析')}
                  </Title>
                  {originalResolution && (
                    <Text type="secondary" className="block text-xs mt-1">分辨率：{originalResolution}</Text>
                  )}
                  <Text type="secondary" className="block text-xs">帧率：{originalFps != null ? Number(originalFps).toFixed(0) + ' fps' : (loading ? '计算中' : '未分析')}</Text>
                  <Text type="secondary" className="block text-xs">单帧大小：{formatPerFrameSize(originalBitrate, originalFps) || (loading ? '计算中' : '未分析')}</Text>
                </div>
              </Col>
              <Col span={12}>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <Text type="secondary" className="text-sm">导出码率</Text>
                  <Title level={4} className="!mb-0">
                    {loading ? '计算中' : (exportedBitrate != null ? formatBitrate(exportedBitrate) : '未分析')}
                  </Title>
                  {exportedResolution && (
                    <Text type="secondary" className="block text-xs mt-1">分辨率：{exportedResolution}</Text>
                  )}
                  <Text type="secondary" className="block text-xs">帧率：{exportedFps != null ? Number(exportedFps).toFixed(0) + ' fps' : (loading ? '计算中' : '未分析')}</Text>
                  <Text type="secondary" className="block text-xs">单帧大小：{formatPerFrameSize(exportedBitrate, exportedFps) || (loading ? '计算中' : '未分析')}</Text>
                </div>
              </Col>
            </Row>

            {/* 仅展示原始与导出码率，不展示压缩效率 */}
          </div>
        </div>

        <Row gutter={8}>
          <Col span={12}>
            <Button 
              type="primary" 
              icon={<VideoCameraOutlined />}
              onClick={onAnalyze}
              disabled={loading}
              block
            >
              开始分析
            </Button>
          </Col>
          <Col span={12}>
            <Button icon={<BarChartOutlined />} block onClick={() => setOpen(true)}>码率范围对照</Button>
          </Col>
        </Row>
        <Modal open={open} onCancel={() => setOpen(false)} onOk={() => setOpen(false)} title="分辨率/帧率/推荐码率对照" width={800}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2">分辨率</th>
                  {fpsSet.map(f => (
                    <th key={f} className="text-center p-2">{f} fps</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.h}>
                    <td className="p-2 font-medium">{row.label}</td>
                    {row.cols.map(c => (
                      <td key={c.fps} className="p-2 text-center">
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            backgroundColor: c.isOriginal && c.isExported ? 'rgba(147,51,234,0.12)' : c.isOriginal ? 'rgba(34,197,94,0.15)' : c.isExported ? 'rgba(59,130,246,0.15)' : 'transparent',
                            border: c.isOriginal && c.isExported ? '1px solid rgba(147,51,234,0.6)' : c.isOriginal ? '1px solid rgba(34,197,94,0.6)' : c.isExported ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(0,0,0,0.08)'
                          }}
                        >
                          ~{c.rec.toFixed(1)} Mbps{c.isOriginal && c.isExported ? '（原/导）' : c.isOriginal ? '（原）' : c.isExported ? '（导出）' : ''}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Text type="secondary">说明：经验值基于 30fps，实际推荐码率按 fps 成比例缩放。原/导出视频所在格会高亮显示。</Text>
          </div>
        </Modal>
      </div>
    </Card>
  );
}
