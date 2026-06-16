// frontend/src/components/PinduoduoPublish.tsx
// Version: 4.4 (Fixed Silent Failure in Title Generation)
import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Select, message, Divider, Modal, Spin, Upload, Image, Cascader } from 'antd';
import { 
  RobotOutlined, PictureOutlined, ThunderboltOutlined, 
  VideoCameraOutlined, CloudOutlined, UploadOutlined, RocketOutlined, EditOutlined, DownloadOutlined, CloseCircleOutlined, LoadingOutlined
} from '@ant-design/icons';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const RENDER_MODELS = [
  { id: 'gpt-image-2', label: 'gpt-image-2 (特价版)', color: 'blue' },
  { id: 'gpt-image-2-vip', label: 'gpt-image-2-vip (直连满血)', color: 'purple' },
  { id: 'nano-banana-pro', label: 'nano-banana-pro (顶配超清)', color: 'red' },
];

const TEXT_MODELS = [
  { id: 'gpt-5.5', label: 'gpt-5.5 (高级推理)', color: 'blue' },
  { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash (极速响应)', color: 'purple' },
];

  export default function PinduoduoPublish() {
    const [form] = Form.useForm();
    
  const [catalogTree, setCatalogTree] = useState([]);
  // Cascader stores the full path array; we keep the resolved leaf string separately
  const [selectedSkuName, setSelectedSkuName] = useState<string>('');

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/catalog/tree')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          setCatalogTree(data.data);
        }
      })
      .catch(err => {
        console.error('获取类目树失败:', err);
      });
  }, []);

  const [parsing, setParsing] = useState(false);             
  const [parsingModel, setParsingModel] = useState<string>('gpt-5.5');
  const [generatingTitle, setGeneratingTitle] = useState(false); 
  const [titleModel, setTitleModel] = useState<string>('gpt-5.5');
  
  // 🚀 状态解耦：主图与详情页生成状态物理隔离
  const [generatingMainImages, setGeneratingMainImages] = useState(false);
  const [mainImageModel, setMainImageModel] = useState<string>('');
  const [mainRenderProgress, setMainRenderProgress] = useState("");

  const [generatingDetailImages, setGeneratingDetailImages] = useState(false);
  const [detailImageModel, setDetailImageModel] = useState<string>('');
  const [detailRenderProgress, setDetailRenderProgress] = useState("");

  const [generatingWhiteBgImages, setGeneratingWhiteBgImages] = useState(false);
  const [whiteBgImageModel, setWhiteBgImageModel] = useState<string>('');
  const [whiteBgRenderProgress, setWhiteBgRenderProgress] = useState("");
  const [whiteBgImages, setWhiteBgImages] = useState<string[]>(Array(5).fill(''));
  const [downloadingWhiteBg, setDownloadingWhiteBg] = useState(false);

  const [generatingSkuImages, setGeneratingSkuImages] = useState(false);
  const [skuImageModel, setSkuImageModel] = useState<string>('');
  const [skuRenderProgress, setSkuRenderProgress] = useState("");
  const [skuImages, setSkuImages] = useState<string[]>(Array(5).fill(''));
  const [downloadingSku, setDownloadingSku] = useState(false);

  const [generatingBuyerShows, setGeneratingBuyerShows] = useState(false);
  const [buyerShowModel, setBuyerShowModel] = useState<string>('');
  const [buyerShowProgress, setBuyerShowProgress] = useState("");
  const [buyerShowImages, setBuyerShowImages] = useState<string[]>(Array(5).fill(''));
  const [buyerShowTexts, setBuyerShowTexts] = useState<string[]>(Array(5).fill(''));
  const [buyerShowCount, setBuyerShowCount] = useState<number>(5);
  const [buyerShowR2Images, setBuyerShowR2Images] = useState<string[]>([]);

  const [runningOneClick, setRunningOneClick] = useState(false);
  const [finalAdUrl, setFinalAdUrl] = useState<string | null>(null);

  // 🛑 终止生成控制器
  const abortControllers = useRef<Record<string, AbortController | null>>({
    main: null,
    detail: null,
    whitebg: null,
    sku: null,
    buyerShow: null,
    video: null
  });

  const stopGeneration = (type: string) => {
    if (abortControllers.current[type]) {
      abortControllers.current[type]?.abort();
      abortControllers.current[type] = null;
      message.info('🛑 已手动终止生成');
    }
  };

  const [generatingVideo, setGeneratingVideo] = useState(false); 
  const [videoRenderProgress, setVideoRenderProgress] = useState("");
  const [videoClips, setVideoClips] = useState<string[]>(Array(12).fill(''));
  const [generatingDetails, setGeneratingDetails] = useState(false); 
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadingDetails, setDownloadingDetails] = useState(false);

  // === 🚀 全局任务状态收集 ===
  const activeTasks = [
    { name: "生成图文策划案", active: parsing, status: "执行中..." },
    { name: "生成高转化标题", active: generatingTitle, status: "执行中..." },
    { name: "生成主图", active: generatingMainImages, status: mainRenderProgress },
    { name: "排版详情页", active: generatingDetails, status: detailRenderProgress },
    { name: "生成白底图", active: generatingWhiteBgImages, status: whiteBgRenderProgress },
    { name: "生成SKU图", active: generatingSkuImages, status: skuRenderProgress },
    { name: "生成买家秀", active: generatingBuyerShows, status: buyerShowProgress },
    { name: "组装一键海报", active: runningOneClick, status: "工业级海报组装中..." },
    { name: "生成视频矩阵", active: generatingVideo, status: videoRenderProgress }
  ].filter(t => t.active);

  const [selectedR2Images, setSelectedR2Images] = useState<string[]>([]); 
  const [isR2ModalVisible, setIsR2ModalVisible] = useState(false);
  const [r2ModalTarget, setR2ModalTarget] = useState<'global' | 'buyerShow'>('global');
  const [r2Gallery, setR2Gallery] = useState<string[]>([]);
  const [fetchingR2, setFetchingR2] = useState(false);
  const [uploadingR2, setUploadingR2] = useState(false); 
  const [r2Page, setR2Page] = useState(1);
  const [hasMoreR2, setHasMoreR2] = useState(false);

    const [mainImages, setMainImages] = useState<string[]>(Array(10).fill(''));

    const handleFormChange = () => { /* no-op */ };

    const fetchR2Images = async (page: number, append: boolean = false) => {
    setFetchingR2(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/v1/r2/images?page=${page}&limit=20`);
      if (!response.ok) throw new Error(`后端未响应 (HTTP ${response.status})`);
      const resData = await response.json();
      if (resData.code === 200) {
        if (append) {
          setR2Gallery(prev => [...prev, ...resData.data.urls]);
        } else {
          setR2Gallery(resData.data.urls);
        }
        setHasMoreR2(resData.data.has_more);
        setR2Page(page);
      }
    } catch (err: any) {
      message.error(`拉取 R2 图库失败: ${err.message}`);
    } finally {
      setFetchingR2(false);
    }
  };

  const openR2Modal = (target: 'global' | 'buyerShow' = 'global') => {
    setR2ModalTarget(target);
    setIsR2ModalVisible(true);
    if (r2Gallery.length === 0) fetchR2Images(1, false);
  };

  const toggleR2ImageSelection = (url: string) => {
    if (r2ModalTarget === 'global') {
      setSelectedR2Images(prev => {
        if (prev.includes(url)) return prev.filter(u => u !== url);
        if (prev.length >= 3) {
          message.warning('最多只能选择3张原图！');
          return prev;
        }
        return [...prev, url];
      });
    } else {
      setBuyerShowR2Images(prev => {
        if (prev.includes(url)) return prev.filter(u => u !== url);
        if (prev.length >= 5) {
          message.warning('最多只能选择5张买家秀原图！');
          return prev;
        }
        return [...prev, url];
      });
    }
  };

  const handleR2Upload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    setUploadingR2(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/r2/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`后端连不上 (HTTP ${res.status})`);
      const data = await res.json();
      if (data.code === 200) {
        message.success('✅ 成功推送到云端对象存储！');
        onSuccess(data, file);
        if (r2ModalTarget === 'global') {
          setSelectedR2Images(prev => [data.data.url, ...prev].slice(0, 3));
        } else {
          setBuyerShowR2Images(prev => [data.data.url, ...prev].slice(0, 5));
        }
        fetchR2Images(1, false);
      } else {
        throw new Error(data.message);
      }
    } catch (e: any) {
      message.error(` 上传失败: ${e.message}`);
      onError(e);
    } finally {
      setUploadingR2(false);
    }
  };

  const handleRunOneClickPipeline = async () => {
    const skuName = selectedSkuName;
    const bossWords = form.getFieldValue('base_desc');
    
    if (!skuName) return message.warning('请先在下拉框选择目标产品 (SKU)！');
    if (!bossWords) return message.warning('请告诉 AI 您的战术意图！');
    if (selectedR2Images.length === 0) return message.warning('请选择要合成的产品原图！');

    setRunningOneClick(true);
    message.loading({ content: ' 流水线启动！3个大脑正在狂奔，请等待约 45 秒...', key: 'one_click', duration: 0 });

    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/agents/generate-one-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platform: 'pinduoduo', 
          sku_name: skuName,
          text_desc: bossWords, 
          image_urls: selectedR2Images 
        })
      });
      
      if (!res.ok) throw new Error(`后端崩溃 (HTTP ${res.status})`);
      const data = await res.json();
      
      if (data.code === 200 && data.data?.url) {
        setFinalAdUrl(data.data.url);
        message.success({ content: ' 工业级海报组装完成！图文分离完美合成！', key: 'one_click', duration: 4 });
      } else {
        throw new Error(data.message || '系统内部异常');
      }
    } catch (err: any) {
      message.error({ content: ` 流水线崩溃: ${err.message}`, key: 'one_click', duration: 5 });
    } finally {
      setRunningOneClick(false);
    }
  };

 const handleParseFeatures = async (targetModelId: string) => {
    const skuName = selectedSkuName;
    const baseDesc = form.getFieldValue('base_desc');
    
    // 强制要求先选品
    if (!skuName) return message.warning('请先在下拉框选择核心产品 (SKU)！');
    if (!baseDesc) return message.warning('请先输入老板意图！');

    setParsingModel(targetModelId);
    setParsing(true);
    form.setFieldsValue({ pm_report: '' }); 
    message.loading({ content: '1号大脑正在研读全维度档案...', key: 'pm_stream' });

    // 180s 超时保护
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 180_000);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/agents/pm-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({ 
          platform: 'pinduoduo', 
          sku_name: skuName,
          text_desc: baseDesc, 
          image_urls: selectedR2Images,
          model: targetModelId
        })
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${errText ? `: ${errText}` : ''}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('服务器未返回流式响应');

      const decoder = new TextDecoder('utf-8');
      let currentReport = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        currentReport += decoder.decode(value, { stream: true });
        form.setFieldsValue({ pm_report: currentReport });
      }
      message.success({ content: '策划案生成完毕！', key: 'pm_stream' });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        message.error({ content: '策划案生成超时（超过180秒），请检查网络或重试', key: 'pm_stream' });
      } else {
        console.error("生成图文策划案错误:", err);
        message.error({ content: `分析中断: ${err.message}`, key: 'pm_stream' });
      }
    } finally {
      clearTimeout(timeoutId);
      setParsing(false);
    }
  };

  // 🛠 重点修复区：加上了严格的 else 分支处理错误，并增强 JSON 容错
  const handleGenerateTitle = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    const skuName = selectedSkuName;
    if (!pmReport) return message.warning('请先使用 1号大脑(基础分析) 出具会议纪要');
    if (!skuName) return message.warning('请先选择目标产品 (SKU)');

    setTitleModel(targetModelId);
    setGeneratingTitle(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/agents/ops-title', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platform: 'pinduoduo', 
          sku_name: skuName,
          pm_report: pmReport, 
          model: targetModelId 
        })
      });
      if (!response.ok) throw new Error(`后端连不上 (HTTP ${response.status})`);
      
      const data = await response.json();
      if (data.code === 200 && data.data) {
        // 增强型 JSON 提取逻辑
        let cleanJsonStr = data.data;
        if (cleanJsonStr.includes('```json')) {
          cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
        } else if (cleanJsonStr.includes('```')) {
          cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
        }
        
        const parsedData = JSON.parse(cleanJsonStr);
        // Fix: ops-title endpoint returns { title: "...", keywords: [...] } based on OmniBrain.run_ops_agent
        form.setFieldsValue({ title: (parsedData.title || parsedData.seo_titles?.[0] || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s【】]/g, '').trim() });
        message.success(' 高转化标题生成成功！');
      } else {
        throw new Error(data.message || '后端异常，请检查终端日志');
      }
    } catch (error: any) {
      message.error(` 标题生成失败: ${error.message}`);
    } finally { 
      setGeneratingTitle(false); 
    }
  };

  const handleGenerateImages = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (selectedR2Images.length === 0) return message.warning('必须选择原图！');

    setMainImageModel(targetModelId);
    setGeneratingMainImages(true);
    setMainRenderProgress(`连接 ${targetModelId} 构思分镜...`);
    
    abortControllers.current['main'] = new AbortController();
    
    try {
      const briefRes = await fetch('http://127.0.0.1:8000/api/v1/agents/design-main-image-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'pinduoduo', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！(HTTP ${briefRes.status})`);
      
      const briefData = await briefRes.json();
      if (briefData.code !== 200) throw new Error(briefData.message || '设计大脑内部错误');
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      let parsedData;
      try {
        parsedData = JSON.parse(cleanJsonStr);
      } catch (parseErr) {
        throw new Error(`设计大脑输出的规格书格式异常`);
      }

      setMainImages(Array(10).fill(''));
      const updatedImages = Array(10).fill('');
      let hasError = false;

      for (let i = 0; i < parsedData.storyboard.length && i < 10; i++) {
        if (abortControllers.current['main']?.signal.aborted) break;

        const scene = parsedData.storyboard[i];
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current['main']?.signal.aborted) break;
          
          attempts++;
          setMainRenderProgress(`【${targetModelId}】生成第 ${i + 1}/10 张...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch('http://127.0.0.1:8000/api/v1/agents/generate-image', {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['main']?.signal,
              body: JSON.stringify({ 
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                previous_image_url: i > 0 ? updatedImages[i - 1] : "",
                platform: 'pinduoduo',
                product_name: selectedSkuName || '未知产品',
                image_type: 'main'
              }) 
            });
            
            if (!drawRes.ok) throw new Error(`生图引擎网络断开 (HTTP ${drawRes.status})`);
            
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setMainImages([...updatedImages]); 
              success = true;
            } else {
              if (attempts === 3) message.error(`第 ${i + 1} 张最终生成失败: ${drawData.message}`);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true; // Exit the loop gracefully
              break;
            }
            if (attempts === 3) message.error(`第 ${i + 1} 张请求异常: ${err.message}`);
          }
        }
        
        if (!success && !abortControllers.current['main']?.signal.aborted) {
          hasError = true;
        }
      }
      
      if (abortControllers.current['main']?.signal.aborted) {
        message.warning(` 生成过程已手动终止`);
      } else {
        if (!hasError) message.success(` 10张主图全部渲染完毕！`);
        else message.warning(` 渲染结束，部分分镜生成失败。`);
      }
    } catch (error: any) {
      message.error(` 规格书生成中断: ${error.message}`);
    } finally {
      setGeneratingMainImages(false);
      setMainImageModel('');
      setMainRenderProgress("");
      abortControllers.current['main'] = null;
    }
  };

  const handleDownloadAll = async () => {
    const validImages = mainImages.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的图片！');
    
    setDownloading(true);
    message.loading({ content: '正在打包主图 ZIP...', key: 'download_main' });
    try {
      const zip = new JSZip();
      const folder = zip.folder("pinduoduo_main_images");
      
      for (let i = 0; i < validImages.length; i++) {
        const url = validImages[i];
        const response = await fetch(`http://127.0.0.1:8000/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`主图_${i + 1}.jpg`, blob);
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "pinduoduo_main_images.zip");
      message.success({ content: '全部主图打包下载完成！', key: 'download_main' });
    } catch (err) {
      message.error({ content: '打包下载失败，请检查网络', key: 'download_main' });
    } finally {
      setDownloading(false);
    }
  };

  const handleGenerateVideo = async () => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) return message.warning('请先生成策划案');
    
    setGeneratingVideo(true);
    setVideoRenderProgress("构思视频剧本中...");
    
    abortControllers.current['video'] = new AbortController();

    try {
      const scriptRes = await fetch(`http://127.0.0.1:8000/api/v1/video/design-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo' })
      });
      
      if (!scriptRes.ok) throw new Error("剧本生成失败");
      const scriptData = await scriptRes.json();
      
      let cleanJsonStr = scriptData.data;
      if (cleanJsonStr.includes('```json')) cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      const parsedData = JSON.parse(cleanJsonStr);

      const numClips = parsedData.storyboard.length || 12;
      setVideoClips(Array(numClips).fill(''));
      const updatedClips = Array(numClips).fill('');

      for (let i = 0; i < numClips; i++) {
        if (abortControllers.current['video']?.signal.aborted) break;

        const scene = parsedData.storyboard[i];
        setVideoRenderProgress(`生成视频切片 ${i + 1}/${numClips}...`);
        
        try {
          const videoRes = await fetch(`http://127.0.0.1:8000/api/v1/video/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortControllers.current['video']?.signal,
            body: JSON.stringify({ 
              prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, 
              type: 'pinduoduo_main',
              image_urls: selectedR2Images,
            })
          });
          
          const videoData = await videoRes.json();
          if (videoRes.ok && videoData.url) {
            updatedClips[i] = videoData.url;
            setVideoClips([...updatedClips]);
          } else {
             message.warning(`切片 ${i+1} 生成失败，跳过`);
          }
        } catch (err: any) {
          if (err.name === 'AbortError') break;
          console.error(err);
        }
      }
      
      if (abortControllers.current['video']?.signal.aborted) {
        message.warning(`视频生成已手动终止`);
      } else {
        message.success(`视频剧本分镜渲染完成！`);
      }

    } catch (error: any) {
      message.error(`视频生成中断: ${error.message}`);
    } finally {
      setGeneratingVideo(false);
      setVideoRenderProgress("");
      abortControllers.current['video'] = null;
    }
  };

  const handleDownloadVideos = async () => {
    const validClips = videoClips.filter(url => url);
    if (validClips.length === 0) return message.warning('没有可下载的视频片段！');
    setDownloading(true);
    message.loading({ content: '正在打包视频片段 ZIP...', key: 'download_video' });
    try {
      const zip = new JSZip();
      const folder = zip.folder('pinduoduo_video_clips');
      for (let i = 0; i < validClips.length; i++) {
        const url = validClips[i];
        const response = await fetch(`http://127.0.0.1:8000/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`拼多多视频切片_${i + 1}.mp4`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `pinduoduo_video_clips.zip`);
      message.success({ content: '全部视频片段打包下载完成！', key: 'download_video' });
    } catch (err) {
      message.error({ content: '下载失败', key: 'download_video' });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAllDetails = async () => {
    const validImages = detailImages.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的详情页图片！');
    
    setDownloadingDetails(true);
    message.loading({ content: '正在打包详情页 ZIP...', key: 'download_detail' });
    try {
      const zip = new JSZip();
      const folder = zip.folder("pinduoduo_detail_images");
      
      for (let i = 0; i < validImages.length; i++) {
        const url = validImages[i];
        const response = await fetch(`http://127.0.0.1:8000/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`详情页_${i + 1}.jpg`, blob);
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "pinduoduo_detail_images.zip");
      message.success({ content: '全部详情页图片打包下载完成！', key: 'download_detail' });
    } catch (err) {
      message.error({ content: '打包下载失败，请检查网络', key: 'download_detail' });
    } finally {
      setDownloadingDetails(false);
    }
  };
  
  const handleGenerateDetails = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (selectedR2Images.length === 0) return message.warning('必须选择原图！');

    setDetailImageModel(targetModelId);
    setGeneratingDetailImages(true); 
    setGeneratingDetails(true); 
    message.loading({ content: `连接设计大脑生成详情页分镜...`, key: 'details', duration: 0 });
    
    abortControllers.current['detail'] = new AbortController();

    try {
      const briefRes = await fetch('http://127.0.0.1:8000/api/v1/agents/design-detail-image-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'pinduoduo', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！(HTTP ${briefRes.status})`);
      
      const briefData = await briefRes.json();
      if (briefData.code !== 200) throw new Error(briefData.message || '设计大脑内部错误');
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      let parsedData;
      try { parsedData = JSON.parse(cleanJsonStr); } catch (e) { throw new Error(`设计大脑输出的规格书格式异常`); }

      const numSlices = parsedData.storyboard.length || 15;
      setDetailImages(Array(numSlices).fill('')); 
      const updatedImages = Array(numSlices).fill('');
      let hasError = false;

      for (let i = 0; i < numSlices; i++) {
        if (abortControllers.current['detail']?.signal.aborted) break;

        const scene = parsedData.storyboard[i];
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current['detail']?.signal.aborted) break;

          attempts++;
          setDetailRenderProgress(`生成第 ${i + 1}/${numSlices} 屏...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          message.loading({ content: `生成第 ${i + 1}/${numSlices} 屏...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`, key: 'details' });
          try {
            const drawRes = await fetch('http://127.0.0.1:8000/api/v1/agents/generate-image', {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['detail']?.signal,
              body: JSON.stringify({ 
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                previous_image_url: i > 0 ? updatedImages[i - 1] : "",
                platform: 'pinduoduo',
                product_name: selectedSkuName || '未知产品',
                image_type: 'detail'
              }) 
            });
            
            if (!drawRes.ok) throw new Error(`生图引擎网络断开`);
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setDetailImages([...updatedImages]); 
              success = true;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true;
              break;
            }
          }
        }
        
        if (!success && !abortControllers.current['detail']?.signal.aborted) {
          hasError = true;
        }
      }
      
      if (abortControllers.current['detail']?.signal.aborted) {
        message.warning({ content: `详情页生成过程已手动终止`, key: 'details', duration: 3 });
      } else {
        if (!hasError) message.success({ content: ` ${numSlices}屏详情页全部渲染完毕！`, key: 'details', duration: 3 });
        else message.warning({ content: ` 渲染结束，部分切片生成失败。`, key: 'details', duration: 3 });
      }
      
    } catch (error: any) {
      message.error({ content: ` 详情页生成中断: ${error.message}`, key: 'details', duration: 3 });
    } finally {
      setGeneratingDetails(false); 
      setGeneratingDetailImages(false);
      setDetailImageModel('');
      setDetailRenderProgress("");
      abortControllers.current['detail'] = null;
    }
  };

  const handleGenerateWhiteBgImages = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (selectedR2Images.length === 0) return message.warning('必须选择原图！');

    setWhiteBgImageModel(targetModelId);
    setGeneratingWhiteBgImages(true);
    setWhiteBgRenderProgress(`连接 ${targetModelId} 构思分镜...`);
    
    abortControllers.current['whitebg'] = new AbortController();

    try {
      const briefRes = await fetch('http://127.0.0.1:8000/api/v1/agents/design-white-bg-image-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'pinduoduo', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！(HTTP ${briefRes.status})`);
      
      const briefData = await briefRes.json();
      if (briefData.code !== 200) throw new Error(briefData.message || '设计大脑内部错误');
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      let parsedData;
      try { parsedData = JSON.parse(cleanJsonStr); } catch (e) { throw new Error(`设计大脑输出的规格书格式异常`); }

      const numImages = parsedData.storyboard.length || 5;
      setWhiteBgImages(Array(numImages).fill(''));
      const updatedImages = Array(numImages).fill('');
      let hasError = false;

      for (let i = 0; i < numImages; i++) {
        if (abortControllers.current['whitebg']?.signal.aborted) break;

        const scene = parsedData.storyboard[i];
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current['whitebg']?.signal.aborted) break;

          attempts++;
          setWhiteBgRenderProgress(`生成第 ${i + 1}/${numImages} 张...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch('http://127.0.0.1:8000/api/v1/agents/generate-image', {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['whitebg']?.signal,
              body: JSON.stringify({ 
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}, square 1:1 ratio, pure white background`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                previous_image_url: i > 0 ? updatedImages[i - 1] : "",
                platform: 'pinduoduo',
                product_name: selectedSkuName || '未知产品',
                image_type: 'whitebg'
              }) 
            });
            
            if (!drawRes.ok) throw new Error(`生图引擎网络断开 (HTTP ${drawRes.status})`);
            
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setWhiteBgImages([...updatedImages]); 
              success = true;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true;
              break;
            }
          }
        }
        
        if (!success && !abortControllers.current['whitebg']?.signal.aborted) {
          hasError = true;
        }
      }
      
      if (abortControllers.current['whitebg']?.signal.aborted) {
        message.warning(` 生成过程已手动终止`);
      } else {
        if (!hasError) message.success(` ${numImages}张白底图全部渲染完毕！`);
        else message.warning(` 渲染结束，部分白底图生成失败。`);
      }
    } catch (error: any) {
      message.error(` 白底图生成中断: ${error.message}`);
    } finally {
      setGeneratingWhiteBgImages(false);
      setWhiteBgImageModel('');
      setWhiteBgRenderProgress("");
      abortControllers.current['whitebg'] = null;
    }
  };

  const handleDownloadWhiteBgImages = async () => {
    const validImages = whiteBgImages.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的白底图！');
    
    setDownloadingWhiteBg(true);
    message.loading({ content: '正在打包白底图 ZIP...', key: 'download_whitebg' });
    try {
      const zip = new JSZip();
      const folder = zip.folder("pinduoduo_white_bg_images");
      
      for (let i = 0; i < validImages.length; i++) {
        const url = validImages[i];
        const response = await fetch(`http://127.0.0.1:8000/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`白底图_${i + 1}.jpg`, blob);
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "pinduoduo_white_bg_images.zip");
      message.success({ content: '全部白底图打包下载完成！', key: 'download_whitebg' });
    } catch (err) {
      message.error({ content: '打包下载失败，请检查网络', key: 'download_whitebg' });
    } finally {
      setDownloadingWhiteBg(false);
    }
  };

  const handleGenerateSkuImages = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (selectedR2Images.length === 0) return message.warning('必须选择原图！');

    setSkuImageModel(targetModelId);
    setGeneratingSkuImages(true);
    setSkuRenderProgress(`连接 ${targetModelId} 构思分镜...`);
    
    abortControllers.current['sku'] = new AbortController();

    try {
      const briefRes = await fetch('http://127.0.0.1:8000/api/v1/agents/design-sku-image-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'pinduoduo', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！(HTTP ${briefRes.status})`);
      
      const briefData = await briefRes.json();
      if (briefData.code !== 200) throw new Error(briefData.message || '设计大脑内部错误');
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      let parsedData;
      try { parsedData = JSON.parse(cleanJsonStr); } catch (e) { throw new Error(`设计大脑输出的规格书格式异常`); }

      const numImages = parsedData.storyboard.length || 5;
      setSkuImages(Array(numImages).fill(''));
      const updatedImages = Array(numImages).fill('');
      let hasError = false;

      for (let i = 0; i < numImages; i++) {
        if (abortControllers.current['sku']?.signal.aborted) break;

        const scene = parsedData.storyboard[i];
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current['sku']?.signal.aborted) break;

          attempts++;
          setSkuRenderProgress(`生成第 ${i + 1}/${numImages} 张...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch('http://127.0.0.1:8000/api/v1/agents/generate-image', {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['sku']?.signal,
              body: JSON.stringify({ 
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}, square 1:1 ratio, product quantity display`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                previous_image_url: i > 0 ? updatedImages[i - 1] : "",
                platform: 'pinduoduo',
                product_name: selectedSkuName || '未知产品',
                image_type: 'sku'
              }) 
            });
            
            if (!drawRes.ok) throw new Error(`生图引擎网络断开 (HTTP ${drawRes.status})`);
            
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setSkuImages([...updatedImages]); 
              success = true;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true;
              break;
            }
          }
        }
        
        if (!success && !abortControllers.current['sku']?.signal.aborted) {
          hasError = true;
        }
      }
      
      if (abortControllers.current['sku']?.signal.aborted) {
        message.warning(` 生成过程已手动终止`);
      } else {
        if (!hasError) message.success(` ${numImages}张SKU图全部渲染完毕！`);
        else message.warning(` 渲染结束，部分SKU图生成失败。`);
      }
    } catch (error: any) {
      message.error(` SKU图生成中断: ${error.message}`);
    } finally {
      setGeneratingSkuImages(false);
      setSkuImageModel('');
      setSkuRenderProgress("");
      abortControllers.current['sku'] = null;
    }
  };

  const handleGenerateBuyerShows = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (buyerShowR2Images.length === 0) return message.warning('必须选择买家秀原图！');

    setBuyerShowModel(targetModelId);
    setGeneratingBuyerShows(true);
    setBuyerShowProgress(`连接 ${targetModelId} 构思买家秀...`);
    
    abortControllers.current['buyerShow'] = new AbortController();

    try {
      const briefRes = await fetch('http://127.0.0.1:8000/api/v1/agents/design-buyer-show', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platform: 'pinduoduo', 
          pm_report: pmReport, 
          ops_report: form.getFieldValue('base_desc') || '',
          count: buyerShowCount 
        })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！(HTTP ${briefRes.status})`);
      const briefData = await briefRes.json();
      if (briefData.code !== 200 || !briefData.data) throw new Error(briefData.message || '设计大脑返回空数据');

      let cleanJsonStr: string = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      let parsedData: any;
      try { parsedData = JSON.parse(cleanJsonStr); } catch (e) { throw new Error('买家秀规格书格式异常，请重试'); }

      // 兼容 LLM 偶尔返回 storyboard 而不是 buyer_shows 的情况
      const rawItems = parsedData.buyer_shows || parsedData.storyboard || [];
      // 统一字段名：storyboard 里用的是 logic/scene_prompt，我们映射到 review_text/image_prompt
      const generatedItems = rawItems.map((item: any) => ({
        review_text: item.review_text || item.logic || '',
        image_prompt: item.image_prompt || item.scene_prompt || '',
      }));

      if (generatedItems.length === 0) throw new Error('买家秀规格书返回了空数组，请重试');
      const numImages = Math.min(buyerShowCount, generatedItems.length);
      
      setBuyerShowImages(Array(numImages).fill(''));
      setBuyerShowTexts(Array(numImages).fill(''));
      
      const updatedImages = Array(numImages).fill('');
      const updatedTexts = Array(numImages).fill('');

      for (let i = 0; i < numImages; i++) {
        if (abortControllers.current['buyerShow']?.signal.aborted) break;

        const scene = generatedItems[i];
        updatedTexts[i] = scene.review_text;
        setBuyerShowTexts([...updatedTexts]);

        // 轮询选择参考原图：每张买家秀从多选的原图中轮流取一张作为主垫图，
        // 其余图仍作为辅助参考，确保整组风格统一但场景各异
        const refImageIndex = buyerShowR2Images.length > 0 ? i % buyerShowR2Images.length : 0;
        const primaryRefImage = buyerShowR2Images[refImageIndex] || '';
        // 其余原图作为辅助参考（不重复主垫图）
        const supplementaryImages = buyerShowR2Images.filter((_, idx) => idx !== refImageIndex);
        const allRefImages = primaryRefImage
          ? [primaryRefImage, ...supplementaryImages]
          : buyerShowR2Images;

        // 核心约束：可以美化光影、场景、构图，但绝对不得改变商品本身的形态、颜色与包装
        const safetyInstruction = 'CRITICAL CONSTRAINT: Use the provided product reference image(s) as the exact product appearance. You MAY enhance lighting, background, scene composition, and lifestyle aesthetics. You MUST NOT alter the product shape, packaging design, color, label, or any physical characteristic of the product itself. The product must remain 100% visually identical to the reference.';

        const fullPrompt = `${parsedData.global_style_prompt}, ${scene.image_prompt}. ${safetyInstruction}`;

        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current['buyerShow']?.signal.aborted) break;

          attempts++;
          setBuyerShowProgress(`生成第 ${i + 1}/${numImages} 张...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch('http://127.0.0.1:8000/api/v1/agents/generate-image', {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['buyerShow']?.signal,
              body: JSON.stringify({ 
                prompt: fullPrompt,
                image_urls: allRefImages,
                model: targetModelId,
                platform: 'pinduoduo',
                product_name: selectedSkuName || 'pinduoduo_product',
                image_type: 'buyer_show'
              }) 
            });
            
            if (!drawRes.ok) throw new Error(`生图引擎异常 (HTTP ${drawRes.status})`);
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setBuyerShowImages([...updatedImages]); 
              success = true;
            } else if (attempts === 3) {
              console.error(`买家秀第 ${i+1} 张生图失败:`, drawData.message);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true;
              break;
            }
            if (attempts === 3) console.error(`买家秀第 ${i+1} 张请求异常:`, err.message);
          }
        }
      }
      
      if (abortControllers.current['buyerShow']?.signal.aborted) {
        message.warning(`买家秀生成已手动终止`);
      } else {
        message.success(`买家秀渲染完毕！`);
      }
    } catch (error: any) {
      message.error(`生成中断: ${error.message}`);
    } finally {
      setGeneratingBuyerShows(false);
      setBuyerShowProgress("");
      abortControllers.current['buyerShow'] = null;
    }
  };

  const handleDownloadBuyerShows = async () => {
    const validImages = buyerShowImages.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的买家秀！');
    setDownloading(true);
    message.loading({ content: '正在打包买家秀 ZIP...', key: 'download_buyer_show' });
    try {
      const zip = new JSZip();
      const folder = zip.folder('pinduoduo_buyer_shows');
      
      // Save images
      for (let i = 0; i < buyerShowImages.length; i++) {
        const url = buyerShowImages[i];
        if (url) {
          const response = await fetch(`http://127.0.0.1:8000/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
          const blob = await response.blob();
          folder?.file(`买家秀_${i + 1}.jpg`, blob);
        }
      }
      
      // Save text reviews
      const reviewsText = buyerShowTexts.map((text, i) => `买家秀 ${i + 1} 评价:\n${text}\n\n`).join('');
      folder?.file(`评价文案.txt`, reviewsText);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `pinduoduo_buyer_shows.zip`);
      message.success({ content: '买家秀打包下载完成！', key: 'download_buyer_show' });
    } catch (err) {
      message.error({ content: '下载失败', key: 'download_buyer_show' });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSkuImages = async () => {
    const validImages = skuImages.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的SKU图！');
    
    setDownloadingSku(true);
    message.loading({ content: '正在打包SKU图 ZIP...', key: 'download_sku' });
    try {
      const zip = new JSZip();
      const folder = zip.folder("pinduoduo_sku_images");
      
      for (let i = 0; i < validImages.length; i++) {
        const url = validImages[i];
        const response = await fetch(`http://127.0.0.1:8000/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`SKU图_${i + 1}.jpg`, blob);
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "pinduoduo_sku_images.zip");
      message.success({ content: '全部SKU图打包下载完成！', key: 'download_sku' });
    } catch (err) {
      message.error({ content: '打包下载失败，请检查网络', key: 'download_sku' });
    } finally {
      setDownloadingSku(false);
    }
  };

  return (
    <div className="h-full bg-[#f8f9fa] flex flex-col text-[#333]">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
          <Form form={form} layout="horizontal" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }} onValuesChange={handleFormChange}>
            
            <div className="mb-10 p-6 bg-blue-50/50 border border-blue-100 rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-bold text-blue-800 m-0">1. 战前准备：选品与意图注入</h3>
              </div>
              
              <div className="flex gap-8 mb-5">
                <div className="w-[260px]">
                  <div className="mb-3 text-sm text-blue-900 font-medium">
                    <span className="text-red-500 mr-1">*</span>多视角原图 ({selectedR2Images.length}/3)
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {selectedR2Images.map((img, idx) => (
                      <div key={idx} className="relative w-[70px] h-[70px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                        <img src={img} className="w-full h-full object-cover" />
                        <div 
                          className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleR2ImageSelection(img);
                          }}
                          title="删除"
                        >
                          ×
                        </div>
                      </div>
                    ))}
                    {selectedR2Images.length < 3 && (
                      <div 
                        onClick={() => openR2Modal('global')}
                        className="w-[70px] h-[70px] border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-blue-500 transition-colors"
                      >
                        <CloudOutlined className="text-xl mb-1" />
                        <span className="text-[10px] font-bold">选择图片</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-4">
                  <Form.Item name="target_sku" label={<span className="text-sm font-bold text-blue-900">核心产品 (SKU)</span>} labelCol={{span: 24}} wrapperCol={{span: 24}} className="mb-0">
                    <Cascader 
                      options={catalogTree} 
                      placeholder="请选择类目与对应产品..." 
                      size="large" 
                      className="w-full"
                      displayRender={(labels) => labels[labels.length - 1]}
                      onChange={(value) => {
                        // Cascader stores the full path array ["tea", "共享莓满"].
                        // We persist the leaf string in a dedicated state variable
                        // so API calls always get a plain string, not an array.
                        const leaf = Array.isArray(value) && value.length > 0
                          ? String(value[value.length - 1])
                          : '';
                        setSelectedSkuName(leaf);
                        // 切换产品时只清除 AI 生成的内容，保留用户手动上传的原图
                        form.setFieldsValue({ pm_report: '', title: '', base_desc: '' });
                        setMainImages(Array(10).fill(''));
                        setDetailImages([]);
                        setWhiteBgImages(Array(5).fill(''));
                        setSkuImages(Array(5).fill(''));
                        setBuyerShowImages(Array(5).fill(''));
                        setBuyerShowTexts(Array(5).fill(''));
                        setFinalAdUrl(null);
                        // 注意：不清空 selectedR2Images 和 buyerShowR2Images，用户上传的原图保留
                      }}
                    />
                  </Form.Item>
                  <Form.Item name="base_desc" label={<span className="text-sm font-bold text-blue-900">战术方向 (老板的话)</span>} labelCol={{span: 24}} wrapperCol={{span: 24}} className="mb-0">
                    <Input.TextArea rows={3} placeholder="例如：针对换季咳嗽、突出草本不伤肝肾的卖点。大字报留白风。" className="rounded-lg border-blue-200" />
                  </Form.Item>
                </div>
              </div>
            </div>

            <Divider dashed className="my-8" />
            
          
            <div className="mb-8 p-5 border border-gray-200 rounded-lg bg-white">
               <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-gray-700">第一步：提取产品卖点与策划案</span>
                  <div className="flex gap-2">
                    {TEXT_MODELS.map((model) => (
                      <Button 
                        key={model.id}
                        type={parsingModel === model.id && parsing ? "primary" : "default"}
                        className={parsingModel === model.id && parsing ? 'bg-blue-600 font-bold' : 'text-gray-600'}
                        onClick={() => handleParseFeatures(model.id)}
                        loading={parsingModel === model.id && parsing}
                        disabled={parsing && parsingModel !== model.id}
                        icon={<RobotOutlined />}
                      >
                        生成图文策划案 ({model.id})
                      </Button>
                    ))}
                  </div>
               </div>
               <Form.Item name="pm_report" className="mb-6">
                 <Input.TextArea 
                    rows={8} 
                    className="rounded-lg border-gray-200 shadow-inner text-sm bg-gray-50" 
                    placeholder="点击右上角，系统将结合 24 列 Excel 档案，为你深度策划出 10 张主图与 15 张详情页的核心卖点与画面构图脚本..." 
                 />
               </Form.Item>

               <Form.Item label={<span className="font-bold text-gray-700">拼多多高转化标题</span>} className="mb-0">
                  <div className="flex gap-3 flex-wrap">
                    <Form.Item name="title" className="flex-1 mb-0" noStyle>
                      <Input maxLength={60} className="h-10 rounded-md" placeholder="高转化标题将在此处生成，可直接复制去拼多多上架填报..." />
                    </Form.Item>
                    <div className="flex gap-2">
                      {TEXT_MODELS.map((model) => (
                        <Button 
                          key={model.id}
                          icon={<EditOutlined />} 
                          onClick={() => handleGenerateTitle(model.id)} 
                          loading={titleModel === model.id && generatingTitle}
                          disabled={generatingTitle && titleModel !== model.id}
                          className={titleModel === model.id && generatingTitle ? 'text-orange-600 font-bold border-orange-300 bg-orange-100 h-10' : 'text-orange-500 bg-orange-50 border-orange-200 h-10 font-bold'}
                        >
                          拟定标题 ({model.id})
                        </Button>
                      ))}
                    </div>
                  </div>
               </Form.Item>
            </div>

            <Form.Item label={<span className="font-bold text-gray-700 block">主图</span>} className="mb-8">
              <div className="flex flex-col">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <div className="flex flex-wrap gap-3 items-center">
                    {RENDER_MODELS.map((model) => (
                      <Button 
                        key={model.id}
                        type={mainImageModel === model.id ? "primary" : "default"}
                        className={mainImageModel === model.id ? 'bg-purple-600 font-bold' : 'text-gray-600'}
                        onClick={() => handleGenerateImages(model.id)}
                        loading={mainImageModel === model.id}
                        disabled={generatingMainImages && mainImageModel !== model.id}
                      >
                        {model.label}
                      </Button>
                    ))}
                    {generatingMainImages && (
                      <span className="ml-4 text-purple-600 font-bold text-xs self-center flex items-center">
                        <Spin size="small" className="mr-2"/>{mainRenderProgress}
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2" onClick={() => stopGeneration('main')} title="停止生成" />
                      </span>
                    )}
                  </div>
                  
                  {mainImages.some(img => img !== '') && (
                    <Button 
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadAll} 
                      loading={downloading}
                      className="bg-green-600 font-bold"
                    >
                      一键打包下载
                    </Button>
                  )}
                </div>

                <Image.PreviewGroup>
                  <div className="grid grid-cols-5 gap-4">
                    {mainImages.map((imgUrl, i) => (
                      <div key={i} className="aspect-square border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 relative overflow-hidden shadow-sm">
                        {imgUrl ? (
                             <Image src={imgUrl} className="w-full h-full object-cover" />
                        ) : (
                           <div className="flex flex-col items-center opacity-40">
                             <PictureOutlined className="text-2xl mb-2" />
                             <span className="text-[10px] font-medium">纯净底图 {i+1}</span>
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Image.PreviewGroup>
              </div>
            </Form.Item>

            <Form.Item label={<span className="font-bold text-gray-700 block">视频分镜矩阵</span>} className="mb-12">
              <div className="flex flex-col">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button 
                      type="primary" 
                      icon={<VideoCameraOutlined />} 
                      onClick={handleGenerateVideo} 
                      loading={generatingVideo}
                      className="bg-purple-600 font-bold"
                    >
                      生成 60s 视频分镜切片
                    </Button>
                    
                    {generatingVideo && (
                      <span className="ml-4 text-purple-600 font-bold text-xs self-center flex items-center">
                        <Spin size="small" className="mr-2"/>{videoRenderProgress}
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('video')} title="停止生成" />
                      </span>
                    )}
                  </div>
                  
                  {videoClips.some(v => v !== '') && (
                    <Button 
                      size="small"
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadVideos} 
                      loading={downloading}
                      className="bg-green-600 font-bold"
                    >
                      一键打包下载全部切片
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-4 lg:grid-cols-6 gap-4">
                  {videoClips.map((vidUrl, i) => (
                    <div key={i} className="aspect-[9/16] bg-black border border-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm group">
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded z-10">分镜 {i+1}</span>
                      {vidUrl ? (
                        <>
                          <video src={vidUrl} controls className="w-full h-full object-cover" />
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                            <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center opacity-40 text-white">
                          <VideoCameraOutlined className="text-2xl mb-2" />
                          <span className="text-[10px] font-medium">切片 {i+1} (约5s)</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Form.Item>

            <Form.Item label={<span className="font-bold text-gray-700">图文详情</span>} className="mb-8">
              <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
                <div className="flex h-[450px]">
                  <div className="w-[280px] bg-gray-100 border-r border-gray-200 flex flex-col">
                    <div className="h-10 flex justify-between items-center px-4 border-b border-gray-200 bg-white">
                      <span className="text-xs font-bold text-gray-800">页面预览</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
                      {detailImages.length > 0 ? (
                        <div className="w-full bg-white shadow-md border border-gray-200 relative pb-10">
                          <div className="h-24 bg-gradient-to-br from-indigo-900 to-purple-900 text-white p-3 flex flex-col justify-center">
                              <h3 className="text-sm font-black text-yellow-400 m-0">我们敢送</h3>
                          </div>
                          <div className="h-20 bg-gray-50 flex items-center justify-center text-gray-400 text-xs border-t border-gray-100">向下滚动查看全图...</div>
                        </div>
                      ) : (
                        <div className="mt-20 text-center text-gray-400">
                          <PictureOutlined className="text-3xl mb-2 opacity-50" />
                          <p className="text-[10px]">等待排版...</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 p-4 flex flex-col bg-gray-50">
                    <div className="flex justify-between items-center mb-4 bg-white p-2 rounded-lg border border-gray-200">
                      <span className="text-xs font-bold text-gray-700 ml-2">详情排版画布</span>
                      <div className="flex gap-2 items-center">
                        {detailImages.some(img => img !== '') && (
                          <Button 
                            onClick={handleDownloadAllDetails} 
                            loading={downloadingDetails} 
                            icon={<DownloadOutlined />} 
                            size="small" 
                            className="text-green-600 border-green-300 bg-green-50 font-bold"
                          >
                            一键打包下载
                          </Button>
                        )}
                        
                        {generatingDetailImages && (
                          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} onClick={() => stopGeneration('detail')} title="停止生成" />
                        )}
                        <div className="flex gap-1">
                          {RENDER_MODELS.map((model) => (
                            <Button 
                              key={model.id}
                              size="small"
                              type={detailImageModel === model.id ? "primary" : "default"}
                              className={detailImageModel === model.id ? 'bg-orange-600 font-bold' : 'text-gray-600 text-[10px]'}
                              onClick={() => handleGenerateDetails(model.id)}
                              loading={detailImageModel === model.id}
                              disabled={generatingDetailImages && detailImageModel !== model.id}
                            >
                              {model.label.split(' ')[0]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto border border-gray-200 p-4 bg-white rounded-lg">
                      {detailImages.length > 0 ? (
                        <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 content-start">
                          {detailImages.map((imgUrl, i) => (
                            <div key={i} className="aspect-square bg-gray-50 border border-gray-200 rounded relative flex items-center justify-center hover:border-orange-400 cursor-move transition-all overflow-hidden">
                              <span className="absolute top-1 left-1 bg-gray-800/80 text-white text-[10px] px-1 rounded z-10">{i+1}</span>
                              {imgUrl ? (
                                <Image src={imgUrl} className="w-full h-full object-cover" />
                              ) : (
                                <PictureOutlined className="text-xl text-gray-300" />
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                          点击右上角使用 AI 排版，或手动拖入图片
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Form.Item>

            <Form.Item label={<span className="font-bold text-gray-700 block">生成买家秀</span>} className="mb-12">
              <div className="flex flex-col">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-gray-600 font-medium mr-2">生成条数:</span>
                    <Input 
                      type="number" 
                      min={1} 
                      max={10} 
                      value={buyerShowCount} 
                      onChange={(e) => setBuyerShowCount(Number(e.target.value))}
                      className="w-20 mr-4"
                    />
                    {RENDER_MODELS.map((model) => (
                      <Button 
                        key={model.id}
                        size="small"
                        type={buyerShowModel === model.id ? "primary" : "default"}
                        className={buyerShowModel === model.id ? 'bg-red-600 font-bold text-white border-none' : 'text-gray-600'}
                        onClick={() => handleGenerateBuyerShows(model.id)}
                        loading={buyerShowModel === model.id}
                        disabled={generatingBuyerShows && buyerShowModel !== model.id}
                      >
                        {model.label.split(' ')[0]}
                      </Button>
                    ))}
                    {generatingBuyerShows && (
                      <span className="ml-4 text-red-600 font-bold text-xs self-center flex items-center">
                        <Spin size="small" className="mr-2"/>{buyerShowProgress}
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('buyerShow')} title="停止生成" />
                      </span>
                    )}
                  </div>
                  
                  {(buyerShowImages.some(img => img !== '') || buyerShowTexts.some(t => t !== '')) && (
                    <Button 
                      size="small"
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadBuyerShows} 
                      loading={downloading}
                      className="bg-green-600 font-bold border-none"
                    >
                      一键打包下载买家秀
                    </Button>
                  )}
                </div>

                <div className="mb-4">
                  <div className="mb-2 text-sm text-gray-700 font-medium flex items-center justify-between">
                    <span>
                      <span className="text-red-500 mr-1">*</span>买家秀原图垫图 ({buyerShowR2Images.length}/5)
                      <span className="ml-2 text-xs font-normal text-gray-400">支持多选，每张买家秀轮流使用一张参考图</span>
                    </span>
                    <Button
                      size="small"
                      icon={<CloudOutlined />}
                      onClick={() => openR2Modal('buyerShow')}
                      className="text-blue-500 border-blue-200 bg-blue-50"
                    >
                      {buyerShowR2Images.length === 0 ? '选择原图' : '管理原图'}
                    </Button>
                  </div>
                  <div className="flex gap-2 flex-wrap bg-white p-3 rounded-lg border border-gray-200 min-h-[76px]">
                    {buyerShowR2Images.length === 0 ? (
                      <div
                        onClick={() => openR2Modal('buyerShow')}
                        className="w-full h-[52px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-400 text-gray-400 hover:text-blue-500 transition-colors gap-2"
                      >
                        <CloudOutlined />
                        <span className="text-xs">点击从图库选择产品原图（可多选，最多5张）</span>
                      </div>
                    ) : (
                      buyerShowR2Images.map((img, idx) => (
                        <div key={idx} className="relative w-[60px] h-[60px] border-2 border-blue-200 rounded-lg overflow-hidden group shadow-sm">
                          <img src={img} className="w-full h-full object-cover" />
                          <div className="absolute top-0 left-0 bg-blue-500/80 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-br font-bold">{idx + 1}</div>
                          <div
                            className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBuyerShowR2Images(prev => prev.filter((_, i) => i !== idx));
                            }}
                            title="移除"
                          >
                            ×
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">建议选择：产品包装正面图、使用场景图、细节特写图等。多张原图会轮流作为每条买家秀的主垫图，生成场景各异但商品一致的买家秀。</div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {Array.from({ length: buyerShowCount }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50 shadow-sm">
                      <div className="aspect-square bg-white rounded-md flex items-center justify-center relative overflow-hidden">
                        {buyerShowImages[i] ? (
                           <Image src={buyerShowImages[i]} className="w-full h-full object-cover" />
                        ) : (
                           <div className="flex flex-col items-center opacity-40">
                             <PictureOutlined className="text-2xl mb-2" />
                             <span className="text-[10px] font-medium">买家秀图 {i+1}</span>
                           </div>
                        )}
                      </div>
                      <Input.TextArea 
                        value={buyerShowTexts[i] || ''} 
                        placeholder="评价文案" 
                        rows={3} 
                        className="text-xs" 
                        readOnly 
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Form.Item>

            <Form.Item label={<span className="font-bold text-gray-700 block">白底图</span>} className="mb-8">
              <div className="flex flex-col">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <div className="flex flex-wrap gap-3 items-center">
                    {RENDER_MODELS.map((model) => (
                      <Button 
                        key={model.id}
                        type={whiteBgImageModel === model.id ? "primary" : "default"}
                        className={whiteBgImageModel === model.id ? 'bg-purple-600 font-bold' : 'text-gray-600'}
                        onClick={() => handleGenerateWhiteBgImages(model.id)}
                        loading={whiteBgImageModel === model.id}
                        disabled={generatingWhiteBgImages && whiteBgImageModel !== model.id}
                      >
                        {model.label}
                      </Button>
                    ))}
                    {generatingWhiteBgImages && (
                      <span className="ml-4 text-purple-600 font-bold text-xs self-center flex items-center">
                        <Spin size="small" className="mr-2"/>{whiteBgRenderProgress}
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2" onClick={() => stopGeneration('whitebg')} title="停止生成" />
                      </span>
                    )}
                  </div>
                  
                  {whiteBgImages.some(img => img !== '') && (
                    <Button 
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadWhiteBgImages} 
                      loading={downloadingWhiteBg}
                      className="bg-green-600 font-bold"
                    >
                      一键打包下载
                    </Button>
                  )}
                </div>

                <Image.PreviewGroup>
                  <div className="grid grid-cols-5 gap-4">
                    {whiteBgImages.map((imgUrl, i) => (
                      <div key={i} className="aspect-square border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 relative overflow-hidden shadow-sm">
                        {imgUrl ? (
                             <Image src={imgUrl} className="w-full h-full object-cover" />
                        ) : (
                           <div className="flex flex-col items-center opacity-40">
                             <PictureOutlined className="text-2xl mb-2" />
                             <span className="text-[10px] font-medium">纯净底图 {i+1}</span>
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Image.PreviewGroup>
              </div>
            </Form.Item>

            <Form.Item label={<span className="font-bold text-gray-700 block">SKU规格图</span>} className="mb-8">
              <div className="flex flex-col">
                <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <div className="flex flex-wrap gap-3 items-center">
                    {RENDER_MODELS.map((model) => (
                      <Button 
                        key={model.id}
                        type={skuImageModel === model.id ? "primary" : "default"}
                        className={skuImageModel === model.id ? 'bg-purple-600 font-bold' : 'text-gray-600'}
                        onClick={() => handleGenerateSkuImages(model.id)}
                        loading={skuImageModel === model.id}
                        disabled={generatingSkuImages && skuImageModel !== model.id}
                      >
                        {model.label}
                      </Button>
                    ))}
                    {generatingSkuImages && (
                      <span className="ml-4 text-purple-600 font-bold text-xs self-center flex items-center">
                        <Spin size="small" className="mr-2"/>{skuRenderProgress}
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2" onClick={() => stopGeneration('sku')} title="停止生成" />
                      </span>
                    )}
                  </div>
                  
                  {skuImages.some(img => img !== '') && (
                    <Button 
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadSkuImages} 
                      loading={downloadingSku}
                      className="bg-green-600 font-bold"
                    >
                      一键打包下载
                    </Button>
                  )}
                </div>

                <Image.PreviewGroup>
                  <div className="grid grid-cols-5 gap-4">
                    {skuImages.map((imgUrl, i) => (
                      <div key={i} className="aspect-square border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 relative overflow-hidden shadow-sm">
                        {imgUrl ? (
                             <Image src={imgUrl} className="w-full h-full object-cover" />
                        ) : (
                           <div className="flex flex-col items-center opacity-40">
                             <PictureOutlined className="text-2xl mb-2" />
                             <span className="text-[10px] font-medium">SKU占位 {i+1}</span>
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Image.PreviewGroup>
              </div>
            </Form.Item>

          </Form>
        </div>
      </div>

      <Modal
        title={<div className="flex justify-between items-center pr-8">
            <div className="flex items-center"><CloudOutlined className="text-blue-500 mr-2 text-xl"/> 多视角垫图库</div>
            <Upload customRequest={handleR2Upload} showUploadList={false} accept="image/*" multiple>
              <Button type="primary" icon={<UploadOutlined />} loading={uploadingR2}>上传新角度</Button>
            </Upload>
          </div>}
        open={isR2ModalVisible}
        onCancel={() => setIsR2ModalVisible(false)}
        footer={<Button type="primary" onClick={() => setIsR2ModalVisible(false)} className="w-full">确认</Button>}
        width={800}
      >
        <div className="h-[400px] overflow-y-auto mt-4">
          <div className="grid grid-cols-5 gap-3 p-2">
            {r2Gallery.map((url, idx) => {
              const isSelected = r2ModalTarget === 'global' ? selectedR2Images.includes(url) : buyerShowR2Images.includes(url);
              return (
              <div 
                key={idx} 
                className={`aspect-square border-2 rounded-md overflow-hidden cursor-pointer relative ${isSelected ? 'border-blue-500 shadow-md transform scale-105' : 'border-gray-200'}`}
                onClick={() => toggleR2ImageSelection(url)}
              >
                <img src={url} className="w-full h-full object-cover" />
                {isSelected && <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs">✓</div>}
              </div>
            )})}
          </div>
          {hasMoreR2 && (
            <div className="text-center mt-6 pb-4">
              <Button loading={fetchingR2} onClick={() => fetchR2Images(r2Page + 1, true)}>加载更多历史素材</Button>
            </div>
          )}
        </div>
      </Modal>

      {/* 🚀 悬浮任务状态栏 */}
      {activeTasks.length > 0 && (
        <div className="fixed bottom-6 right-6 w-80 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-gray-100 overflow-hidden z-50 transform transition-all duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex justify-between items-center">
            <span className="text-white font-bold text-sm flex items-center">
              <LoadingOutlined className="mr-2" /> 任务控制中心
            </span>
            <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
              {activeTasks.length} 个进行中
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {activeTasks.map((task, idx) => (
              <div key={idx} className="flex flex-col p-3 border-b border-gray-50 last:border-0 bg-gray-50/50 rounded m-1 mb-2">
                <span className="font-bold text-gray-700 text-xs mb-1">{task.name}</span>
                <span className="text-[10px] text-blue-600 animate-pulse">{task.status || '正在执行中...'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
