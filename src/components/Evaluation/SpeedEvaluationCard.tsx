import { Card, InputNumber, Space, Typography } from 'antd';

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
      title="导出速度" 
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

            {/* 删除导出速度评估的结果展示 */}
          </Space>
        </div>

        
      </div>
    </Card>
  );
}
