// frontend/src/components/PinduoduoPublish.tsx
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
// Version: 4.4 (Fixed Silent Failure in Title Generation)
import React, { useState, useEffect, useRef } from 'react';
import PlanManager from './PlanManager';
import { Form, Input, Button, Select, message, Divider, Modal, Spin, Upload, Image, Cascader } from 'antd';
import { 
  RobotOutlined, PictureOutlined, ThunderboltOutlined, 
  VideoCameraOutlined, CloudOutlined, UploadOutlined, RocketOutlined, EditOutlined, DownloadOutlined, CloseCircleOutlined, LoadingOutlined,
  SoundOutlined, CustomerServiceOutlined, PlusOutlined
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
  // 主图比例（拼多多要求：1:1 或 3:4，宽高均 > 480px，大小 3M 内）
  const [mainImageRatio, setMainImageRatio] = useState<'1:1' | '3:4'>('1:1');


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
  const [detailR2Images, setDetailR2Images] = useState<string[]>([]);

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
  // 商品视频比例（拼多多要求：1:1 / 16:9 / 3:4，时长 60s 内）
  const [productVideoRatio, setProductVideoRatio] = useState<'1:1' | '16:9' | '3:4'>('16:9');

  const [generatingScript, setGeneratingScript] = useState(false);
  const [scriptModel, setScriptModel] = useState<string>('');
  const [script, setScript] = useState<{global_style_prompt: string; ratio?: string; storyboard: {shot_number?: string; time: string; shot_and_camera: string; logic: string; scene_prompt: string; audio: string; transition: string; video_type?: string; reference_image?: string}[]} | null>(null);
  const [generatingLtx, setGeneratingLtx] = useState(false);
  const [ltxProgress, setLtxProgress] = useState("");
  const [ltxClips, setLtxClips] = useState<string[]>(Array(12).fill(''));

  // ── 商品讲解视频（9:16，Seedance + LTX） ──
  const [generatingExplainVideo, setGeneratingExplainVideo] = useState(false);
  const [explainVideoProgress, setExplainVideoProgress] = useState("");
  const [explainVideoClips, setExplainVideoClips] = useState<string[]>(Array(12).fill(''));
  const [generatingExplainScript, setGeneratingExplainScript] = useState(false);
  const [explainScriptModel, setExplainScriptModel] = useState<string>('');
  const [explainScript, setExplainScript] = useState<{global_style_prompt: string; ratio?: string; storyboard: {shot_number: string; time: string; shot_and_camera: string; logic: string; scene_prompt: string; audio: string; transition: string; video_type?: string; reference_image?: string}[]} | null>(null);
  const [generatingExplainLtx, setGeneratingExplainLtx] = useState(false);
  const [explainLtxProgress, setExplainLtxProgress] = useState("");
  const [explainLtxClips, setExplainLtxClips] = useState<string[]>(Array(12).fill(''));

  // ── 商详视频（16:9，Seedance + LTX） ──
  const [generatingDetailVideo, setGeneratingDetailVideo] = useState(false);
  const [detailVideoProgress, setDetailVideoProgress] = useState("");
  const [detailVideoClips, setDetailVideoClips] = useState<string[]>(Array(12).fill(''));
  const [generatingDetailScript, setGeneratingDetailScript] = useState(false);
  const [detailScriptModel, setDetailScriptModel] = useState<string>('');
  const [detailScript, setDetailScript] = useState<{global_style_prompt: string; ratio?: string; storyboard: {shot_number: string; time: string; shot_and_camera: string; logic: string; scene_prompt: string; audio: string; transition: string; video_type?: string; reference_image?: string}[]} | null>(null);
  const [generatingDetailLtx, setGeneratingDetailLtx] = useState(false);
  const [detailLtxProgress, setDetailLtxProgress] = useState("");
  const [detailLtxClips, setDetailLtxClips] = useState<string[]>(Array(12).fill(''));

  // ── 视频素材库 (Pexels / Pixabay / Unsplash) ──
  const PEXELS_API_KEY = 'hneKcoWsAuZdTUM3fFNw5F8mizHzimcJQkqZqJnvZjJV2ZLD02wt5jOt';
  const PIXABAY_API_KEY = '7268232-a1a9b779595d77cac397b7ed8';
  const UNSPLASH_API_KEY = 'yzYxinqB7LV0gjwocEvetMqQSKk4gCbOdYqBaa5cQuc';
  const [searchingStock, setSearchingStock] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [stockTab, setStockTab] = useState<'pexels' | 'pixabay' | 'unsplash'>('pexels');
  const [pexelsResults, setPexelsResults] = useState<any[]>([]);
  const [pixabayResults, setPixabayResults] = useState<any[]>([]);
  const [unsplashResults, setUnsplashResults] = useState<any[]>([]);

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

  // 🗣️ SadTalker：统一走后端代理（避免浏览器直连 modal.run 被 TLS 重置 / CORS），token 由后端注入

  const SADTALKER_TALK_ENDPOINT = `${API_BASE}/api/v1/media/sadtalker/talk`;
  const SADTALKER_PETTALK_ENDPOINT = `${API_BASE}/api/v1/media/sadtalker/pet-talk`;


  // —— 数字人：人物图 + 音频 → 对口型说话视频 ——
  const [dhImageUrl, setDhImageUrl] = useState<string>('');
  const [dhImageFile, setDhImageFile] = useState<File | null>(null);
  const [dhAudioUrl, setDhAudioUrl] = useState<string>('');
  const [dhAudioFile, setDhAudioFile] = useState<File | null>(null);
  const [generatingDh, setGeneratingDh] = useState(false);
  const [dhProgress, setDhProgress] = useState('');
  const [dhVideoUrl, setDhVideoUrl] = useState('');
  // —— 人物正脸图 AI 生成 ——
  const [dhGenPrompt, setDhGenPrompt] = useState('');
  const [generatingDhImage, setGeneratingDhImage] = useState(false);


  // —— 宠物：宠物图 + 音频 + 真人驱动脸 → 宠物说话视频 ——
  const [petImageUrl, setPetImageUrl] = useState<string>('');
  const [petImageFile, setPetImageFile] = useState<File | null>(null);
  const [petAudioUrl, setPetAudioUrl] = useState<string>('');
  const [petAudioFile, setPetAudioFile] = useState<File | null>(null);
  const [petDriverUrl, setPetDriverUrl] = useState<string>('');
  const [petDriverFile, setPetDriverFile] = useState<File | null>(null);
  const [generatingPet, setGeneratingPet] = useState(false);
  const [petProgress, setPetProgress] = useState('');
  const [petVideoUrl, setPetVideoUrl] = useState('');
  // —— 宠物正脸图 AI 生成 ——
  const [petGenPrompt, setPetGenPrompt] = useState('');
  const [generatingPetImage, setGeneratingPetImage] = useState(false);




  // VoxCPM2 TTS：统一走后端代理（避免浏览器直连 modal.run 被 TLS 重置 / CORS）
  const VOXCPM2_ENDPOINT = `${API_BASE}/api/v1/media/voxcpm2/generate`;
  const [generatingVoxCpm2, setGeneratingVoxCpm2] = useState(false);

  const [previewingVoxCpm2, setPreviewingVoxCpm2] = useState(false);
  const [voxCpm2CfgValue, setVoxCpm2CfgValue] = useState(2.0);
  const [voxCpm2Timesteps, setVoxCpm2Timesteps] = useState(10);
  const [voxCpm2Url, setVoxCpm2Url] = useState('');
  const [voxCpm2PreviewUrl, setVoxCpm2PreviewUrl] = useState('');
  // 选中的音色描述符（作为文案前缀使用）
  const [voxCpm2VoiceDesc, setVoxCpm2VoiceDesc] = useState('声音甜美，语速适中，充满活力');

  // 🎭 VoxCPM2 声音克隆（上传音频/视频，复刻音色）
  // transcribe / clone 同样走后端代理
  const VOXCPM2_TRANSCRIBE_ENDPOINT = `${API_BASE}/api/v1/media/voxcpm2/transcribe`;
  const VOXCPM2_CLONE_ENDPOINT = `${API_BASE}/api/v1/media/voxcpm2/clone`;


  const [ttsMode, setTtsMode] = useState<'design' | 'clone'>('design'); // 音色设计 / 声音克隆
  const [cloneRefFile, setCloneRefFile] = useState<File | null>(null);
  const [cloneRefName, setCloneRefName] = useState('');
  const [cloneRefIsVideo, setCloneRefIsVideo] = useState(false);
  const [cloneRefAudioUrl, setCloneRefAudioUrl] = useState(''); // 本地预览（视频提取前为原文件）
  const [clonePromptText, setClonePromptText] = useState(''); // 参考音频识别文本（可编辑）
  const [transcribingClone, setTranscribingClone] = useState(false);
  const [cloningVoice, setCloningVoice] = useState(false);
  const [cloneVoiceUrl, setCloneVoiceUrl] = useState('');


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

  // Per-section reference images (each section is fully independent)
  const [refImagesMain, setRefImagesMain] = useState<string[]>([]);
  const [refImagesWhiteBg, setRefImagesWhiteBg] = useState<string[]>([]);
  const [refImagesSku, setRefImagesSku] = useState<string[]>([]);
  const [refImagesVideo, setRefImagesVideo] = useState<string[]>([]);
  const [refImagesCombo, setRefImagesCombo] = useState<string[]>([]);
  const [isR2ModalVisible, setIsR2ModalVisible] = useState(false);
  const [r2ModalTarget, setR2ModalTarget] = useState<'main' | 'whitebg' | 'sku' | 'video' | 'buyerShow' | 'detail' | 'combo'>('main');

  // 🧩 商品组合图（多商品组合，不变形、无文字）
  const [generatingCombo, setGeneratingCombo] = useState(false);
  const [comboImageModel, setComboImageModel] = useState<string>('');
  const [comboRenderProgress, setComboRenderProgress] = useState("");
  const [comboImages, setComboImages] = useState<string[]>(Array(3).fill(''));
  const [comboRatio, setComboRatio] = useState<'1:1' | '3:4' | '4:3' | '16:9'>('1:1');
  const [comboCount, setComboCount] = useState<number>(3);
  const [comboPrompt, setComboPrompt] = useState<string>('');

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

  const getRefStateByTarget = (target: typeof r2ModalTarget): [string[], React.Dispatch<React.SetStateAction<string[]>>] => {
    switch (target) {
      case 'main':     return [refImagesMain, setRefImagesMain];
      case 'whitebg':  return [refImagesWhiteBg, setRefImagesWhiteBg];
      case 'sku':      return [refImagesSku, setRefImagesSku];
      case 'video':    return [refImagesVideo, setRefImagesVideo];
      case 'combo':    return [refImagesCombo, setRefImagesCombo];
      case 'detail':   return [detailR2Images, setDetailR2Images];
      case 'buyerShow': return [buyerShowR2Images, setBuyerShowR2Images];
      default:         return [refImagesMain, setRefImagesMain];
    }
  };


  const openR2Modal = (target: typeof r2ModalTarget) => {
    setR2ModalTarget(target);
    setIsR2ModalVisible(true);
    if (r2Gallery.length === 0) fetchR2Images(1, false);
  };

  const toggleR2ImageSelection = (url: string) => {
    if (r2ModalTarget === 'buyerShow') {
      setBuyerShowR2Images(prev => {
        if (prev.includes(url)) return prev.filter(u => u !== url);
        if (prev.length >= 5) { message.warning('最多只能选择5张买家秀原图！'); return prev; }
        return [...prev, url];
      });
    } else {
      const [, setter] = getRefStateByTarget(r2ModalTarget);
      setter(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
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
        const [, setter] = getRefStateByTarget(r2ModalTarget);
        setter(prev => [data.data.url, ...prev].slice(0, r2ModalTarget === 'buyerShow' ? 5 : Infinity));
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
    if (refImagesMain.length === 0) return message.warning('请选择要合成的产品原图！');

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
          image_urls: refImagesMain 
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
    const baseDesc = form.getFieldValue('base_desc');

    // 强制要求先选品
    if (!selectedSkuName) return message.warning('请先在下拉框选择核心产品 (SKU)！');
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
          sku_name: selectedSkuName,
          text_desc: baseDesc,
          image_urls: refImagesMain,
          model: targetModelId,
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
    if (refImagesMain.length === 0) return message.warning('必须选择原图！');

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
                prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}, ${mainImageRatio === '1:1' ? 'square 1:1 aspect ratio composition' : 'vertical 3:4 portrait aspect ratio composition'}`, 
                ratio: mainImageRatio,
                image_urls: refImagesMain, 
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
  type ScriptData = { global_style_prompt: string; ratio?: string; storyboard: { shot_number?: string; time: string; shot_and_camera: string; logic: string; scene_prompt: string; audio: string; transition: string; video_type?: string; reference_image?: string }[] };

  const handleDownloadCsv = (scriptData: ScriptData | null, filename: string) => {
    if (!scriptData || !scriptData.storyboard || scriptData.storyboard.length === 0) {
      return message.warning('没有可下载的分镜脚本！');
    }
    const headers = ['镜号', '时间', '景别&运镜', '画面描述', 'AI Prompt', '音频', '转场'];
    const rows = scriptData.storyboard.map((shot, i) => [
      shot.shot_number || (i + 1).toString().padStart(2, '0'),
      shot.time,
      shot.shot_and_camera,
      shot.logic,
      shot.scene_prompt,
      shot.audio,
      shot.transition
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${filename}.csv`);
    message.success('分镜脚本下载成功！');
  };

  const _generateScriptOnly = async (targetModelId: string = 'gpt-5.5') => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) { message.warning('请先生成策划案'); return; }
    setScriptModel(targetModelId);
    setGeneratingScript(true);
    setScript(null);
    message.loading({ content: `【${targetModelId}】分镜脚本生成中...`, key: 'script_gen', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo', ratio: productVideoRatio, num_clips: 12, model: targetModelId })
      });
      if (!res.ok) throw new Error(`剧本接口异常 (HTTP ${res.status})`);
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '后端返回异常');
      let clean: string = data.data;
      if (clean.includes('```json')) clean = clean.split('```json')[1].split('```')[0].trim();
      else if (clean.includes('```')) clean = clean.split('```')[1].split('```')[0].trim();
      const parsed: ScriptData = JSON.parse(clean);
      // 记录所选比例，供后续单镜 Wan2.2 渲染按比例出片
      parsed.ratio = productVideoRatio;
      setScript(parsed);

      message.success({ content: '分镜脚本已就绪！', key: 'script_gen', duration: 3 });
    } catch (e: any) {
      message.error({ content: `脚本生成失败: ${e.message}`, key: 'script_gen', duration: 4 });
    } finally {
      setGeneratingScript(false);
      setScriptModel('');
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
          image_urls: refImagesVideo,
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
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo', ratio: productVideoRatio })
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
              image_urls: refImagesVideo,
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
    if (detailR2Images.length === 0) return message.warning('必须选择原图！');

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
                image_urls: detailR2Images,
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
    if (refImagesWhiteBg.length === 0) return message.warning('必须选择原图！');

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
                image_urls: refImagesWhiteBg, 
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
    if (refImagesSku.length === 0) return message.warning('必须选择原图！');

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
                image_urls: refImagesSku, 
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
    targetModelId: string = 'gpt-5.5',
    setModelState?: (m: string) => void,
  ) => {
    const pmReport = form.getFieldValue('pm_report');
    const opsReport = form.getFieldValue('base_desc') || '';
    if (!pmReport) { message.warning('请先生成策划案'); return; }
    setModelState?.(targetModelId);
    setGenerating(true);
    setScriptState(null);
    message.loading({ content: `【${targetModelId}】分镜脚本生成中...`, key: msgKey, duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/video/design-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_report: pmReport, ops_report: opsReport, platform: 'pinduoduo', ratio, num_clips: 12, model: targetModelId })
      });
      if (!res.ok) throw new Error(`剧本接口异常 (HTTP ${res.status})`);
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '后端返回异常');
      let clean: string = data.data;
      if (clean.includes('```json')) clean = clean.split('```json')[1].split('```')[0].trim();
      else if (clean.includes('```')) clean = clean.split('```')[1].split('```')[0].trim();
      const parsed = JSON.parse(clean);
      // 记录所选比例，供后续单镜 Wan2.2 渲染按比例出片
      parsed.ratio = ratio;
      setScriptState(parsed);
      message.success({ content: '分镜脚本已就绪！', key: msgKey, duration: 3 });
    } catch (e: any) {
      message.error({ content: `脚本生成失败: ${e.message}`, key: msgKey, duration: 4 });
    } finally {
      setGenerating(false);
      setModelState?.('');
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

    try {
      // 统一走后端 /video/generate-from-script，由后端代理调用视频服务，
      // 浏览器不再直连 modal.run（避免 CORS / TLS 重置，token 由后端注入）。
      const res = await fetch(`${API_BASE}/api/v1/video/generate-from-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          global_style_prompt: scriptState.global_style_prompt,
          ratio: scriptState.ratio || '16:9',
          storyboard: scriptState.storyboard.map((s: any) => ({
            logic: s.logic || '',
            scene_prompt: s.scene_prompt,
            video_type: s.video_type || 'text-to-video',
          })),
          image_urls: refImagesVideo,
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
      setClips([...clips]);
      if (data.failed_count === 0) message.success(`🎬 全部 ${data.success_count} 个视频渲染完毕！`);
      else message.warning(`渲染结束：${data.success_count} 成功，${data.failed_count} 失败`);
    } catch (e: any) {
      message.error(`视频生成失败: ${e.message}`);
    } finally {
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
          body: JSON.stringify({ prompt: `${parsedData.global_style_prompt}, ${scene.scene_prompt}`, type: 'pinduoduo_main', image_urls: refImagesVideo })
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

  // ─── 单分镜渲染（只渲染当前镜号）──────────────────────────────
  // 判定规则（用户需求）：
  //   • 该镜有产品图（手动上传的 reference_image，或脚本标记 image-to-video 且有全局产品图）
  //     → 图生视频：把产品实拍图作为首帧，最大限度保持产品不变形（仅美化光影/背景）
  //   • 否则 → 文生视频（纯提示词）
  const _resolveShotImage = (shot: any): string => {
    // 优先用该镜单独上传的参考图，其次回退到视频区选择的产品图
    return shot?.reference_image || (refImagesVideo.length > 0 ? refImagesVideo[0] : '');
  };
  const _isShotImageToVideo = (shot: any, shotImg: string): boolean => {
    if (!shotImg) return false;
    return !!shot?.reference_image || shot?.video_type === 'image-to-video';
  };
  // 图生视频时追加的保真指令：锁死产品外形/比例/logo，仅美化环境与光影
  const I2V_PRESERVE_CLAUSE =
    'keep the product exact shape, color, logo, text and proportions strictly unchanged, ' +
    'do not distort or deform the product, only enhance lighting, reflections and background';

  // 面向中国市场：画面中如出现人物，必须是中国人/东亚面孔
  const CHINESE_MARKET_CLAUSE =
    'if any person appears, they must be Chinese / East Asian with authentic Chinese facial features, ' +
    'Chinese models, suitable for the Chinese market';

  // 正在渲染的单镜标识列表（形如 "video-seedance-3" / "explain-wan22-1"）。
  // 用数组而非单值，允许多个镜号并发渲染——点击哪几个就有哪几个在转圈，
  // 互不阻塞，loading 只作用于各自被点击的那一镜。
  const [shotRendering, setShotRendering] = useState<string[]>([]);

  // Seedance 单镜渲染（后端 /video/generate 同步返回 URL）
  // Seedance 单镜渲染（后端 /video/generate 同步返回 URL）
  const _renderShotSeedance = async (
    shot: any,
    idx: number,
    globalStyle: string,
    setGenerating: (v: boolean) => void,
    setProgress: (s: string) => void,
    setClips: React.Dispatch<React.SetStateAction<string[]>>,
    shotKey: string,
  ) => {
    const shotImg = _resolveShotImage(shot);
    const isI2V = _isShotImageToVideo(shot, shotImg);
    // 直接渲染，无弹窗确认。加入并发渲染列表（不阻塞其它镜号）
    setShotRendering(prev => [...prev, shotKey]);
    setGenerating(true);
    setProgress(`Seedance 渲染第 ${idx + 1} 镜（${isI2V ? '图生视频·保真' : '文生视频'}）...`);
    try {

      const prompt = isI2V
        ? `${globalStyle}, ${shot.scene_prompt}, ${I2V_PRESERVE_CLAUSE}, ${CHINESE_MARKET_CLAUSE}`
        : `${globalStyle}, ${shot.scene_prompt}, ${CHINESE_MARKET_CLAUSE}`;
      const res = await fetch(`${API_BASE}/api/v1/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          type: 'pinduoduo_main',
          image_urls: isI2V && shotImg ? [shotImg] : [],
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setClips(prev => { const n = [...prev]; n[idx] = data.url; return n; });
        message.success(`第 ${idx + 1} 镜渲染完成（${isI2V ? '图生视频' : '文生视频'}）`);
      } else {
        throw new Error(data.detail || data.message || '渲染失败');
      }
    } catch (e: any) {
      message.error(`第 ${idx + 1} 镜 Seedance 渲染失败: ${e.message}`);
    } finally {
      setGenerating(false);
      setProgress('');
      setShotRendering(prev => prev.filter(k => k !== shotKey));
    }
  };



  // Wan2.2 单镜渲染（LTX modal 异步任务，轮询结果）
  const _renderShotWan22 = async (
    shot: any,
    idx: number,
    ratio: string,
    globalStyle: string,
    setGenerating: (v: boolean) => void,
    setProgress: (s: string) => void,
    setClips: React.Dispatch<React.SetStateAction<string[]>>,
    shotKey: string,
  ) => {
    const shotImg = _resolveShotImage(shot);
    const isI2V = _isShotImageToVideo(shot, shotImg);
    const modeLabel = ltxFastMode ? 'LTX 快速预览' : 'Wan2.2 正式出片';
    // 直接渲染，无弹窗确认。加入并发渲染列表（不阻塞其它镜号）
    setShotRendering(prev => [...prev, shotKey]);
    setGenerating(true);
    setProgress(`${modeLabel} 渲染第 ${idx + 1} 镜（${isI2V ? '图生视频·保真' : '文生视频'}）...`);

    try {
      // 异步提交 + 轮询：后端 /generate/async 仅提交任务并立即返回 task_id，
      // 真正的渲染（Wan2.2 每条约 60s，冷启动更久）脱离本 HTTP 请求，
      // 避免浏览器/代理因长连接空闲断开而报 "Failed to fetch"。
      const scenePrompt = isI2V
        ? `${globalStyle}, ${shot.scene_prompt}, ${I2V_PRESERVE_CLAUSE}, ${CHINESE_MARKET_CLAUSE}`
        : `${globalStyle}, ${shot.scene_prompt}, ${CHINESE_MARKET_CLAUSE}`;

      // Step 1：提交任务，拿 task_id（短请求，秒级返回）
      const submitRes = await fetch(`${API_BASE}/api/v1/video/generate/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: scenePrompt,
          ratio,
          image_urls: isI2V && shotImg ? [shotImg] : [],
          num_frames: ltxFastMode ? 25 : 97,
          steps: ltxFastMode ? 20 : 50,
          fast: ltxFastMode,
          background_style: ltxBackgroundStyle,
        }),
      });
      if (!submitRes.ok) {
        let detail = `HTTP ${submitRes.status}`;
        try { detail = (await submitRes.json()).detail || detail; } catch {}
        throw new Error(`提交渲染任务失败 (${detail})`);
      }
      const submitData = await submitRes.json();
      const taskId = submitData.task_id;
      if (!taskId) throw new Error('提交成功但未返回 task_id');

      // Step 2：轮询任务状态，直到 done / failed。每 5s 一次，最多 ~30 分钟。
      const POLL_INTERVAL = 5000;
      const MAX_POLLS = 360;
      let finalUrl = '';
      for (let poll = 0; poll < MAX_POLLS; poll++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        let statusRes: Response;
        try {
          statusRes = await fetch(`${API_BASE}/api/v1/video/tasks/${taskId}`);
        } catch {
          continue; // 单次轮询网络抖动，忽略后继续
        }
        if (!statusRes.ok) continue;
        const st = await statusRes.json();
        if (st.progress) {
          setProgress(`${modeLabel} 渲染第 ${idx + 1} 镜... ${st.progress}%`);
        }
        if (st.status === 'done' && st.video_url) {
          finalUrl = st.video_url;
          break;
        }
        if (st.status === 'failed' || st.status === 'error') {
          throw new Error(st.error || '渲染任务失败');
        }
      }
      if (!finalUrl) throw new Error('渲染超时（超过30分钟未完成）');

      setClips(prev => { const n = [...prev]; n[idx] = finalUrl; return n; });
      message.success(`第 ${idx + 1} 镜渲染完成（${isI2V ? '图生视频' : '文生视频'}）`);
    } catch (e: any) {
      message.error(`第 ${idx + 1} 镜 ${modeLabel} 渲染失败: ${e.message}`);
    } finally {
      setGenerating(false);
      setProgress('');
      setShotRendering(prev => prev.filter(k => k !== shotKey));
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

  // 🎭 选择参考文件（音频/视频）后：本地预览 + 自动识别参考音色文本
  const handleCloneFileSelected = async (file: File) => {
    const isVideo = file.type.startsWith('video') || /\.(mp4|mov|avi|mkv|webm|flv|m4v|wmv)$/i.test(file.name);
    setCloneRefFile(file);
    setCloneRefName(file.name);
    setCloneRefIsVideo(isVideo);
    setCloneRefAudioUrl(URL.createObjectURL(file));
    setClonePromptText('');
    setCloneVoiceUrl('');

    // 自动识别参考音频文本（视频会在云端先提取音轨）
    setTranscribingClone(true);
    message.loading({ content: isVideo ? '🎬 正在提取视频音轨并识别...' : '📝 正在识别参考音频文本...', key: 'clone_asr', duration: 0 });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(VOXCPM2_TRANSCRIBE_ENDPOINT, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`识别服务异常 (HTTP ${res.status})`);
      const data = await res.json();
      setClonePromptText(data.text || '');
      message.success({ content: data.text ? '✅ 参考音频识别完成，可在下方编辑校正' : '⚠️ 未识别到文本，请手动填写参考文案', key: 'clone_asr', duration: 3 });
    } catch (err: any) {
      message.error({ content: `识别失败：${err.message}，可手动填写参考文案`, key: 'clone_asr', duration: 4 });
    } finally {
      setTranscribingClone(false);
    }
  };

  // 🎭 声音克隆：用参考音色朗读口播文案
  const handleCloneVoice = async () => {
    if (!cloneRefFile) return message.warning('请先上传参考音频或视频文件！');
    if (!broadcastScript.trim()) return message.warning('请先提取或输入口播文案！');
    setCloningVoice(true);
    setCloneVoiceUrl('');
    message.loading({ content: '🎭 声音克隆合成中，GPU 加速约15~40秒...', key: 'clone_gen', duration: 0 });
    try {
      const formData = new FormData();
      formData.append('file', cloneRefFile);
      const params = new URLSearchParams({
        text: broadcastScript,
        prompt_text: clonePromptText.trim(),
        cfg_value: String(voxCpm2CfgValue),
        timesteps: String(voxCpm2Timesteps),
      });
      const res = await fetch(`${VOXCPM2_CLONE_ENDPOINT}?${params.toString()}`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`克隆服务异常 (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setCloneVoiceUrl(url);
      setVoxCpm2Url(url); // 同步给数字人模块使用
      message.success({ content: '🎉 声音克隆合成完成！', key: 'clone_gen' });
    } catch (err: any) {
      message.error({ content: `声音克隆失败: ${err.message}`, key: 'clone_gen' });
    } finally {
      setCloningVoice(false);
    }
  };


  // 🗣️ 工具：把 blobURL / 远程 URL / VoxCPM2 音频统一取成 Blob
  const _urlToBlob = async (url: string): Promise<Blob> => {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return await (await fetch(url)).blob();
    }
    const res = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(url)}`);
    return await res.blob();
  };

  // 🧑 AI 生成人物正脸图（用于数字人口型驱动）
  const handleGenerateDhFace = async () => {
    const desc = dhGenPrompt.trim() || '一位友好亲切的中国年轻女性，自然微笑，正对镜头';
    setGeneratingDhImage(true);
    message.loading({ content: '🧑 AI 正在生成人物正脸图...', key: 'dh_face', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 强约束：单人、正脸、清晰五官，适合 SadTalker 对口型驱动
          prompt: `${desc}. Photorealistic portrait, single person, front-facing headshot, looking straight at camera, clear sharp facial features, neutral closed-mouth expression, even soft lighting, plain clean background, head and shoulders visible, ultra realistic.`,
          ratio: '1:1',
          model: 'nano-banana-pro',
          platform: 'pinduoduo',
          product_name: 'digital_human_face',
          image_type: 'main',
          category: 'portrait',  // 纯文生图人像，绝不引入商品/包装/文字
        }),

      });
      const data = await res.json();
      if (data.code === 200 && data.data?.url) {
        setDhImageFile(null);       // 改用 AI 生成的远程 URL
        setDhImageUrl(data.data.url);
        message.success({ content: '✅ 人物正脸图生成完成！', key: 'dh_face' });
      } else {
        throw new Error(data.message || '生成失败');
      }
    } catch (err: any) {
      message.error({ content: `人物图生成失败: ${err.message}`, key: 'dh_face' });
    } finally {
      setGeneratingDhImage(false);
    }
  };

  // 🐾 AI 生成宠物正脸图（用于宠物口型迁移）
  const handleGeneratePetFace = async () => {
    const desc = petGenPrompt.trim() || '一只可爱的橘猫，正对镜头，表情呆萌';
    setGeneratingPetImage(true);
    message.loading({ content: '🐾 AI 正在生成宠物正脸图...', key: 'pet_face', duration: 0 });
    try {
      const res = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 强约束：单只宠物、正脸大头、清晰五官，便于 LivePortrait 迁移口型
          prompt: `${desc}. Photorealistic, single pet, front-facing close-up headshot, looking straight at camera, clear sharp face with visible eyes nose and mouth, even soft lighting, plain clean background, ultra realistic.`,
          ratio: '1:1',
          model: 'nano-banana-pro',
          platform: 'pinduoduo',
          product_name: 'pet_face',
          image_type: 'main',
          category: 'portrait',  // 纯文生图宠物正脸，绝不引入商品/包装/文字
        }),

      });
      const data = await res.json();
      if (data.code === 200 && data.data?.url) {
        setPetImageFile(null);
        setPetImageUrl(data.data.url);
        message.success({ content: '✅ 宠物正脸图生成完成！', key: 'pet_face' });
      } else {
        throw new Error(data.message || '生成失败');
      }
    } catch (err: any) {
      message.error({ content: `宠物图生成失败: ${err.message}`, key: 'pet_face' });
    } finally {
      setGeneratingPetImage(false);
    }
  };

  // 🗣️ 轮询 SadTalker / 宠物口型异步任务，直到拿到 R2 视频 URL。
  // 后端把渲染任务挂在脱离请求连接的后台跑，结果稳定落进 R2，这里只负责
  // 周期性查询状态。轮询本身很轻量，断网/超时不会再丢失已渲染好的视频。
  const _pollSadtalkerTask = async (taskId: string): Promise<string> => {
    const statusUrl = `${API_BASE}/api/v1/media/sadtalker/tasks/${taskId}`;
    // 最长等 30 分钟（与后端 Modal timeout 对齐），每 5 秒查一次
    const maxAttempts = 360;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(statusUrl);
        if (!res.ok) continue; // 偶发网络抖动，下一轮再试
        const data = await res.json();
        const task = data.data;
        if (!task) continue;
        if (task.status === 'done' && task.url) return task.url;
        if (task.status === 'error') throw new Error(task.message || '渲染失败');
        // pending：继续等
      } catch (e: any) {
        // 仅 error 状态主动抛出；网络抖动忽略继续轮询
        if (e.message && e.message !== 'Failed to fetch') throw e;
      }
    }
    throw new Error('渲染超时，请稍后在图库中查看结果');
  };

  // 🧑 数字人：人物图 + 音频 → SadTalker 对口型说话视频
  const handleGenerateDigitalHuman = async () => {


    if (!dhImageUrl && !dhImageFile) return message.warning('请先上传数字人的人物正脸图片！');
    const audioSource = dhAudioFile ? null : (dhAudioUrl || voxCpm2Url);
    if (!dhAudioFile && !audioSource) return message.warning('请先上传音频，或在上方用 VoxCPM2 生成口播语音！');
    setGeneratingDh(true);
    setDhProgress('正在提交 SadTalker 渲染任务...');
    setDhVideoUrl('');
    try {
      const formData = new FormData();
      if (dhImageFile) {
        formData.append('source_image', dhImageFile);
      } else {
        const ext = dhImageUrl.split('.').pop()?.toLowerCase() || 'jpg';
        formData.append('source_image', await _urlToBlob(dhImageUrl), `source.${ext}`);
      }
      if (dhAudioFile) {
        formData.append('driven_audio', dhAudioFile);
      } else {
        formData.append('driven_audio', await _urlToBlob(audioSource as string), 'audio.wav');
      }
      // full：保留肩部/半身背景，避免半身照被裁成只剩头部
      formData.append('preprocess', 'full');
      setDhProgress('SadTalker 对口型渲染中，GPU 加速约 30~90 秒（冷启动首次更久）...');
      // 后端改为异步任务：先提交拿到 task_id，再轮询任务状态，避免长连接被中途断开导致结果丢失。
      const res = await fetch(SADTALKER_TALK_ENDPOINT, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`SadTalker 服务异常 (HTTP ${res.status})`);
      const submit = await res.json();
      if (submit.code !== 200 || !submit.data?.task_id) throw new Error(submit.message || '提交任务失败');

      const url = await _pollSadtalkerTask(submit.data.task_id);
      setDhVideoUrl(url);
      message.success('🧑 数字人口型视频生成完成！');


    } catch (err: any) { message.error(`数字人生成失败: ${err.message}`); }
    finally { setGeneratingDh(false); setDhProgress(''); }
  };

  // 🐾 宠物：宠物图 + 音频 + 真人驱动脸 → SadTalker→LivePortrait 宠物说话视频
  const handleGeneratePetTalk = async () => {
    if (!petImageUrl && !petImageFile) return message.warning('请先上传宠物正脸图片！');
    const audioSource = petAudioFile ? null : (petAudioUrl || voxCpm2Url);
    if (!petAudioFile && !audioSource) return message.warning('请先上传音频，或在上方用 VoxCPM2 生成口播语音！');
    if (!petDriverUrl && !petDriverFile) return message.warning('请先上传一张真人正脸图片（用于生成口型驱动）！');
    setGeneratingPet(true);
    setPetProgress('正在提交宠物口型任务（SadTalker → LivePortrait 两段式）...');
    setPetVideoUrl('');
    try {
      const formData = new FormData();
      if (petImageFile) {
        formData.append('pet_image', petImageFile);
      } else {
        const ext = petImageUrl.split('.').pop()?.toLowerCase() || 'jpg';
        formData.append('pet_image', await _urlToBlob(petImageUrl), `pet.${ext}`);
      }
      if (petAudioFile) {
        formData.append('driven_audio', petAudioFile);
      } else {
        formData.append('driven_audio', await _urlToBlob(audioSource as string), 'audio.wav');
      }
      if (petDriverFile) {
        formData.append('driver_face', petDriverFile);
      } else {
        const ext = petDriverUrl.split('.').pop()?.toLowerCase() || 'jpg';
        formData.append('driver_face', await _urlToBlob(petDriverUrl), `driver.${ext}`);
      }
      setPetProgress('宠物口型渲染中（两段式较慢，约 1~3 分钟，冷启动首次更久）...');
      // 后端改为异步任务：先提交拿到 task_id，再轮询任务状态。
      // 这样长时间的两段式渲染完全脱离浏览器连接，关页面/断网也不丢结果，
      // 渲染完成后视频会稳定落进 R2 并由轮询拿到公网 URL。
      const res = await fetch(SADTALKER_PETTALK_ENDPOINT, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`宠物口型服务异常 (HTTP ${res.status})`);
      const submit = await res.json();
      if (submit.code !== 200 || !submit.data?.task_id) throw new Error(submit.message || '提交任务失败');

      const url = await _pollSadtalkerTask(submit.data.task_id);
      setPetVideoUrl(url);
      message.success('🐾 宠物说话视频生成完成！');

    } catch (err: any) { message.error(`宠物口型生成失败: ${err.message}`); }
    finally { setGeneratingPet(false); setPetProgress(''); }
  };




  const handleSearchStock = async (q: string) => {
    const query = (q || stockQuery).trim();
    if (!query) return message.warning('请输入搜索关键词！');
    setStockQuery(query);
    setSearchingStock(true);
    setPexelsResults([]); setPixabayResults([]); setUnsplashResults([]);
    try {
      const [pexRes, pixRes, unsRes] = await Promise.allSettled([
        fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`, { headers: { Authorization: PEXELS_API_KEY } }),
        fetch(`https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=12&video_type=film`),
        fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&client_id=${UNSPLASH_API_KEY}`),
      ]);
      if (pexRes.status === 'fulfilled' && pexRes.value.ok) { const d = await pexRes.value.json(); setPexelsResults(d.videos || []); }
      if (pixRes.status === 'fulfilled' && pixRes.value.ok) { const d = await pixRes.value.json(); setPixabayResults(d.hits || []); }
      if (unsRes.status === 'fulfilled' && unsRes.value.ok) { const d = await unsRes.value.json(); setUnsplashResults(d.results || []); }
      message.success('素材搜索完成！');
    } catch (e: any) { message.error(`搜索失败: ${e.message}`); }
    finally { setSearchingStock(false); }
  };

  const handleSearchFromScriptData = (scriptData: { storyboard: { scene_prompt: string }[] } | null) => {
    if (!scriptData) return message.warning('请先生成分镜脚本！');
    const kw = scriptData.storyboard.slice(0, 4).map(sh => sh.scene_prompt.split(',')[0].trim()).join(' ');
    handleSearchStock(kw);
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

  // 🧩 商品组合图生成：将选中的多张商品原图组合成同一张图，保证不变形、无文字
  const handleGenerateCombo = async (targetModelId: string) => {
    if (refImagesCombo.length < 2) return message.warning('请至少选择 2 张商品图片进行组合！');

    setComboImageModel(targetModelId);
    setGeneratingCombo(true);
    setComboImages(Array(comboCount).fill(''));
    abortControllers.current['combo'] = new AbortController();

    const basePrompt = (comboPrompt || '').trim() ||
      'clean professional studio product-combo photography, soft balanced lighting, simple seamless light-gray gradient background, realistic shadows and reflections';
    const updatedImages = Array(comboCount).fill('');
    let hasError = false;

    try {
      for (let i = 0; i < comboCount; i++) {
        if (abortControllers.current['combo']?.signal.aborted) break;

        let attempts = 0;
        let success = false;
        while (attempts < 3 && !success) {
          if (abortControllers.current['combo']?.signal.aborted) break;
          attempts++;
          setComboRenderProgress(`生成第 ${i + 1}/${comboCount} 张组合图...${attempts > 1 ? ` (重试 ${attempts}/3)` : ''}`);
          try {
            const drawRes = await fetch(`${API_BASE}/api/v1/agents/generate-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: abortControllers.current['combo']?.signal,
              body: JSON.stringify({
                prompt: `${basePrompt}. Arrange all the products together in one cohesive group shot. Each product keeps its exact original shape with zero deformation. Absolutely no added text, no captions, no watermarks.`,
                ratio: comboRatio,
                image_urls: refImagesCombo,
                model: targetModelId,
                platform: 'pinduoduo',
                product_name: selectedSkuName || '未知产品',
                image_type: 'combo',
                category: 'combo',
              })
            });
            const drawData = await drawRes.json();
            if (drawData.code === 200 && drawData.data?.url) {
              updatedImages[i] = drawData.data.url;
              setComboImages([...updatedImages]);
              success = true;
            } else if (attempts >= 3) {
              hasError = true;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') { success = true; break; }
            if (attempts >= 3) hasError = true;
          }
        }
      }

      if (abortControllers.current['combo']?.signal.aborted) {
        message.warning('商品组合图生成已手动终止');
      } else if (hasError) {
        message.warning('组合图渲染结束，部分图片生成失败，可重试');
      } else {
        message.success('商品组合图渲染完毕！');
      }
    } catch (error: any) {
      message.error(`组合图生成中断: ${error.message}`);
    } finally {
      setGeneratingCombo(false);
      setComboImageModel('');
      setComboRenderProgress('');
      abortControllers.current['combo'] = null;
    }
  };

  const handleDownloadCombo = async () => {
    const validImages = comboImages.filter(url => url);
    if (validImages.length === 0) return message.warning('没有可下载的组合图！');
    setDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('pinduoduo_combo_images');
      for (let i = 0; i < validImages.length; i++) {
        const response = await fetch(`${API_BASE}/api/v1/proxy/download?url=${encodeURIComponent(validImages[i])}`);
        folder?.file(`组合图_${i + 1}.jpg`, await response.blob());
      }
      saveAs(await zip.generateAsync({ type: 'blob' }), 'pinduoduo_combo_images.zip');
    } catch (err) {
      message.error('下载失败');
    } finally {
      setDownloading(false);
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
                        // 注意：不清空各 refImages* 和 buyerShowR2Images，用户上传的原图保留
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

               <div className="mb-6">
                 <PlanManager
                   platform="pinduoduo"
                   skuName={selectedSkuName}
                   pmReport={form.getFieldValue('pm_report') || ''}
                   onLoad={(report) => form.setFieldsValue({ pm_report: report })}
                 />
               </div>

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

                {/* 模式切换：音色设计 / 声音克隆 */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setTtsMode('design')}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition-all ${ttsMode === 'design' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-300 hover:border-purple-400'}`}
                  >🎨 音色设计（预设/描述）</button>
                  <button
                    onClick={() => setTtsMode('clone')}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition-all ${ttsMode === 'clone' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-300 hover:border-purple-400'}`}
                  >🎙️ 声音克隆（上传音频/视频）</button>
                </div>

                {ttsMode === 'design' && (<>
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
                </>)}

                {ttsMode === 'clone' && (<>
                {/* 声音克隆：上传音频/视频参考 */}
                <div className="mb-3 text-[11px] text-purple-600 bg-purple-50 px-2 py-1.5 rounded border border-purple-100">
                  🎙️ 上传一段<strong>参考音频或视频</strong>（建议 5~20 秒清晰人声），系统将自动复刻其音色来朗读上方口播文案。上传视频时会自动提取音轨并识别文本。
                </div>

                {/* 文件上传区 */}
                <div className="mb-3 flex gap-3 items-start">
                  <Upload
                    accept="audio/*,video/*"
                    showUploadList={false}
                    beforeUpload={(file) => { handleCloneFileSelected(file); return false; }}
                  >
                    <div className="w-28 h-24 border-2 border-dashed border-purple-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 bg-white text-purple-400 transition-colors">
                      <UploadOutlined className="text-xl mb-1" />
                      <span className="text-[10px] font-bold text-center px-1">上传参考音频/视频</span>
                    </div>
                  </Upload>
                  <div className="flex-1">
                    {cloneRefName ? (
                      <div className="text-xs text-gray-600 mb-1">
                        <span className="font-bold text-purple-700">{cloneRefIsVideo ? '🎬 视频' : '🎵 音频'}：</span>{cloneRefName}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 mb-1">支持 MP3/WAV/M4A 音频，或 MP4/MOV 视频（自动提取音轨）。</div>
                    )}
                    {cloneRefAudioUrl && !cloneRefIsVideo && (
                      <audio src={cloneRefAudioUrl} controls className="w-full" style={{height:'32px'}} />
                    )}
                    {cloneRefAudioUrl && cloneRefIsVideo && (
                      <video src={cloneRefAudioUrl} controls className="max-h-24 rounded" />
                    )}
                  </div>
                </div>

                {/* 参考音频识别文本（可编辑） */}
                <div className="mb-3">
                  <div className="text-[10px] text-purple-500 mb-1 font-medium flex items-center gap-2">
                    参考音频文本（自动识别，可编辑校正以提升克隆质量）
                    {transcribingClone && <span className="text-purple-400 flex items-center gap-1"><LoadingOutlined /> 识别中...</span>}
                  </div>
                  <Input.TextArea
                    value={clonePromptText}
                    onChange={e => setClonePromptText(e.target.value)}
                    rows={2}
                    size="small"
                    className="text-xs"
                    placeholder="上传参考文件后将自动识别其文字内容，也可手动填写或修正..."
                  />
                </div>

                {/* 参数 + 克隆按钮 */}
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
                    icon={cloningVoice ? <LoadingOutlined /> : <CustomerServiceOutlined />}
                    onClick={handleCloneVoice}
                    loading={cloningVoice}
                    disabled={!cloneRefFile || !broadcastScript.trim() || transcribingClone}
                    className="bg-purple-600 border-purple-600 font-bold">
                    克隆音色并生成口播
                  </Button>
                  {cloneVoiceUrl && (
                    <Button size="small" icon={<DownloadOutlined />}
                      onClick={() => { const a = document.createElement('a'); a.href = cloneVoiceUrl; a.download = 'voxcpm2_clone.wav'; a.click(); }}
                      className="text-purple-700 border-purple-300">
                      下载 WAV
                    </Button>
                  )}
                </div>
                </>)}

                {voxCpm2Url && (
                  <div className="p-3 bg-white rounded-lg border border-purple-200 flex items-center gap-3">
                    <SoundOutlined className="text-purple-500 text-lg flex-shrink-0" />
                    <audio src={voxCpm2Url} controls className="flex-1" style={{height:'32px'}} />
                    <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex-shrink-0">{ttsMode === 'clone' ? '✅ 声音克隆 · WAV' : '✅ VoxCPM2 · WAV'}</span>
                  </div>
                )}
              </div>
            </div>


            {/* 🧑 数字人口型视频生成区 — SadTalker（音频驱动） */}
            <div className="mb-8 p-5 border border-blue-200 rounded-lg bg-gradient-to-r from-blue-50 to-sky-50">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-blue-800 flex items-center gap-2">
                  <span className="text-xl">🧑</span>
                  第三步 A：数字人口型视频（音频驱动）
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">SadTalker · Modal GPU</span>
                </span>
              </div>
              <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded p-2 mb-4">
                上传一张<strong>人物正脸图</strong> + 一段<strong>音频</strong>（可直接用上方 VoxCPM2 生成的口播语音），SadTalker 会让人物按音频<strong>对口型说话</strong>，并带自然的头部微动。
              </div>
              <div className="mb-4 flex gap-6 flex-wrap">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">① 人物正脸图：</div>
                  <div className="flex gap-3 items-start">
                    <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { setDhImageFile(file); setDhImageUrl(URL.createObjectURL(file)); return false; }}>
                      <div className="w-24 h-24 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-blue-400">
                        <UploadOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold text-center">上传人物图</span>
                      </div>
                    </Upload>
                    {dhImageUrl && (
                      <div className="relative w-24 h-24 border border-blue-200 rounded-lg overflow-hidden shadow-sm group">
                        <img src={dhImageUrl} className="w-full h-full object-cover" />
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => { setDhImageUrl(''); setDhImageFile(null); }}>×</div>
                      </div>
                    )}
                  </div>
                  {/* 没有现成照片？让 AI 直接生成一张正脸图 */}
                  <div className="mt-2 flex gap-2 items-center" style={{ maxWidth: 320 }}>
                    <Input size="small" value={dhGenPrompt} onChange={e => setDhGenPrompt(e.target.value)}
                      placeholder="描述想要的人物，如：温柔知性的中年女性" className="text-xs" />
                    <Button size="small" icon={generatingDhImage ? <LoadingOutlined /> : <RobotOutlined />}
                      onClick={handleGenerateDhFace} loading={generatingDhImage}
                      className="text-blue-600 border-blue-300 bg-blue-50 font-bold whitespace-nowrap">AI 生成</Button>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">② 音频（口型来源）：</div>

                  <div className="flex gap-3 items-start">
                    <Upload accept="audio/*" showUploadList={false} beforeUpload={(file) => { setDhAudioFile(file); setDhAudioUrl(URL.createObjectURL(file)); return false; }}>
                      <div className="w-24 h-24 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-blue-400">
                        <CustomerServiceOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold text-center">上传音频</span>
                      </div>
                    </Upload>
                    <div className="flex flex-col gap-1 self-center">
                      {(dhAudioUrl || dhAudioFile) ? (
                        <>
                          <audio src={dhAudioUrl} controls className="w-44" style={{height:'32px'}} />
                          <span className="text-[10px] text-blue-500 cursor-pointer" onClick={() => { setDhAudioUrl(''); setDhAudioFile(null); }}>清除已上传音频</span>
                        </>
                      ) : voxCpm2Url ? (
                        <div className="text-[11px] text-green-600 bg-green-50 border border-green-100 rounded px-2 py-1">✅ 将使用上方 VoxCPM2 生成的语音<br/>（如需自定义可在此上传）</div>
                      ) : (
                        <div className="text-[11px] text-gray-400">未上传音频时，将自动使用上方 VoxCPM2 生成的口播语音。</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-[160px] text-[11px] text-gray-400 self-center">人物图：JPG/PNG 正面清晰单张人脸。<br/>音频：wav/mp3/m4a，建议时长 5~60 秒。</div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button type="primary" icon={generatingDh ? <LoadingOutlined /> : <VideoCameraOutlined />}
                  onClick={handleGenerateDigitalHuman} loading={generatingDh}
                  disabled={(!dhImageUrl && !dhImageFile) || (!dhAudioFile && !dhAudioUrl && !voxCpm2Url)}
                  className="bg-blue-600 border-blue-600 font-bold">
                  生成数字人口型视频
                </Button>
                {generatingDh && <span className="text-blue-600 font-bold text-xs flex items-center gap-1"><Spin size="small" />{dhProgress}</span>}
                {dhVideoUrl && !generatingDh && (
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => { const a = document.createElement('a'); a.href = dhVideoUrl; a.download = 'digital_human_talk.mp4'; a.click(); }}
                    className="text-blue-700 border-blue-300 bg-blue-50 font-bold">下载视频</Button>
                )}
              </div>
              {dhVideoUrl && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
                  <div className="text-xs font-bold text-blue-700 mb-2">🎬 数字人口型视频预览：</div>
                  <video src={dhVideoUrl} controls className="w-full max-h-80 rounded-lg" />
                </div>
              )}
            </div>

            {/* 🐾 宠物口型视频生成区 — SadTalker → LivePortrait（音频驱动两段式） */}
            <div className="mb-8 p-5 border border-pink-200 rounded-lg bg-gradient-to-r from-pink-50 to-rose-50">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-pink-800 flex items-center gap-2">
                  <span className="text-xl">🐾</span>
                  第三步 B：宠物口型视频（音频驱动）
                  <span className="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">SadTalker → LivePortrait · Modal GPU</span>
                </span>
              </div>
              <div className="text-xs text-pink-600 bg-pink-50 border border-pink-100 rounded p-2 mb-4">
                上传<strong>宠物正脸图</strong> + 一段<strong>音频</strong> + 一张<strong>真人正脸图</strong>。系统先用真人脸+音频生成对口型说话视频，再把口型/表情动作迁移到宠物，得到<strong>宠物按音频说话</strong>的视频。两段式渲染较慢（约 1~3 分钟）。
              </div>
              <div className="mb-4 flex gap-6 flex-wrap">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">① 宠物正脸图：</div>
                  <div className="flex gap-3 items-start">
                    <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { setPetImageFile(file); setPetImageUrl(URL.createObjectURL(file)); return false; }}>
                      <div className="w-24 h-24 border-2 border-dashed border-pink-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 bg-white text-pink-400">
                        <UploadOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold text-center">上传宠物图</span>
                      </div>
                    </Upload>
                    {petImageUrl && (
                      <div className="relative w-24 h-24 border border-pink-200 rounded-lg overflow-hidden shadow-sm group">
                        <img src={petImageUrl} className="w-full h-full object-cover" />
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => { setPetImageUrl(''); setPetImageFile(null); }}>×</div>
                      </div>
                    )}
                  </div>
                  {/* 没有现成宠物照片？让 AI 直接生成一张正脸图 */}
                  <div className="mt-2 flex gap-2 items-center" style={{ maxWidth: 320 }}>
                    <Input size="small" value={petGenPrompt} onChange={e => setPetGenPrompt(e.target.value)}
                      placeholder="描述想要的宠物，如：可爱的柯基犬" className="text-xs" />
                    <Button size="small" icon={generatingPetImage ? <LoadingOutlined /> : <RobotOutlined />}
                      onClick={handleGeneratePetFace} loading={generatingPetImage}
                      className="text-pink-600 border-pink-300 bg-pink-50 font-bold whitespace-nowrap">AI 生成</Button>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">② 音频（口型来源）：</div>
                  <div className="flex gap-3 items-start">
                    <Upload accept="audio/*" showUploadList={false} beforeUpload={(file) => { setPetAudioFile(file); setPetAudioUrl(URL.createObjectURL(file)); return false; }}>
                      <div className="w-24 h-24 border-2 border-dashed border-pink-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 bg-white text-pink-400">
                        <CustomerServiceOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold text-center">上传音频</span>

                      </div>
                    </Upload>
                    <div className="flex flex-col gap-1 self-center">
                      {(petAudioUrl || petAudioFile) ? (
                        <>
                          <audio src={petAudioUrl} controls className="w-44" style={{height:'32px'}} />
                          <span className="text-[10px] text-pink-500 cursor-pointer" onClick={() => { setPetAudioUrl(''); setPetAudioFile(null); }}>清除已上传音频</span>
                        </>
                      ) : voxCpm2Url ? (
                        <div className="text-[11px] text-green-600 bg-green-50 border border-green-100 rounded px-2 py-1">✅ 将使用上方 VoxCPM2 生成的语音</div>
                      ) : (
                        <div className="text-[11px] text-gray-400">未上传时自动使用上方 VoxCPM2 语音。</div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">③ 真人正脸图（口型驱动源）：</div>
                  <div className="flex gap-3 items-start">
                    <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { setPetDriverFile(file); setPetDriverUrl(URL.createObjectURL(file)); return false; }}>
                      <div className="w-24 h-24 border-2 border-dashed border-pink-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 bg-white text-pink-400">
                        <UploadOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold text-center">上传真人脸</span>
                      </div>
                    </Upload>
                    {petDriverUrl && (
                      <div className="relative w-24 h-24 border border-pink-200 rounded-lg overflow-hidden shadow-sm group">
                        <img src={petDriverUrl} className="w-full h-full object-cover" />
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => { setPetDriverUrl(''); setPetDriverFile(null); }}>×</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-[160px] text-[11px] text-gray-400 self-center">宠物图：正面清晰宠物脸。<br/>真人脸：清晰正脸，用于生成口型驱动视频，越接近正面效果越好。</div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button type="primary" icon={generatingPet ? <LoadingOutlined /> : <VideoCameraOutlined />}
                  onClick={handleGeneratePetTalk} loading={generatingPet}
                  disabled={(!petImageUrl && !petImageFile) || (!petAudioFile && !petAudioUrl && !voxCpm2Url) || (!petDriverUrl && !petDriverFile)}
                  className="bg-pink-600 border-pink-600 font-bold">
                  生成宠物口型视频
                </Button>
                {generatingPet && <span className="text-pink-600 font-bold text-xs flex items-center gap-1"><Spin size="small" />{petProgress}</span>}
                {petVideoUrl && !generatingPet && (
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => { const a = document.createElement('a'); a.href = petVideoUrl; a.download = 'pet_talk.mp4'; a.click(); }}
                    className="text-pink-700 border-pink-300 bg-pink-50 font-bold">下载视频</Button>
                )}
              </div>
              {petVideoUrl && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-pink-200">
                  <div className="text-xs font-bold text-pink-700 mb-2">🎬 宠物口型视频预览：</div>
                  <video src={petVideoUrl} controls className="w-full max-h-80 rounded-lg" />
                </div>
              )}
            </div>


            <Form.Item label={<span className="font-bold text-gray-700 block">主图</span>} className="mb-8">
              <div className="flex flex-col">
                {/* 拼多多主图规格提示 + 比例单选 */}
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 mb-3">
                  📐 <strong>图片要求：</strong>宽高比例为 <strong>1:1 或 3:4</strong>，且宽高均大于 480px，大小 3M 内。请选择目标比例后再生图，系统将按所选比例出图。
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs text-gray-600 font-medium">主图比例：</span>
                  {(['1:1', '3:4'] as const).map(r => (
                    <button type="button" key={r} onClick={() => setMainImageRatio(r)}
                      className={`text-xs px-3 py-1 rounded border font-bold cursor-pointer transition-all ${mainImageRatio === r ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-300 hover:border-purple-400'}`}>
                      {r === '1:1' ? '1:1 方图' : '3:4 竖图'}
                    </button>
                  ))}
                </div>
                <div className="mb-3 flex flex-col gap-1">
                  <div className="text-xs font-medium text-gray-500">主图参考素材 ({refImagesMain.length} 张)</div>

                  <div className="flex gap-2 flex-wrap">
                    {refImagesMain.map((img, idx) => (
                      <div key={idx} className="relative w-[50px] h-[50px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                        <img src={img} className="w-full h-full object-cover" />
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => setRefImagesMain(prev => prev.filter(u => u !== img))}>×</div>
                      </div>
                    ))}
                    <div onClick={() => openR2Modal('main')} className="w-[50px] h-[50px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-gray-400 hover:text-blue-500 transition-colors">
                      <CloudOutlined className="text-lg mb-0.5" /><span className="text-[9px] font-bold">选图</span>
                    </div>
                  </div>
                </div>
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
                      <div key={i} className={`${mainImageRatio === '1:1' ? 'aspect-square' : 'aspect-[3/4]'} border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 relative overflow-hidden shadow-sm`}>
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

            {/* ── 🧩 商品组合图生图 ── */}

            <Form.Item label={<span className="font-bold text-gray-700 block">商品组合图</span>} className="mb-8">
              <div className="flex flex-col">
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-700 mb-4">
                  🧩 <strong>商品组合图：</strong>上传/选择 2 张以上不同商品图片，AI 自动将它们组合到同一张图中。保证每件商品<strong>形状不变形</strong>、画面<strong>无任何文字</strong>，适合套餐/组合/搭配售卖场景。
                </div>

                {/* 组合商品参考图选择 */}
                <div className="mb-4 flex flex-col gap-2">
                  <div className="text-sm font-medium text-gray-700">组合商品原图 ({refImagesCombo.length} 张，至少 2 张)</div>
                  <div className="flex gap-2 flex-wrap">
                    {refImagesCombo.map((img, idx) => (
                      <div key={idx} className="relative w-[60px] h-[60px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                        <img src={img} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 left-0 bg-emerald-600/80 text-white text-[9px] px-1 rounded-tr">{idx + 1}</span>
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => setRefImagesCombo(prev => prev.filter(u => u !== img))} title="删除">×</div>
                      </div>
                    ))}
                    <div onClick={() => openR2Modal('combo')} className="w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 bg-white text-gray-400 hover:text-emerald-500 transition-colors">
                      <CloudOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold">选择图片</span>
                    </div>
                  </div>
                </div>

                {/* 配置 + 生成栏 */}
                <div className="flex flex-col gap-3 mb-6 bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-gray-600 font-medium">画面比例：</span>
                    {(['1:1', '3:4', '4:3', '16:9'] as const).map(r => (
                      <button type="button" key={r} onClick={() => setComboRatio(r)}
                        className={`text-xs px-2 py-1 rounded border font-bold cursor-pointer transition-all ${comboRatio === r ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-300 hover:border-emerald-400'}`}>
                        {r}
                      </button>
                    ))}
                    <span className="text-xs text-gray-600 font-medium ml-2">生成数量：</span>
                    <Input type="number" min={1} max={6} value={comboCount}
                      onChange={(e) => setComboCount(Math.min(6, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-16" size="small" />
                  </div>
                  <Input
                    value={comboPrompt}
                    onChange={e => setComboPrompt(e.target.value)}
                    placeholder="可选：补充组合场景/背景描述（如：浅灰渐变背景、原木桌面摆台等），留空则使用默认干净影棚背景"
                    size="small"
                    className="rounded"
                  />
                  <div className="flex flex-wrap gap-3 items-center">
                    {RENDER_MODELS.map((model) => (
                      <Button
                        key={model.id}
                        size="small"
                        type={comboImageModel === model.id ? 'primary' : 'default'}
                        className={comboImageModel === model.id ? 'bg-emerald-600 font-bold' : 'text-gray-600'}
                        onClick={() => handleGenerateCombo(model.id)}
                        loading={comboImageModel === model.id}
                        disabled={generatingCombo && comboImageModel !== model.id}
                      >
                        {model.label.split(' ')[0]}
                      </Button>
                    ))}
                    {generatingCombo && (
                      <span className="ml-2 text-emerald-600 font-bold text-xs self-center flex items-center">
                        <Spin size="small" className="mr-2" />{comboRenderProgress}
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('combo')} title="停止生成" />
                      </span>
                    )}
                    {comboImages.some(img => img !== '') && (
                      <Button size="small" type="primary" icon={<DownloadOutlined />}
                        onClick={handleDownloadCombo}
                        loading={downloading}
                        className="bg-green-600 font-bold ml-auto">
                        一键打包下载
                      </Button>
                    )}
                  </div>
                </div>

                <Image.PreviewGroup>
                  <div className="grid grid-cols-3 gap-4">
                    {comboImages.map((imgUrl, i) => {
                      const aspectClass = comboRatio === '1:1' ? 'aspect-square' : comboRatio === '3:4' ? 'aspect-[3/4]' : comboRatio === '4:3' ? 'aspect-[4/3]' : 'aspect-video';
                      return (
                        <div key={i} className={`${aspectClass} border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 relative overflow-hidden shadow-sm`}>
                          {imgUrl ? (
                            <Image src={imgUrl} className="w-full h-full object-cover" alt={`组合图${i+1}`} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                          ) : (
                            <div className="flex flex-col items-center opacity-40">
                              <PictureOutlined className="text-2xl mb-2" />
                              <span className="text-[10px] font-medium">组合图 {i+1}</span>
                            </div>
                          )}
                          <span className="absolute top-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded z-10 pointer-events-none">{i+1}</span>
                        </div>
                      );
                    })}
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
                  视频要求：时长 60 秒以内；宽高比为 <strong>1:1 或 16:9 或 3:4</strong>。上传后展示在商品轮播图位置首位，享全站流量扶持，提升转化。请选择目标比例后再生成，系统将按所选比例出片。
                </div>

                {/* 商品视频比例单选 */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 font-medium">视频比例：</span>
                  {(['1:1', '16:9', '3:4'] as const).map(r => (
                    <button type="button" key={r} onClick={() => setProductVideoRatio(r)}
                      className={`text-xs px-3 py-1 rounded border font-bold cursor-pointer transition-all ${productVideoRatio === r ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-300 hover:border-purple-400'}`}>
                      {r === '1:1' ? '1:1 方形' : r === '16:9' ? '16:9 横屏' : '3:4 竖屏'}
                    </button>
                  ))}
                </div>

                {/* AI 生成分镜脚本（双模型：gpt-5.5 / gemini） */}
                <div className="flex flex-wrap gap-3 items-center bg-gray-50 p-4 border border-gray-100 rounded-lg">
                  <span className="text-xs text-gray-500 font-medium">生成分镜脚本：</span>
                  {TEXT_MODELS.map((model) => (
                    <Button
                      key={model.id}
                      icon={<RobotOutlined />}
                      type={scriptModel === model.id ? 'primary' : 'default'}
                      onClick={() => _generateScriptOnly(model.id)}
                      loading={scriptModel === model.id && generatingScript}
                      disabled={generatingScript && scriptModel !== model.id}
                      className={scriptModel === model.id && generatingScript ? 'bg-indigo-600 font-bold' : 'text-indigo-600 border-indigo-300 bg-indigo-50 font-bold'}
                    >
                      分镜脚本 ({model.id})
                    </Button>
                  ))}
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
                              <span className="text-indigo-100 text-[10px]" title={script.global_style_prompt}>{script.global_style_prompt.slice(0, 60)}...</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[10px] text-left">
                                <thead className="bg-indigo-50 text-gray-600 font-bold border-b border-indigo-100">
                                  <tr>
                                    <th className="px-2 py-2">镜号</th>
                                    <th className="px-2 py-2">时间</th>
                                    <th className="px-2 py-2">景别&运镜</th>
                                    <th className="px-2 py-2">画面描述</th>
                                    <th className="px-2 py-2 w-[250px]">AI Prompt</th>
                                    <th className="px-2 py-2">音频/转场</th>
                                    <th className="px-2 py-2">参考图</th>
                                    <th className="px-2 py-2 w-[80px]">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {script.storyboard.map((shot, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 align-top">
                                      <td className="px-2 py-2"><span className="w-4 h-4 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-[9px] font-bold">{shot.shot_number || (idx+1).toString().padStart(2, '0')}</span></td>
                                      <td className="px-2 py-2 text-gray-500">{shot.time}</td>
                                      <td className="px-2 py-2 font-medium text-gray-700">{shot.shot_and_camera}</td>
                                      <td className="px-2 py-2 text-gray-600 max-w-[200px]">{shot.logic}</td>
                                      <td className="px-2 py-2 text-gray-400 break-words">{shot.scene_prompt}</td>
                                      <td className="px-2 py-2">
                                        <div className="text-gray-500">{shot.audio}</div>
                                        <div className="text-gray-400 mt-1">{shot.transition}</div>
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="w-12 h-12 border border-dashed border-gray-300 rounded overflow-hidden flex flex-col items-center justify-center bg-gray-50 relative group/img">
                                          {shot.reference_image ? (
                                            <><img src={shot.reference_image} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                              <Button size="small" type="text" className="text-white text-[8px]" onClick={() => {
                                                  setScript(prev => prev ? { ...prev, storyboard: prev.storyboard.map((s, i) => i === idx ? { ...s, reference_image: undefined } : s) } : prev);
                                              }}>删除</Button>
                                            </div>
                                            </>
                                          ) : (
                                            <Upload accept="image/*" showUploadList={false} customRequest={async (options: any) => {
                                                const { file, onSuccess, onError } = options;
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                  const res = await fetch(`${API_BASE}/api/v1/r2/upload`, { method: 'POST', body: formData });
                                                  const data = await res.json();
                                                  if (data.code === 200) {
                                                    setScript(prev => prev ? { ...prev, storyboard: prev.storyboard.map((s, i) => i === idx ? { ...s, reference_image: data.data.url } : s) } : prev);
                                                    onSuccess(data, file);
                                                  } else throw new Error(data.message);
                                                } catch(e) { onError(e); }
                                            }}>
                                                <div className="w-12 h-12 flex flex-col items-center justify-center cursor-pointer hover:text-blue-500 text-gray-400">
                                                    <PlusOutlined className="text-[10px] mb-0.5"/>
                                                    <span className="text-[8px]">上传</span>
                                                </div>
                                            </Upload>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 flex flex-col gap-1.5 items-center justify-center">
                                        <Button size="small" type="primary" className="text-[10px] h-6 w-full bg-indigo-600 font-bold border-0" 
                                          onClick={() => _renderShotWan22(shot, idx, script.ratio || '16:9', script.global_style_prompt, setGeneratingLtx, setLtxProgress, setLtxClips, `video-wan22-${idx}`)}
                                          loading={shotRendering.includes(`video-wan22-${idx}`)}>
                                          Wan2.2 渲染
                                        </Button>
                                        <Button size="small" className="text-[10px] h-6 w-full text-purple-600 border-purple-200 hover:border-purple-400 bg-purple-50"
                                          onClick={() => _renderShotSeedance(shot, idx, script.global_style_prompt, setGeneratingVideo, setVideoRenderProgress, setVideoClips, `video-seedance-${idx}`)}
                                          loading={shotRendering.includes(`video-seedance-${idx}`)}>
                                          Seedance 渲染
                                        </Button>


                                        {(ltxClips[idx] || videoClips[idx]) && (
                                          <div className="w-full mt-1 flex flex-col gap-1">
                                            <video src={ltxClips[idx] || videoClips[idx]} controls className="w-full rounded border border-gray-200" />
                                            <a href={ltxClips[idx] || videoClips[idx]} download={`商品视频_镜${shot.shot_number || (idx+1).toString().padStart(2,'0')}.mp4`}
                                              className="text-[10px] text-green-600 font-bold text-center hover:underline">⬇ 下载本镜</a>
                                          </div>
                                        )}
                                      </td>

                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                  <span className="text-xs text-gray-500 font-medium">生成分镜脚本（9:16）：</span>
                  {TEXT_MODELS.map((model) => (
                    <Button
                      key={model.id}
                      icon={<RobotOutlined />}
                      type={explainScriptModel === model.id ? 'primary' : 'default'}
                      onClick={() => _generateScript('9:16', setGeneratingExplainScript, setExplainScript, 'explain_script', model.id, setExplainScriptModel)}
                      loading={explainScriptModel === model.id && generatingExplainScript}
                      disabled={generatingExplainScript && explainScriptModel !== model.id}
                      className={explainScriptModel === model.id && generatingExplainScript ? 'bg-orange-500 font-bold' : 'text-orange-600 border-orange-300 bg-orange-50 font-bold'}
                    >
                      分镜脚本 ({model.id})
                    </Button>
                  ))}
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
                      <span className="text-orange-100 text-[10px]" title={explainScript.global_style_prompt}>{explainScript.global_style_prompt.slice(0, 60)}...</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] text-left">
                                <thead className="bg-orange-50 text-gray-600 font-bold border-b border-orange-100">
                                  <tr>
                                    <th className="px-2 py-2">镜号</th>
                                    <th className="px-2 py-2">时间</th>
                                    <th className="px-2 py-2">景别&运镜</th>
                                    <th className="px-2 py-2">画面描述</th>
                                    <th className="px-2 py-2 w-[250px]">AI Prompt</th>
                                    <th className="px-2 py-2">音频/转场</th>
                                    <th className="px-2 py-2">参考图</th>
                                    <th className="px-2 py-2 w-[80px]">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {explainScript.storyboard.map((shot, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 align-top">
                                      <td className="px-2 py-2"><span className="w-4 h-4 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-[9px] font-bold">{shot.shot_number || (idx+1).toString().padStart(2, '0')}</span></td>
                                      <td className="px-2 py-2 text-gray-500">{shot.time}</td>
                                      <td className="px-2 py-2 font-medium text-gray-700">{shot.shot_and_camera}</td>
                                      <td className="px-2 py-2 text-gray-600 max-w-[200px]">{shot.logic}</td>
                                      <td className="px-2 py-2 text-gray-400 break-words">{shot.scene_prompt}</td>
                                      <td className="px-2 py-2">
                                        <div className="text-gray-500">{shot.audio}</div>
                                        <div className="text-gray-400 mt-1">{shot.transition}</div>
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="w-12 h-12 border border-dashed border-gray-300 rounded overflow-hidden flex flex-col items-center justify-center bg-gray-50 relative group/img">
                                          {shot.reference_image ? (
                                            <><img src={shot.reference_image} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                              <Button size="small" type="text" className="text-white text-[8px]" onClick={() => {
                                                  setExplainScript(prev => prev ? { ...prev, storyboard: prev.storyboard.map((s, i) => i === idx ? { ...s, reference_image: undefined } : s) } : prev);
                                              }}>删除</Button>
                                            </div>
                                            </>
                                          ) : (
                                            <Upload accept="image/*" showUploadList={false} customRequest={async (options: any) => {
                                                const { file, onSuccess, onError } = options;
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                  const res = await fetch(`${API_BASE}/api/v1/r2/upload`, { method: 'POST', body: formData });
                                                  const data = await res.json();
                                                  if (data.code === 200) {
                                                    setExplainScript(prev => prev ? { ...prev, storyboard: prev.storyboard.map((s, i) => i === idx ? { ...s, reference_image: data.data.url } : s) } : prev);
                                                    onSuccess(data, file);
                                                  } else throw new Error(data.message);
                                                } catch(e) { onError(e); }
                                            }}>
                                                <div className="w-12 h-12 flex flex-col items-center justify-center cursor-pointer hover:text-blue-500 text-gray-400">
                                                    <PlusOutlined className="text-[10px] mb-0.5"/>
                                                    <span className="text-[8px]">上传</span>
                                                </div>
                                            </Upload>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 flex flex-col gap-1.5 items-center justify-center">
                                        <Button size="small" type="primary" className="text-[10px] h-6 w-full bg-orange-600 font-bold border-0" 
                                          onClick={() => _renderShotWan22(shot, idx, explainScript.ratio || '9:16', explainScript.global_style_prompt, setGeneratingExplainLtx, setExplainLtxProgress, setExplainLtxClips, `explain-wan22-${idx}`)}
                                          loading={shotRendering.includes(`explain-wan22-${idx}`)}>
                                          Wan2.2 渲染
                                        </Button>
                                        <Button size="small" className="text-[10px] h-6 w-full text-purple-600 border-purple-200 hover:border-purple-400 bg-purple-50"
                                          onClick={() => _renderShotSeedance(shot, idx, explainScript.global_style_prompt, setGeneratingExplainVideo, setExplainVideoProgress, setExplainVideoClips, `explain-seedance-${idx}`)}
                                          loading={shotRendering.includes(`explain-seedance-${idx}`)}>

                                          Seedance 渲染
                                        </Button>

                                        {(explainLtxClips[idx] || explainVideoClips[idx]) && (
                                          <div className="w-full mt-1 flex flex-col gap-1">
                                            <video src={explainLtxClips[idx] || explainVideoClips[idx]} controls className="w-full rounded border border-gray-200" />
                                            <a href={explainLtxClips[idx] || explainVideoClips[idx]} download={`讲解视频_镜${shot.shot_number || (idx+1).toString().padStart(2,'0')}.mp4`}
                                              className="text-[10px] text-green-600 font-bold text-center hover:underline">⬇ 下载本镜</a>
                                          </div>
                                        )}
                                      </td>

                                    </tr>
                                  ))}
                                </tbody>
                      </table>
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

            {/* ── 视频素材库 ── */}
            <Form.Item label={<span className="font-bold text-gray-700 block">视频素材库</span>} className="mb-8">
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-sky-50 border border-sky-100 rounded-lg text-xs text-sky-700">
                  🎬 根据分镜脚本自动提取关键词，一键搜索 <strong>Pexels · Pixabay · Unsplash</strong> 海量正版视频/图片素材。
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input
                    value={stockQuery}
                    onChange={e => setStockQuery(e.target.value)}
                    onPressEnter={() => handleSearchStock(stockQuery)}
                    placeholder="输入关键词搜索素材，例如：green tea ceremony"
                    className="flex-1 min-w-[200px]"
                    size="small"
                  />
                  <Button type="primary" size="small" loading={searchingStock} onClick={() => handleSearchStock(stockQuery)}
                    className="bg-sky-600 border-sky-600 font-bold">搜索</Button>
                  <Button size="small" icon={<RobotOutlined />} onClick={() => handleSearchFromScriptData(script || explainScript || detailScript)} loading={searchingStock}
                    disabled={!script && !explainScript && !detailScript}
                    className="text-indigo-600 border-indigo-300 bg-indigo-50 font-bold">
                    从分镜脚本提取关键词
                  </Button>
                </div>
                {/* Tab 切换 */}
                <div className="flex gap-0 border-b border-gray-200">
                  {(['pexels','pixabay','unsplash'] as const).map(tab => (
                    <button key={tab} onClick={() => setStockTab(tab)}
                      className={`text-xs px-4 py-2 font-bold border-b-2 transition-all cursor-pointer ${stockTab === tab ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                      {tab === 'pexels' ? '🎥 Pexels' : tab === 'pixabay' ? '📹 Pixabay' : '📷 Unsplash'}
                      <span className="ml-1 text-[10px] text-gray-400">
                        ({tab === 'pexels' ? pexelsResults.length : tab === 'pixabay' ? pixabayResults.length : unsplashResults.length})
                      </span>
                    </button>
                  ))}
                </div>
                {/* 搜索结果 */}
                {searchingStock ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-sky-600">
                    <Spin size="small" /><span className="text-sm">正在搜索三平台素材...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                    {stockTab === 'pexels' && pexelsResults.map((v, i) => {
                      const thumb = v.image;
                      const videoFile = v.video_files?.find((f: any) => f.quality === 'sd') || v.video_files?.[0];
                      return (
                        <div key={i} className="rounded-lg overflow-hidden border border-gray-200 shadow-sm group relative bg-black">
                          <div className="aspect-video relative overflow-hidden">
                            {thumb && <img src={thumb} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" />}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <VideoCameraOutlined className="text-white text-2xl opacity-70" />
                            </div>
                          </div>
                          <div className="p-1.5 bg-white">
                            <div className="text-[10px] text-gray-500 truncate">{v.duration}s · {v.width}×{v.height}</div>
                            <div className="flex gap-1 mt-1">
                              {videoFile && <a href={videoFile.link} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-sky-600 hover:underline font-bold flex items-center gap-0.5">
                                <DownloadOutlined />下载
                              </a>}
                              <a href={v.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-gray-400 hover:underline ml-auto">预览</a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {stockTab === 'pixabay' && pixabayResults.map((v, i) => {
                      const thumb = v.videos?.medium?.thumbnail || v.userImageURL;
                      const videoUrl = v.videos?.medium?.url || v.videos?.small?.url;
                      return (
                        <div key={i} className="rounded-lg overflow-hidden border border-gray-200 shadow-sm group relative bg-black">
                          <div className="aspect-video relative overflow-hidden">
                            {thumb && <img src={thumb} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" />}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <VideoCameraOutlined className="text-white text-2xl opacity-70" />
                            </div>
                          </div>
                          <div className="p-1.5 bg-white">
                            <div className="text-[10px] text-gray-500 truncate">{v.duration}s · {v.videos?.medium?.width}×{v.videos?.medium?.height}</div>
                            <div className="flex gap-1 mt-1">
                              {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-sky-600 hover:underline font-bold flex items-center gap-0.5">
                                <DownloadOutlined />下载
                              </a>}
                              <a href={v.pageURL} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-gray-400 hover:underline ml-auto">预览</a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {stockTab === 'unsplash' && unsplashResults.map((p, i) => (
                      <div key={i} className="rounded-lg overflow-hidden border border-gray-200 shadow-sm group relative">
                        <div className="aspect-video relative overflow-hidden bg-gray-100">
                          <img src={p.urls?.small} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        </div>
                        <div className="p-1.5 bg-white">
                          <div className="text-[10px] text-gray-500 truncate">{p.user?.name}</div>
                          <div className="flex gap-1 mt-1">
                            <a href={`${p.links?.download}&force=true`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-sky-600 hover:underline font-bold flex items-center gap-0.5">
                              <DownloadOutlined />下载
                            </a>
                            <a href={p.links?.html} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-gray-400 hover:underline ml-auto">预览</a>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!searchingStock && stockTab === 'pexels' && pexelsResults.length === 0 && stockQuery && (
                      <div className="col-span-6 text-center py-8 text-gray-400 text-sm">暂无 Pexels 结果，尝试换个关键词</div>
                    )}
                    {!searchingStock && stockTab === 'pixabay' && pixabayResults.length === 0 && stockQuery && (
                      <div className="col-span-6 text-center py-8 text-gray-400 text-sm">暂无 Pixabay 结果，尝试换个关键词</div>
                    )}
                    {!searchingStock && stockTab === 'unsplash' && unsplashResults.length === 0 && stockQuery && (
                      <div className="col-span-6 text-center py-8 text-gray-400 text-sm">暂无 Unsplash 结果，尝试换个关键词</div>
                    )}
                    {!stockQuery && (
                      <div className="col-span-6 text-center py-8 text-gray-300 text-sm">输入关键词或点击「从分镜脚本提取关键词」开始搜索</div>
                    )}
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
                  <span className="text-xs text-gray-500 font-medium">生成分镜脚本（16:9）：</span>
                  {TEXT_MODELS.map((model) => (
                    <Button
                      key={model.id}
                      icon={<RobotOutlined />}
                      type={detailScriptModel === model.id ? 'primary' : 'default'}
                      onClick={() => _generateScript('16:9', setGeneratingDetailScript, setDetailScript, 'detail_script', model.id, setDetailScriptModel)}
                      loading={detailScriptModel === model.id && generatingDetailScript}
                      disabled={generatingDetailScript && detailScriptModel !== model.id}
                      className={detailScriptModel === model.id && generatingDetailScript ? 'bg-teal-600 font-bold' : 'text-teal-600 border-teal-300 bg-teal-50 font-bold'}
                    >
                      分镜脚本 ({model.id})
                    </Button>
                  ))}
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
                      <span className="text-teal-100 text-[10px]" title={detailScript.global_style_prompt}>{detailScript.global_style_prompt.slice(0, 60)}...</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] text-left">
                                <thead className="bg-teal-50 text-gray-600 font-bold border-b border-teal-100">
                                  <tr>
                                    <th className="px-2 py-2">镜号</th>
                                    <th className="px-2 py-2">时间</th>
                                    <th className="px-2 py-2">景别&运镜</th>
                                    <th className="px-2 py-2">画面描述</th>
                                    <th className="px-2 py-2 w-[250px]">AI Prompt</th>
                                    <th className="px-2 py-2">音频/转场</th>
                                    <th className="px-2 py-2">参考图</th>
                                    <th className="px-2 py-2 w-[80px]">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {detailScript.storyboard.map((shot, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 align-top">
                                      <td className="px-2 py-2"><span className="w-4 h-4 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-[9px] font-bold">{shot.shot_number || (idx+1).toString().padStart(2, '0')}</span></td>
                                      <td className="px-2 py-2 text-gray-500">{shot.time}</td>
                                      <td className="px-2 py-2 font-medium text-gray-700">{shot.shot_and_camera}</td>
                                      <td className="px-2 py-2 text-gray-600 max-w-[200px]">{shot.logic}</td>
                                      <td className="px-2 py-2 text-gray-400 break-words">{shot.scene_prompt}</td>
                                      <td className="px-2 py-2">
                                        <div className="text-gray-500">{shot.audio}</div>
                                        <div className="text-gray-400 mt-1">{shot.transition}</div>
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="w-12 h-12 border border-dashed border-gray-300 rounded overflow-hidden flex flex-col items-center justify-center bg-gray-50 relative group/img">
                                          {shot.reference_image ? (
                                            <><img src={shot.reference_image} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                              <Button size="small" type="text" className="text-white text-[8px]" onClick={() => {
                                                  setDetailScript(prev => prev ? { ...prev, storyboard: prev.storyboard.map((s, i) => i === idx ? { ...s, reference_image: undefined } : s) } : prev);
                                              }}>删除</Button>
                                            </div>
                                            </>
                                          ) : (
                                            <Upload accept="image/*" showUploadList={false} customRequest={async (options: any) => {
                                                const { file, onSuccess, onError } = options;
                                                const formData = new FormData();
                                                formData.append('file', file);
                                                try {
                                                  const res = await fetch(`${API_BASE}/api/v1/r2/upload`, { method: 'POST', body: formData });
                                                  const data = await res.json();
                                                  if (data.code === 200) {
                                                    setDetailScript(prev => prev ? { ...prev, storyboard: prev.storyboard.map((s, i) => i === idx ? { ...s, reference_image: data.data.url } : s) } : prev);
                                                    onSuccess(data, file);
                                                  } else throw new Error(data.message);
                                                } catch(e) { onError(e); }
                                            }}>
                                                <div className="w-12 h-12 flex flex-col items-center justify-center cursor-pointer hover:text-blue-500 text-gray-400">
                                                    <PlusOutlined className="text-[10px] mb-0.5"/>
                                                    <span className="text-[8px]">上传</span>
                                                </div>
                                            </Upload>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 flex flex-col gap-1.5 items-center justify-center">
                                        <Button size="small" type="primary" className="text-[10px] h-6 w-full bg-teal-600 font-bold border-0" 
                                          onClick={() => _renderShotWan22(shot, idx, detailScript.ratio || '16:9', detailScript.global_style_prompt, setGeneratingDetailLtx, setDetailLtxProgress, setDetailLtxClips, `detail-wan22-${idx}`)}
                                          loading={shotRendering.includes(`detail-wan22-${idx}`)}>
                                          Wan2.2 渲染
                                        </Button>
                                        <Button size="small" className="text-[10px] h-6 w-full text-purple-600 border-purple-200 hover:border-purple-400 bg-purple-50"
                                          onClick={() => _renderShotSeedance(shot, idx, detailScript.global_style_prompt, setGeneratingDetailVideo, setDetailVideoProgress, setDetailVideoClips, `detail-seedance-${idx}`)}
                                          loading={shotRendering.includes(`detail-seedance-${idx}`)}>

                                          Seedance 渲染
                                        </Button>

                                        {(detailLtxClips[idx] || detailVideoClips[idx]) && (
                                          <div className="w-full mt-1 flex flex-col gap-1">
                                            <video src={detailLtxClips[idx] || detailVideoClips[idx]} controls className="w-full rounded border border-gray-200" />
                                            <a href={detailLtxClips[idx] || detailVideoClips[idx]} download={`商详视频_镜${shot.shot_number || (idx+1).toString().padStart(2,'0')}.mp4`}
                                              className="text-[10px] text-green-600 font-bold text-center hover:underline">⬇ 下载本镜</a>
                                          </div>
                                        )}
                                      </td>

                                    </tr>
                                  ))}
                                </tbody>
                      </table>
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

              <Form.Item label={<span className="font-bold text-gray-700 block">图文详情</span>} className="mb-10">
                <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
                  
                  <div className="p-3 border-b border-gray-200">
                    <div className="mb-2 flex flex-col gap-2">
                      <div className="text-sm font-medium text-gray-700">详情页参考素材 ({detailR2Images.length})</div>
                      <div className="flex gap-2 flex-wrap">
                        {detailR2Images.map((img, idx) => (
                          <div key={idx} className="relative w-[60px] h-[60px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                            <img src={img} className="w-full h-full object-cover" />
                            <div 
                              className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailR2Images(prev => prev.filter(u => u !== img));
                              }}
                              title="删除"
                            >
                              ×
                            </div>
                          </div>
                        ))}
                        <div 
                          onClick={() => openR2Modal('detail')}
                          className="w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          <CloudOutlined className="text-xl mb-1" />
                          <span className="text-[10px] font-bold">选择图片</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex gap-2 items-center">
                      {RENDER_MODELS.map(m => <Button key={m.id} size="small" onClick={() => handleGenerateDetails(m.id)} loading={generatingDetails && detailImageModel === m.id}>{m.label.split(' ')[0]}</Button>)}
                      {generatingDetails && (
                        <span className="text-[10px] text-orange-600 ml-2 flex items-center">
                          {detailRenderProgress}
                          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-1 py-0 h-auto" onClick={() => stopGeneration('detail')} title="停止生成" />
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-1">3:4 竖版详情页</span>
                    </div>
                    <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadAllDetails}>打包下载</Button>
                  </div>
                  <div className="h-[500px] overflow-y-auto p-5 bg-gray-100/50">
                    <Image.PreviewGroup>
                      <div className="grid grid-cols-5 gap-4">
                        {detailImages.map((img, i) => (
                          <div key={i} className="aspect-[3/4] bg-white border border-gray-200 rounded-xl flex items-center justify-center overflow-hidden relative cursor-pointer">
                            {img ? <Image src={img} className="w-full h-full object-cover" alt={`详情${i+1}`} style={{objectFit:'cover',width:'100%',height:'100%'}} preview={{mask: <span className="text-xs">预览</span>}} /> : <PictureOutlined className="text-xl text-gray-300" />}
                            <span className="absolute top-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded z-10 pointer-events-none">{i+1}</span>
                          </div>
                        ))}
                      </div>
                    </Image.PreviewGroup>
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
                
                <div className="mb-4 flex flex-col gap-2">
                  <div className="text-sm font-medium text-gray-700">白底图参考素材 ({refImagesWhiteBg.length})</div>
                  <div className="flex gap-2 flex-wrap">
                    {refImagesWhiteBg.map((img, idx) => (
                      <div key={idx} className="relative w-[60px] h-[60px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                        <img src={img} className="w-full h-full object-cover" />
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => setRefImagesWhiteBg(prev => prev.filter(u => u !== img))} title="删除">×</div>
                      </div>
                    ))}
                    <div onClick={() => openR2Modal('whitebg')} className="w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-gray-400 hover:text-blue-500 transition-colors">
                      <CloudOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold">选择图片</span>
                    </div>
                  </div>
                </div>

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
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('whitebg')} title="停止生成" />
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
                
                <div className="mb-4 flex flex-col gap-2">
                  <div className="text-sm font-medium text-gray-700">SKU参考素材 ({refImagesSku.length})</div>
                  <div className="flex gap-2 flex-wrap">
                    {refImagesSku.map((img, idx) => (
                      <div key={idx} className="relative w-[60px] h-[60px] border border-gray-200 rounded-lg overflow-hidden group shadow-sm">
                        <img src={img} className="w-full h-full object-cover" />
                        <div className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-md"
                          onClick={() => setRefImagesSku(prev => prev.filter(u => u !== img))} title="删除">×</div>
                      </div>
                    ))}
                    <div onClick={() => openR2Modal('sku')} className="w-[60px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 bg-white text-gray-400 hover:text-blue-500 transition-colors">
                      <CloudOutlined className="text-xl mb-1" /><span className="text-[10px] font-bold">选择图片</span>
                    </div>
                  </div>
                </div>

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
                        <Button type="text" danger size="small" icon={<CloseCircleOutlined />} className="ml-2 py-0" onClick={() => stopGeneration('sku')} title="停止生成" />
                      </span>
                    )}
                  </div>
                  
                  {skuImages.some(img => img !== '') && (
                    <Button 
                      type="primary" 
                      icon={<DownloadOutlined />} 
                      onClick={handleDownloadSkuImages} 
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
              const [currentRefImages] = getRefStateByTarget(r2ModalTarget);
              const isSelected = currentRefImages.includes(url);
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
