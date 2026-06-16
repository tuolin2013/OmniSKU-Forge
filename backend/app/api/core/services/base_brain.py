# E:\laotuo_project\OmniSKU-Forge\backend\app\api\core\services\base_brain.py
import os
import requests
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------
# API 配置 — 所有密钥必须通过环境变量注入，严禁硬编码
# 参考 .env.example 文件配置本地开发环境
# ---------------------------------------------------------
RIGHT_CODE_API_KEY = os.environ.get("RIGHT_CODE_API_KEY", "")
if not RIGHT_CODE_API_KEY:
    import warnings
    warnings.warn(
        "环境变量 RIGHT_CODE_API_KEY 未设置，AI 调用将失败。"
        "请复制 .env.example 为 .env 并填入密钥。",
        RuntimeWarning,
        stacklevel=1,
    )

GEMINI_BASE_URL = os.environ.get("GEMINI_BASE_URL", "https://right.codes/gemini/v1")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-pro-preview")

gemini_client = OpenAI(
    api_key=RIGHT_CODE_API_KEY or "placeholder",
    base_url=GEMINI_BASE_URL,
    default_headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0"
    }
)

CODEX_BASE_URL = os.environ.get("CODEX_BASE_URL", "https://right.codes/codex/v1")
CODEX_MODEL = os.environ.get("CODEX_MODEL", "gpt-5.5")

class BaseBrain:
    """🧠 基础大脑基类：提供底层大模型调用和通用公共方法"""
    
    def __init__(self, platform_name: str):
        self.platform = platform_name

    def _call_codex_with_fallback(self, prompt: str, temperature: float = 0.8) -> str:
        headers = {
            "Authorization": f"Bearer {RIGHT_CODE_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": CODEX_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature
        }
        try:
            response = requests.post(f"{CODEX_BASE_URL}/chat/completions", json=payload, headers=headers, timeout=60, proxies={"http": None, "https": None})
            if response.status_code != 200:
                raise Exception(f"HTTP {response.status_code}: {response.text}")
            return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"\n⚠️ Codex 异常 ({str(e)})，切回 Gemini 引擎...")
            fallback_resp = gemini_client.chat.completions.create(
                model=GEMINI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature
            )
            return fallback_resp.choices[0].message.content

    # PM 大脑属于全平台通用逻辑，因此留在基类
    def run_pm_agent_stream(self, text_desc: str, image_urls: list[str]):
        print(f"[{self.platform.upper()}] 🧠 1号大脑(PM) 正在多视角联合分析...")
        prompt = """你是一位拥有10年经验的顶尖电商产品经理。
请结合【多张产品实拍图】和【基础说明】，进行深度剖析。提取 FABE、长尾词、马斯洛心理，并极其详细地提取【视觉基因锁】。"""
        
        content_array = [{"type": "text", "text": prompt + f"\n\n基础说明:\n{text_desc}"}]
        if image_urls:
            for url in image_urls:
                content_array.append({"type": "image_url", "image_url": {"url": url}})
                
        messages = [{"role": "user", "content": content_array}]
        try:
            yield "DEBUG: starting stream...\n"
            response = gemini_client.chat.completions.create(model=GEMINI_MODEL, messages=messages, temperature=0.7, stream=True)
            for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"\n\n🚨 【系统异常】：{str(e)}"

    def run_ops_agent(self, pm_report: str) -> str:
        raise NotImplementedError("子类必须实现此方法")

    def run_designer_main_image(self, pm_report: str, ops_report: str) -> str:
        raise NotImplementedError("子类必须实现此方法")