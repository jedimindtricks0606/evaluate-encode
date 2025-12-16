import { Card, Button, Checkbox, Space, Typography, Row, Col, Modal, Progress } from 'antd';
import { LineChartOutlined, SettingOutlined } from '@ant-design/icons';
import { EvaluationType, EvaluationResults } from '@/types';
import { useState, useMemo } from 'react';

const { Title, Text } = Typography;

interface QualityEvaluationCardProps {
  selectedTypes: EvaluationType[];
  onTypeChange: (types: EvaluationType[]) => void;
  onEvaluate: () => void;
  results?: EvaluationResults;
}

export default function QualityEvaluationCard({ 
  selectedTypes, 
  onTypeChange, 
  onEvaluate,
  results 
}: QualityEvaluationCardProps) {
  const qualityTypes = [EvaluationType.VMAF, EvaluationType.PSNR, EvaluationType.SSIM];
  const [open, setOpen] = useState(false);
  
  const handleTypeChange = (type: EvaluationType, checked: boolean) => {
    if (checked) {
      onTypeChange([...selectedTypes, type]);
    } else {
      onTypeChange(selectedTypes.filter(t => t !== type));
    }
  };

  return (
    <Card 
      title="画质评估" 
      className="h-80 shadow-sm hover:shadow-md transition-shadow"
      extra={<SettingOutlined className="text-gray-400" />}
    >
      <div className="h-full flex flex-col">
        <div className="flex-1">
          <Text type="secondary" className="block mb-4">
            使用专业指标评估视频画质质量
          </Text>
          
          <Space orientation="vertical" className="w-full mb-4">
            {qualityTypes.map(type => (
              <div key={type} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <Checkbox
                  checked={selectedTypes.includes(type)}
                  onChange={(e) => handleTypeChange(type, e.target.checked)}
                >
                  <span className="font-medium">{type.toUpperCase()}</span>
                </Checkbox>
                {type === EvaluationType.VMAF && results?.vmaf && (
                  <Text type="success" className="text-sm">
                    {(results.vmaf.score ?? 0).toFixed(2)}
                  </Text>
                )}
                {type === EvaluationType.PSNR && results?.psnr && (
                  <Text type="success" className="text-sm">
                    {(results.psnr.avg ?? 0).toFixed(2)}
                  </Text>
                )}
                {type === EvaluationType.SSIM && results?.ssim && (
                  <Text type="success" className="text-sm">
                    {(results.ssim.score ?? 0).toFixed(2)}
                  </Text>
                )}
              </div>
            ))}
          </Space>

          {/* 不展示综合画质评分，仅展示右侧绿字结果 */}
        </div>

        <Row gutter={8}>
          <Col span={12}>
            <Button 
              type="primary" 
              icon={<LineChartOutlined />}
              onClick={onEvaluate}
              block
            >
              开始评估
            </Button>
          </Col>
          <Col span={12}>
            <Button block onClick={() => setOpen(true)}>查看评价标准</Button>
          </Col>
        </Row>
        <Modal open={open} onCancel={() => setOpen(false)} onOk={() => setOpen(false)} title="指标范围与评价">
          <Space orientation="vertical" className="w-full" size="large">
            <div>
              <Title level={4} className="!mb-2">VMAF</Title>
              <Text type="secondary" className="block mb-2">优秀 ≥ 90，良好 80–90，合格 60–80，较差 ＜ 60</Text>
              <div className="flex items-center gap-3">
                <Progress percent={Math.min(100, Math.max(0, (results?.vmaf?.score || 0)))} showInfo={false} strokeColor="#52c41a" className="flex-1" />
                <Text strong>{(results?.vmaf?.score ?? 0).toFixed(2)}</Text>
                <Text type="secondary">{(() => {
                  const v = results?.vmaf?.score ?? 0;
                  if (v >= 90) return '优秀';
                  if (v >= 80) return '良好';
                  if (v >= 60) return '合格';
                  return '较差';
                })()}</Text>
              </div>
            </div>
            <div>
              <Title level={4} className="!mb-2">PSNR</Title>
              <Text type="secondary" className="block mb-2">优秀 ≥ 45 dB，良好 40–45 dB，合格 35–40 dB，较差 ＜ 35 dB</Text>
              <div className="flex items-center gap-3">
                <Progress percent={Math.min(100, Math.max(0, ((results?.psnr?.avg ?? 0) - 20) / 30 * 100))} showInfo={false} strokeColor="#1890ff" className="flex-1" />
                <Text strong>{(results?.psnr?.avg ?? 0).toFixed(2)}</Text>
                <Text type="secondary">{(() => {
                  const v = results?.psnr?.avg ?? 0;
                  if (v >= 45) return '优秀';
                  if (v >= 40) return '良好';
                  if (v >= 35) return '合格';
                  return '较差';
                })()}</Text>
              </div>
            </div>
            <div>
              <Title level={4} className="!mb-2">SSIM</Title>
              <Text type="secondary" className="block mb-2">优秀 ≥ 0.95，良好 0.90–0.95，合格 0.80–0.90，较差 ＜ 0.80</Text>
              <div className="flex items-center gap-3">
                <Progress percent={Math.min(100, Math.max(0, (results?.ssim?.score || 0) * 100))} showInfo={false} strokeColor="#722ed1" className="flex-1" />
                <Text strong>{(results?.ssim?.score ?? 0).toFixed(2)}</Text>
                <Text type="secondary">{(() => {
                  const v = results?.ssim?.score ?? 0;
                  if (v >= 0.95) return '优秀';
                  if (v >= 0.9) return '良好';
                  if (v >= 0.8) return '合格';
                  return '较差';
                })()}</Text>
              </div>
            </div>
          </Space>
        </Modal>
      </div>
    </Card>
  );
}
