// frontend/next.config.js
/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  // 允许局域网设备访问热更新
  allowedDevOrigins: ["192.168.1.7", "192.168.1.6", "localhost"],

  // 图片域名白名单（生产部署时替换为实际域名）
  images: {
    domains: ["localhost", "assets.laotuo.top"],
  },

  // 关闭 Fast Refresh，防止生成任务被页面刷新打断
  reactStrictMode: false,

  // Turbopack 空配置，消除 webpack/turbopack 混用警告
  turbopack: {},

  // @/ 路径别名（与 tsconfig.json 保持一致）
  webpack(config) {
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
};

module.exports = nextConfig;
