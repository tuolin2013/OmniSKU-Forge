// frontend/next.config.js
/** @type {import('next').NextConfig} */
const path = require("path");

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  // 允许局域网设备访问热更新
  allowedDevOrigins: ["192.168.1.7", "192.168.1.6", "localhost"],

  // 图片生成最长需要 300 秒，将 dev 代理超时延长到 360 秒（默认只有 30 秒）
  experimental: {
    proxyTimeout: 360_000,
  },

  // 将 /api/* 请求代理到后端，解决局域网访问时浏览器无法直连 127.0.0.1:8000 的问题
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },

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
