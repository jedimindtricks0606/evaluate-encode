import { Layout, Table, Card, Button, Space, Tag, Typography } from 'antd';
import { EyeOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Layout/Header';

const { Content } = Layout;
const { Title, Text } = Typography;

const mockHistoryData = [
  {
    id: '1',
    originalVideo: { name: 'sample_video_original.mp4' },
    exportedVideo: { name: 'sample_video_exported.mp4' },
    score: 85.5,
    status: 'completed',
    createdAt: '2024-01-15 14:30:25',
    evaluationTypes: ['vmaf', 'psnr', 'speed', 'bitrate'],
  },
  {
    id: '2',
    originalVideo: { name: 'demo_clip_original.mov' },
    exportedVideo: { name: 'demo_clip_exported.mov' },
    score: 72.3,
    status: 'completed',
    createdAt: '2024-01-14 16:45:12',
    evaluationTypes: ['vmaf', 'speed'],
  },
  {
    id: '3',
    originalVideo: { name: 'test_footage_original.mp4' },
    exportedVideo: { name: 'test_footage_exported.mp4' },
    score: null,
    status: 'processing',
    createdAt: '2024-01-15 10:20:18',
    evaluationTypes: ['vmaf', 'psnr', 'ssim', 'speed', 'bitrate'],
  },
];

export default function HistoryPage() {
  const navigate = useNavigate();

  const handleViewResult = (record: (typeof mockHistoryData)[number]) => {
    navigate(`/result/${record.id}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'processing':
        return 'blue';
      case 'failed':
        return 'red';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'processing':
        return '处理中';
      case 'failed':
        return '失败';
      default:
        return '未知';
    }
  };

  const columns = [
    {
      title: '原视频',
      dataIndex: ['originalVideo', 'name'],
      key: 'originalVideo',
      render: (text: string) => <Text ellipsis style={{ maxWidth: 200 }}>{text}</Text>,
    },
    {
      title: '导出视频',
      dataIndex: ['exportedVideo', 'name'],
      key: 'exportedVideo',
      render: (text: string) => <Text ellipsis style={{ maxWidth: 200 }}>{text}</Text>,
    },
    {
      title: '评分',
      dataIndex: 'score',
      key: 'score',
      render: (score: number | null) => (
        <Text strong style={{ color: score && score >= 80 ? '#52c41a' : score && score >= 60 ? '#faad14' : '#ff4d4f' }}>
          {score ? score.toFixed(1) : '-'}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      ),
    },
    {
      title: '评估类型',
      dataIndex: 'evaluationTypes',
      key: 'evaluationTypes',
      render: (types: string[]) => (
        <Space size="small">
          {types.map(type => (
            <Tag key={type}>
              {type.toUpperCase()}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => <Text type="secondary">{text}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: (typeof mockHistoryData)[number]) => (
        <Space size="small">
          <Button 
            type="text" 
            icon={<EyeOutlined />}
            onClick={() => handleViewResult(record)}
          >
            查看
          </Button>
          <Button 
            type="text" 
            icon={<DownloadOutlined />}
            disabled={record.status !== 'completed'}
          >
            下载
          </Button>
          <Button 
            type="text" 
            danger
            icon={<DeleteOutlined />}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Layout className="min-h-screen bg-gray-50">
      <Header />
      
      <Content className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Title level={2}>评估历史</Title>
            <Text type="secondary">查看和管理您的视频评估历史记录</Text>
          </div>

          <Card className="shadow-sm">
            <Table
              columns={columns}
              dataSource={mockHistoryData}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
              }}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
}
