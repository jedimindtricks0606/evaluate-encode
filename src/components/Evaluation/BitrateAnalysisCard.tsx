import { Card, Button, Typography, Row, Col, Progress } from 'antd';
import { VideoCameraOutlined, BarChartOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface BitrateAnalysisCardProps {
  originalBitrate?: number;
  exportedBitrate?: number;
  onAnalyze: () => void;
  results?: { ratio: number; original: number; exported: number };
}

export default function BitrateAnalysisCard({ 
  originalBitrate, 
  exportedBitrate, 
  onAnalyze,
  results 
}: BitrateAnalysisCardProps) {
  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    } else if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)} Kbps`;
    }
    return `${bitrate} bps`;
  };

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
                    {originalBitrate ? formatBitrate(originalBitrate) : '未上传'}
                  </Title>
                </div>
              </Col>
              <Col span={12}>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <Text type="secondary" className="text-sm">导出码率</Text>
                  <Title level={4} className="!mb-0">
                    {exportedBitrate ? formatBitrate(exportedBitrate) : '未上传'}
                  </Title>
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
              block
            >
              开始分析
            </Button>
          </Col>
          <Col span={12}>
            <Button icon={<BarChartOutlined />} block>码率图表</Button>
          </Col>
        </Row>
      </div>
    </Card>
  );
}
