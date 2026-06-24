// frontend/src/components/PinduoduoPublish.tsx
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
// Version: 4.4 (Fixed Silent Failure in Title Generation)
import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Select, message, Divider, Modal, Spin, Upload, Image, Cascader } from 'antd';
import { 
  RobotOutlined, PictureOutlined, ThunderboltOutlined, 
  VideoCameraOutlined, CloudOutlined, UploadOutlined, RocketOutlined, EditOutlined, DownloadOutlined, CloseCircleOutlined, LoadingOutlined,
  SoundOutlined, CustomerServiceOutlined
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
    fetch(`${API_BASE}/api/catalog/tree`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('后端未返回 JSON，请确认后端服务已启动');
        }
        return res.json();
      })
      .then(data => {
        if (data.code === 200) {
          setCatalogTree(data.data);
        }
      })
      .catch(err => {
        console.error('获取类目树失败:', err);
        message.warning(`无法连接后端，类目树加载失败: ${err.message}`);
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

  // ── RunPod LTX 服务健康状态 ──
  const [ltxServiceReady, setLtxServiceReady] = useState<boolean | null>(null); // null=checking
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/video/ltx-health`)
      .then(r => r.json())
      .then(d => setLtxServiceReady(d.ready === true))
      .catch(() => setLtxServiceReady(false));
  }, []);

  // ── 商品视频（1:1/16:9，Seedance + LTX） ──
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoRenderProgress, setVideoRenderProgress] = useState("");
  const [videoClips, setVideoClips] = useState<string[]>(Array(12).fill(''));
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState<{global_style_prompt: string; ratio?: string; storyboard: {logic: string; scene_prompt: string; video_type?: string}[]} | null>(null);
  const [generatingLtx, setGeneratingLtx] = useState(false);
  const [ltxProgress, setLtxProgress] = useState("");
  const [ltxClips, setLtxClips] = useState<string[]>(Array(12).fill(''));

  // ── 商品讲解视频（9:16，Seedance + LTX） ──
  const [generatingExplainVideo, setGeneratingExplainVideo] = useState(false);
  const [explainVideoProgress, setExplainVideoProgress] = useState("");
  const [explainVideoClips, setExplainVideoClips] = useState<string[]>(Array(12).fill(''));
  const [generatingExplainScript, setGeneratingExplainScript] = useState(false);
  const [explainScript, setExplainScript] = useState<{global_style_prompt: string; ratio?: string; storyboard: {logic: string; scene_prompt: string; video_type?: string}[]} | null>(null);
  const [generatingExplainLtx, setGeneratingExplainLtx] = useState(false);
  const [explainLtxProgress, setExplainLtxProgress] = useState("");
  const [explainLtxClips, setExplainLtxClips] = useState<string[]>(Array(12).fill(''));

  // ── 商详视频（16:9，Seedance + LTX） ──
  const [generatingDetailVideo, setGeneratingDetailVideo] = useState(false);
  const [detailVideoProgress, setDetailVideoProgress] = useState("");
  const [detailVideoClips, setDetailVideoClips] = useState<string[]>(Array(12).fill(''));
  const [generatingDetailScript, setGeneratingDetailScript] = useState(false);
  const [detailScript, setDetailScript] = useState<{global_style_prompt: string; ratio?: string; storyboard: {logic: string; scene_prompt: string; video_type?: string}[]} | null>(null);
  const [generatingDetailLtx, setGeneratingDetailLtx] = useState(false);
  const [detailLtxProgress, setDetailLtxProgress] = useState("");
  const [detailLtxClips, setDetailLtxClips] = useState<string[]>(Array(12).fill(''));

  // ── LTX/Wan2.2 渲染模式 ──
  // fast=false → Wan2.2 正式出片（高质量，每条~60s）
  // fast=true  → LTX-Video 快速预览（每条~8s）
  const [ltxFastMode, setLtxFastMode] = useState(false);
  const [ltxBackgroundStyle, setLtxBackgroundStyle] = useState<string>('gradient');

  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadingDetails, setDownloadingDetails] = useState(false);

  // 🎙️ 口播文案 & TTS 状态
  const [extractingScript, setExtractingScript] = useState(false);
  const [broadcastScript, setBroadcastScript] = useState('');

  // VoxCPM2 TTS
  const VOXCPM2_ENDPOINT = process.env.NEXT_PUBLIC_VOXCPM2_URL || 'https://tuolin2011--voxcpm2-api-factory-voxcpm2service-api-endpoint.modal.run';
  const [generatingVoxCpm2, setGeneratingVoxCpm2] = useState(false);
  const [previewingVoxCpm2, setPreviewingVoxCpm2] = useState(false);
  const [voxCpm2CfgValue, setVoxCpm2CfgValue] = useState(2.0);
  const [voxCpm2Timesteps, setVoxCpm2Timesteps] = useState(10);
  const [voxCpm2Url, setVoxCpm2Url] = useState('');
  const [voxCpm2PreviewUrl, setVoxCpm2PreviewUrl] = useState('');
  // 选中的音色描述符（作为文案前缀使用）
  const [voxCpm2VoiceDesc, setVoxCpm2VoiceDesc] = useState('声音甜美，语速适中，充满活力');

  // 预设音色库（value = 自然语言描述符，直接插入文案括号前缀）
  const VOXCPM2_VOICE_PRESETS = [
    // ── 女声 ──
    { group: '女声', value: '声音甜美，语速适中，充满活力',           label: '😊 甜美女声', preview: '你好，我是甜美女声，欢迎选购！' },
    { group: '女声', value: '声音温柔亲切，语速稍慢，娓娓道来',       label: '🤗 温柔女声', preview: '你好，我是温柔女声，欢迎选购！' },
    { group: '女声', value: '声音活泼热情，语速稍快，富有感染力',     label: '💃 活泼女声', preview: '你好，我是活泼女声，欢迎选购！' },
    { group: '女声', value: '声音轻柔耳语，语速缓慢，温柔细腻',      label: '🤫 耳语女声', preview: '你好，我是耳语女声，欢迎选购！' },
    { group: '女声', value: '声音专业干练，语速适中，清晰有力',       label: '💼 职场女声', preview: '你好，我是职场女声，欢迎选购！' },
    // ── 男声 ──
    { group: '男声', value: '声音低沉磁性，语速适中，沉稳有力',       label: '🎤 磁性男声', preview: '你好，我是磁性男声，欢迎选购！' },
    { group: '男声', value: '中年男性，声音淳朴亲切，带着一点南方口音', label: '🧔 朴实男声', preview: '你好，我是朴实男声，欢迎选购！' },
    { group: '男声', value: '声音激昂有力，语速稍快，充满激情',       label: '🤩 激情男声', preview: '你好，我是激情男声，欢迎选购！' },
    { group: '男声', value: '声音沉稳专业，语速适中，权威可信',       label: '🎯 播报男声', preview: '你好，我是播报男声，欢迎选购！' },
    // ── 特色 ──
    { group: '特色', value: '老奶奶的声音，慈祥温和，语速缓慢',      label: '👵 慈祥奶奶', preview: '孩子，这是奶奶给你推荐的好东西！' },
    { group: '特色', value: '声音阳光帅气，像年轻男大学生，语速适中', label: '🧑 阳光男生', preview: '兄弟姐妹们，这个真的超好用！' },
    { group: '特色', value: '声音可爱甜萌，像小女孩，语速稍快',      label: '🎀 萌萌女生', preview: '哇！这个真的太可爱了，超推荐哦！' },
  ];

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
    { name: "生成视频矩阵", active: generatingVideo, status: videoRenderProgress },
    { name: "生成分镜脚本", active: generatingScript, status: "AI 构思分镜中..." },
    { name: "LTX 渲染视频", active: generatingLtx, status: ltxProgress },
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
      const response = await fetch(`${API_BASE}/api/v1/r2/images?page=${page}&limit=20`);
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
      const res = await fetch(`${API_BASE}/api/v1/r2/upload`, { method: 'POST', body: formData });
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
      const res = await fetch(`${API_BASE}/api/v1/agents/generate-one-click`, {
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
      const response = await fetch(`${API_BASE}/api/v1/agents/pm-analyze`, {
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
      const response = await fetch(`${API_BASE}/api/v1/agents/ops-title`, {
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
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-main-image-brief`, {
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
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
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
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
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

  // ─── 生成分镜脚本（不渲染视频）────────────────────────────────────────────
  type ScriptData = { global_style_prompt: string; ratio?: string; storyboard: { logic: string; scene_prompt: string; video_type?: string }[] };

  const _generateScriptOnly = async () => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) { message.warning('请先生成策划案'); return; }
    setGeneratingScript(true);
    setScript(null);
    message.loading({ content: '分镜脚本生成中...', key: 'script_gen', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo', ratio: '16:9', num_clips: 12 })
      });
      if (!res.ok) throw new Error(`剧本接口异常 (HTTP ${res.status})`);
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '后端返回异常');
      let clean: string = data.data;
      if (clean.includes('```json')) clean = clean.split('```json')[1].split('```')[0].trim();
      else if (clean.includes('```')) clean = clean.split('```')[1].split('```')[0].trim();
      const parsed: ScriptData = JSON.parse(clean);
      setScript(parsed);
      message.success({ content: '分镜脚本已就绪！', key: 'script_gen', duration: 3 });
    } catch (e: any) {
      message.error({ content: `脚本生成失败: ${e.message}`, key: 'script_gen', duration: 4 });
    } finally {
      setGeneratingScript(false);
    }
  };

  // ─── 根据分镜脚本调用 LTX-Video 批量生成（HTTP，一次性返回全部结果）──
  const _generateLtxFromScript = async () => {
    if (!script || script.storyboard.length === 0) { message.warning('请先生成分镜脚本'); return; }
    setGeneratingLtx(true);
    const total = script.storyboard.length;
    setLtxClips(Array(total).fill(''));
    const modeLabel = ltxFastMode ? 'LTX-Video 快速预览' : 'Wan2.2 正式出片';
    setLtxProgress(`提交渲染任务，共 ${total} 个分镜（${modeLabel}），请耐心等待...`);

    try {
      const res = await fetch(`${API_BASE}/api/v1/video/generate-from-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          global_style_prompt: script!.global_style_prompt,
          ratio: script!.ratio || '16:9',
          storyboard: script!.storyboard.map(s => ({
            logic: s.logic,
            scene_prompt: s.scene_prompt,
            video_type: s.video_type || 'text-to-video',
          })),
          image_urls: selectedR2Images,
          num_frames: ltxFastMode ? 25 : 97,
          steps: ltxFastMode ? 20 : 50,
          fast: ltxFastMode,
          background_style: ltxBackgroundStyle,
        }),
      });
      if (!res.ok) throw new Error(`渲染服务异常 (HTTP ${res.status})`);
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '渲染服务返回异常');
      const clips = Array(total).fill('');
      for (const r of data.results) {
        if (r.video_url) clips[r.index] = r.video_url;
        else if (r.error) message.warning(`分镜 ${r.index + 1} 失败: ${r.error}`);
      }
      setLtxClips([...clips]);
      if (data.failed_count === 0) message.success(`🎬 LTX 全部 ${data.success_count} 个视频渲染完毕！`);
      else message.warning(`渲染结束：${data.success_count} 成功，${data.failed_count} 失败`);
    } catch (e: any) {
      message.error(`LTX 生成失败: ${e.message}`);
    } finally {
      setGeneratingLtx(false);
      setLtxProgress('');
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
      const scriptRes = await fetch(`${API_BASE}/api/v1/video/design-script`, {
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
          const videoRes = await fetch(`${API_BASE}/api/v1/video/generate`, {
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
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
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
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
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
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-detail-image-brief`, {
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
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
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
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-white-bg-image-brief`, {
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
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
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
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
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
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-sku-image-brief`, {
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
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
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
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-buyer-show`, {
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
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
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
          const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
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

  // ─── 通用视频生成工具函数 ───────────────────────────────────────────────────
  const _generateScript = async (
    ratio: string,
    setGenerating: (v: boolean) => void,
    setScriptState: (s: any) => void,
    msgKey: string,
  ) => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) { message.warning('请先生成策划案'); return; }
    setGenerating(true);
    setScriptState(null);
    message.loading({ content: '分镜脚本生成中...', key: msgKey, duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo', ratio, num_clips: 12 })
      });
      if (!res.ok) throw new Error(`剧本接口异常 (HTTP ${res.status})`);
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '后端返回异常');
      let clean: string = data.data;
      if (clean.includes('```json')) clean = clean.split('```json')[1].split('```')[0].trim();
      else if (clean.includes('```')) clean = clean.split('```')[1].split('```')[0].trim();
      setScriptState(JSON.parse(clean));
      message.success({ content: '分镜脚本已就绪！', key: msgKey, duration: 3 });
    } catch (e: any) {
      message.error({ content: `脚本生成失败: ${e.message}`, key: msgKey, duration: 4 });
    } finally {
      setGenerating(false);
    }
  };

  // ─── 通用 LTX HTTP 生成（商品讲解视频 / 商详视频共用）────────────────
  const _generateLtx = async (
    scriptState: any,
    setGenerating: (v: boolean) => void,
    setProgress: (s: string) => void,
    setClips: (c: string[]) => void,
  ) => {
    if (!scriptState || scriptState.storyboard.length === 0) { message.warning('请先生成分镜脚本'); return; }
    setGenerating(true);
    const total = scriptState.storyboard.length;
    setClips(Array(total).fill(''));
    const modeLabel = ltxFastMode ? 'LTX-Video 快速预览' : 'Wan2.2 正式出片';
    setProgress(`提交渲染任务，共 ${total} 个分镜（${modeLabel}），请耐心等待...`);

    const ltxApiBase = "https://tuolin2011--omni-ltx-video-video-api.modal.run";

    try {
      const res = await fetch(`${ltxApiBase}/api/v1/generate/storyboard/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shots: scriptState.storyboard.map((s: any) => ({
            prompt: `${scriptState.global_style_prompt}, ${s.scene_prompt}`,
            width: scriptState.ratio === '9:16' ? 480 : 704,
            height: scriptState.ratio === '9:16' ? 854 : 480,
            num_frames: ltxFastMode ? 25 : 97,
            num_inference_steps: ltxFastMode ? 20 : 50,
            fps: 24,
            fast: ltxFastMode,
            background_style: ltxBackgroundStyle,
            reference_images: selectedR2Images.length > 0 ? [selectedR2Images[0]] : []
          }))
        }),
      });
      if (!res.ok) throw new Error(`渲染服务异常 (HTTP ${res.status})`);
      const { task_id } = await res.json();
      
      // 轮询状态
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`${ltxApiBase}/api/v1/tasks/${task_id}`);
          if (!pollRes.ok) return;
          const statusData = await pollRes.json();
          
          setProgress(`渲染中... ${statusData.progress}% (${statusData.done}/${statusData.total})`);
          
          // Update clips with R2 URLs as they become available
          if (statusData.r2_urls) {
            setClips((prevClips: string[]) => {
              const newClips = [...prevClips];
              statusData.r2_urls.forEach((url: string | null, i: number) => {
                if (url && !newClips[i]) {
                  newClips[i] = url;
                }
              });
              return newClips;
            });
          }
          
          if (statusData.status === 'done') {
            clearInterval(pollInterval);
            setProgress('渲染完成');
            
            // If we have all R2 URLs, we don't need to download the ZIP
            if (statusData.r2_urls && statusData.r2_urls.every((url: string | null) => url !== null)) {
              setClips(statusData.r2_urls);
            } else {
              // Fallback to downloading ZIP if R2 URLs are missing
              setProgress('渲染完成，正在下载...');
              const dlRes = await fetch(`${ltxApiBase}/api/v1/tasks/${task_id}/download`);
              const blob = await dlRes.blob();
              const zip = await JSZip.loadAsync(blob);
              
              const newClips = new Array(total).fill('');
              let idx = 0;
              for (const [filename, file] of Object.entries(zip.files)) {
                if (filename.endsWith('.mp4')) {
                  const videoBlob = await file.async('blob');
                  newClips[idx] = URL.createObjectURL(videoBlob);
                  idx++;
                }
              }
              setClips(newClips);
            }
            
            setGenerating(false);
            setProgress('');
            message.success('LTX 视频生成完成');
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setGenerating(false);
            setProgress('');
            message.error(`生成失败: ${statusData.error}`);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 5000);
    } catch (e: any) {
      message.error(`LTX 生成失败: ${e.message}`);
      setGenerating(false);
      setProgress('');
    }
  };

  const _generateSeedanceVideo = async (
    ratio: string,
    setGenerating: (v: boolean) => void,
    setProgress: (s: string) => void,
    setClips: (c: string[]) => void,
    abortKey: string,
  ) => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) return message.warning('请先生成策划案');
    setGenerating(true);
    setProgress('构思视频剧本中...');
    abortControllers.current[abortKey] = new AbortController();
    try {
      const scriptRes = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo', ratio })
      });
      if (!scriptRes.ok) throw new Error('剧本生成失败');
      const scriptData = await scriptRes.json();
      let cleanJsonStr = scriptData.data;
      if (cleanJsonStr.includes('```json')) cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      const parsedData = JSON.parse(cleanJsonStr);
      const numClips = parsedData.storyboard.length || 12;
      const updatedClips = Array(numClips).fill('');
      setClips(Array(numClips).fill(''));
      for (let i = 0; i < numClips; i++) {
        if (abortControllers.current[abortKey]?.signal.aborted) break;
        const scene = parsedData.storyboard[i];
        setProgress(`生成视频切片 ${i + 1}/${numClips}...`);
        try {
          const videoRes = await fetch(`${API_BASE}/api/v1/video/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: abortControllers.current[abortKey]?.signal,
            body: JSON.stringify({ prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, type: 'pinduoduo_main', image_urls: selectedR2Images })
          });
          const videoData = await videoRes.json();
          if (videoRes.ok && videoData.url) {
            updatedClips[i] = videoData.url;
            setClips([...updatedClips]);
          }
        } catch (err: any) { if (err.name === 'AbortError') break; }
      }
      if (abortControllers.current[abortKey]?.signal.aborted) message.warning('视频生成已手动终止');
      else message.success('视频生成完成！');
    } catch (error: any) {
      message.error(`视频生成中断: ${error.message}`);
    } finally {
      setGenerating(false);
      setProgress('');
      abortControllers.current[abortKey] = null;
    }
  };

  // 🎙️ 提取口播文案
  const handleExtractScript = async () => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先生成策划案！');
    setExtractingScript(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tts/extract-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, platform: 'pinduoduo' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.code === 200 && data.data) {
        setBroadcastScript(typeof data.data === 'string' ? data.data : data.data.script || '');
        message.success('口播文案提取成功！');
      } else {
        throw new Error(data.message || '提取失败');
      }
    } catch (err: any) {
      message.error(`提取口播文案失败: ${err.message}`);
    } finally {
      setExtractingScript(false);
    }
  };

  // 🎭 VoxCPM2 底层调用（可复用）
  const _callVoxCpm2 = async (text: string, msgKey: string): Promise<string> => {
    const params = new URLSearchParams({
      text,
      cfg_value: String(voxCpm2CfgValue),
      timesteps: String(voxCpm2Timesteps),
    });
    const res = await fetch(`${VOXCPM2_ENDPOINT}?${params.toString()}`, { method: 'POST' });
    if (!res.ok) throw new Error(`VoxCPM2 服务异常 (HTTP ${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  };

  // 🎭 VoxCPM2 合成正式口播（直连 Modal GPU 端点）
  const handleGenerateVoxCpm2 = async () => {
    if (!broadcastScript.trim()) return message.warning('请先提取或输入口播文案！');
    setGeneratingVoxCpm2(true);
    setVoxCpm2Url('');
    message.loading({ content: '🎭 VoxCPM2 合成中，GPU 加速约10~30秒...', key: 'voxcpm2_gen', duration: 0 });
    try {
      // 将选定音色描述符作为括号前缀注入文案
      const fullText = `(${voxCpm2VoiceDesc})${broadcastScript}`;
      const url = await _callVoxCpm2(fullText, 'voxcpm2_gen');
      setVoxCpm2Url(url);
      message.success({ content: '🎉 VoxCPM2 合成完成！', key: 'voxcpm2_gen' });
    } catch (err: any) {
      message.error({ content: `VoxCPM2 失败: ${err.message}`, key: 'voxcpm2_gen' });
    } finally {
      setGeneratingVoxCpm2(false);
    }
  };

  // 🎧 VoxCPM2 音色试听（用预设的短句测试当前音色）
  const handlePreviewVoxCpm2 = async (preset: typeof VOXCPM2_VOICE_PRESETS[0]) => {
    setPreviewingVoxCpm2(true);
    setVoxCpm2PreviewUrl('');
    message.loading({ content: `🎧 试听"${preset.label}"...`, key: 'voxcpm2_preview', duration: 0 });
    try {
      const url = await _callVoxCpm2(`(${preset.value})${preset.preview}`, 'voxcpm2_preview');
      setVoxCpm2PreviewUrl(url);
      message.success({ content: `✅ 试听就绪！`, key: 'voxcpm2_preview', duration: 2 });
    } catch (err: any) {
      message.error({ content: `试听失败: ${err.message}`, key: 'voxcpm2_preview' });
    } finally {
      setPreviewingVoxCpm2(false);
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
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
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
    <div className="h-full bg-gradient-to-br from-slate-50 to-red-50/20 flex flex-col text-[#333]">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto bg-white p-8 rounded-2xl shadow-md border border-red-100/50">
          <Form form={form} layout="horizontal" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }} onValuesChange={handleFormChange}>
            
            <div className="mb-10 p-6 bg-gradient-to-br from-red-50 via-orange-50/60 to-yellow-50/40 border border-red-200/60 rounded-2xl relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-red-100/40 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-bold text-red-800 m-0 flex items-center gap-2">
                  <span className="w-7 h-7 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center shadow-sm text-white text-xs font-black">1</span>
                  战前准备：选品与意图注入
                </h3>
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

            {/* 🎙️ 口播文案 & TTS 语音合成 */}
            <div className="mb-8 p-5 border border-teal-200 rounded-lg bg-gradient-to-r from-teal-50 to-cyan-50">
              <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-teal-800 flex items-center">
                  <CustomerServiceOutlined className="mr-2 text-lg text-teal-600" />
                  第二步：口播文案 &amp; 语音合成
                  <span className="ml-2 text-[10px] bg-teal-100 text-teal-600 px-2 py-0.5 rounded-full">OmniVoice TTS</span>
                </span>
                <Button
                  size="small"
                  type="primary"
                  icon={<SoundOutlined />}
                  onClick={handleExtractScript}
                  loading={extractingScript}
                  className="bg-teal-600 border-teal-600 hover:bg-teal-700 font-bold"
                >
                  提取口播文案
                </Button>
              </div>

              <Input.TextArea
                value={broadcastScript}
                onChange={e => setBroadcastScript(e.target.value)}
                rows={5}
                className="text-sm bg-white mb-4 rounded-lg border-teal-200"
                placeholder="点击「提取口播文案」从策划案中自动生成，也可直接在此输入或粘贴文案..."
              />

              {/* ── VoxCPM2 生成语音 ── */}
              <div className="mt-5 pt-4 border-t border-teal-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">VoxCPM2</span>
                  <span className="text-xs text-gray-500">OpenBMB 出品 · 自然语言音色控制 · Modal GPU 加速</span>
                </div>

                {/* 音色预设选择器 */}
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-600 mb-2">选择音色（点击试听，双击选用）：</div>
                  {(['女声','男声','特色'] as const).map(group => (
                    <div key={group} className="mb-2">
                      <div className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">{group}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {VOXCPM2_VOICE_PRESETS.filter(p => p.group === group).map(preset => {
                          const isActive = voxCpm2VoiceDesc === preset.value;
                          return (
                            <div key={preset.value} className="flex items-center gap-0">
                              <button
                                onClick={() => setVoxCpm2VoiceDesc(preset.value)}
                                className={`text-xs px-2 py-1 rounded-l border font-medium cursor-pointer transition-all ${isActive ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400 hover:text-purple-600'}`}
                                title={`选用：${preset.value}`}
                              >
                                {preset.label}
                              </button>
                              <button
                                onClick={() => handlePreviewVoxCpm2(preset)}
                                disabled={previewingVoxCpm2}
                                className={`text-[10px] px-1.5 py-1 rounded-r border-t border-r border-b cursor-pointer transition-all ${isActive ? 'bg-purple-500 text-white border-purple-500' : 'bg-gray-50 text-gray-400 border-gray-300 hover:bg-purple-50 hover:text-purple-500 hover:border-purple-300'} disabled:opacity-40`}
                                title="试听此音色"
                              >
                                {previewingVoxCpm2 ? '...' : '▶'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {/* 试听播放器 */}
                  {voxCpm2PreviewUrl && (
                    <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-100 flex items-center gap-2">
                      <span className="text-[10px] text-purple-500 font-medium shrink-0">🎧 试听：</span>
                      <audio src={voxCpm2PreviewUrl} controls autoPlay className="flex-1" style={{height:'28px'}} />
                    </div>
                  )}
                </div>

                {/* 当前选中音色显示 + 自定义输入 */}
                <div className="mb-3 p-2 bg-purple-50 rounded border border-purple-100">
                  <div className="text-[10px] text-purple-500 mb-1 font-medium">当前音色描述符（可直接编辑自定义）：</div>
                  <Input
                    value={voxCpm2VoiceDesc}
                    onChange={e => setVoxCpm2VoiceDesc(e.target.value)}
                    size="small"
                    className="text-xs"
                    placeholder="例如：声音低沉磁性，带港台腔，语速偏慢..."
                  />
                </div>

                {/* 参数控制行 */}
                <div className="flex flex-wrap gap-3 items-center mb-3">
                  <span className="text-xs font-medium text-gray-600">引导强度：</span>
                  <Select value={voxCpm2CfgValue} onChange={setVoxCpm2CfgValue} size="small" className="w-28"
                    options={[
                      { value: 1.5, label: '1.5 自然' },
                      { value: 2.0, label: '2.0 标准' },
                      { value: 3.0, label: '3.0 强调' },
                    ]} />
                  <span className="text-xs font-medium text-gray-600">推理步数：</span>
                  <Select value={voxCpm2Timesteps} onChange={setVoxCpm2Timesteps} size="small" className="w-28"
                    options={[
                      { value: 5,  label: '5 步 极速' },
                      { value: 10, label: '10 步 标准' },
                      { value: 20, label: '20 步 精细' },
                    ]} />
                  <Button type="primary" size="small"
                    icon={generatingVoxCpm2 ? <LoadingOutlined /> : <CustomerServiceOutlined />}
                    onClick={handleGenerateVoxCpm2}
                    loading={generatingVoxCpm2}
                    disabled={!broadcastScript.trim()}
                    className="bg-purple-600 border-purple-600 font-bold">
                    生成完整口播语音
                  </Button>
                  {voxCpm2Url && (
                    <Button size="small" icon={<DownloadOutlined />}
                      onClick={() => { const a = document.createElement('a'); a.href = voxCpm2Url; a.download = 'voxcpm2_voice.wav'; a.click(); }}
                      className="text-purple-700 border-purple-300">
                      下载 WAV
                    </Button>
                  )}
                </div>

                {voxCpm2Url && (
                  <div className="p-3 bg-white rounded-lg border border-purple-200 flex items-center gap-3">
                    <SoundOutlined className="text-purple-500 text-lg flex-shrink-0" />
                    <audio src={voxCpm2Url} controls className="flex-1" style={{height:'32px'}} />
                    <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex-shrink-0">✅ VoxCPM2 · WAV</span>
                  </div>
                )}
              </div>
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

            {/* RunPod LTX 服务状态栏 + 渲染模式选项（三个视频版块共用） */}
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-500 font-medium shrink-0">RunPod 视频服务：</span>
                {ltxServiceReady === null && (
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Spin size="small" /> 检测中...</span>
                )}
                {ltxServiceReady === true && (
                  <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 服务就绪
                  </span>
                )}
                {ltxServiceReady === false && (
                  <span className="text-xs text-red-500 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 未就绪
                    <button className="ml-1 underline text-blue-500 cursor-pointer bg-transparent border-none p-0 text-xs"
                      onClick={() => {
                        setLtxServiceReady(null);
                        fetch(`${API_BASE}/api/v1/video/ltx-health`).then(r=>r.json()).then(d=>setLtxServiceReady(d.ready===true)).catch(()=>setLtxServiceReady(false));
                      }}>重检</button>
                  </span>
                )}
                <span className="text-gray-300 mx-1">|</span>
                {/* 渲染模式切换 */}
                <span className="text-xs text-gray-500 font-medium shrink-0">渲染模式：</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setLtxFastMode(false)}
                    className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${!ltxFastMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400'}`}
                  >🎬 Wan2.2 正式出片（~60s/条）</button>
                  <button
                    onClick={() => setLtxFastMode(true)}
                    className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${ltxFastMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-300 hover:border-orange-400'}`}
                  >⚡ LTX 快速预览（~8s/条）</button>
                </div>
                <span className="text-gray-300 mx-1">|</span>
                {/* 背景样式选择 */}
                <span className="text-xs text-gray-500 font-medium shrink-0">商品背景：</span>
                <div className="flex gap-1">
                  {[
                    { value: 'gradient', label: '渐变', emoji: '🌈' },
                    { value: 'white',    label: '纯白', emoji: '⬜' },
                    { value: 'warm',     label: '暖色', emoji: '🟡' },
                    { value: 'dark',     label: '深色', emoji: '⬛' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setLtxBackgroundStyle(opt.value)}
                      className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${ltxBackgroundStyle === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-300 hover:border-teal-400'}`}
                    >{opt.emoji} {opt.label}</button>
                  ))}
                </div>
              </div>
              {ltxFastMode && (
                <div className="mt-2 text-[11px] text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100">
                  ⚡ 快速预览模式：使用 LTX-Video（~8s/条），num_frames=25，steps=20，适合快速确认构图；正式出片请切换到 Wan2.2 模式。
                </div>
              )}
              {!ltxFastMode && (
                <div className="mt-2 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                  🎬 正式出片模式：使用 Wan2.2（~60s/条），num_frames=97，steps=50，有参考图时自动启用 TI2V/I2V 模型，CLIP 自动选最匹配角度。
                </div>
              )}
            </div>

            {/* ── 商品视频（1:1 / 16:9 / 3:4，≤60s，展示在轮播图首位） ── */}
            <Form.Item label={<span className="font-bold text-gray-700 block">商品视频</span>} className="mb-8">
              <div className="flex flex-col gap-4">
                <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-700">
                  视频要求：时长 60 秒以内；宽高比为 <strong>1:1 或 16:9 或 3:4</strong>。上传后展示在商品轮播图位置首位，享全站流量扶持，提升转化。
                </div>

                {/* AI 生成区 */}
                <div className="flex flex-wrap gap-3 items-center bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <Button icon={<RobotOutlined />} onClick={_generateScriptOnly} loading={generatingScript}
                    disabled={generatingVideo} className="text-indigo-600 border-indigo-300 bg-indigo-50 font-bold">
                    生成分镜脚本
                  </Button>
                  <Button type="primary" icon={<VideoCameraOutlined />} onClick={handleGenerateVideo} loading={generatingVideo}
                    disabled={generatingScript} className="bg-purple-600 font-bold">
                    AI 生成视频（Seedance）
                  </Button>
                  {generatingVideo && (
                    <span className="text-purple-600 font-bold text-xs flex items-center">
                      <Spin size="small" className="mr-2"/>{videoRenderProgress}
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2" onClick={() => stopGeneration('video')} />
                    </span>
                  )}
                  {videoClips.some(v => v !== '') && (
                    <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadVideos}
                      loading={downloading} className="text-green-600 border-green-300 bg-green-50 font-bold ml-auto">
                      打包下载
                    </Button>
                  )}
                </div>

                {/* 分镜脚本 + LTX */}
                {generatingScript && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3 text-indigo-700 text-sm">
                    <Spin size="small" /><span>AI 正在构思分镜脚本，请稍候...</span>
                  </div>
                )}
                {!generatingScript && script && (
                  <div className="border border-indigo-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 flex items-center justify-between">
                      <span className="text-white font-bold text-sm">📋 分镜脚本（{script.storyboard.length} 个分镜）</span>
                      <Button size="small" icon={<VideoCameraOutlined />} onClick={_generateLtxFromScript}
                        loading={generatingLtx} disabled={generatingLtx}
                        className="bg-white/20 text-white border-white/40 font-bold text-xs">
                        {generatingLtx ? ltxProgress || 'LTX 渲染中...' : '▶ LTX 生成视频（RunPod）'}
                      </Button>
                    </div>
                    <div className="p-3 bg-indigo-50/50 border-b border-indigo-100">
                      <span className="text-xs text-indigo-500 font-medium">全局风格：</span>
                      <span className="text-xs text-gray-600 ml-1">{script.global_style_prompt}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {script.storyboard.map((shot, idx) => (
                        <div key={idx} className="flex gap-3 px-4 py-2 hover:bg-gray-50">
                          <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">{idx+1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-gray-800">{shot.logic}</span>
                              {shot.video_type === 'image-to-video'
                                ? <span className="text-[10px] px-1 py-0.5 bg-orange-100 text-orange-600 rounded font-bold">🖼 图生视频</span>
                                : <span className="text-[10px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded font-bold">✏️ 文生视频</span>}
                            </div>
                            <div className="text-[11px] text-gray-500 break-words">{shot.scene_prompt}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(generatingLtx || ltxClips.some(v => v !== '')) && (
                      <div className="border-t border-indigo-100 p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-700">
                            🎬 LTX 渲染结果
                            {generatingLtx && <span className="ml-2 text-indigo-500 font-normal animate-pulse text-[11px]">{ltxProgress}</span>}
                          </span>
                          {ltxClips.some(v => v !== '') && (
                            <Button size="small" icon={<DownloadOutlined />} loading={downloading}
                              onClick={() => { ltxClips.filter(u=>u).forEach((url,i)=>{ const a=document.createElement('a'); a.href=url; a.download=`ltx_clip_${i+1}.mp4`; a.click(); }); }}
                              className="text-green-600 border-green-300 bg-green-50 font-bold">打包下载</Button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                          {ltxClips.map((vidUrl, i) => (
                            <div key={i} className="aspect-video bg-black border border-gray-200 rounded flex items-center justify-center relative overflow-hidden group">
                              <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded z-10">{i+1}</span>
                              {vidUrl ? (
                                <><video src={vidUrl} controls className="w-full h-full object-cover" />
                                <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 z-10">
                                  <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                                </div></>
                              ) : (
                                <div className="flex flex-col items-center text-white">
                                  {generatingLtx ? (
                                    <><Spin size="small" /><span className="text-[8px] mt-1 opacity-60">渲染中</span></>
                                  ) : (
                                    <><VideoCameraOutlined className="text-sm opacity-40" /><span className="text-[8px] opacity-40">LTX</span></>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Seedance 结果网格 */}
                {videoClips.some(v => v !== '') && (
                  <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
                    {videoClips.filter(v => v).map((vidUrl, i) => (
                      <div key={i} className="aspect-square bg-black border border-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm group">
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded z-10">切片 {i+1}</span>
                        <video src={vidUrl} controls className="w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 z-10">
                          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Form.Item>

            {/* ── 商品讲解视频（9:16，10s～5min，展示在商详悬浮窗） ── */}
            <Form.Item label={<span className="font-bold text-gray-700 block">商品讲解视频</span>} className="mb-8">
              <div className="flex flex-col gap-4">
                <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-700">
                  视频要求：时长 10 秒～5 分钟以内；宽高比为 <strong>9:16</strong>。上传后展示在商详悬浮窗，享受全站流量扶持，下单转化 +20%。
                </div>
                <div className="flex flex-wrap gap-3 items-center bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <Button icon={<RobotOutlined />}
                    onClick={() => _generateScript('9:16', setGeneratingExplainScript, setExplainScript, 'explain_script')}
                    loading={generatingExplainScript} disabled={generatingExplainVideo}
                    className="text-orange-600 border-orange-300 bg-orange-50 font-bold">
                    生成分镜脚本（9:16）
                  </Button>
                  <Button type="primary" icon={<VideoCameraOutlined />}
                    onClick={() => _generateSeedanceVideo('9:16', setGeneratingExplainVideo, setExplainVideoProgress, setExplainVideoClips, 'explainVideo')}
                    loading={generatingExplainVideo} disabled={generatingExplainScript}
                    className="bg-orange-500 font-bold">
                    AI 生成视频（Seedance 9:16）
                  </Button>
                  {generatingExplainVideo && (
                    <span className="text-orange-600 font-bold text-xs flex items-center">
                      <Spin size="small" className="mr-2"/>{explainVideoProgress}
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2"
                        onClick={() => { abortControllers.current['explainVideo']?.abort(); setGeneratingExplainVideo(false); }} />
                    </span>
                  )}
                  {explainVideoClips.some(v => v !== '') && (
                    <Button size="small" icon={<DownloadOutlined />} loading={downloading}
                      onClick={() => { const valid = explainVideoClips.filter(u=>u); if(!valid.length) return; const zip = new JSZip(); const folder = zip.folder('explain_video'); valid.forEach(async (url,i) => { const r = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`); folder?.file(`讲解视频_${i+1}.mp4`, await r.blob()); }); zip.generateAsync({type:'blob'}).then(c => saveAs(c,'explain_videos.zip')); }}
                      className="text-green-600 border-green-300 bg-green-50 font-bold ml-auto">
                      打包下载
                    </Button>
                  )}
                </div>
                {generatingExplainScript && (
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-3 text-orange-700 text-sm">
                    <Spin size="small" /><span>AI 正在构思 9:16 竖版分镜脚本...</span>
                  </div>
                )}
                {!generatingExplainScript && explainScript && (
                  <div className="border border-orange-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 flex items-center justify-between">
                      <span className="text-white font-bold text-sm">📋 分镜脚本（{explainScript.storyboard.length} 个分镜 · 9:16）</span>
                      <Button size="small" icon={<VideoCameraOutlined />}
                        onClick={() => _generateLtx(explainScript, setGeneratingExplainLtx, setExplainLtxProgress, setExplainLtxClips)}
                        loading={generatingExplainLtx} disabled={generatingExplainLtx}
                        className="bg-white/20 text-white border-white/40 font-bold text-xs">
                        {generatingExplainLtx ? explainLtxProgress || 'LTX 渲染中...' : '▶ LTX 生成视频（RunPod）'}
                      </Button>
                    </div>
                    <div className="p-3 bg-orange-50/50 border-b border-orange-100">
                      <span className="text-xs text-orange-500 font-medium">全局风格：</span>
                      <span className="text-xs text-gray-600 ml-1">{explainScript.global_style_prompt}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {explainScript.storyboard.map((shot, idx) => (
                        <div key={idx} className="flex gap-3 px-4 py-2 hover:bg-gray-50">
                          <span className="flex-shrink-0 w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">{idx+1}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-gray-800 block mb-0.5">{shot.logic}</span>
                            <span className="text-[11px] text-gray-500 break-words">{shot.scene_prompt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(generatingExplainLtx || explainLtxClips.some(v => v !== '')) && (
                      <div className="border-t border-orange-100 p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-700">
                            🎬 LTX 渲染结果（9:16）
                            {generatingExplainLtx && <span className="ml-2 text-orange-500 font-normal animate-pulse text-[11px]">{explainLtxProgress}</span>}
                          </span>
                          {explainLtxClips.some(v => v !== '') && (
                            <Button size="small" icon={<DownloadOutlined />} loading={downloading}
                              onClick={() => { explainLtxClips.filter(u=>u).forEach((url,i)=>{ const a=document.createElement('a'); a.href=url; a.download=`explain_ltx_${i+1}.mp4`; a.click(); }); }}
                              className="text-green-600 border-green-300 bg-green-50 font-bold">打包下载</Button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                          {explainLtxClips.map((vidUrl, i) => (
                            <div key={i} className="aspect-[9/16] bg-black border border-gray-200 rounded flex items-center justify-center relative overflow-hidden group">
                              <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded z-10">{i+1}</span>
                              {vidUrl ? (
                                <><video src={vidUrl} controls className="w-full h-full object-cover" />
                                <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 z-10">
                                  <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                                </div></>
                              ) : (
                                <div className="flex flex-col items-center text-white">
                                  {generatingExplainLtx ? (
                                    <><Spin size="small" /><span className="text-[8px] mt-1 opacity-60">渲染中</span></>
                                  ) : (
                                    <><VideoCameraOutlined className="text-sm opacity-40" /><span className="text-[8px] opacity-40">LTX</span></>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {explainVideoClips.some(v => v !== '') && (
                  <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
                    {explainVideoClips.filter(v => v).map((vidUrl, i) => (
                      <div key={i} className="aspect-[9/16] bg-black border border-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm group">
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded z-10">切片 {i+1}</span>
                        <video src={vidUrl} controls className="w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 z-10">
                          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Form.Item>

            {/* ── 商详视频（16:9，≤3min，展示在商详图文顶部） ── */}
            <Form.Item label={<span className="font-bold text-gray-700 block">商详视频</span>} className="mb-12">
              <div className="flex flex-col gap-4">
                <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg text-xs text-teal-700">
                  视频要求：时长 3 分钟以内；宽高比为 <strong>16:9</strong>。上传后展示在商详图文详情顶部。
                </div>
                <div className="flex flex-wrap gap-3 items-center bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <Button icon={<RobotOutlined />}
                    onClick={() => _generateScript('16:9', setGeneratingDetailScript, setDetailScript, 'detail_script')}
                    loading={generatingDetailScript} disabled={generatingDetailVideo}
                    className="text-teal-600 border-teal-300 bg-teal-50 font-bold">
                    生成分镜脚本（16:9）
                  </Button>
                  <Button type="primary" icon={<VideoCameraOutlined />}
                    onClick={() => _generateSeedanceVideo('16:9', setGeneratingDetailVideo, setDetailVideoProgress, setDetailVideoClips, 'detailVideo')}
                    loading={generatingDetailVideo} disabled={generatingDetailScript}
                    className="bg-teal-600 font-bold">
                    AI 生成视频（Seedance 16:9）
                  </Button>
                  {generatingDetailVideo && (
                    <span className="text-teal-600 font-bold text-xs flex items-center">
                      <Spin size="small" className="mr-2"/>{detailVideoProgress}
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2"
                        onClick={() => { abortControllers.current['detailVideo']?.abort(); setGeneratingDetailVideo(false); }} />
                    </span>
                  )}
                  {detailVideoClips.some(v => v !== '') && (
                    <Button size="small" icon={<DownloadOutlined />} loading={downloading}
                      onClick={() => { const valid = detailVideoClips.filter(u=>u); if(!valid.length) return; valid.forEach((url,i)=>{ const a=document.createElement('a'); a.href=url; a.download=`detail_video_${i+1}.mp4`; a.click(); }); }}
                      className="text-green-600 border-green-300 bg-green-50 font-bold ml-auto">
                      打包下载
                    </Button>
                  )}
                </div>
                {generatingDetailScript && (
                  <div className="p-4 bg-teal-50 border border-teal-100 rounded-lg flex items-center gap-3 text-teal-700 text-sm">
                    <Spin size="small" /><span>AI 正在构思 16:9 横版分镜脚本...</span>
                  </div>
                )}
                {!generatingDetailScript && detailScript && (
                  <div className="border border-teal-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 flex items-center justify-between">
                      <span className="text-white font-bold text-sm">📋 分镜脚本（{detailScript.storyboard.length} 个分镜 · 16:9）</span>
                      <Button size="small" icon={<VideoCameraOutlined />}
                        onClick={() => _generateLtx(detailScript, setGeneratingDetailLtx, setDetailLtxProgress, setDetailLtxClips)}
                        loading={generatingDetailLtx} disabled={generatingDetailLtx}
                        className="bg-white/20 text-white border-white/40 font-bold text-xs">
                        {generatingDetailLtx ? detailLtxProgress || 'LTX 渲染中...' : '▶ LTX 生成视频（RunPod）'}
                      </Button>
                    </div>
                    <div className="p-3 bg-teal-50/50 border-b border-teal-100">
                      <span className="text-xs text-teal-500 font-medium">全局风格：</span>
                      <span className="text-xs text-gray-600 ml-1">{detailScript.global_style_prompt}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {detailScript.storyboard.map((shot, idx) => (
                        <div key={idx} className="flex gap-3 px-4 py-2 hover:bg-gray-50">
                          <span className="flex-shrink-0 w-5 h-5 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">{idx+1}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-gray-800 block mb-0.5">{shot.logic}</span>
                            <span className="text-[11px] text-gray-500 break-words">{shot.scene_prompt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(generatingDetailLtx || detailLtxClips.some(v => v !== '')) && (
                      <div className="border-t border-teal-100 p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-700">
                            🎬 LTX 渲染结果（16:9）
                            {generatingDetailLtx && <span className="ml-2 text-teal-500 font-normal animate-pulse text-[11px]">{detailLtxProgress}</span>}
                          </span>
                          {detailLtxClips.some(v => v !== '') && (
                            <Button size="small" icon={<DownloadOutlined />} loading={downloading}
                              onClick={() => { detailLtxClips.filter(u=>u).forEach((url,i)=>{ const a=document.createElement('a'); a.href=url; a.download=`detail_ltx_${i+1}.mp4`; a.click(); }); }}
                              className="text-green-600 border-green-300 bg-green-50 font-bold">打包下载</Button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                          {detailLtxClips.map((vidUrl, i) => (
                            <div key={i} className="aspect-video bg-black border border-gray-200 rounded flex items-center justify-center relative overflow-hidden group">
                              <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded z-10">{i+1}</span>
                              {vidUrl ? (
                                <><video src={vidUrl} controls className="w-full h-full object-cover" />
                                <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 z-10">
                                  <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                                </div></>
                              ) : (
                                <div className="flex flex-col items-center text-white">
                                  {generatingDetailLtx ? (
                                    <><Spin size="small" /><span className="text-[8px] mt-1 opacity-60">渲染中</span></>
                                  ) : (
                                    <><VideoCameraOutlined className="text-sm opacity-40" /><span className="text-[8px] opacity-40">LTX</span></>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {detailVideoClips.some(v => v !== '') && (
                  <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
                    {detailVideoClips.filter(v => v).map((vidUrl, i) => (
                      <div key={i} className="aspect-video bg-black border border-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm group">
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded z-10">切片 {i+1}</span>
                        <video src={vidUrl} controls className="w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 z-10">
                          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
