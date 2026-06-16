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
          >
            <Menu.Item 
              key="pinduoduo" 
              icon={<AppstoreOutlined className="text-red-500 text-lg" />}
              className="font-bold h-12"
            >
              拼多多商家后台
            </Menu.Item>
            <Menu.Item 
              key="taobao" 
              icon={<ShopOutlined className="text-orange-500 text-lg" />}
              className="font-bold h-12"
            >
              淘宝/天猫工作台
            </Menu.Item>
          </Menu>
        </Sider>

        {/* 内容区：由内部组件自己决定如何滚动 */}
        <Content className="bg-gray-100 h-full w-full relative">
          {currentPlatform === 'pinduoduo' && <PinduoduoPublish />}
          {currentPlatform === 'taobao' && <TaobaoPublish />}
        </Content>
      </Layout>
    </Layout>
  );
}