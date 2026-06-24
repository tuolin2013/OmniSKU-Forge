// frontend/src/components/TaobaoPublish.tsx
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Select, message, Divider, Modal, Spin, Upload, Image, Tabs, Switch, Tag, Cascader } from 'antd';
import { 
  RobotOutlined, PictureOutlined, ThunderboltOutlined, 
  VideoCameraOutlined, CloudOutlined, UploadOutlined, RocketOutlined, EditOutlined, DownloadOutlined,
  CheckCircleFilled, PlusOutlined, CloseCircleOutlined, LoadingOutlined,
  SoundOutlined, CustomerServiceOutlined
} from '@ant-design/icons';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const { Option } = Select;

const RENDER_MODELS = [
  { id: 'gpt-image-2', label: 'gpt-image-2 (特价版)', color: 'blue' },
  { id: 'gpt-image-2-vip', label: 'gpt-image-2-vip (直连满血)', color: 'purple' },
  { id: 'nano-banana-pro', label: 'nano-banana-pro (顶配超清)', color: 'red' },
];

const TEXT_MODELS = [
  { id: 'gpt-5.5', label: 'gpt-5.5 (高级推理)', color: 'blue' },
  { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash (极速响应)', color: 'purple' },
];

export default function TaobaoPublish() {
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('graphic');
  
  const [parsing, setParsing] = useState(false);             
  const [parsingModel, setParsingModel] = useState<string>('gpt-5.5');
  const [generatingTitle, setGeneratingTitle] = useState(false); 
  const [titleModel, setTitleModel] = useState<string>('gpt-5.5');
  
  // 🚀 状态解耦
  const [generatingMainImages11, setGeneratingMainImages11] = useState(false);
  const [mainImageModel11, setMainImageModel11] = useState<string>('');
  const [mainRenderProgress11, setMainRenderProgress11] = useState("");
  const [mainImages11, setMainImages11] = useState<string[]>(Array(5).fill(''));

  const [generatingMainImages34, setGeneratingMainImages34] = useState(false);
  const [mainImageModel34, setMainImageModel34] = useState<string>('');
  const [mainRenderProgress34, setMainRenderProgress34] = useState("");
  const [mainImages34, setMainImages34] = useState<string[]>(Array(5).fill(''));

  const [generatingWhiteBgImages, setGeneratingWhiteBgImages] = useState(false);
  const [whiteBgImageModel, setWhiteBgImageModel] = useState<string>('');
  const [whiteBgRenderProgress, setWhiteBgRenderProgress] = useState("");
  const [whiteBgImages, setWhiteBgImages] = useState<string[]>(Array(1).fill(''));

  const [generatingDetails, setGeneratingDetails] = useState(false); 
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [detailRenderProgress, setDetailRenderProgress] = useState("");
  const [detailImageModel, setDetailImageModel] = useState<string>('');

  const [generatingSkuImages, setGeneratingSkuImages] = useState(false);
  const [skuImageModel, setSkuImageModel] = useState<string>('');
  const [skuRenderProgress, setSkuRenderProgress] = useState("");
  const [skuImages, setSkuImages] = useState<string[]>(Array(5).fill(''));

  const [generatingVideo, setGeneratingVideo] = useState(false); 
  const [videoRenderProgress, setVideoRenderProgress] = useState("");
  const [videoClips, setVideoClips] = useState<string[]>(Array(12).fill(''));

  // LTX RunPod 视频（script-first 模式，与 PDD 一致）
  const [ltxServiceReady, setLtxServiceReady] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/video/ltx-health`)
      .then(r => r.json())
      .then(d => setLtxServiceReady(d.ready === true))
      .catch(() => setLtxServiceReady(false));
  }, []);
  const [ltxFastMode, setLtxFastMode] = useState(false);
  const [ltxBackgroundStyle, setLtxBackgroundStyle] = useState<string>('gradient');

  type TaobaoScriptData = { global_style_prompt: string; ratio?: string; storyboard: { logic: string; scene_prompt: string; video_type?: string }[] };
  const [generatingScript, setGeneratingScript] = useState(false);
  const [videoScript, setVideoScript] = useState<TaobaoScriptData | null>(null);
  const [generatingLtxVideo, setGeneratingLtxVideo] = useState(false);
  const [ltxVideoProgress, setLtxVideoProgress] = useState("");
  const [ltxVideoClips, setLtxVideoClips] = useState<string[]>(Array(12).fill(''));

  const [generatingBuyerShows, setGeneratingBuyerShows] = useState(false);
  const [buyerShowModel, setBuyerShowModel] = useState<string>('');
  const [buyerShowProgress, setBuyerShowProgress] = useState("");
  const [buyerShowImages, setBuyerShowImages] = useState<string[]>([]);
  const [buyerShowTexts, setBuyerShowTexts] = useState<string[]>([]);
  const [buyerShowCount, setBuyerShowCount] = useState<number>(5);
  const [buyerShowR2Images, setBuyerShowR2Images] = useState<string[]>([]);

  // 🛑 终止生成控制器
  const abortControllers = useRef<Record<string, AbortController | null>>({
    main11: null,
    main34: null,
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

  const [catalogTree, setCatalogTree] = useState([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/catalog/tree`)
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
  
  const [selectedR2Images, setSelectedR2Images] = useState<string[]>([]); 
  const [isR2ModalVisible, setIsR2ModalVisible] = useState(false);
  const [r2ModalTarget, setR2ModalTarget] = useState<'global' | 'buyerShow'>('global');
  const [r2Gallery, setR2Gallery] = useState<string[]>([]);
  const [fetchingR2, setFetchingR2] = useState(false);
  const [uploadingR2, setUploadingR2] = useState(false); 
  const [r2Page, setR2Page] = useState(1);
  const [hasMoreR2, setHasMoreR2] = useState(false);

  const [downloading, setDownloading] = useState(false);

  // 🎙️ 口播文案 & TTS 状态
  const [extractingScript, setExtractingScript] = useState(false);
  const [broadcastScript, setBroadcastScript] = useState('');
  const [ttsVoice, setTtsVoice] = useState('zf_xiaobei');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [generatingTts, setGeneratingTts] = useState(false);
  const [ttsVoiceUrl, setTtsVoiceUrl] = useState('');
  // VoxCPM2 TTS
  const VOXCPM2_ENDPOINT = process.env.NEXT_PUBLIC_VOXCPM2_URL || 'https://tuolin2011--voxcpm2-api-factory-voxcpm2service-api-endpoint.modal.run';
  const [generatingVoxCpm2, setGeneratingVoxCpm2] = useState(false);
  const [voxCpm2CfgValue, setVoxCpm2CfgValue] = useState(2.0);
  const [voxCpm2Timesteps, setVoxCpm2Timesteps] = useState(10);
  const [voxCpm2Url, setVoxCpm2Url] = useState('');

  // === 🚀 全局任务状态收集 ===
  const activeTasks = [
    { name: "生成图文策划案", active: parsing, status: "执行中..." },
    { name: "生成高转化标题", active: generatingTitle, status: "执行中..." },
    { name: "生成 1:1 主图", active: generatingMainImages11, status: mainRenderProgress11 },
    { name: "生成 3:4 主图", active: generatingMainImages34, status: mainRenderProgress34 },
    { name: "排版详情页", active: generatingDetails, status: detailRenderProgress },
    { name: "生成白底图", active: generatingWhiteBgImages, status: whiteBgRenderProgress },
    { name: "生成SKU图", active: generatingSkuImages, status: skuRenderProgress },
    { name: "生成商品视频", active: generatingVideo, status: videoRenderProgress },
    { name: "生成买家秀", active: generatingBuyerShows, status: buyerShowProgress }
  ].filter(t => t.active);
  
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

  const handleParseFeatures = async (targetModelId: string) => {
    const skuName = form.getFieldValue('target_sku');
    const baseDesc = form.getFieldValue('base_desc');
    
    if (!skuName) return message.warning('请先在下拉框选择核心产品 (SKU)！');
    if (!baseDesc) return message.warning('请先输入老板意图！');

    setParsingModel(targetModelId);
    setParsing(true);
    form.setFieldsValue({ pm_report: '' }); 
    message.loading({ content: '淘宝大脑正在研读全维度档案...', key: 'pm_stream' });

    // 180s 超时保护
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 180_000);

    try {
      const response = await fetch(`${API_BASE}/api/v1/agents/pm-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({ 
          platform: 'taobao', 
          sku_name: skuName,
          text_desc: baseDesc, 
          image_urls: selectedR2Images,
          model: targetModelId
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
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
      message.success({ content: '淘宝策划案生成完毕！', key: 'pm_stream' });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        message.error({ content: '策划案生成超时（超过180秒），请检查网络或重试', key: 'pm_stream' });
      } else {
        message.error({ content: `分析中断: ${err.message}`, key: 'pm_stream' });
      }
    } finally {
      clearTimeout(timeoutId);
      setParsing(false);
    }
  };

  const handleGenerateTitle = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    const skuName = form.getFieldValue('target_sku');
    if (!pmReport) return message.warning('请先出具会议纪要');
    if (!skuName) return message.warning('请先选择目标产品 (SKU)');
    
    setTitleModel(targetModelId);
    setGeneratingTitle(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/agents/ops-title`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platform: 'taobao', 
          sku_name: skuName,
          pm_report: pmReport, 
          model: targetModelId 
        })
      });
      if (!response.ok) throw new Error(`后端连不上 (HTTP ${response.status})`);
      
      const data = await response.json();
      if (data.code === 200 && data.data) {
        let cleanJsonStr = data.data;
        if (cleanJsonStr.includes('```json')) {
          cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
        } else if (cleanJsonStr.includes('```')) {
          cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
        }
        
        const parsedData = JSON.parse(cleanJsonStr);
        // Fix: ops-title endpoint returns { title: "...", keywords: [...] } based on OmniBrain.run_ops_agent
        form.setFieldsValue({ title: (parsedData.title || parsedData.seo_titles?.[0] || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s【】]/g, '').trim() });
        message.success(' 淘宝高权重标题生成成功！');
      } else {
        throw new Error(data.message || '后端异常');
      }
    } catch (error: any) {
      message.error(` 标题生成失败: ${error.message}`);
    } finally { 
      setGeneratingTitle(false); 
    }
  };

  const handleGenerateImages = async (targetModelId: string, type: '1:1' | '3:4' | 'whitebg') => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (selectedR2Images.length === 0) return message.warning('必须选择原图！');

    if (type === '1:1') {
      setMainImageModel11(targetModelId);
      setGeneratingMainImages11(true);
    } else if (type === '3:4') {
      setMainImageModel34(targetModelId);
      setGeneratingMainImages34(true);
    } else {
      setWhiteBgImageModel(targetModelId);
      setGeneratingWhiteBgImages(true);
    }

    const setProgress = type === '1:1' ? setMainRenderProgress11 : type === '3:4' ? setMainRenderProgress34 : setWhiteBgRenderProgress;
    const setImages = type === '1:1' ? setMainImages11 : type === '3:4' ? setMainImages34 : setWhiteBgImages;
    const count = type === 'whitebg' ? 1 : 5;
    const abortKey = type === '1:1' ? 'main11' : type === '3:4' ? 'main34' : 'whitebg';

    setProgress(`连接 ${targetModelId} 构思分镜...`);
    
    abortControllers.current[abortKey] = new AbortController();

    try {
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-main-image-brief`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'taobao', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！`);
      const briefData = await briefRes.json();
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      const parsedData = JSON.parse(cleanJsonStr);
      setImages(Array(count).fill(''));
      const updatedImages = Array(count).fill('');

      for (let i = 0; i < count; i++) {
        if (abortControllers.current[abortKey]?.signal.aborted) break;

        const scene = parsedData.storyboard[i] || { scene_prompt: "product showcase" };
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current[abortKey]?.signal.aborted) break;

          attempts++;
          setProgress(`生成第 ${i + 1}/${count} 张...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current[abortKey]?.signal,
              body: JSON.stringify({ 
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}, ratio ${type}`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                platform: 'taobao',
                product_name: form.getFieldValue('target_sku') || 'taobao_product',
                image_type: type === 'whitebg' ? 'whitebg' : 'main'
              }) 
            });
            
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setImages([...updatedImages]); 
              success = true;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true;
              break;
            }
          }
        }
      }
      if (abortControllers.current[abortKey]?.signal.aborted) {
        message.warning(`${type} 素材生成已手动终止`);
      } else {
        message.success(`${type} 素材渲染完毕！`);
      }
    } catch (error: any) {
      message.error(`生成中断: ${error.message}`);
    } finally {
      if (type === '1:1') setGeneratingMainImages11(false);
      else if (type === '3:4') setGeneratingMainImages34(false);
      else setGeneratingWhiteBgImages(false);
      setProgress("");
      abortControllers.current[abortKey] = null;
    }
  };

  const handleGenerateDetails = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    setDetailImageModel(targetModelId);
    setGeneratingDetails(true);
    message.loading({ content: `淘宝详情页排版中...`, key: 'details', duration: 0 });
    
    abortControllers.current['detail'] = new AbortController();

    try {
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-detail-image-brief`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'taobao', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      const briefData = await briefRes.json();
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      const parsedData = JSON.parse(cleanJsonStr);

      const numSlices = parsedData.storyboard.length || 12;
      setDetailImages(Array(numSlices).fill('')); 
      const updatedImages = Array(numSlices).fill('');

      for (let i = 0; i < numSlices; i++) {
        if (abortControllers.current['detail']?.signal.aborted) break;

        const scene = parsedData.storyboard[i];
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          if (abortControllers.current['detail']?.signal.aborted) break;

          attempts++;
          setDetailRenderProgress(`生成第 ${i + 1}/${numSlices} 屏...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['detail']?.signal,
              body: JSON.stringify({ 
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                platform: 'taobao',
                product_name: form.getFieldValue('target_sku') || 'taobao_product',
                image_type: 'detail'
              }) 
            });
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
      }
      
      if (abortControllers.current['detail']?.signal.aborted) {
        message.warning({ content: `淘宝详情页生成已手动终止`, key: 'details' });
      } else {
        message.success({ content: `淘宝详情页渲染完毕！`, key: 'details' });
      }
    } catch (error: any) {
      message.error({ content: `详情页生成中断`, key: 'details' });
    } finally {
      setGeneratingDetails(false);
      setDetailRenderProgress("");
      abortControllers.current['detail'] = null;
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
        body: JSON.stringify({ platform: 'taobao', pm_report: pmReport, ops_report: form.getFieldValue('base_desc') || '' })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！`);
      const briefData = await briefRes.json();
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      const parsedData = JSON.parse(cleanJsonStr);
      const numImages = parsedData.storyboard.length || 5;
      setSkuImages(Array(numImages).fill(''));
      const updatedImages = Array(numImages).fill('');

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
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, 
                image_urls: selectedR2Images, 
                model: targetModelId,
                platform: 'taobao',
                product_name: form.getFieldValue('target_sku') || 'taobao_product',
                image_type: 'sku'
              }) 
            });
            
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
      }
      
      if (abortControllers.current['sku']?.signal.aborted) {
        message.warning(`淘宝 SKU 规格图生成已手动终止`);
      } else {
        message.success(`淘宝 SKU 规格图渲染完毕！`);
      }
    } catch (error: any) {
      message.error(`生成中断: ${error.message}`);
    } finally {
      setGeneratingSkuImages(false);
      setSkuRenderProgress("");
      abortControllers.current['sku'] = null;
    }
  };

  const handleGenerateVideo = async () => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) return message.warning('请先生成策划案');
    
    setGeneratingVideo(true);
    setVideoRenderProgress("构思视频剧本中...");
    
    abortControllers.current['video'] = new AbortController();
    let wsRef: WebSocket | null = null;

    try {
      // 1. 获取剧本
      const scriptRes = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllers.current['video']?.signal,
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'taobao' })
      });
      
      if (!scriptRes.ok) throw new Error("剧本生成失败");
      const scriptData = await scriptRes.json();
      
      let cleanJsonStr = scriptData.data;
      if (cleanJsonStr.includes('```json')) cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      const parsedData = JSON.parse(cleanJsonStr);

      const numClips = parsedData.storyboard.length || 12;
      setVideoClips(Array(numClips).fill(''));
      const updatedClips: string[] = Array(numClips).fill('');

      setVideoRenderProgress(`连接渲染节点...`);

      // 2. 通过 WebSocket 逐条生成（避免 HTTP 超时）
      await new Promise<void>((resolve, reject) => {
        const wsUrl = API_BASE
          .replace(/^https:\/\//, 'wss://')
          .replace(/^http:\/\//, 'ws://');
        
        const ws = new WebSocket(`${wsUrl}/api/v1/video/ws/generate-from-script`);
        wsRef = ws;

        ws.onopen = () => {
          // 发送完整分镜请求
          ws.send(JSON.stringify({
            global_style_prompt: parsedData.global_style_prompt || '',
            ratio: '16:9',
            storyboard: parsedData.storyboard.map((scene: any) => ({
              logic: scene.logic || scene.scene_prompt,
              scene_prompt: scene.scene_prompt,
              video_type: selectedR2Images.length > 0 ? 'image-to-video' : 'text-to-video',
            })),
            image_urls: selectedR2Images,
            num_frames: 97,
            steps: 50,
            fast: false,
          }));
        };

        ws.onmessage = (event) => {
          // Check abort signal
          if (abortControllers.current['video']?.signal.aborted) {
            ws.close();
            resolve();
            return;
          }

          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'init') {
              setVideoRenderProgress(`开始渲染 ${msg.total} 个分镜...`);

            } else if (msg.type === 'progress') {
              updatedClips[msg.index] = msg.url;
              setVideoClips([...updatedClips]);
              setVideoRenderProgress(`✅ 分镜 ${msg.index + 1}/${msg.total} 完成`);

            } else if (msg.type === 'error') {
              updatedClips[msg.index] = '';
              setVideoRenderProgress(`⚠️ 分镜 ${msg.index + 1}/${msg.total} 失败，继续下一条...`);

            } else if (msg.type === 'done') {
              message.success(`视频渲染完成！成功 ${msg.success} / 失败 ${msg.failed}`);
              resolve();

            } else if (msg.type === 'fatal') {
              reject(new Error(msg.error));
            }
          } catch (e) {
            console.error('[ws_video] parse error', e);
          }
        };

        ws.onerror = (e) => {
          reject(new Error('WebSocket 连接失败，请检查后端服务'));
        };

        ws.onclose = (e) => {
          if (!e.wasClean && e.code !== 1000) {
            reject(new Error(`WebSocket 异常断开 (code=${e.code})`));
          } else {
            resolve();
          }
        };

        // 监听 abort 信号
        abortControllers.current['video']?.signal.addEventListener('abort', () => {
          ws.close(1000, '用户手动终止');
          resolve();
        });
      });

      if (abortControllers.current['video']?.signal.aborted) {
        message.warning('视频生成已手动终止');
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        message.error(`视频生成中断: ${error.message}`);
      }
    } finally {
      wsRef = null;
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
      const folder = zip.folder('taobao_video_clips');
      for (let i = 0; i < validClips.length; i++) {
        const url = validClips[i];
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`视频切片_${i + 1}.mp4`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `taobao_video_clips.zip`);
      message.success({ content: '全部视频片段打包下载完成！', key: 'download_video' });
    } catch (err) {
      message.error({ content: '下载失败', key: 'download_video' });
    } finally {
      setDownloading(false);
    }
  };

  const handleGenerateBuyerShows = async (targetModelId: string) => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先出具会议纪要！');
    if (buyerShowR2Images.length === 0) return message.warning('必须选择买家秀参考原图！');

    setBuyerShowModel(targetModelId);
    setGeneratingBuyerShows(true);
    setBuyerShowProgress(`连接 ${targetModelId} 构思买家秀...`);
    
    abortControllers.current['buyerShow'] = new AbortController();

    try {
      const briefRes = await fetch(`${API_BASE}/api/v1/agents/design-buyer-show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platform: 'taobao', 
          pm_report: pmReport, 
          ops_report: form.getFieldValue('base_desc') || '',
          count: buyerShowCount 
        })
      });
      
      if (!briefRes.ok) throw new Error(`设计大脑没连上后端！`);
      const briefData = await briefRes.json();
      
      let cleanJsonStr = briefData.data;
      if (cleanJsonStr.includes('```json')) {
        cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      } else if (cleanJsonStr.includes('```')) {
        cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      }

      const parsedData = JSON.parse(cleanJsonStr);
      const generatedItems = parsedData.buyer_shows || [];
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
                prompt: `${parsedData.global_style_prompt}, ${scene.image_prompt}`, 
                image_urls: buyerShowR2Images, 
                model: targetModelId,
                platform: 'taobao',
                product_name: form.getFieldValue('target_sku') || 'taobao_product',
                image_type: 'buyer_show'
              }) 
            });
            
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setBuyerShowImages([...updatedImages]); 
              success = true;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              success = true;
              break;
            }
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
      const folder = zip.folder('taobao_buyer_shows');
      
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
      saveAs(content, `taobao_buyer_shows.zip`);
      message.success({ content: '买家秀打包下载完成！', key: 'download_buyer_show' });
    } catch (err) {
      message.error({ content: '下载失败', key: 'download_buyer_show' });
    } finally {
      setDownloading(false);
    }
  };

  // 🎬 LTX RunPod 批量视频生成（generate-from-script）
  const handleGenerateLtxVideo = async () => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) return message.warning('请先生成策划案');

    setGeneratingLtxVideo(true);
    setLtxVideoProgress('构思视频剧本中...');
    setLtxVideoClips(Array(12).fill(''));

    try {
      // 1. 生成剧本 JSON
      const scriptRes = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'taobao' }),
      });
      if (!scriptRes.ok) throw new Error('剧本生成失败');
      const scriptData = await scriptRes.json();

      let cleanJsonStr = scriptData.data as string;
      if (cleanJsonStr.includes('```json')) cleanJsonStr = cleanJsonStr.split('```json')[1].split('```')[0].trim();
      else if (cleanJsonStr.includes('```')) cleanJsonStr = cleanJsonStr.split('```')[1].split('```')[0].trim();
      const parsedData = JSON.parse(cleanJsonStr);

      const storyboard = (parsedData.storyboard || []).map((s: any) => ({
        logic: s.logic || '',
        scene_prompt: s.scene_prompt || '',
        video_type: selectedR2Images.length > 0 ? 'image-to-video' : 'text-to-video',
      }));

      setLtxVideoClips(Array(storyboard.length).fill(''));
      setLtxVideoProgress(`提交 ${storyboard.length} 个分镜到 RunPod...`);

      // 2. 一次性批量提交到 RunPod LTX
      const genRes = await fetch(`${API_BASE}/api/v1/video/generate-from-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          global_style_prompt: parsedData.global_style_prompt || '',
          ratio: '16:9',
          storyboard,
          image_urls: selectedR2Images,
          num_frames: 97,
          steps: 30,
          fast: false,
          background_style: 'gradient',
        }),
      });

      if (!genRes.ok) throw new Error(`RunPod 返回 HTTP ${genRes.status}`);
      const genData = await genRes.json();

      if (genData.code === 200 && genData.results) {
        const urls = genData.results.map((r: any) => r.video_url || '');
        setLtxVideoClips(urls);
        const successCount = genData.success_count ?? urls.filter(Boolean).length;
        message.success(`RunPod 视频渲染完成！成功 ${successCount}/${genData.total} 条`);
      } else {
        throw new Error(genData.detail || '批量生成失败');
      }
    } catch (err: any) {
      message.error(`LTX 视频生成中断: ${err.message}`);
    } finally {
      setGeneratingLtxVideo(false);
      setLtxVideoProgress('');
    }
  };

  // 🎙️ 提取口播文案
  const handleExtractScript = async () => {
    const pmReport = form.getFieldValue('pm_report');
    if (!pmReport) return message.warning('请先生成策划案！');
    setExtractingScript(true);
    setBroadcastScript('');
    setTtsVoiceUrl('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/tts/extract-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pm_report: pmReport,
          sku_name: form.getFieldValue('target_sku') || '',
          platform: 'taobao',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.code === 200) {
        setBroadcastScript(data.data);
        message.success('口播文案提取成功，可在下方编辑后生成语音！');
      } else {
        throw new Error(data.detail || '提取失败');
      }
    } catch (err: any) {
      message.error(`提取口播文案失败: ${err.message}`);
    } finally {
      setExtractingScript(false);
    }
  };

  // 🎭 VoxCPM2 合成（直连 Modal GPU 端点，返回 WAV 音频流）
  const handleGenerateVoxCpm2 = async () => {
    if (!broadcastScript.trim()) return message.warning('请先提取或输入口播文案！');
    setGeneratingVoxCpm2(true);
    setVoxCpm2Url('');
    message.loading({ content: '🎭 VoxCPM2 合成中，GPU 加速约10~30秒...', key: 'voxcpm2_gen', duration: 0 });
    try {
      const params = new URLSearchParams({
        text: broadcastScript,
        cfg_value: String(voxCpm2CfgValue),
        timesteps: String(voxCpm2Timesteps),
      });
      const res = await fetch(`${VOXCPM2_ENDPOINT}?${params.toString()}`, { method: 'POST' });
      if (!res.ok) throw new Error(`VoxCPM2 服务异常 (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setVoxCpm2Url(url);
      message.success({ content: '🎉 VoxCPM2 合成完成！', key: 'voxcpm2_gen' });
    } catch (err: any) {
      message.error({ content: `VoxCPM2 失败: ${err.message}`, key: 'voxcpm2_gen' });
    } finally {
      setGeneratingVoxCpm2(false);
    }
  };

  // 🔊 (kept for compatibility — not shown in UI)
  const handleGenerateTts = async () => {
    if (!broadcastScript.trim()) return message.warning('请先提取或输入口播文案！');
    setGeneratingTts(true);
    setTtsVoiceUrl('');
    message.loading({ content: '🎙️ 正在合成语音，请稍候（约20~60秒）...', key: 'tts_gen', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/tts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: broadcastScript,
          voice: ttsVoice,
          speed: ttsSpeed,
          product_name: form.getFieldValue('target_sku') || 'product',
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.code === 200 && data.data?.url) {
        setTtsVoiceUrl(data.data.url);
        message.success({ content: '🎉 语音合成完成！已存入 R2 voice/ 文件夹', key: 'tts_gen' });
      } else {
        throw new Error(data.detail || '合成失败');
      }
    } catch (err: any) {
      message.error({ content: `语音合成失败: ${err.message}`, key: 'tts_gen' });
    } finally {
      setGeneratingTts(false);
    }
  };

  const handleDownloadZip = async (images: string[], name: string) => {
    const validImages = images.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的图片！');
    setDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(name);
      for (let i = 0; i < validImages.length; i++) {
        const url = validImages[i];
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        folder?.file(`${name}_${i + 1}.jpg`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${name}.zip`);
    } catch (err) {
      message.error('下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-orange-50/30 flex overflow-hidden text-[13px] text-gray-700 relative">
      <div className="flex-1 flex flex-col min-w-0 bg-white m-4 rounded-2xl shadow-md border border-orange-100/60 relative overflow-hidden">
        <div className="flex justify-between items-center px-8 border-b border-orange-100/40 bg-gradient-to-r from-white via-orange-50/20 to-white">
          <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab}
            className="flex-1 custom-taobao-tabs max-w-6xl mx-auto w-full"
            items={[
              { key: 'food', label: '食品安全' },
              { key: 'graphic', label: '图文描述' },
              { key: 'basic', label: '基础信息' },
              { key: 'sales', label: '销售信息' },
              { key: 'logistics', label: '物流服务' },
            ]}
          />
          <div className="flex items-center space-x-2 text-xs text-gray-500 font-medium bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm cursor-pointer hover:bg-gray-50 mr-8">
            <span>只看必填项</span>
            <Switch size="small" className="ml-1" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pb-32">
          <Form form={form} layout="horizontal" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }} onValuesChange={handleFormChange}>
            <div className="max-w-6xl mx-auto">
              <div className="mb-10 p-6 bg-gradient-to-br from-orange-50 via-amber-50/60 to-yellow-50 border border-orange-200/60 rounded-2xl shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-orange-100/40 to-transparent rounded-bl-full pointer-events-none" />
                <h3 className="text-base font-bold text-orange-800 mb-5 flex items-center gap-2">
                  <span className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center shadow-sm">
                    <RobotOutlined className="text-white text-base" />
                  </span>
                  AI 素材加工厂
                  <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-normal">淘宝专属</span>
                </h3>
                <div className="flex gap-8">
                  <div className="w-[300px]">
                    <div className="mb-3 text-sm font-bold text-blue-900">1. 上传产品实拍图 ({selectedR2Images.length}/3)</div>
                    <div className="flex gap-2 flex-wrap mb-3">
                      {selectedR2Images.map((img, idx) => (
                        <div key={idx} className="relative w-[60px] h-[60px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                          <img src={img} className="w-full h-full object-cover" />
                          <div className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => toggleR2ImageSelection(img)}>×</div>
                        </div>
                      ))}
                    {selectedR2Images.length < 3 && (
                      <div onClick={() => openR2Modal('global')} className="w-[60px] h-[60px] border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-blue-500">
                        <PlusOutlined />
                      </div>
                    )}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-4">
                    <Form.Item name="target_sku" label={<span className="text-sm font-bold text-blue-900">核心产品 (SKU)</span>} labelCol={{span: 24}} wrapperCol={{span: 24}} className="mb-0">
                      <Cascader 
                        options={catalogTree} 
                        placeholder="请先选择类目，再选择具体产品" 
                        size="large" 
                        onChange={(value) => {
                          if (value && value.length > 1) {
                            form.setFieldsValue({ target_sku: value[1] });
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="base_desc" label={<span className="text-sm font-bold text-blue-900">2. 粘贴产品说明或卖点信息</span>} labelCol={{span: 24}} wrapperCol={{span: 24}} className="mb-0">
                      <Input.TextArea rows={4} className="rounded-lg border-blue-200" placeholder="粘贴底层逻辑信息，AI 将自动扩写符合淘宝搜索权重的标题及白底素材..." />
                    </Form.Item>
                  </div>
                </div>
              </div>

              <div className="mb-8 p-5 border border-gray-200 rounded-lg bg-white">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-gray-700">第一步：提取淘宝策划案</span>
                  <div className="flex gap-2">
                    {TEXT_MODELS.map(m => (
                      <Button key={m.id} size="small" onClick={() => handleParseFeatures(m.id)} loading={parsing && parsingModel === m.id}>生成策划案 ({m.id})</Button>
                    ))}
                  </div>
                </div>
                <Form.Item name="pm_report" className="mb-4">
                  <Input.TextArea rows={6} className="text-xs bg-gray-50" placeholder="策划案将在此生成..." />
                </Form.Item>
                <div className="flex gap-3 items-center">
                  <Form.Item name="title" className="flex-1 mb-0"><Input placeholder="淘宝高权重标题..." /></Form.Item>
                  {TEXT_MODELS.map(m => (
                    <Button key={m.id} size="small" icon={<EditOutlined />} onClick={() => handleGenerateTitle(m.id)} loading={generatingTitle && titleModel === m.id}>拟定标题</Button>
                  ))}
                </div>
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

                {/* 可编辑文案区 */}
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
                  <div className="mb-2 text-[11px] text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                    💡 在文案开头用括号描述音色，例如：<code className="bg-purple-100 px-1 rounded">(声音甜美，语速稍快)</code> 你好呀！
                  </div>
                  <div className="flex flex-wrap gap-3 items-center">
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
                      VoxCPM2 生成语音
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
                    <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200 flex items-center gap-3">
                      <SoundOutlined className="text-purple-500 text-lg flex-shrink-0" />
                      <audio src={voxCpm2Url} controls className="flex-1" style={{height:'32px'}} />
                      <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex-shrink-0">✅ VoxCPM2 · WAV</span>
                    </div>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-black text-gray-800 mb-6 flex items-center"><span className="w-1.5 h-5 bg-blue-500 rounded-sm mr-2"></span>图文描述</h2>

              <Form.Item label={<span className="font-bold text-gray-700">1:1 主图 <span className="text-red-500">*</span></span>} className="mb-10">
                <div className="flex gap-2 mb-3 items-center">
                  {RENDER_MODELS.map(m => <Button key={m.id} size="small" onClick={() => handleGenerateImages(m.id, '1:1')} loading={generatingMainImages11 && mainImageModel11 === m.id}>{m.label.split(' ')[0]}</Button>)}
                  {generatingMainImages11 && (
                    <span className="text-[10px] text-purple-600 ml-2 flex items-center">
                      {mainRenderProgress11}
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-1 py-0 h-auto" onClick={() => stopGeneration('main11')} title="停止生成" />
                    </span>
                  )}
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadZip(mainImages11, 'taobao_11_main')}>下载</Button>
                </div>
                <div className="flex gap-4">
                  {mainImages11.map((img, i) => (
                    <div key={i} className="w-[100px] h-[100px] border border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
                      {img ? <Image src={img} className="w-full h-full object-cover" /> : <span className="text-[10px]">主图 {i+1}</span>}
                    </div>
                  ))}
                </div>
              </Form.Item>

              <Form.Item label={<span className="font-bold text-gray-700">3:4 主图</span>} className="mb-10">
                <div className="flex gap-2 mb-3 items-center">
                  {RENDER_MODELS.map(m => <Button key={m.id} size="small" onClick={() => handleGenerateImages(m.id, '3:4')} loading={generatingMainImages34 && mainImageModel34 === m.id}>{m.label.split(' ')[0]}</Button>)}
                  {generatingMainImages34 && (
                    <span className="text-[10px] text-purple-600 ml-2 flex items-center">
                      {mainRenderProgress34}
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-1 py-0 h-auto" onClick={() => stopGeneration('main34')} title="停止生成" />
                    </span>
                  )}
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadZip(mainImages34, 'taobao_34_main')}>下载</Button>
                </div>
                <div className="flex gap-4">
                  {mainImages34.map((img, i) => (
                    <div key={i} className="w-[100px] h-[133px] border border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
                      {img ? <Image src={img} className="w-full h-full object-cover" /> : <span className="text-[10px]">主图 {i+1}</span>}
                    </div>
                  ))}
                </div>
              </Form.Item>

              <Form.Item label={<span className="font-bold text-gray-700 block">商品视频矩阵</span>} className="mb-12">
                <div className="flex flex-col gap-4">

                  {/* RunPod 服务状态 + 渲染模式配置栏 */}
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-500 font-medium shrink-0">RunPod 视频服务：</span>
                      {ltxServiceReady === null && <span className="text-xs text-gray-400 flex items-center gap-1"><Spin size="small" /> 检测中...</span>}
                      {ltxServiceReady === true && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 服务就绪</span>}
                      {ltxServiceReady === false && (
                        <span className="text-xs text-red-500 font-bold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 未就绪
                          <button className="ml-1 underline text-blue-500 cursor-pointer bg-transparent border-none p-0 text-xs"
                            onClick={() => { setLtxServiceReady(null); fetch(`${API_BASE}/api/v1/video/ltx-health`).then(r=>r.json()).then(d=>setLtxServiceReady(d.ready===true)).catch(()=>setLtxServiceReady(false)); }}>重检</button>
                        </span>
                      )}
                      <span className="text-gray-300 mx-1">|</span>
                      <span className="text-xs text-gray-500 font-medium shrink-0">渲染模式：</span>
                      <div className="flex gap-1">
                        <button onClick={() => setLtxFastMode(false)}
                          className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${!ltxFastMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400'}`}>
                          🎬 Wan2.2 正式出片（~60s/条）
                        </button>
                        <button onClick={() => setLtxFastMode(true)}
                          className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${ltxFastMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-300 hover:border-orange-400'}`}>
                          ⚡ LTX 快速预览（~8s/条）
                        </button>
                      </div>
                      <span className="text-gray-300 mx-1">|</span>
                      <span className="text-xs text-gray-500 font-medium shrink-0">商品背景：</span>
                      <div className="flex gap-1">
                        {[{value:'gradient',label:'渐变',emoji:'🌈'},{value:'white',label:'纯白',emoji:'⬜'},{value:'warm',label:'暖色',emoji:'🟡'},{value:'dark',label:'深色',emoji:'⬛'}].map(opt => (
                          <button key={opt.value} onClick={() => setLtxBackgroundStyle(opt.value)}
                            className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${ltxBackgroundStyle === opt.value ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-300 hover:border-teal-400'}`}>
                            {opt.emoji} {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {ltxFastMode
                      ? <div className="mt-2 text-[11px] text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100">⚡ 快速预览：LTX-Video ~8s/条，num_frames=25，steps=20，适合快速确认构图；正式出片请切换 Wan2.2。</div>
                      : <div className="mt-2 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">🎬 正式出片：Wan2.2 ~60s/条，num_frames=97，steps=50，有参考图时自动启用 I2V，CLIP 自动选最匹配角度。</div>
                    }
                  </div>

                  {/* ── Seedance 逐条生成 ── */}
                  <div className="border border-purple-100 rounded-lg overflow-hidden">
                    <div className="flex justify-between items-center flex-wrap gap-3 p-4 bg-purple-50/60 border-b border-purple-100">
                      <div className="flex flex-wrap gap-3 items-center">
                        <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Seedance</span>
                        <Button type="primary" icon={<VideoCameraOutlined />} onClick={handleGenerateVideo} loading={generatingVideo} className="bg-purple-600 font-bold">
                          逐条生成切片
                        </Button>
                        {generatingVideo && (
                          <span className="text-purple-600 font-bold text-xs flex items-center">
                            <Spin size="small" className="mr-2"/>{videoRenderProgress}
                            <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('video')} />
                          </span>
                        )}
                      </div>
                      {videoClips.some(v => v !== '') && (
                        <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadVideos} loading={downloading} className="bg-green-600 font-bold">打包下载</Button>
                      )}
                    </div>
                    {videoClips.some(v => v !== '') && (
                      <div className="p-4">
                        <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
                          {videoClips.filter(v => v).map((vidUrl, i) => (
                            <div key={i} className="aspect-video bg-black border border-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm group">
                              <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 rounded z-10">切片 {i+1}</span>
                              <video src={vidUrl} controls className="w-full h-full object-cover" />
                              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── LTX RunPod：先生成分镜脚本，再批量渲染 ── */}
                  <div className="border border-orange-100 rounded-lg overflow-hidden">
                    <div className="flex justify-between items-center flex-wrap gap-3 p-4 bg-orange-50/60 border-b border-orange-100">
                      <div className="flex flex-wrap gap-3 items-center">
                        <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">LTX · RunPod</span>
                        <Button icon={<RobotOutlined />} onClick={async () => {
                          const pmReport = form.getFieldValue('pm_report');
                          const opsReport = form.getFieldValue('base_desc') || '';
                          if (!pmReport) { message.warning('请先生成策划案'); return; }
                          setGeneratingScript(true);
                          setVideoScript(null);
                          message.loading({ content: '分镜脚本生成中...', key: 'tb_script', duration: 0 });
                          try {
                            const res = await fetch(`${API_BASE}/api/v1/video/design-script`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'taobao', ratio: '16:9', num_clips: 12 })
                            });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            const data = await res.json();
                            if (data.code !== 200) throw new Error(data.message || '后端异常');
                            let clean: string = data.data;
                            if (clean.includes('```json')) clean = clean.split('```json')[1].split('```')[0].trim();
                            else if (clean.includes('```')) clean = clean.split('```')[1].split('```')[0].trim();
                            setVideoScript(JSON.parse(clean));
                            message.success({ content: '分镜脚本已就绪！', key: 'tb_script', duration: 3 });
                          } catch (e: any) {
                            message.error({ content: `脚本生成失败: ${e.message}`, key: 'tb_script', duration: 4 });
                          } finally { setGeneratingScript(false); }
                        }} loading={generatingScript} disabled={generatingLtxVideo}
                        className="text-orange-600 border-orange-300 bg-orange-50 font-bold">
                          生成分镜脚本
                        </Button>
                      </div>
                    </div>

                    {generatingScript && (
                      <div className="p-4 bg-orange-50 flex items-center gap-3 text-orange-700 text-sm">
                        <Spin size="small" /><span>AI 正在构思分镜脚本，请稍候...</span>
                      </div>
                    )}

                    {!generatingScript && videoScript && (
                      <div className="border-t border-orange-100">
                        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 flex items-center justify-between">
                          <span className="text-white font-bold text-sm">📋 分镜脚本（{videoScript.storyboard.length} 个分镜）</span>
                          <Button size="small" icon={<RocketOutlined />}
                            onClick={async () => {
                              if (!videoScript || videoScript.storyboard.length === 0) { message.warning('请先生成分镜脚本'); return; }
                              setGeneratingLtxVideo(true);
                              const total = videoScript.storyboard.length;
                              setLtxVideoClips(Array(total).fill(''));
                              const modeLabel = ltxFastMode ? 'LTX-Video 快速预览' : 'Wan2.2 正式出片';
                              setLtxVideoProgress(`提交 ${total} 个分镜到 RunPod（${modeLabel}）...`);
                              try {
                                const res = await fetch(`${API_BASE}/api/v1/video/generate-from-script`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    global_style_prompt: videoScript.global_style_prompt,
                                    ratio: videoScript.ratio || '16:9',
                                    storyboard: videoScript.storyboard.map(s => ({ logic: s.logic, scene_prompt: s.scene_prompt, video_type: s.video_type || 'text-to-video' })),
                                    image_urls: selectedR2Images,
                                    num_frames: ltxFastMode ? 25 : 97,
                                    steps: ltxFastMode ? 20 : 50,
                                    fast: ltxFastMode,
                                    background_style: ltxBackgroundStyle,
                                  }),
                                });
                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                const data = await res.json();
                                if (data.code === 200 && Array.isArray(data.results)) {
                                  const newClips = Array(total).fill('');
                                  data.results.forEach((r: { index: number; video_url?: string; error?: string }) => {
                                    if (r.video_url) newClips[r.index] = r.video_url;
                                    else if (r.error) message.warning(`分镜 ${r.index + 1} 失败: ${r.error}`);
                                  });
                                  setLtxVideoClips(newClips);
                                  const fail = data.failed_count;
                                  if (!fail) message.success(`🎬 LTX 全部 ${data.success_count} 个视频渲染完毕！`);
                                  else message.warning(`渲染结束：${data.success_count} 成功，${fail} 失败`);
                                } else throw new Error(data.detail || '后端异常');
                              } catch (e: any) {
                                message.error(`LTX 生成中断: ${e.message}`);
                              } finally { setGeneratingLtxVideo(false); setLtxVideoProgress(''); }
                            }}
                            loading={generatingLtxVideo} disabled={generatingLtxVideo}
                            className="bg-white/20 text-white border-white/40 font-bold text-xs">
                            {generatingLtxVideo ? ltxVideoProgress || 'LTX 渲染中...' : '▶ LTX 生成视频（RunPod）'}
                          </Button>
                        </div>
                        <div className="p-3 bg-orange-50/50 border-b border-orange-100">
                          <span className="text-xs text-orange-500 font-medium">全局风格：</span>
                          <span className="text-xs text-gray-600 ml-1">{videoScript.global_style_prompt}</span>
                        </div>
                        <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                          {videoScript.storyboard.map((shot, idx) => (
                            <div key={idx} className="flex gap-3 px-4 py-2 hover:bg-gray-50">
                              <span className="flex-shrink-0 w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">{idx+1}</span>
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

                        {/* LTX 渲染结果网格 */}
                        {(generatingLtxVideo || ltxVideoClips.some(v => v !== '')) && (
                          <div className="border-t border-orange-100 p-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-gray-700">
                                🎬 LTX 渲染结果
                                {generatingLtxVideo && <span className="ml-2 text-orange-500 font-normal animate-pulse text-[11px]">{ltxVideoProgress}</span>}
                              </span>
                              {ltxVideoClips.some(v => v !== '') && (
                                <Button size="small" icon={<DownloadOutlined />} loading={downloading}
                                  onClick={async () => {
                                    const valid = ltxVideoClips.filter(u => u);
                                    if (!valid.length) return;
                                    setDownloading(true);
                                    message.loading({ content: '打包 LTX 视频...', key: 'ltx_dl' });
                                    try {
                                      const zip = new JSZip();
                                      const folder = zip.folder('taobao_ltx_clips');
                                      for (let i = 0; i < valid.length; i++) {
                                        const r = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(valid[i])}`);
                                        folder?.file(`ltx_切片_${i+1}.mp4`, await r.blob());
                                      }
                                      saveAs(await zip.generateAsync({ type: 'blob' }), 'taobao_ltx_clips.zip');
                                      message.success({ content: '下载完成！', key: 'ltx_dl' });
                                    } catch { message.error({ content: '下载失败', key: 'ltx_dl' }); }
                                    finally { setDownloading(false); }
                                  }}
                                  className="text-green-600 border-green-300 bg-green-50 font-bold">打包下载</Button>
                              )}
                            </div>
                            <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                              {ltxVideoClips.map((vidUrl, i) => (
                                <div key={i} className="aspect-video bg-black border border-gray-200 rounded flex items-center justify-center relative overflow-hidden group">
                                  <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded z-10">{i+1}</span>
                                  {vidUrl ? (
                                    <>
                                      <video src={vidUrl} controls className="w-full h-full object-cover" />
                                      <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 z-10">
                                        <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => window.open(vidUrl)} />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex flex-col items-center text-white">
                                      {generatingLtxVideo
                                        ? <><Spin size="small" /><span className="text-[8px] mt-1 opacity-60">渲染中</span></>
                                        : <><VideoCameraOutlined className="text-sm opacity-40" /><span className="text-[8px] opacity-40">LTX</span></>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </Form.Item>

              <Form.Item label={<span className="font-bold text-gray-700">白底图</span>} className="mb-12">
                <div className="flex gap-2 mb-3 items-center">
                  {RENDER_MODELS.map(m => <Button key={m.id} size="small" onClick={() => handleGenerateImages(m.id, 'whitebg')} loading={generatingWhiteBgImages && whiteBgImageModel === m.id}>AI 抠图 ({m.id})</Button>)}
                  {generatingWhiteBgImages && (
                    <span className="text-[10px] text-purple-600 ml-2 flex items-center">
                      {whiteBgRenderProgress}
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-1 py-0 h-auto" onClick={() => stopGeneration('whitebg')} title="停止生成" />
                    </span>
                  )}
                </div>
                <div className="w-[100px] h-[100px] border border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
                  {whiteBgImages[0] ? <Image src={whiteBgImages[0]} className="w-full h-full object-cover" /> : <PictureOutlined className="text-2xl" />}
                </div>
              </Form.Item>
              
              <Form.Item label={<span className="font-bold text-gray-700">宝贝详情 <span className="text-red-500">*</span></span>} className="mb-10">
                <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
                  <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex gap-2 items-center">
                      {RENDER_MODELS.map(m => <Button key={m.id} size="small" onClick={() => handleGenerateDetails(m.id)} loading={generatingDetails && detailImageModel === m.id}>{m.label.split(' ')[0]}</Button>)}
                      {generatingDetails && (
                        <span className="text-[10px] text-orange-600 ml-2 flex items-center">
                          {detailRenderProgress}
                          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-1 py-0 h-auto" onClick={() => stopGeneration('detail')} title="停止生成" />
                        </span>
                      )}
                    </div>
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadZip(detailImages, 'taobao_details')}>打包下载</Button>
                  </div>
                  <div className="h-[400px] overflow-y-auto p-5 bg-gray-100/50">
                    <div className="grid grid-cols-5 gap-4">
                      {detailImages.map((img, i) => (
                        <div key={i} className="aspect-square bg-white border border-gray-200 rounded-xl flex items-center justify-center overflow-hidden relative">
                          {img ? <Image src={img} className="w-full h-full object-cover" /> : <PictureOutlined className="text-xl text-gray-300" />}
                          <span className="absolute top-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded">{i+1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Form.Item>

              <Form.Item label={<span className="font-bold text-gray-700 block">生成买家秀</span>} className="mb-12">
                <div className="flex flex-col">
                  
                  <div className="mb-4 flex flex-col gap-2">
                    <div className="text-sm font-medium text-gray-700">买家秀参考素材 ({buyerShowR2Images.length}/5)</div>
                    <div className="flex gap-2 flex-wrap">
                      {buyerShowR2Images.map((img, idx) => (
                        <div key={idx} className="relative w-[60px] h-[60px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                          <img src={img} className="w-full h-full object-cover" />
                          <div 
                            className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBuyerShowR2Images(prev => prev.filter(u => u !== img));
                            }}
                            title="删除"
                          >
                            ×
                          </div>
                        </div>
                      ))}
                      {buyerShowR2Images.length < 5 && (
                        <div 
                          onClick={() => openR2Modal('buyerShow')}
                          className="w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          <CloudOutlined className="text-xl mb-1" />
                          <span className="text-[10px] font-bold">选择图片</span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">建议选择产品包装图片、茶叶在茶杯的图片、茶叶泡前和泡后的特写图片等。不选择时默认使用AI纯生成。</div>
                  </div>

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
                          className={buyerShowModel === model.id ? 'bg-purple-600 font-bold' : 'text-gray-600'}
                          onClick={() => handleGenerateBuyerShows(model.id)}
                          loading={buyerShowModel === model.id}
                          disabled={generatingBuyerShows && buyerShowModel !== model.id}
                        >
                          {model.label.split(' ')[0]}
                        </Button>
                      ))}
                      {generatingBuyerShows && (
                        <span className="ml-4 text-purple-600 font-bold text-xs self-center flex items-center">
                          <Spin size="small" className="mr-2"/>{buyerShowProgress}
                          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('buyerShow')} title="停止生成" />
                        </span>
                      )}
                    </div>
                    
                    {buyerShowImages.some(img => img !== '') && (
                      <Button 
                        size="small"
                        type="primary" 
                        icon={<DownloadOutlined />} 
                        onClick={handleDownloadBuyerShows} 
                        loading={downloading}
                        className="bg-green-600 font-bold"
                      >
                        一键打包下载买家秀
                      </Button>
                    )}
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

              <Form.Item label={<span className="font-bold text-gray-700 block">SKU规格图</span>} className="mb-8">
                <div className="flex flex-col">
                  <div className="flex justify-between items-center flex-wrap gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                    <div className="flex flex-wrap gap-3 items-center">
                      {RENDER_MODELS.map((model) => (
                        <Button 
                          key={model.id}
                          size="small"
                          type={skuImageModel === model.id ? "primary" : "default"}
                          className={skuImageModel === model.id ? 'bg-purple-600 font-bold' : 'text-gray-600'}
                          onClick={() => handleGenerateSkuImages(model.id)}
                          loading={skuImageModel === model.id}
                          disabled={generatingSkuImages && skuImageModel !== model.id}
                        >
                          {model.label.split(' ')[0]}
                        </Button>
                      ))}
                      {generatingSkuImages && (
                        <span className="ml-4 text-purple-600 font-bold text-xs self-center flex items-center">
                          <Spin size="small" className="mr-2"/>{skuRenderProgress}
                          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('sku')} title="停止生成" />
                        </span>
                      )}
                    </div>
                    
                    {skuImages.some(img => img !== '') && (
                      <Button 
                        size="small"
                        type="primary" 
                        icon={<DownloadOutlined />} 
                        onClick={() => handleDownloadZip(skuImages, 'taobao_sku_images')} 
                        loading={downloading}
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
            </div>
          </Form>
        </div>

        <div className="absolute bottom-0 left-0 w-full h-16 backdrop-blur-md bg-white/90 border-t border-orange-100 flex justify-center items-center gap-4 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <Button type="primary" size="large" className="!bg-gradient-to-r !from-orange-500 !to-red-500 !border-0 w-[160px] font-bold rounded-xl shadow-lg hover:shadow-orange-200">提交宝贝信息</Button>
          <Button size="large" className="w-[120px] rounded-xl border-gray-200 font-medium text-gray-600 hover:border-orange-300 hover:text-orange-600">保存草稿</Button>
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
        footer={<Button type="primary" onClick={() => setIsR2ModalVisible(false)}>确认</Button>}
        width={800}
      >
        <div className="h-[400px] overflow-y-auto mt-4">
          <div className="grid grid-cols-5 gap-3 p-2">
            {r2Gallery.map((url, idx) => {
              const isSelected = r2ModalTarget === 'global' ? selectedR2Images.includes(url) : buyerShowR2Images.includes(url);
              return (
              <div key={idx} className={`aspect-square border-2 rounded-md overflow-hidden cursor-pointer relative ${isSelected ? 'border-blue-500' : 'border-gray-200'}`} onClick={() => toggleR2ImageSelection(url)}>
                <img src={url} className="w-full h-full object-cover" />
                {isSelected && <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">✓</div>}
              </div>
            )})}
          </div>
          {hasMoreR2 && <div className="text-center mt-4"><Button size="small" onClick={() => fetchR2Images(r2Page + 1, true)}>加载更多</Button></div>}
        </div>
      </Modal>

      {/* 🚀 悬浮任务状态栏 */}
      {activeTasks.length > 0 && (
        <div className="fixed bottom-24 right-6 w-80 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-gray-100 overflow-hidden z-50 transform transition-all duration-300">
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

      <style dangerouslySetInnerHTML={{__html: `
        .custom-taobao-tabs .ant-tabs-nav { margin-bottom: 0 !important; }
        .custom-taobao-tabs .ant-tabs-tab { padding: 18px 0 !important; font-weight: bold; color: #6b7280; font-size: 14px; }
        .custom-taobao-tabs .ant-tabs-tab-active .ant-tabs-tab-btn { color: #2563eb !important; }
        .custom-taobao-tabs .ant-tabs-ink-bar { background: #2563eb !important; height: 3px !important; }
      `}} />
    </div>
  );
}
