import { Layout, Button } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Header: AntHeader } = Layout;

interface HeaderProps {
  onOneClickEvaluate?: () => void;
  showOneClickEvaluate?: boolean;
}

export default function Header({ onOneClickEvaluate, showOneClickEvaluate = true }: HeaderProps) {
  return (
    <AntHeader className="bg-white shadow-sm px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Link to="/" className="text-xl font-bold text-blue-600">
          视频导出评估
        </Link>
        <Link to="/automation" className="text-sm text-gray-600 hover:text-blue-600">
          自动化测试
        </Link>
      </div>
      
      <div className="flex items-center space-x-4">
        {showOneClickEvaluate && (
          <Button 
            type="primary" 
            icon={<PlayCircleOutlined />}
            size="large"
            className="h-12 px-6"
            onClick={onOneClickEvaluate}
          >
            一键评估
          </Button>
        )}
        {/* 历史记录与登录暂时关闭 */}
      </div>
    </AntHeader>
  );
}
