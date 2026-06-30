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
                
                # 缩放最大边为 2048 像素，保留更多产品细节
                img.thumbnail((2048, 2048))
                
                buffer = BytesIO()
                # 使用 JPEG 格式，92 质量压缩，保留包装/文字细节
                img.save(buffer, format="JPEG", quality=92)
                
                # 转换成 base64 字符串
                return base64.b64encode(buffer.getvalue()).decode('utf-8')
        except Exception as e:
            print(f"❌ 图片 Base64 转码及压缩失败: {e}")
        return ""

    # ── 品类关键词自动识别（与 search_skill 保持一致）────────────────────
    _PET_TAGS = {"宠物", "猫", "狗", "犬", "保健品", "营养品", "益生菌", "维生素", "鱼油", "软骨素"}
    _TEA_TAGS = {"莓茶", "藤茶", "张家界", "显齿蛇葡萄", "湘西莓茶"}

    @staticmethod
    def _resolve_category(category: str, product_name: str) -> str:
        """将 auto 解析为 pet / tea / combo / portrait，明确传入时直接使用。"""
        if category in ("pet", "tea", "combo", "portrait"):
            return category

        name = product_name.lower()
        for tag in ImageRenderEngine._PET_TAGS:
            if tag in name:
                return "pet"
        return "tea"  # 默认莓茶


    @staticmethod
    def _build_system_prompt(
        category: str, prompt: str, ar_flag: str, packaging_count: int = 1
    ) -> str:
        """按品类生成差异化 system prompt。packaging_count 为包装图数量（支持多视角）。"""
        if category == "portrait":
            # 数字人 / 宠物正脸图：纯文生图，绝不引入任何商品、包装、文字。
            # 产出结果必须适合 SadTalker / LivePortrait 口型驱动：单一主体、正脸朝相机、五官清晰。
            return (
                "ROLE: You are a professional portrait photographer AI. "
                "Generate a clean, photorealistic head-and-shoulders portrait suitable for talking-head / "
                "lip-sync animation (SadTalker / LivePortrait).\n\n"
                "=== ABSOLUTE CONSTRAINTS (NEVER violate) ===\n"
                "1. SINGLE SUBJECT ONLY: exactly one subject (a person OR an animal) centered in frame, "
                "facing the camera straight-on (frontal view), eyes looking at the camera.\n"
                "2. FACE CLARITY: the full face must be clearly visible, well-lit, sharp, with natural skin/fur "
                "detail and clear, symmetric facial features. Mouth closed, neutral or gently pleasant expression.\n"
                "3. NO PRODUCTS, NO PACKAGING, NO TEXT: the image must contain absolutely NO commercial products, "
                "NO packaging, NO bottles, NO boxes, NO bags, NO logos, NO watermarks, and NO text or characters "
                "of any kind (Chinese or English). Do NOT add any objects held by or near the subject.\n"
                "4. CLEAN BACKGROUND: plain, softly-lit, uncluttered studio-style background. "
                "Nothing should distract from the face.\n"
                "5. FRAMING: head and shoulders only, face occupying a large clear portion of the frame, "
                "not cropped, not tilted, not in profile.\n\n"
                f"=== SUBJECT DESCRIPTION ===\n{prompt}\n"
                f"Aspect ratio: {ar_flag}\n\n"
                "OUTPUT: A single high-resolution frontal portrait of one subject only, "
                "clean background, no products, no text, ready for lip-sync animation."
            )
        if category == "combo":

            # 商品组合图：把多张商品原图组合到同一张图中，保持每件商品不变形、无任何文字
            return (
                "ROLE: You are a professional e-commerce product photographer AI specializing in "
                "PRODUCT GROUP / COMBO compositions (multiple products arranged together in one image).\n\n"
                "=== ABSOLUTE CONSTRAINTS (NEVER violate) ===\n"
                "1. EVERY reference image shows a REAL product that MUST appear in the final combo image.\n"
                "   • Reproduce each product with 100% shape fidelity — identical silhouette, proportions, "
                "structure, material, and color. ZERO deformation, stretching, warping, or distortion.\n"
                "   • Keep each product's original aspect ratio and geometry. Do NOT squash, bend, melt, or merge products together.\n"
                "   • Preserve all packaging graphics, labels, logos, and surface details EXACTLY as in the reference.\n"
                "2. NO TEXT WHATSOEVER: The final image must contain absolutely NO added text, NO captions, "
                "NO watermarks, NO logos-overlays, NO price tags, NO promotional words, NO Chinese or English characters "
                "of any kind beyond the text that already physically exists printed on the products themselves. "
                "Do NOT invent or add any new typography.\n"
                "3. COMPOSITION: Arrange all the products together in a clean, natural, professional studio layout — "
                "balanced spacing, realistic shared lighting, consistent shadows and reflections, so they look like one "
                "cohesive product family photo. All products fully visible, none cropped or hidden behind another.\n"
                "4. ONLY the background/environment and arrangement are creative. Each individual product is UNCHANGED.\n\n"
                f"=== SCENE (background & arrangement guidance only) ===\n{prompt}\n"
                f"Aspect ratio: {ar_flag}\n\n"
                "OUTPUT: A single high-resolution commercial product-combo photo containing every reference product, "
                "each identical to its reference (no deformation), with a clean background and absolutely no added text."
            )
        if category == "tea":

            if packaging_count == 1:
                pkg_desc = "the image(s) labeled PACKAGING (ABSOLUTE LOCK)"
                pkg_lock = "Reference image labeled PACKAGING"
            else:
                pkg_desc = f"the {packaging_count} images labeled PACKAGING (ABSOLUTE LOCK) — each shows a different angle of the same packaging"
                pkg_lock = f"all {packaging_count} PACKAGING reference images combined"
            return (
                "ROLE: You are a professional e-commerce product photographer AI specializing in tea products.\n\n"
                "=== ABSOLUTE CONSTRAINTS (NEVER violate) ===\n"
                f"1. PACKAGING IMAGE LOCK (applies to {pkg_desc}):\n"
                "   • Reproduce the packaging with PIXEL-PERFECT fidelity on every visible face.\n"
                "   • Every Chinese character, brand name, logo, color block, seal, and graphic "
                "MUST appear EXACTLY as in the reference(s) — zero modification, zero addition, zero omission.\n"
                "   • The packaging occupies the CENTER-FOREGROUND. Do NOT shrink, tilt beyond natural perspective, or obscure it.\n\n"
                "2. SCENE ELEMENT IMAGES (images labeled SCENE ELEMENT — plant / dry tea / brewed tea):\n"
                "   • Each of these images shows a REAL element that MUST appear in the scene.\n"
                "   • Plant image → include real-looking 莓茶/藤茶 plants with faithful leaf shape and color.\n"
                "   • Dry tea leaves image → scatter/display these exact dry leaves visibly in the scene.\n"
                "   • Brewed tea image → include a glass/cup/teapot showing this exact tea color (golden-amber).\n"
                "   • Reproduce their appearance as faithfully as possible — do NOT reduce them to vague texture.\n"
                "   • Position all scene elements so they do NOT cover or obscure the packaging.\n\n"
                "3. ONLY the packaging itself is UNCHANGED. All other elements serve the scene composition.\n\n"
                f"=== SCENE (background & environment only) ===\n{prompt}\n"
                f"Aspect ratio: {ar_flag}\n\n"
                "OUTPUT: A single high-resolution commercial product photo. "
                f"The packaging must be indistinguishable from {pkg_lock}. "
                "Background uses the natural tea aesthetics from the visual mood reference images."
            )
        else:  # pet
            return (
                "ROLE: You are a professional e-commerce product photographer AI specializing in pet health products.\n\n"
                "=== ABSOLUTE CONSTRAINTS (NEVER violate) ===\n"
                "1. The reference image(s) show the EXACT product to render.\n"
                "   Reproduce with 100% shape fidelity — same silhouette, proportions, and packaging structure.\n"
                "2. Preserve ALL text, logos, colors, and packaging graphics EXACTLY as-is.\n"
                "   Do NOT add, remove, or alter any Chinese or English text on the product.\n"
                "3. The product occupies the CENTER-FOREGROUND. Do NOT shrink, crop, or obscure it.\n"
                "4. ONLY the background/environment changes. The product itself is UNCHANGED.\n\n"
                f"=== SCENE (background only) ===\n{prompt}\n"
                f"Aspect ratio: {ar_flag}\n\n"
                "OUTPUT: A single high-resolution commercial product photo. "
                "Product identical to reference — same packaging design, same shape. Only background and lighting differ."
            )

    @staticmethod
    def _build_ref_role_annotations(
        category: str, total: int, image_roles: list[str] | None = None
    ) -> list[str]:
        """
        按品类 + 前端显式角色标注生成每张参考图的文字说明。

        image_roles 与 image_urls 一一对应，可选值：
          packaging  → 包装图，文字/logo 绝对锁死
          visual_ref → 视觉参考，仅作氛围/色调

        未传或长度不足时，按品类默认规则填充：
          tea：第1张 packaging，其余 visual_ref
          pet：全部 packaging
        """
        # 商品组合图：每张参考图都是一件独立商品，需各自不变形地出现在同一张组合图中
        if category == "combo":
            return [
                (
                    f"REFERENCE IMAGE {i + 1} — PRODUCT #{i + 1} (ABSOLUTE LOCK, NO DEFORMATION): "
                    "This is one of the products that MUST appear in the final combo image. "
                    "Reproduce it with 100% shape fidelity — identical silhouette, proportions, structure, "
                    "material, and color, keeping its original aspect ratio. Do NOT stretch, warp, squash, or distort it. "
                    "Preserve all of its existing labels, logos, and surface graphics exactly. "
                    "Do NOT add any new text. Place it together with the other products in a balanced, fully-visible arrangement."
                )
                for i in range(total)
            ]

        # 先按默认规则生成完整列表，再用 image_roles 覆盖
        default_roles: list[str] = []
        for i in range(total):
            if category == "tea":
                default_roles.append("packaging" if i == 0 else "visual_ref")
            else:
                default_roles.append("packaging")


        # 用前端传入的 image_roles 覆盖（若有）
        resolved: list[str] = list(default_roles)
        if image_roles:
            for i, r in enumerate(image_roles):
                if i < total and r in ("packaging", "visual_ref"):
                    resolved[i] = r

        # 统计 packaging 图的总数（用于多视角包装图的序号说明）
        packaging_indices = [i for i, r in enumerate(resolved) if r == "packaging"]
        pkg_count = len(packaging_indices)
        pkg_seq: dict[int, int] = {idx: seq + 1 for seq, idx in enumerate(packaging_indices)}

        # 生成标注文字
        annotations: list[str] = []
        for i, role in enumerate(resolved):
            n = i + 1
            if role == "packaging":
                seq = pkg_seq[i]
                if pkg_count == 1:
                    annotations.append(
                        f"REFERENCE IMAGE {n} — PACKAGING (ABSOLUTE LOCK): "
                        "This is the product PACKAGING photo. "
                        "Reproduce EVERY character, logo, color block, seal, and graphic with 100% pixel-perfect fidelity. "
                        "No text may be altered, added, or removed. "
                        "This packaging appears CENTER-FOREGROUND in the final image."
                    )
                else:
                    view_label = (
                        "FRONT VIEW" if seq == 1 else
                        "BACK/SIDE VIEW" if seq == 2 else
                        f"VIEW {seq}"
                    )
                    annotations.append(
                        f"REFERENCE IMAGE {n} — PACKAGING {view_label} (ABSOLUTE LOCK, view {seq}/{pkg_count}): "
                        "This is another angle of the SAME product packaging. "
                        "Use ALL packaging views together to understand every face of the packaging. "
                        "Reproduce ALL characters, logos, colors, and graphics with 100% fidelity on the corresponding face. "
                        "The packaging appears CENTER-FOREGROUND. Do NOT alter any text or graphics."
                    )
            else:  # visual_ref
                if category == "tea":
                    tea_hints = [
                        (
                            "PLANT / BOTANICAL (SCENE ELEMENT — REPRODUCE FAITHFULLY)",
                            "the raw Ampelopsis grossedentata (莓茶/藤茶) plant with its distinctive serrated leaves.",
                            "You MUST include real-looking versions of this plant in the background or foreground corners of the scene. "
                            "Reproduce the leaf shape, color, and texture as faithfully as possible. "
                            "The plant enriches the scene but must NOT cover or obscure the packaging.",
                        ),
                        (
                            "DRY TEA LEAVES (SCENE ELEMENT — REPRODUCE FAITHFULLY)",
                            "the dried/compressed tea leaves (茶干) of 莓茶 — their exact color, texture, and form.",
                            "You MUST scatter or display these dry tea leaves in the foreground or around the packaging. "
                            "Reproduce their exact color, surface texture, and appearance. "
                            "They should be clearly visible and recognizable. Do NOT let them cover the packaging.",
                        ),
                        (
                            "BREWED TEA (SCENE ELEMENT — REPRODUCE FAITHFULLY)",
                            "the brewed tea liquid — its exact golden-amber / pale-yellow color and translucency.",
                            "You MUST include a glass, cup, or teapot with this exact tea color in the scene. "
                            "Reproduce the tea's color and translucency faithfully. "
                            "Position it beside or behind the packaging, not in front of it.",
                        ),
                    ]
                    # 找这是第几张 visual_ref
                    vr_idx = [j for j, r in enumerate(resolved) if r == "visual_ref"].index(i)
                    if vr_idx < len(tea_hints):
                        label, desc, instruction = tea_hints[vr_idx]
                        annotations.append(
                            f"REFERENCE IMAGE {n} — {label}: "
                            f"This shows {desc} "
                            f"{instruction}"
                        )
                    else:
                        annotations.append(
                            f"REFERENCE IMAGE {n} (SUPPLEMENTAL SCENE ELEMENT — REPRODUCE FAITHFULLY): "
                            "Include this element visibly in the scene. "
                            "Reproduce its appearance as faithfully as possible. "
                            "It must not cover the packaging."
                        )
                else:
                    annotations.append(
                        f"REFERENCE IMAGE {n} (VISUAL MOOD / SCENE REFERENCE): "
                        "Use for background environment and lighting inspiration only. "
                        "Do not change the product itself."
                    )
        return annotations

    @staticmethod
    def generate_main_image(
        prompt: str,
        image_urls: list[str] = None,
        model_name: str = "nano-banana-pro",
        previous_image_url: str = "",
        ratio: str = "1:1",
        category: str = "auto",
        product_name: str = "product",
        image_roles: list[str] = None,
    ) -> str:
        headers = {
            "Authorization": f"Bearer {RIGHT_CODE_API_KEY}",
            "Content-Type": "application/json"
        }

        # 将前端比例转换为 ar 参数
        ar_map = {"1:1": "1:1", "3:4": "3:4", "4:3": "4:3", "9:16": "9:16", "16:9": "16:9"}
        ar_flag = ar_map.get(ratio, ratio)

        # 解析品类
        resolved_cat = ImageRenderEngine._resolve_category(category, product_name)
        print(f"[ImageRenderEngine] 品类={resolved_cat}  model={model_name}  ratio={ratio}")

        # 统计包装图数量（用于 system prompt 动态描述）
        _roles_preview = image_roles or []
        if image_urls and not _roles_preview:
            # 按默认规则预估：tea 第1张包装，pet 全部包装
            _roles_preview = (
                ["packaging"] + ["visual_ref"] * (len(image_urls) - 1)
                if resolved_cat == "tea" else
                ["packaging"] * len(image_urls)
            )
        pkg_count_preview = sum(1 for r in _roles_preview if r == "packaging") or 1

        # 按品类生成 system prompt
        system_text = ImageRenderEngine._build_system_prompt(resolved_cat, prompt, ar_flag, pkg_count_preview)

        messages_content = [{"type": "text", "text": system_text}]

        # 按品类 + 前端显式 image_roles 生成每张参考图的角色标注
        if image_urls:
            role_annotations = ImageRenderEngine._build_ref_role_annotations(resolved_cat, len(image_urls), image_roles)
            for idx, url in enumerate(image_urls):
                messages_content.append({"type": "text", "text": role_annotations[idx]})
                b64_data = ImageRenderEngine._image_to_base64(url)
                if b64_data:
                    messages_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}
                    })
                else:
                    messages_content.append({"type": "image_url", "image_url": {"url": url}})

        if previous_image_url:
            prev_role = (
                "PREVIOUSLY GENERATED IMAGE (STYLE CONSISTENCY REFERENCE): "
                "This image shows the visual style from a prior generation in this session. "
                "Use it ONLY for background style and lighting consistency. "
                "Do NOT alter the product packaging — it must still match Reference Image 1 above."
            ) if resolved_cat == "tea" else (
                "PREVIOUSLY GENERATED IMAGE (STYLE REFERENCE): "
                "Use for visual style and background consistency ONLY. "
                "The product must still match the primary reference images above."
            )
            messages_content.append({"type": "text", "text": prev_role})
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
