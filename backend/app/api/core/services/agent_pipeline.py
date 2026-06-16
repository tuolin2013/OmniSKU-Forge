# E:\laotuo_project\OmniSKU-Forge\backend\app\api\core\services\agent_pipeline.py
# Version: 6.0 | Feature: Multi-Agent Async Pipeline & Typography Compositor

import os
import re
import json
import time
import requests
import base64
import asyncio

from .base_brain import BaseBrain, RIGHT_CODE_API_KEY
from .omni_brain import OmniBrain
from .taobao_brain import TaobaoBrain
from .knowledge_base import product_db
from .image_compositor import ImageCompositor

DRAW_CHAT_URL = "https://www.right.codes/draw/v1/chat/completions"

# ==========================================
# 🏭 大脑工厂 (Brain Factory) - 自动分配中枢
# ==========================================
def get_brain(platform: str) -> BaseBrain:
    platform = platform.lower()
    if platform == "taobao":
        # 补上 platform_name 参数
        return TaobaoBrain(platform_name="taobao")
    # 未来如果有 jd, 就在这里加 if platform == "jd": return JdBrain(platform_name="jd")
    
    # 补上 platform_name 参数
    return OmniBrain(platform_name="pinduoduo")
# ==========================================
# 🎨 渲染引擎 (保持纯粹的生图能力，不管哪个平台)
# ==========================================
class ImageRenderEngine:
    @staticmethod
    def _image_to_base64(image_url: str) -> str:
        try:
            from io import BytesIO
            from PIL import Image
            
            # 直接在后端把图片下载到内存
            response = requests.get(image_url, timeout=10)
            if response.status_code == 200:
                # 压缩图片，极大降低 Base64 体积，防超时
                img = Image.open(BytesIO(response.content))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                
                # 缩放最大边为 1024 像素
                img.thumbnail((1024, 1024))
                
                buffer = BytesIO()
                # 使用 JPEG 格式，75 质量压缩
                img.save(buffer, format="JPEG", quality=75)
                
                # 转换成 base64 字符串
                return base64.b64encode(buffer.getvalue()).decode('utf-8')
        except Exception as e:
            print(f"❌ 图片 Base64 转码及压缩失败: {e}")
        return ""

    @staticmethod
    def generate_main_image(prompt: str, image_urls: list[str] = None, model_name: str = "nano-banana-pro", previous_image_url: str = "") -> str:
        headers = {
            "Authorization": f"Bearer {RIGHT_CODE_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 极简指令 + 满垫图权重 (死磕 API 极限配置)
        system_text = f"CRITICAL: You are an elite AI renderer. You MUST use the attached reference images as the exact product. 100% pixel-perfect replica of the box, text, and logo. DO NOT alter the Chinese text. ONLY draw the requested background.\n\nBackground: {prompt} --ar 3:4 --iw 3 --v 6.0 --style raw"

        # 👑 【Base64 强攻版】
        messages_content = [{"type": "text", "text": system_text}]
        
        if image_urls:
            for url in image_urls:
                b64_data = ImageRenderEngine._image_to_base64(url)
                if b64_data:
                    # 按照 OpenAI 的标准 Base64 格式注入
                    messages_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}
                    })
                else:
                    messages_content.append({"type": "image_url", "image_url": {"url": url}})
        if previous_image_url:
            b64_data = ImageRenderEngine._image_to_base64(previous_image_url)
            if b64_data:
                messages_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}
                })
            else:
                messages_content.append({"type": "image_url", "image_url": {"url": previous_image_url}})

        payload = {
            "model": model_name, 
            "messages": [{"role": "user", "content": messages_content}], 
            "stream": True
        }

        print(f"📡 [流式引擎启动] 正在呼叫引擎【{model_name}】...")
        # 👑 调整超时为 300秒，因为高清生图确实慢，并加入心跳监控
        max_retries = 2
        for attempt in range(max_retries):
            full_text_response = ""
            print(f"⌛ [第 {attempt + 1} 次尝试] 正在与引擎建立连接...")
            try:
                # 调整 timeout 到 300，给高清模型预留呼吸空间
                response = requests.post(DRAW_CHAT_URL, json=payload, headers=headers, stream=True, timeout=300, proxies={"http": None, "https": None})
                if response.status_code != 200:
                    if response.status_code in [524, 502, 504]:
                        time.sleep(2)
                        continue
                    raise Exception(f"画图节点拒绝请求: HTTP {response.status_code} - {response.text}")
                
                # 💓【核心心跳】：如果你不打印内容，说明模型在后台做高强度推理，不是死机了
                print("💓 [引擎心跳] 正在进行深度推理，请耐心等待...")

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8').strip()
                        if decoded_line.startswith("data: "):
                            content = decoded_line[6:]
                            if content == "[DONE]": break
                            try:
                                chunk_json = json.loads(content)
                                delta = chunk_json['choices'][0]['delta']
                                if 'content' in delta:
                                    char = delta['content']
                                    full_text_response += char
                            except: pass
                url_match = re.search(r'(https?://[^\s"\'`<>!\[\]\(\)]+)', full_text_response)
                if url_match:
                    return url_match.group(1)
                else:
                    raise Exception("未解析到图像 URL")
            except requests.exceptions.Timeout:
                time.sleep(2)
                continue
            except Exception as e:
                if attempt < max_retries - 1 and "524" in str(e):
                    time.sleep(2)
                    continue
                raise e
        raise Exception(f"渲染失败。")


# ==========================================
# 🚀 工业级流水线总管 (Pipeline Engine) - 异步并发中枢
# ==========================================
class PipelineEngine:
    
    @staticmethod
    async def run_one_click_generation(platform: str, sku_name: str, boss_words: str, image_urls: list[str], font_path: str = "C:/Windows/Fonts/msyh.ttc"):
        """
        一键出图核心工作流：调度 3 大特工大脑 + 渲染引擎 + 物理排版车间
        """
        print(f"\n🚀 [总管调度] 启动【{platform}】一键产线，目标SKU: {sku_name}")
        
        # 0. 调配大脑与知识库
        brain = get_brain(platform)
        try:
            sku_info = product_db.get_sku_info(sku_name)
            if not sku_info:
                raise ValueError("未找到商品档案")
        except Exception:
            # 兼容：如果 Excel 数据没准备好，强行构造兜底档案防崩溃
            print("⚠️ 未从内存获取到 Excel 档案，启动降级模式兜底...")
            sku_info = {"sku_name": sku_name, "product_type": "宠物营养补充剂", "target_pain_points": "宠物不适，主人心疼"}

        # ==========================================
        # 🟢 阶段一：策略智能体定策略 (需优先串行，为后续定调)
        # ==========================================
        # to_thread 将同步请求放入线程池，释放 FastAPI 事件循环
        strategy_context = await asyncio.to_thread(brain.generate_strategy, sku_info, boss_words)
        print("✅ [流程 1/4] [策略智能体] 策略纲领生成完毕")
        
        # ==========================================
        # ⚡ 阶段二：文案智能体 / 视觉智能体并发作业 (极限压榨时间)
        # ==========================================
        copy_task = asyncio.to_thread(brain.generate_copywriting, strategy_context)
        visual_task = asyncio.to_thread(brain.generate_visual_prompt, strategy_context)
        
        # gather 启动并发，文案和分镜参数同时思考
        copy_json, visual_json = await asyncio.gather(copy_task, visual_task)
        print(f"✅ [流程 2/4] [文案智能体] 产出文案: {copy_json}")
        print(f"✅ [流程 2/4] [视觉智能体] 产出视觉: 留白在 {visual_json.get('layout_direction', 'right')}")
        
        # ==========================================
        # 🎨 阶段三：底层引擎生图 (调用你的强攻版代码)
        # ==========================================
        # 可以切换为你测好的默认大模型，例如 gpt-image-2 或 nano-banana-pro
        model_name = "gpt-image-2" 
        prompt = visual_json.get("scene_prompt", "a clean commercial product shot, minimalist --ar 3:4")
        
        pure_image_url = await asyncio.to_thread(
            ImageRenderEngine.generate_main_image,
            prompt=prompt,
            image_urls=image_urls,
            model_name=model_name
        )
        print(f"✅ [流程 3/4] 底层引擎：无字大图已就绪 -> {pure_image_url[:50]}...")

        # 中继站：将生成的高清纯净大图拉回本地，喂给合成车间
        print("⏳ 正在拉取高清大图至本地内存...")
        response = await asyncio.to_thread(requests.get, pure_image_url, timeout=60)
        temp_bg_path = f"temp_pure_bg_{int(time.time())}.jpg"
        with open(temp_bg_path, "wb") as f:
            f.write(response.content)

        # ==========================================
        # 🖨️ 阶段四：物理排版车间强行印字 (CPU级极速防乱码)
        # ==========================================
        output_path = f"final_ad_output_{int(time.time())}.jpg"
        layout_dir = visual_json.get("layout_direction", "right")
        
        final_image_path = await asyncio.to_thread(
            ImageCompositor.render_final_ad,
            pure_image_path=temp_bg_path,
            copy_json=copy_json,
            layout_direction=layout_dir,
            font_path=font_path,
            output_path=output_path
        )

        # 🛡️ 阶段五：注入物理级防机审护盾 (洗除 C2PA 与频域特征)
        from .image_shield import AntiReviewShield
        final_image_path = await asyncio.to_thread(
            AntiReviewShield.apply_shield,
            image_path=final_image_path
        )
        
        # 打扫战场：删除用于垫底的无字底图缓存，只保留最终带字成品
        if os.path.exists(temp_bg_path):
            os.remove(temp_bg_path)
            
        print(f"🎉 [流程 4/4] 组装彻底完成！防机审护盾已应用，一人公司专属海报已出炉：{final_image_path}")
        return final_image_path
