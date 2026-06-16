// frontend/src/components/PreviewPhone.tsx
import React from 'react';
import { Typography, Divider } from 'antd';

const { Title, Text } = Typography;

export default function PreviewPhone({ data }: { data: any }) {
  return (
    <div className="w-[320px] h-[650px] bg-[#f2f2f6] rounded-[40px] border-[12px] border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative flex flex-col shrink-0 overflow-hidden ring-1 ring-gray-200">
      {/* 顶部听筒 / 灵动岛位置 */}
      <div className="absolute top-0 inset-x-0 h-6 bg-transparent z-20 flex justify-center">
        <div className="w-32 h-6 bg-gray-100 rounded-b-3xl shadow-inner"></div>
      </div>

      {/* 顶部状态栏 */}
      <div className="h-10 w-full z-10 flex justify-between items-center px-6 text-[11px] font-medium text-gray-800 pt-2 absolute top-0">
        <span>9:41</span>
        <div className="flex space-x-1 items-center">
          <span>5G</span>
          <div className="w-5 h-2.5 border border-gray-800 rounded-sm p-[1px] relative">
            <div className="w-full h-full bg-gray-800 rounded-sm"></div>
          </div>
        </div>
      </div>

      {/* 主图展示区 */}
      <div className="h-[320px] bg-white flex items-center justify-center relative mt-0">
        {data?.mainImage ? (
          <div className="w-full h-full bg-orange-50 flex flex-col items-center justify-center text-orange-400 font-bold border-b border-orange-100">
            <span className="text-4xl mb-2">✨</span>
            [AI 合成主图展示位]
          </div>
        ) : (
          <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center text-gray-400 border-b border-gray-200">
            <span className="text-4xl mb-2">📦</span>
            <span className="text-sm">商品 1:1 主图展示</span>
          </div>
        )}
      </div>

      {/* 价格与标题区 */}
      <div className="p-4 bg-white mb-2 shadow-sm rounded-b-2xl">
        <div className="text-[#ff5000] font-bold mb-1 flex items-baseline">
          <span className="text-sm mr-1">¥</span>
          <span className="text-2xl tracking-tight">128.00</span>
          <span className="text-xs text-gray-400 line-through ml-2 font-normal">¥199.00</span>
        </div>
        <Title level={5} className="!mb-1 !mt-0 !text-[15px] !leading-snug line-clamp-2">
          {data?.title || '【商品标题】填完表单或点击生成后，这里将实时同步预览'}
        </Title>
        <Text className="text-[12px] text-[#ff5000] line-clamp-2 bg-orange-50 px-2 py-0.5 rounded mt-2 inline-block">
          {data?.guide_title || '导购标题展示区，凸显产品核心优势...'}
        </Text>
      </div>

      {/* 运费与保障区 */}
      <div className="p-3 bg-white mb-2 text-[12px] text-gray-500 space-y-2 rounded-xl mx-3 shadow-sm">
        <div className="flex justify-between items-center">
          <span>发货地: 湖北</span>
          <span>月销 500+</span>
        </div>
        <Divider className="!my-1" />
        <div className="flex space-x-2 text-gray-700">
          <span className="text-gray-400">保障</span>
          <span>假一赔十 · 极速退款 · 7天无理由</span>
        </div>
      </div>

      <div className="flex-1"></div>

      {/* 底部购买动作栏 */}
      <div className="h-16 bg-white border-t border-gray-100 flex items-center px-2 pb-2 pt-1 shadow-[0_-10px_10px_rgba(0,0,0,0.02)]">
        <div className="w-12 flex flex-col items-center justify-center text-[10px] text-gray-500 hover:text-[#ff5000] cursor-pointer">
          <span className="text-lg">🏠</span><span>店铺</span>
        </div>
        <div className="w-12 flex flex-col items-center justify-center text-[10px] text-gray-500 hover:text-[#ff5000] cursor-pointer">
          <span className="text-lg">🎧</span><span>客服</span>
        </div>
        <div className="flex-1 flex space-x-2 px-2">
          <button className="flex-1 h-9 rounded-full bg-gradient-to-r from-[#ff9000] to-[#ff5000] text-white text-sm font-bold shadow-md hover:opacity-90">
            加入购物车
          </button>
          <button className="flex-1 h-9 rounded-full bg-gradient-to-r from-[#ff5000] to-[#ff0000] text-white text-sm font-bold shadow-md hover:opacity-90">
            立即购买
          </button>
        </div>
      </div>
    </div>
  );
}