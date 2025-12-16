import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Home from "@/pages/Home";

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* 上传页面已整合到首页 */}
          {/* 历史记录功能暂时关闭 */}
        </Routes>
      </Router>
    </ConfigProvider>
  );
}
