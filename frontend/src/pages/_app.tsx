// frontend/src/pages/_app.tsx
import 'antd/dist/reset.css'; // AntD 默认样式重置
import '../styles/globals.css'; // 引入 Tailwind 全局样式
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}