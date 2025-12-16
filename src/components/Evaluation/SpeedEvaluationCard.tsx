import { Card, Button, InputNumber, Space, Typography, Row, Col } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface SpeedEvaluationCardProps {
  exportTime: number;
  onExportTimeChange: (time: number) => void;
  benchmark: number;
  onBenchmarkChange: (benchmark: number) => void;
  onEvaluate: () => void;
  results?: { rtf: number; exportTime: number; relative?: number };
}

export default function SpeedEvaluationCard({ 
  exportTime, 
  onExportTimeChange, 
  benchmark,
  onBenchmarkChange,
  onEvaluate,
  results 
}: SpeedEvaluationCardProps) {
  return (
    <Card 
      title="导出速度评估" 
      className="h-80 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="h-full flex flex-col">
        <div className="flex-1">
          <Text type="secondary" className="block mb-4">
            评估视频导出速度和性能表现
          </Text>
          
          <Space orientation="vertical" className="w-full mb-4" size="large">
            <div>
              <Text className="block mb-2">Benchmark 导出时间 (秒)</Text>
              <InputNumber
                min={0.1}
                step={0.1}
                value={benchmark}
                onChange={(val) => onBenchmarkChange(val || 0)}
                className="w-full"
                placeholder="请输入基准导出时间"
              />
            </div>

            <div>
              <Text className="block mb-2">本次导出时间 (秒)</Text>
              <InputNumber
                min={0.1}
                step={0.1}
                value={exportTime}
                onChange={(val) => onExportTimeChange(val || 0)}
                className="w-full"
                placeholder="请输入导出时间"
              />
            </div>

            {results && (
              <div className="bg-green-50 p-3 rounded">
                <Text type="secondary" className="text-sm">实时因子 (RTF)</Text>
                <Title level={3} className="!mb-0 text-green-600">
                  {results.rtf?.toFixed(2) || '0.00'}
                </Title>
                <Text type="secondary" className="text-xs">
                  {results.rtf >= 1 ? '快于实时' : '慢于实时'}
                </Text>
                <div className="mt-2">
                  <Text type="secondary" className="text-sm">相对基准</Text>
                  <Title level={5} className="!mb-0">
                    {(results.relative ?? 0).toFixed(2)}x {((results.relative ?? 0) >= 1 ? '快于基准' : '慢于基准')}
                  </Title>
                </div>
              </div>
            )}
          </Space>
        </div>

        <Row gutter={8}>
          <Col span={24}>
            <Button 
              type="primary" 
              icon={<ClockCircleOutlined />}
              onClick={onEvaluate}
              block
            >
              计算RTF
            </Button>
          </Col>
        </Row>
      </div>
    </Card>
  );
}
