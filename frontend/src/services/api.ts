// frontend/src/services/api.ts
/**
 * 统一 API 调用层。
 * 所有后端接口调用集中在此文件，组件层不直接使用 fetch/axios。
 * 修改后端地址只需改 BASE_URL 一处。
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

// ------------------------------------------------------------------ //
// 通用 fetch 包装
// ------------------------------------------------------------------ //

async function post<T = unknown>(
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ------------------------------------------------------------------ //
// 类型定义
// ------------------------------------------------------------------ //

export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data: T | null;
}

export interface MediaItem {
  url: string;
  key: string;
  size: number;
  last_modified: string;
}

export interface GalleryResponse {
  urls: string[];
  media: MediaItem[];
  has_more: boolean;
}

export interface GeneratedImageData {
  url: string;
}

// ------------------------------------------------------------------ //
// 知识库 / 目录树
// ------------------------------------------------------------------ //

export const catalogApi = {
  getTree: () => get<ApiResponse>("/api/catalog/tree"),
};

// ------------------------------------------------------------------ //
// AI 智能体
// ------------------------------------------------------------------ //

export interface PmAnalyzeParams {
  platform: string;
  sku_name: string;
  text_desc: string;
  image_urls: string[];
  model?: string;
}

export interface OpsParams {
  platform: string;
  sku_name: string;
  pm_report: string;
  model?: string;
}

export interface DesignParams {
  platform: string;
  pm_report: string;
  ops_report: string;
  count?: number;
  image_urls?: string[];
}

export interface ImageGenParams {
  prompt: string;
  image_urls: string[];
  model: string;
  previous_image_url?: string;
  platform?: string;
  product_name?: string;
  image_type?: string;
}

export const agentsApi = {
  /**
   * 策划案流式生成，返回 Response 对象供调用方读取流。
   * 使用 AbortController 实现 180s 超时或手动取消。
   */
  pmAnalyzeStream: async (
    params: PmAnalyzeParams,
    signal: AbortSignal
  ): Promise<Response> => {
    const res = await fetch(`${BASE_URL}/api/v1/agents/pm-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ""}`);
    }
    return res;
  },

  opsTitle: (params: OpsParams) =>
    post<ApiResponse<string>>("/api/v1/agents/ops-title", params),

  designMainImage: (params: DesignParams) =>
    post<ApiResponse<string>>("/api/v1/agents/design-main-image-brief", params),

  designDetailImage: (params: DesignParams) =>
    post<ApiResponse<string>>("/api/v1/agents/design-detail-image-brief", params),

  designWhiteBgImage: (params: DesignParams) =>
    post<ApiResponse<string>>("/api/v1/agents/design-white-bg-image-brief", params),

  designSkuImage: (params: DesignParams) =>
    post<ApiResponse<string>>("/api/v1/agents/design-sku-image-brief", params),

  designBuyerShow: (params: DesignParams) =>
    post<ApiResponse<string>>("/api/v1/agents/design-buyer-show", params),

  generateImage: (params: ImageGenParams, signal?: AbortSignal) =>
    post<ApiResponse<GeneratedImageData>>(
      "/api/v1/agents/generate-image",
      params,
      signal
    ),

  generateOneClick: (params: {
    platform: string;
    sku_name: string;
    text_desc: string;
    image_urls: string[];
  }) => post<ApiResponse<GeneratedImageData>>("/api/v1/agents/generate-one-click", params),
};

// ------------------------------------------------------------------ //
// R2 图库管理
// ------------------------------------------------------------------ //

export const r2Api = {
  listImages: (page = 1, limit = 20) =>
    get<ApiResponse<GalleryResponse>>(`/api/v1/r2/images?page=${page}&limit=${limit}`),

  uploadImage: async (file: File): Promise<ApiResponse<GeneratedImageData>> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE_URL}/api/v1/r2/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  deleteImage: (file_key: string) =>
    post<ApiResponse<null>>("/api/v1/r2/delete", { file_key }),

  batchDelete: (file_keys: string[]) =>
    post<ApiResponse<null>>("/api/v1/r2/batch-delete", { file_keys }),

  renameImage: (file_key: string, new_name: string) =>
    post<ApiResponse<{ new_url: string; new_key: string }>>(
      "/api/v1/r2/rename",
      { file_key, new_name }
    ),

  proxyDownloadUrl: (url: string) =>
    `${BASE_URL}/api/v1/proxy/download?url=${encodeURIComponent(url)}`,
};

// ------------------------------------------------------------------ //
// 视频
// ------------------------------------------------------------------ //

export const videoApi = {
  designScript: (params: {
    pm_report: string;
    ops_report: string;
    platform: string;
  }) => post<ApiResponse<string>>("/api/v1/video/design-script", params),

  generate: (params: {
    prompt: string;
    type?: string;
    /** 产品参考图，传入时启用图生视频模式，保持产品外观一致 */
    image_urls?: string[];
  }, signal?: AbortSignal) =>
    post<{ url?: string }>("/api/v1/video/generate", params, signal),
};
