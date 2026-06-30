// frontend/src/pages/index.tsx
import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { ShopOutlined, AppstoreOutlined, BuildOutlined } from '@ant-design/icons';
import TaobaoPublish from '../components/TaobaoPublish';
import PinduoduoPublish from '../components/PinduoduoPublish';
import R2GalleryManager from '../components/R2GalleryManager';

const { Header, Sider, Content } = Layout;

export default function MainDashboard() {
  const [currentPlatform, setCurrentPlatform] = useState('pinduoduo');
  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem('omni_current_platform');
    if (saved) {
      setCurrentPlatform(saved);
    }
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (isMounted) {
      localStorage.setItem('omni_current_platform', currentPlatform);
    }
  }, [currentPlatform, isMounted]);

  React.useEffect(() => {
    // 防止在长时间生成过程中，切换窗口导致 Next.js HMR 触发全页刷新或浏览器冻结标签页
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '有正在进行的生成任务或未保存的数据，确定要离开吗？';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    // 修复1：使用 h-screen w-screen 彻底锁定视口，防止被子元素撑爆
    <Layout className="h-screen w-screen overflow-hidden flex flex-col">
      
      {/* 修复2：强制重写内联高度，消除顶部缝隙 */}
      <Header 
        className="bg-[#001529] flex items-center shadow-md z-10 shrink-0" 
        style={{ height: '56px', padding: '0 24px' }}
      >
        <div className="text-xl font-black flex items-center tracking-tighter text-white">
          <BuildOutlined className="mr-2 text-2xl text-blue-400" />
          <span>OmniSKU-Forge</span>
          <span className="ml-3 text-xs text-gray-300 font-normal bg-slate-800 px-2 py-1 rounded">
            多端合一商品发布引擎
          </span>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <R2GalleryManager />
        </div>
      </Header>

      <Layout className="flex-1 overflow-hidden">
        {/* 修复3：显式声明 theme="light"，彻底干掉左下角的黑色狗皮膏药 */}
        <Sider width={220} theme="light" className="border-r border-gray-200 shadow-sm z-0 flex flex-col">
          <div className="p-4 text-xs font-bold text-gray-400 tracking-widest uppercase shrink-0 bg-white">
            选择分发平台
          </div>
          <Menu
            mode="inline"
            theme="light"
            selectedKeys={[currentPlatform]}
            onClick={(e) => setCurrentPlatform(e.key)}
            className="border-r-0 flex-1 overflow-y-auto"
            items={[
              {
                key: 'pinduoduo',
                icon: <AppstoreOutlined className="text-red-500 text-lg" />,
                label: '拼多多商家后台',
                className: 'font-bold h-12',
              },
              {
                key: 'taobao',
                icon: <ShopOutlined className="text-orange-500 text-lg" />,
                label: '淘宝/天猫工作台',
                className: 'font-bold h-12',
              },
            ]}
          />

        </Sider>

        {/* 内容区：由内部组件自己决定如何滚动 */}
        <Content className="bg-gray-100 h-full w-full relative">
          <div style={{ display: currentPlatform === 'pinduoduo' ? 'block' : 'none', height: '100%', width: '100%' }}>
            <PinduoduoPublish />
          </div>
          <div style={{ display: currentPlatform === 'taobao' ? 'block' : 'none', height: '100%', width: '100%' }}>
            <TaobaoPublish />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}