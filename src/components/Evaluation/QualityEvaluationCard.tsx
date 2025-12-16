import { Card, Button, Checkbox, Space, Typography, Row, Col } from 'antd';
import { LineChartOutlined, SettingOutlined } from '@ant-design/icons';
import { EvaluationType, EvaluationResults } from '@/types';

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
            <Button block>查看图表</Button>
          </Col>
        </Row>
      </div>
    </Card>
  );
}
