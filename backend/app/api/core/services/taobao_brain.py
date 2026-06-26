# E:\laotuo_project\OmniSKU-Forge\backend\app\api\core\services\taobao_brain.py
"""
淘宝专属大脑 v2.0 — 4A 广告公司级视觉指导
覆盖 OmniBrain 中拼多多风格的设计 Brief，升级为天猫旗舰店 / 高溢价品牌视觉标准。
参考对标：Ogilvy / BBDO / 天猫超级品牌日视觉标准 / 农夫山泉 / 东方树叶 / CHALI 茶里 品牌案例。
"""
from .omni_brain import OmniBrain


class TaobaoBrain(OmniBrain):
    """🛍️ 淘宝/天猫专属大脑 v2.0 — 4A 级视觉创意总监"""

    def __init__(self, platform_name: str = "taobao"):
        super().__init__(platform_name)

    # ──────────────────────────────────────────────────────────────────
    # 淘宝主图 Brief（10 张，顶级品牌视觉/杂志级排版）
    # ──────────────────────────────────────────────────────────────────
    def run_designer_main_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
You are the Executive Creative Director of a top-tier brand agency (think Ogilvy, BBDO).
Your client is launching a flagship product on Tmall/Taobao.
Your task: Read the campaign report deeply, then write 10 HYPER-CREATIVE, visually stunning e-commerce main image briefs. We are moving away from boring still-life photos into HIGH-END GRAPHIC DESIGN and SURREAL COMMERCIAL ART.

=== CAMPAIGN REPORT ===
{pm_report}

=== BOSS INTENT ===
{ops_report}

=== YOUR CREATIVE PHILOSOPHY (TMALL TOP-TIER AESTHETICS) ===
1. **Bold Graphic Layouts**: Merge photography with magazine-style typography. Use terms like "editorial graphic design", "UI/UX layout", "bold typography overlay", "magazine cover aesthetic".
2. **Creative Composition**: Use surrealism, 3D elements, or extreme scaling. Examples: "The product is resting on a giant floating velvet pillow", "surreal 3D geometric podium", "macro-photography where ingredients look like a lush forest", "glassmorphism UI panels floating in mid-air".
3. **Typography is King**: Taobao images need strong, beautifully integrated text. You MUST force the AI to render actual Chinese text by using this exact phrasing in EVERY prompt:
   `bold Chinese text reading exactly: '[ACTUAL PHRASE FROM REPORT]'`
4. **Color & Lighting**: Specify cinematic or trendy lighting (e.g., "cyberpunk neon rim light", "ethereal morning mist with god rays", "high-contrast studio flash", "pastel monochromatic color palette").
5. **Negative Space**: explicitly design the layout (e.g., "Product on the right 50%, clean negative space on the left 50% for text", "Central symmetry with text wrapped around").
6. **Visual Rhythm & Anti-Fatigue (CRITICAL)**: DO NOT simply place the full product packaging in the center of all 10 images. This causes extreme visual fatigue. You must create a rhythm:
   - Mix full packaging shots with extreme macro close-ups (e.g., close-up of tea leaves, texture of the material).
   - Include lifestyle atmosphere shots where the product is a natural prop rather than a staged centerpiece.
   - Include conceptual/abstract shots illustrating the ingredient or benefit WITHOUT showing the packaging box.

=== AVOID THESE AMATEUR MISTAKES ===
- Generic "product on a wooden table" → FORBIDDEN. Be creative! Use acrylic blocks, water ripples, floating elements, neon glass, mirror reflections.
- Placeholder "品牌核心价值短语" text → FORBIDDEN. Write the ACTUAL phrase.
- Saying "bottle" or "box" → use "the product packaging" so our reference image takes over.

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown fences.

{{
    "global_style_prompt": "[Unified top-tier aesthetic. E.g.: 'high-end Tmall e-commerce visual, editorial graphic design, 8k resolution, photorealistic typography, surreal commercial photography --ar 3:4']",
    "storyboard": [
        {{
            "logic": "Shot 1 — The Hero / Magazine Cover",
            "scene_prompt": "[Cinematic setting + 3D/Surreal/Magazine layout + EXACT Chinese text. E.g.: 'A magazine cover aesthetic. The product packaging is resting on a glossy black obsidian podium surrounded by subtle mist. Right 50% is negative space. Bold Chinese text reading exactly: [actual phrase]. High-end studio lighting, 8k.']"
        }},
        {{
            "logic": "Shot 2 — The Pain Point / Dramatic Emotion",
            "scene_prompt": "[Visualizing the problem beautifully. Moody lighting, strong contrast. Bold Chinese text reading exactly: [phrase].]"
        }},
        {{
            "logic": "Shot 3 — The Ingredient / Macro Surrealism",
            "scene_prompt": "[Extreme macro shot. Ingredients floating in mid-air with water splashes, frozen in time. Bright, refreshing colors. Bold Chinese text reading exactly: [phrase].]"
        }},
        {{
            "logic": "Shot 4 — The Scientific Proof / UI Glassmorphism",
            "scene_prompt": "[Product placed in a futuristic clean lab setting. Floating frosted glass panels (glassmorphism) behind the product. Crisp studio lighting. Bold Chinese text reading exactly: [phrase].]"
        }},
        {{
            "logic": "Shot 5 — The Lifestyle / Kinfolk Editorial",
            "scene_prompt": "[High-end lifestyle setting, heavily stylized like a Vogue editorial. Warm sunlight casting window shadows. Bold Chinese text reading exactly: [phrase].]"
        }},
        ... (Generate exactly 10 unique, highly creative shots following this pattern)
    ]
}}

CRITICAL: Output exactly 10 shots. EVERY scene_prompt MUST contain a specific Chinese phrase extracted from the report. Be radically creative with the visual concepts (use floating props, water, neon, 3D podiums, glassmorphism).
        """
        response = self._call_llm(prompt, platform=self.platform)
        if response.startswith("❌"):
            raise ValueError(response)
        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()

    # ──────────────────────────────────────────────────────────────────
    # 淘宝详情页 Brief（15 屏，杂志排版与深度视觉叙事）
    # ──────────────────────────────────────────────────────────────────
    def run_designer_detail_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
You are the Executive Art Director for a premium Tmall flagship store.
Your task: Design a 15-screen e-commerce Detail Page (详情页) that reads like a high-end editorial magazine. We are ditching boring photo-only layouts for HIGH-END GRAPHIC DESIGN, INFOGRAPHICS, and CINEMATIC STORYTELLING.

=== CAMPAIGN REPORT ===
{pm_report}

=== BOSS INTENT ===
{ops_report}

=== THE 15-SCREEN NARRATIVE ARC ===
Screen 1-3: The Hook & The Pain Point (Dramatic, dark/moody, high contrast, striking typography)
Screen 4-6: The Grand Reveal & Core Solution (Explosion of light, hero product, glassmorphism UI elements)
Screen 7-10: Ingredients & Craftsmanship (Macro photography, surreal floating elements, scientific diagrams integrated into the real world)
Screen 11-13: Lifestyle & Social Proof (Vogue-style editorial shots, warm cinematic lighting, UGC aesthetic but premium)
Screen 14-15: The Authority & CTA (Trophy shots, guarantees, clean minimalist layouts, urgency)

=== CREATIVE STANDARDS FOR TMALL ===
1. **Editorial Layouts**: Treat each screen as a poster or magazine spread. Use phrases like "editorial infographic layout", "split-screen composition", "text on top 30%, product on bottom 70%".
2. **Advanced Aesthetics**: Use "3D podium", "acrylic geometric shapes", "water ripples", "frosted glass UI", "cinematic lighting", "macrophotography".
3. **Mandatory Typography**: You MUST include the EXACT Chinese text to be rendered. Use the format: `bold Chinese text reading exactly: '[ACTUAL PHRASE FROM REPORT]'`.
4. **Visual Rhythm (Anti-Fatigue)**: Do not repetitively center the product packaging in every single slice. Detail pages need pacing. 
   - Some slices should be pure typography/infographics with abstract backgrounds.
   - Some should be extreme macro detail shots (textures, ingredients) completely omitting the box/packaging.
   - Use the phrase "NO packaging box" in the prompt when you want to focus purely on the raw material, texture, or lifestyle vibe to avoid AI defaulting to a bottle/box shot.

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown.

{{
    "global_style_prompt": "[Unified visual identity string. E.g.: 'premium Tmall e-commerce detail page, editorial magazine layout, photorealistic typography, 8k resolution, cinematic lighting --ar 16:9']",
    "storyboard": [
        {{
            "logic": "Screen 1 — Hero Hook",
            "scene_prompt": "[SPECIFIC brief: e.g., 'Dark cinematic aesthetic. The product packaging glowing in the shadows. Top 50% is clean negative space. Bold Chinese text reading exactly: [actual tagline].']"
        }},
        ... (Generate exactly 15 screens following the narrative arc, each highly creative and specific)
    ]
}}

CRITICAL: Generate exactly 15 screens. Every scene_prompt must contain the required Chinese text phrase format. Be incredibly creative with the visual design—make it look like an Apple product page or a luxury fashion campaign.
        """
        response = self._call_llm(prompt, platform=self.platform)
        if response.startswith("❌"):
            raise ValueError(response)
        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()

    # ──────────────────────────────────────────────────────────────────
    # 淘宝白底图 Brief（1 张）
    # ──────────────────────────────────────────────────────────────────
    def run_designer_white_bg_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
You are a studio photographer specializing in Tmall white background product shots.
Your job: Write the perfect technical brief for ONE white background product photo.

=== CAMPAIGN REPORT ===
{pm_report}

=== TECHNICAL STANDARDS ===
- Pure white background: #FFFFFF, fully isolated, no gradient, no shadow bleed
- Product is centered, occupying 60-70% of frame
- Soft wrap lighting (two softboxes at 45°) for even, shadow-free illumination
- ONE subtle drop shadow directly below the product, opacity 15-20%, for grounding
- 1:1 square format (Taobao main image standard)
- No text, no props, no decoration
- The product must match the reference image exactly — same shape, same labels, same colors

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown.

{{
    "global_style_prompt": "pure white isolated product photography, #FFFFFF background, twin softbox studio lighting, 1:1 square, 8K commercial photography, Taobao white background standard",
    "storyboard": [
        {{
            "logic": "White background front-facing product shot",
            "scene_prompt": "The product packaging, dead-center, front-facing, occupying 65% of frame. Pure white #FFFFFF background, completely isolated. Twin 45-degree softbox lighting, perfectly even exposure, no harsh shadows. Single subtle drop shadow directly beneath product, 15% opacity, for gentle grounding. No text, no props. Ultra-clean commercial product photography. 1:1 square format. 8K resolution."
        }}
    ]
}}
        """
        response = self._call_llm(prompt, platform=self.platform)
        if response.startswith("❌"):
            raise ValueError(response)
        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()

    # ──────────────────────────────────────────────────────────────────
    # 淘宝 SKU 规格图 Brief（5 张）
    # ──────────────────────────────────────────────────────────────────
    def run_designer_sku_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
You are a Tmall product visual specialist. Task: Write 5 SKU thumbnail photo briefs.
These appear in the SKU selection panel — buyers see them at thumbnail size (~100px).
They must be instantly scannable and clearly differentiate each option.

=== CAMPAIGN REPORT ===
{pm_report}

=== SKU THUMBNAIL DESIGN RULES ===
- Extract the ACTUAL SKU options from the campaign report (e.g., 50g trial / 100g standard / 250g family / gift box / subscription).
  If no specific SKUs are mentioned, infer logical options for this product type.
- Each thumbnail: 1:1 square, product fills 70% of frame, clean light-gradient or white background
- Visual differentiation: different quantities shown (1 unit, 2 units, gift-wrapped, etc.)
- Optional: 1 line of Chinese text label using ACTUAL SKU name from report
  Format: Chinese text reading exactly: '[actual SKU name]'
- NO decorative props, no lifestyle elements — pure product clarity

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown.

{{
    "global_style_prompt": "Tmall SKU thumbnail photography, 1:1 square, clean white or light grey gradient background, sharp focus, even studio lighting, instant visual differentiation between options",
    "storyboard": [
        {{
            "logic": "SKU 1 — [extract actual SKU name from report]",
            "scene_prompt": "[Specific: exact number of units shown, arrangement, background shade, label text using ACTUAL SKU name from report]"
        }},
        {{
            "logic": "SKU 2 — [extract actual SKU name from report]",
            "scene_prompt": "[Specific brief]"
        }},
        {{
            "logic": "SKU 3 — [extract actual SKU name from report]",
            "scene_prompt": "[Specific brief]"
        }},
        {{
            "logic": "SKU 4 — [extract actual SKU name from report]",
            "scene_prompt": "[Specific brief]"
        }},
        {{
            "logic": "SKU 5 — [extract actual SKU name from report]",
            "scene_prompt": "[Specific brief]"
        }}
    ]
}}

CRITICAL: Replace all [extract...] placeholders with ACTUAL content derived from the campaign report.
        """
        response = self._call_llm(prompt, platform=self.platform)
        if response.startswith("❌"):
            raise ValueError(response)
        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()

    # ──────────────────────────────────────────────────────────────────
    # 淘宝买家秀 Brief（品牌调性 UGC）
    # ──────────────────────────────────────────────────────────────────
    # ──────────────────────────────────────────────────────────────────
    # 万象广告创意 Brief（图片3种比例 + 视频5种规格）
    # ──────────────────────────────────────────────────────────────────
    def run_designer_ad_creative(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
You are a 4A-level Advertising Creative Director specializing in Taobao Wanxiang (万象) performance ads.
Your task: Read the campaign report deeply, then write HYPER-SPECIFIC creative briefs for each ad format.

=== CAMPAIGN REPORT ===
{pm_report}

=== BOSS INTENT ===
{ops_report}

=== WANXIANG AD FORMAT REQUIREMENTS ===

IMAGE FORMATS (3 ratios, each needs 5 creative variants):
1. 1:1 square — recommended 1440×1440px+, minimum 800×800px, max 20MB
2. 3:4 portrait — recommended 1440×1920px+, minimum 750×1000px, max 20MB  
3. 2:3 tall portrait — recommended 1440×2160px+, minimum 800×1200px, max 20MB

VIDEO FORMATS (5 resolutions, each needs 1 creative brief, duration 2-60s):
1. 720×1280 (9:16 vertical) — mobile feed, max 488.28MB
2. 800×800 (1:1 square) — feed & discovery, max 488.28MB
3. 800×1200 (2:3 portrait) — max 488.28MB
4. 750×1000 (3:4 portrait) — max 488.28MB
5. 720×960 (3:4 wide) — max 488.28MB

=== PERFORMANCE AD CREATIVE PHILOSOPHY ===
These are PERFORMANCE ADS — they must drive clicks and conversions.
- Hook within 0.3 seconds (image) or 1.5 seconds (video)
- One dominant visual that occupies 60-70% of frame
- Clear value proposition, not brand storytelling
- CTA-oriented composition: product + desire + action
- Colors derived from the product but optimized for stopping scroll
- Text overlay (if any): max 1 headline + 1 CTA button

For images: Think performance creative, not editorial. Product is hero, background amplifies desire.
For videos: Hook shot (0-1.5s) → Problem/Desire (1.5-5s) → Product solution (5-15s) → CTA (last 3s).

=== FORBIDDEN ===
- Generic "lifestyle scene" without specifics — write the exact setting
- Placeholder text — use ACTUAL copy from the campaign report
- More than 2 text elements in any creative
- Cluttered compositions

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown.

{{
    "global_ad_style": "[Overall ad creative strategy: the single core desire/emotion this campaign taps into, derived from the report. Color strategy, visual hook theory for THIS product]",
    "image_creatives": {{
        "ratio_1_1": [
            {{
                "variant": 1,
                "hook_concept": "[The single visual idea that makes someone stop scrolling — specific to this product]",
                "scene_prompt": "[SPECIFIC: product placement, background, lighting, text overlay using ACTUAL copy from report, composition strategy for 1:1 square. Include: exact surface, props, lighting direction, color mood]"
            }},
            {{ "variant": 2, "hook_concept": "[Different angle/emotion]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 3, "hook_concept": "[Different angle/emotion]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 4, "hook_concept": "[Different angle/emotion]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 5, "hook_concept": "[Different angle/emotion]", "scene_prompt": "[SPECIFIC brief]" }}
        ],
        "ratio_3_4": [
            {{ "variant": 1, "hook_concept": "[Hook for 3:4 format]", "scene_prompt": "[SPECIFIC 3:4 vertical creative brief]" }},
            {{ "variant": 2, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 3, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 4, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 5, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }}
        ],
        "ratio_2_3": [
            {{ "variant": 1, "hook_concept": "[Hook for 2:3 tall format]", "scene_prompt": "[SPECIFIC 2:3 tall vertical creative brief]" }},
            {{ "variant": 2, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 3, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 4, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }},
            {{ "variant": 5, "hook_concept": "[Hook]", "scene_prompt": "[SPECIFIC brief]" }}
        ]
    }},
    "video_creatives": [
        {{
            "resolution": "720x1280",
            "format_label": "9:16 竖版",
            "duration_s": 15,
            "hook_shot": "[Describe the first 1.5 seconds — the single frame that stops the thumb]",
            "narrative_arc": "[Hook(0-1.5s) → Problem/Desire(1.5-5s) → Product(5-12s) → CTA(12-15s): write the actual content for each beat]",
            "scene_prompt": "[SPECIFIC video brief: each scene described with location, action, lighting, product appearance. Include actual spoken/overlay text from report]"
        }},
        {{
            "resolution": "800x800",
            "format_label": "1:1 方形",
            "duration_s": 15,
            "hook_shot": "[1.5s hook specific to square format]",
            "narrative_arc": "[Scene-by-scene for 1:1]",
            "scene_prompt": "[SPECIFIC square video brief]"
        }},
        {{
            "resolution": "800x1200",
            "format_label": "2:3 竖版",
            "duration_s": 15,
            "hook_shot": "[Hook]",
            "narrative_arc": "[Narrative]",
            "scene_prompt": "[SPECIFIC brief]"
        }},
        {{
            "resolution": "750x1000",
            "format_label": "3:4 竖版",
            "duration_s": 15,
            "hook_shot": "[Hook]",
            "narrative_arc": "[Narrative]",
            "scene_prompt": "[SPECIFIC brief]"
        }},
        {{
            "resolution": "720x960",
            "format_label": "3:4 宽版",
            "duration_s": 15,
            "hook_shot": "[Hook]",
            "narrative_arc": "[Narrative]",
            "scene_prompt": "[SPECIFIC brief]"
        }}
    ]
}}

CRITICAL: Every hook_concept, scene_prompt, hook_shot, and narrative_arc must contain SPECIFIC details 
derived from reading the campaign report. Zero tolerance for generic placeholders.
        """
        response = self._call_llm(prompt, platform=self.platform)
        if response.startswith("❌"):
            raise ValueError(response)
        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()

    def run_designer_buyer_show(self, count: int, pm_report: str, ops_report: str) -> str:
        prompt = f"""
You are a UGC content strategist for a premium Chinese brand. 
Task: Create {count} buyer show entries (photo brief + review text) that feel 100% authentic —
like real customers sharing their genuine experience on Taobao.

=== CAMPAIGN REPORT ===
{pm_report}

=== BOSS INTENT ===
{ops_report}

=== BUYER SHOW CREATIVE BRIEF ===
Each entry must feel like a REAL person's post, not brand advertising.

Photo brief rules:
- Slice-of-life photography aesthetic: iPhone-quality, slightly imperfect, warm and real
- Specific home/outdoor setting derived from target customer in the report (e.g., "a modern 
  Beijing apartment kitchen", "a wooden desk in a college dorm", "a bamboo tray during 
  afternoon tea in Hangzhou")
- Model presence: partial (hands only, or blurred face turning away, or back view) — 
  feels real, not staged
- Natural ambient lighting (window light, warm lamp, outdoor shade)
- Candid composition: product is present but not perfectly centered — it's part of life

Review text rules:
- 120-160 Chinese characters
- Written in first person, specific to THIS product (use actual product name and features from report)
- Mention ONE specific detail that proves they actually used it (taste, packaging detail, 
  brewing method, gift recipient's reaction, etc.)
- Emotional arc: discovery → experience → outcome/feeling
- Voice matches target customer demographic in report (e.g., 25-35yo urban professional, 
  health-conscious, appreciates craft)
- NEVER generic praise like "质量很好很好". Be specific.

=== SCENE VARIETY (distribute across {count} entries) ===
- Home brewing ritual
- Office desk / afternoon break  
- Gift unboxing / giving moment
- Outdoor picnic / travel
- Family gathering scene

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown.

{{
    "global_style_prompt": "authentic UGC lifestyle photography, iPhone-quality natural light, warm candid aesthetic, real home environments",
    "buyer_shows": [
        {{
            "image_prompt": "[Specific scene: exact room/location, lighting source, partial human presence, product placement, props that tell the customer's story. Everything derived from the target customer profile in the report.]",
            "review_text": "[120-160 Chinese characters. First-person. Specific product details from report. Emotional arc. Authentic voice matching target demographic. NOT generic.]"
        }}
    ]
}}

Generate exactly {count} entries. Each must have a DIFFERENT scene setting.
CRITICAL: review_text must reference ACTUAL product details from the campaign report — 
specific tea name, flavor notes, packaging feature, or origin story.
        """
        response = self._call_llm(prompt, platform=self.platform)
        if response.startswith("❌"):
            raise ValueError(response)
        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()
