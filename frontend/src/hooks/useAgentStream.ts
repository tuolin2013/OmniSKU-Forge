// frontend/src/hooks/useAgentStream.ts
/**
 * 流式策划案生成 Hook。
 * 封装 SSE 读流、超时中止、状态管理，组件只需传参数和回调。
 *
 * Usage:
 *   const { stream, abort, streaming } = useAgentStream({
 *     onChunk: (text) => setReport(prev => prev + text),
 *     onDone:  ()     => message.success('完成'),
 *     onError: (err)  => message.error(err),
 *     timeout: 180_000,
 *   });
 *
 *   // 触发生成
 *   stream({ platform, sku_name, text_desc, image_urls, model });
 */

import { useCallback, useRef, useState } from "react";
import { agentsApi, type PmAnalyzeParams } from "@/services/api";

interface UseAgentStreamOptions {
  /** 每次收到 chunk 时的回调 */
  onChunk: (chunk: string) => void;
  /** 流正常结束时的回调 */
  onDone?: () => void;
  /** 发生错误或超时时的回调，参数为错误信息字符串 */
  onError?: (message: string) => void;
  /** 超时毫秒数，默认 180 秒 */
  timeout?: number;
}

interface UseAgentStreamReturn {
  /** 启动流式生成 */
  stream: (params: PmAnalyzeParams) => Promise<void>;
  /** 手动中止当前流 */
  abort: () => void;
  /** 是否正在流式输出 */
  streaming: boolean;
}

export function useAgentStream(
  options: UseAgentStreamOptions
): UseAgentStreamReturn {
  const { onChunk, onDone, onError, timeout = 180_000 } = options;

  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStreaming(false);
  }, []);

  const stream = useCallback(
    async (params: PmAnalyzeParams) => {
      // 如果有旧的流，先中止
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setStreaming(true);

      // 超时自动中止
      timeoutRef.current = setTimeout(() => {
        ctrl.abort();
        onError?.(`策划案生成超时（超过 ${timeout / 1000} 秒），请检查网络后重试`);
        setStreaming(false);
      }, timeout);

      try {
        const res = await agentsApi.pmAnalyzeStream(params, ctrl.signal);
        const reader = res.body?.getReader();
        if (!reader) throw new Error("服务器未返回流式响应");

        const decoder = new TextDecoder("utf-8");
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          onChunk(decoder.decode(value, { stream: true }));
        }

        onDone?.();
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") {
          // 手动中止或超时，不再重复调用 onError（超时已在上面处理）
          return;
        }
        onError?.((err as Error).message ?? "未知错误");
      } finally {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setStreaming(false);
      }
    },
    [onChunk, onDone, onError, timeout]
  );

  return { stream, abort, streaming };
}
