import { Card, Typography, Row, Col, Progress, Button, Space } from 'antd';
import { DownloadOutlined, ShareAltOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface ResultsPanelProps {
  overallScore?: number;
  qualityScore?: number;
  speedScore?: number;
  bitrateScore?: number;
  bitrateRationalScore?: number;
  onDownloadReport?: () => void;
  onShare?: () => void;
}

export default function ResultsPanel({ 
  overallScore = 0,
  qualityScore = 0,
  speedScore = 0,
  bitrateScore = 0,
  bitrateRationalScore = 0,
  onDownloadReport,
  onShare
}: ResultsPanelProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a'; // 绿色
    if (score >= 60) return '#faad14'; // 橙色
    return '#ff4d4f'; // 红色
  };

  const getScoreText = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    return '需改进';
  };

  return (
    <Card className="shadow-sm">
      <div className="text-center mb-6">
        <Title level={2} className="!mb-2">综合评估结果</Title>
        <Text type="secondary">基于画质、速度和码率的综合评分</Text>
      </div>

      <Row gutter={24} className="mb-6">
        <Col span={8} className="text-center">
          <div className="mb-2">
            <Progress 
              type="circle" 
              percent={overallScore} 
              strokeColor={getScoreColor(overallScore)}
              size={120}
              format={() => (
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: getScoreColor(overallScore) }}>
                    {overallScore.toFixed(1)}
                  </div>
                  <div className="text-sm text-gray-500">{getScoreText(overallScore)}</div>
                </div>
              )}
            />
          </div>
          <Title level={4} className="!mb-0">综合评分</Title>
        </Col>

        <Col span={16}>
          <Space orientation="vertical" className="w-full" size="large">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Text>画质评分</Text>
                <Text strong>{qualityScore.toFixed(1)}</Text>
              </div>
              <Progress 
                percent={qualityScore} 
                strokeColor="#1890ff"
                showInfo={false}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Text>速度评分</Text>
                <Text strong>{speedScore.toFixed(1)}</Text>
              </div>
              <Progress 
                percent={speedScore} 
                strokeColor="#52c41a"
                showInfo={false}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Text>码率合理性评分</Text>
                <Text strong>{bitrateRationalScore.toFixed(1)}</Text>
              </div>
              <Progress 
                percent={bitrateRationalScore} 
                strokeColor="#531dab"
                showInfo={false}
              />
            </div>

            
          </Space>
        </Col>
      </Row>

      <div className="text-center">
        <Space>
          <Button 
            type="primary" 
            icon={<DownloadOutlined />}
            onClick={onDownloadReport}
            size="large"
          >
            下载报告
          </Button>
          <Button 
            icon={<ShareAltOutlined />}
            onClick={onShare}
            size="large"
          >
            分享结果
          </Button>
        </Space>
      </div>
    </Card>
  );
}
