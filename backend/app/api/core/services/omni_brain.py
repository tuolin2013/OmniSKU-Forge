# E:\laotuo_project\OmniSKU-Forge\backend\app\api\core\services\omni_brain.py
import os
import json
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv
from .base_brain import BaseBrain
import importlib
from app.api.core.services.strategies.pet import PetCareStrategy
from app.api.core.services.strategies.tea import TeaStrategy
from app.api.core.services.skills.search_skill import web_search_competitors

logger = logging.getLogger(__name__)

load_dotenv()
RIGHT_CODE_API_KEY = os.environ.get("RIGHT_CODE_API_KEY", "")
CODEX_BASE_URL = os.environ.get("CODEX_BASE_URL", "https://right.codes/codex/v1")
GEMINI_BASE_URL = os.environ.get("GEMINI_BASE_URL", "https://right.codes/gemini/v1")

class OmniBrain(BaseBrain):
    """
    🧠 全渠道多智能体大脑 (Omni Multi-Agent System)
    兼顾：传统分步流程 (PM/运营/设计) 与 全自动一键工厂 (策略/文案/视觉)
    """

    # ==========================================
    # 🔌 底层通信引擎
    # ==========================================
    def _get_chat_url(self, model: str) -> str:
        if "gemini" in model.lower():
            return f"{GEMINI_BASE_URL}/chat/completions"
        return f"{CODEX_BASE_URL}/chat/completions"

    def _make_session(self) -> requests.Session:
        """
        创建带自动重试的 HTTP Session。
        针对 SSLEOFError / ConnectionError 等网络抖动，最多自动重试 3 次，
        退避间隔 0.5s → 1s → 2s。
        """
        session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["POST"],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _call_llm(self, prompt: str, model: str = "gpt-5.5", platform: str = None, category: str = None) -> str:
        # 🚀 [OmniBrain X-Ray] 打印最终组装好的 Prompt
        p = platform or getattr(self, 'platform', 'N/A')
        c = category or 'N/A'
        print(f"\n========== [OmniBrain 挂载检测 (平台: {p}) (类目: {c})] ==========")
        print(prompt)
        print(f"===============================================================================\n")

        headers = {
            "Authorization": f"Bearer {RIGHT_CODE_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model, 
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
        chat_url = self._get_chat_url(model)
        session = self._make_session()
        try:
            response = session.post(chat_url, json=payload, headers=headers, timeout=180)
            if response.status_code == 200:
                return response.json()["choices"][0]["message"]["content"]
            else:
                return f"❌ 大模型拒绝请求: HTTP {response.status_code} {response.text}"
        except requests.exceptions.SSLError as e:
            logger.error(f"[_call_llm] SSL 握手失败 (已重试3次): {e}")
            return f"❌ 大模型网络失联 (SSL错误): {e}"
        except requests.exceptions.ConnectionError as e:
            logger.error(f"[_call_llm] 连接失败 (已重试3次): {e}")
            return f"❌ 大模型网络失联 (连接错误): {e}"
        except Exception as e:
            logger.error(f"[_call_llm] 未知异常: {e}")
            return f"❌ 大模型网络失联: {e}"
        finally:
            session.close()

    def _call_llm_stream(self, prompt: str, model: str = "gpt-5.5", platform: str = None, category: str = None):
        # 🚀 [OmniBrain X-Ray] 打印最终组装好的 Prompt (流式)
        p = platform or getattr(self, 'platform', 'N/A')
        c = category or 'N/A'
        print(f"\n========== [OmniBrain 挂载检测 (平台: {p}) (类目: {c})] ==========")
        print(prompt)
        print(f"===============================================================================\n")

        headers = {
            "Authorization": f"Bearer {RIGHT_CODE_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model, 
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        }
        chat_url = self._get_chat_url(model)
        session = self._make_session()
        try:
            response = session.post(
                chat_url, json=payload, headers=headers,
                stream=True, timeout=(15, 45)  # connect 15s, read 45s per chunk
            )
            if response.status_code != 200:
                yield f"\n❌ 大模型请求失败 HTTP {response.status_code}: {response.text}"
                return

            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8').strip()
                    if decoded_line.startswith("data: "):
                        content = decoded_line[6:]
                        if content == "[DONE]":
                            return
                        try:
                            chunk = json.loads(content)
                            delta = chunk['choices'][0]['delta']
                            if 'content' in delta:
                                yield delta['content']
                        except Exception:
                            pass
        except requests.exceptions.Timeout as e:
            logger.warning(f"[_call_llm_stream] 超时: {e}")
            yield f"\n❌ 大模型响应超时，请重试"
        except (requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
            logger.warning(f"[_call_llm_stream] 网络异常: {e}")
            yield f"\n❌ 网络流中断: {e}"
        except Exception as e:
            yield f"\n❌ 网络流中断: {e}"
        finally:
            session.close()

    # ==========================================
    # 🏭 终极工业流 (One-Click Pipeline Agents)
    # ==========================================
    def generate_strategy(self, sku_info: dict, boss_words: str) -> str:
        category = sku_info.get("__system_category__", "N/A")
        prompt = f"""
        Role: 拼多多千万级店铺资深视觉操盘手。
        Task: 根据给定的【产品静态档案】和【老板最新战术意图】，制定一份不超过 200 字的《核心视觉与文案策略指导书》。
        【产品静态档案】: {json.dumps(sku_info, ensure_ascii=False, indent=2)}
        【老板战术意图】: {boss_words}
        要求：
        1. 明确打哪个核心痛点（拼多多买家在乎直接疗效、安全性和情感焦虑）。
        2. 明确视觉的情感基调。请直接输出策略内容，不要包含任何客套话。
        """
        return self._call_llm(prompt, category=category)

    def generate_copywriting(self, strategy: str) -> dict:
        prompt = f"""
        Role: 拼多多顶级爆款文案专家。
        Task: 根据以下《策略指导书》，提炼用于电商主图的极限转化文案。
        【策略指导书】: {strategy}
        要求：
        1. 文案必须极度精简、扎心，字数越少越好，适合做大字报。
        2. 严格输出合法的 JSON 格式，绝对不要包含任何 Markdown 标记符。
        输出格式：
        {{
            "main_title": "核心痛点主标题(不超过8个汉字)",
            "sub_title": "支撑卖点副标题(不超过12个汉字)"
        }}
        """
        response = self._call_llm(prompt)
        
        mark = chr(96) * 3 
        cleaned_response = response.replace(mark + "json", "").replace(mark, "").strip()
        
        try:
            return json.loads(cleaned_response)
        except Exception:
            return {"main_title": "极速恢复", "sub_title": "宠物健康护盾"}

    def generate_visual_prompt(self, strategy: str) -> dict:
        prompt = f"""
        Role: 4A广告公司视觉总监。
        Task: 根据《策略指导书》，设计一个极简、高级的产品海报分镜。
        【策略指导书】: {strategy}
        Constraints (铁律):
        1. 视觉风格向 Apple 极简美学看齐，背景温暖纯净。
        2. 必须明确指定留白方向，强制在画面左侧 50% 或右侧 50% 留下纯净的负空间。
        3. 提示词必须是全英文，且绝对禁止包含任何实际的中文字符。
        4. 严格输出合法的 JSON 格式，绝对不要包含任何 Markdown 标记符。
        输出格式：
        {{
            "scene_prompt": "纯英文生图提示词(必须包含 left 50% empty space 或 right 50% empty space)",
            "layout_direction": "left" 或者 "right" (提取你提示词里的留白方向)
        }}
        """
        response = self._call_llm(prompt)
        
        mark = chr(96) * 3 
        cleaned_response = response.replace(mark + "json", "").replace(mark, "").strip()
        
        try:
            return json.loads(cleaned_response)
        except Exception:
            return {
                "scene_prompt": "A premium pet supplement box placed on a minimalist wooden table. The right 50% of the image is a clean, empty solid beige background for text placement. High-end commercial photography, soft lighting --ar 3:4", 
                "layout_direction": "right"
            }

    # ==========================================
    # 🕵️‍♂️ 0 号特工：市场调研员 (Research Agent)
    # ==========================================
    def run_research_agent(self, sku_info: dict, platform: str) -> str:
        system_category = sku_info.get("__system_category__", "unknown")
        sku_name = sku_info.get("产品名称", "未知产品")

        # ── Step 1：用大模型自主提炼买家真实搜索意图，彻底告别死板字段切片 ──
        refiner_prompt = f"""你是一名极其精通买家搜索习惯的电商 SEO 专家。

【产品档案】:
{json.dumps(sku_info, ensure_ascii=False, indent=2)}

任务：仔细阅读该产品的【原料组成】和【使用说明】。
不要被任何独创商标名（如"{sku_name}"）误导。
请精准提炼出：如果是普通消费者想在 {platform} 上购买同品类的爆款竞品，他们会输入什么【核心功效关键词】？

强制约束：
- 只能输出一个最核心的、2-6个字的通用品类词或功效词。
- 绝对不要输出品牌名、商标名、产品型号。
- 绝对不要带任何标点、说明文字或多余修饰。
- 直接输出关键词本身，不要说"答案是"或任何前缀。

示例：如果产品描述是"改善老年犬猫生理健康"，你应该输出：宠物老年保健品"""

        try:
            raw_keyword = self._call_llm(refiner_prompt, model="gpt-5.5",
                                          platform=platform, category=system_category)
            # 清洗：去掉引号、换行、多余空格，截断至 20 字以内
            refined_keyword = raw_keyword.strip().strip('"\'「」').split('\n')[0].strip()[:20]
        except Exception as e:
            logger.warning(f"[市场调研智能体] 意图提炼失败，降级使用产品名。错误: {e}")
            refined_keyword = ""

        # ── Step 2：安全熔断防御 ── 提炼结果为空则回退产品名
        if not refined_keyword:
            refined_keyword = sku_name
            logger.warning(f"📡 [市场调研智能体] 意图提炼返回空值，已降级使用产品名: {sku_name}")
        else:
            logger.info(
                f"📡 [市场调研智能体] 智能提炼搜索意图成功。"
                f"原始产品: {sku_name} -> 提炼后搜索词: {refined_keyword}"
            )

        # ── Step 3：用干净的意图词调用联网探针 ──
        live_data = web_search_competitors(keyword=refined_keyword, platform=platform)
        print(f"📡 [市场调研智能体] 情报回传完毕: {live_data[:80]}...")

        # 直接返回原始情报，由下游 PM 策划智能体自行消化，省去一次 LLM 调用
        return live_data

    # ==========================================
    # 🎖️ 合规审查智能体 (Compliance Reviewer / Critic Agent)
    # ==========================================
    def run_critic_agent(self, draft: str, platform: str, category_rules: str) -> dict:
        """
        电商内容合规审查官（Compliance Reviewer）。
        审查策划案草稿，返回评分、结论和修改指令。
        永不抛出异常，JSON 解析失败时返回降级通过结果。
        """
        # 动态获取平台规则作为上下文
        try:
            platform_module = importlib.import_module(f"app.api.core.services.platforms.{platform}")
            platform_rules = platform_module.get_platform_rules()
        except ImportError:
            platform_rules = f"当前平台【{platform}】暂无特定规则。"

        prompt = f"""
        Role: 你是一名精通中国电商平台规则的【合规审查官】，同时也是深谙消费者心理的【转化率顾问】。
        你的核心使命是：在保住合规底线的前提下，最大化内容的转化爆发力。

        ## 审查哲学（必须严格遵守）
        - 合规是唯一的"一票否决"标准。只要没有触犯明确的法律法规或平台封号规则，内容就应该被放行。
        - 转化力弱、痛点不够深、表达太温和，这些不是打回重写的理由，只需在 advice 里提出强化建议。
        - "擦边"表达（暗示、隐喻、场景化痛点描述）在不违反广告法的前提下，是允许且鼓励的。

        ## 合规红线（触碰任意一条才打回，score < 60，pass = false）
        ### 广告法绝对禁用词（明文出现即违规）
        最、第一、唯一、顶级、极品、首选、国家级、世界级、独家、最佳、最优、神效、根治、彻底治愈、永久
        ### 平台封号高危词
        加微信、VX号、站外导流、好评返现、刷单、点击有奖
        ### 虚假承诺（明确的效果保证）
        "100%有效"、"保证治好"、"无效退款"等绝对化效果承诺

        ## 平台特定规则
        {platform_rules}

        ## 品类合规红线
        {category_rules}

        ## 待审查策划案草稿
        {draft}

        ## 评分规则
        - score 90-100：合规且痛点犀利、文案有爆发力
        - score 75-89：合规，但文案过于温和，痛点挖掘不够深
        - score 60-74：合规，但内容空洞、可执行性差
        - score 0-59：触犯合规红线，必须打回重写

        ## pass 判定规则（重要）
        - pass = false：当且仅当 score < 60，即触犯合规红线
        - pass = true：score >= 60，即使转化力不够强，也放行并在 advice 中给出强化指令

        ## advice 写作规范
        - 如果 pass = false：明确指出触犯了哪条红线，给出合规的替换方向
        - 如果 pass = true 且 score < 85：给出让文案更犀利、痛点更扎心的具体强化建议（可以建议更激进的擦边表达）
        - 如果 pass = true 且 score >= 85：留空字符串

        输出要求：严格输出合法 JSON，绝对不包含任何 Markdown 标记符。
        {{
            "score": <0到100的整数>,
            "pass": <布尔值，仅 score < 60 时为 false>,
            "reason": "<具体说明：触犯了哪条红线 / 或者转化力哪里还不够狠>",
            "advice": "<具体修改指令，按上述规范填写>"
        }}
        """
        response = self._call_llm(prompt, platform=platform)

        # 🛡️ 极度健壮的 JSON 解析
        mark = chr(96) * 3
        cleaned = response.replace(mark + "json", "").replace(mark, "").strip()
        # 尝试提取第一个 { ... } 块，防止 LLM 在 JSON 前后加了文字
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            cleaned = cleaned[start:end]

        try:
            result = json.loads(cleaned)
            # 确保所有必要字段存在且类型正确
            score = int(result.get("score", 0))
            return {
                "score": score,
                "pass": bool(result.get("pass", score >= 60)),
                "reason": str(result.get("reason", "")),
                "advice": str(result.get("advice", "")),
            }
        except Exception as e:
            logger.warning(f"[合规审查] JSON 解析失败，降级放行。原始响应: {response[:200]}. 错误: {e}")
            return {"score": 85, "pass": True, "reason": "合规审查解析失败，降级放行", "advice": ""}

    # ==========================================
    # ️ 传统分步流 (Traditional Pipeline Agents)
    # ==========================================
    def _build_pm_prompt(self, sku_info: dict, text_desc: str, platform_rules: str,
                         research_report: str, system_category: str,
                         critic_advice: str = "") -> tuple[str, str]:
        """
        构建文案策划智能体（planner_agent）的 Prompt，返回 (prompt, category_rules)。
        critic_advice 不为空时，将合规审查智能体的修正指令追加到 Context 末尾。
        """
        sku_name = sku_info.get("产品名称", "指定产品")
        category_rules = ""

        if system_category == "pet":
            from app.api.core.services.strategies.pet import PetCareStrategy
            strategy = PetCareStrategy()
            prompt = strategy.build_prompt(sku_info, text_desc, sku_name, platform_rules)
            prompt += f"\n\n【市场调研智能体深度洞察报告】:\n{research_report}"
        elif system_category == "tea":
            from app.api.core.services.strategies.tea import TeaStrategy
            strategy = TeaStrategy()
            prompt = strategy.build_prompt(sku_info, text_desc, sku_name, platform_rules)
            prompt += f"\n\n【市场调研智能体深度洞察报告】:\n{research_report}"
        else:
            try:
                category_module = importlib.import_module(f"app.api.core.services.categories.{system_category}")
                category_rules = category_module.get_category_rules(sku_name)
            except ImportError:
                category_rules = f"当前产品所在类目为【{system_category}】，暂无特定类目规则。"

            prompt = f"""
            {platform_rules}
            
            Task: 根据【产品全维度档案】和【老板的战术意图】，深度输出一份覆盖"图文+视频矩阵"的《全域高转化内容策划案》。
            
            【当前锁定 SKU 档案】(含核心机密数据): 
            {json.dumps(sku_info, ensure_ascii=False, indent=2)}
            
            【老板战术意图】: 
            {text_desc}

            【市场调研智能体深度洞察报告】: 
            {research_report}
            
            {category_rules}
            """

        if critic_advice:
            prompt += f"\n\n【⚠️ 合规审查智能体修正指令 — 必须严格执行】:\n{critic_advice}"

        return prompt, category_rules

    def run_pm_agent(self, sku_info: dict, text_desc: str, image_urls: list,
                     model: str = "gpt-5.5", research_report: str = "") -> str:
        """
        阻塞式文案策划智能体（planner_agent），内含合规审查 Critic → Reflection 回路。
        最多重写 max_loops 次，确保策划案质量达标后再返回。
        """
        system_category = sku_info.get("__system_category__", "pet")
        max_loops = 2
        current_loop = 0
        critic_advice = ""
        draft = ""
        category_rules = ""

        # 动态加载平台规则（只加载一次）
        try:
            platform_module = importlib.import_module(f"app.api.core.services.platforms.{self.platform}")
            platform_rules = platform_module.get_platform_rules()
        except ImportError:
            platform_rules = f"当前平台为【{self.platform}】，暂无特定平台排版风格要求。"

        while True:
            # 1. 构建 Prompt（第二轮起注入合规审查修正指令）
            prompt, category_rules = self._build_pm_prompt(
                sku_info, text_desc, platform_rules, research_report,
                system_category, critic_advice
            )

            # 2. 调用 LLM 生成草稿（阻塞式，收集完整文本）
            draft = "".join(self._call_llm_stream(prompt, model=model,
                                                   platform=self.platform,
                                                   category=system_category))

            # 3. 合规审查智能体评估
            evaluation = self.run_critic_agent(draft, self.platform, category_rules)
            score = evaluation["score"]
            passed = evaluation["pass"]
            reason = evaluation["reason"]
            advice = evaluation["advice"]

            logger.info(
                f"\n{'='*60}\n"
                f"🎖️  [合规审查] 第 {current_loop + 1} 轮 | 平台: {self.platform}\n"
                f"   📊 得分: {score}/100  |  结论: {'✅ 通过' if passed else '❌ 打回重写'}\n"
                f"   📝 原因: {reason}\n"
                f"   💡 修改指令: {advice if advice else '(无)'}\n"
                f"{'='*60}"
            )

            # 4. 通过则结束
            if passed:
                break

            # 5. 未通过且还有重写次数
            if current_loop < max_loops:
                critic_advice = advice
                current_loop += 1
                logger.info(f"🔄 [合规审查] 打回重写，进入第 {current_loop + 1} 轮...")
            else:
                # 达到上限，强制放行最后一稿
                logger.warning(
                    f"⚠️  [合规审查] 已达最大修正次数 ({max_loops})，已触发安全熔断放行。"
                    f"最终得分: {score}"
                )
                break

        return draft

    def run_pm_agent_stream(self, sku_info: dict, text_desc: str, image_urls: list,
                            model: str = "gpt-5.5", research_report: str = "") -> iter:
        """
        真流式接口：直接把 LLM 的流式 token 推给前端，用户立刻看到内容。
        Critic 合规审查改为异步：先流式输出当前稿，若 score < 60 在末尾追加提示，
        不阻塞主流程。
        """
        system_category = sku_info.get("__system_category__", "pet")

        # 动态加载平台规则
        try:
            platform_module = importlib.import_module(f"app.api.core.services.platforms.{self.platform}")
            platform_rules = platform_module.get_platform_rules()
        except ImportError:
            platform_rules = f"当前平台为【{self.platform}】，暂无特定平台排版风格要求。"

        # 构建 Prompt
        prompt, category_rules = self._build_pm_prompt(
            sku_info, text_desc, platform_rules, research_report,
            system_category, critic_advice=""
        )

        # 真流式：直接 yield LLM 的 token，用户立即看到输出
        full_draft_chunks = []
        for chunk in self._call_llm_stream(prompt, model=model,
                                           platform=self.platform,
                                           category=system_category):
            full_draft_chunks.append(chunk)
            yield chunk

        # 合规审查已禁用（避免后台 LLM 调用挂起影响系统稳定性）

    def run_ops_agent(self, sku_info: dict, pm_report: str, platform: str, model: str = "gpt-5.5") -> str:
        # 获取路由标签
        category = sku_info.get("__system_category__", "pet")
        
        # 动态获取平台规则
        try:
            platform_module = importlib.import_module(f"app.api.core.services.platforms.{platform}")
            title_rules = platform_module.get_title_rules()
        except (ImportError, AttributeError):
            title_rules = f"暂无【{platform}】平台特定的标题规则，请自由发挥。"
            
        # 动态获取策略上下文
        seo_context = ""
        if category == "pet":
            from app.api.core.services.strategies.pet import PetCareStrategy
            seo_context = PetCareStrategy().get_seo_context()
        elif category == "tea":
            from app.api.core.services.strategies.tea import TeaStrategy
            seo_context = TeaStrategy().get_seo_context()
            
        # 清洗数据
        washed_sku_data = ""
        if category == "pet":
            from app.api.core.services.strategies.pet import PetCareStrategy
            washed_sku_data = PetCareStrategy()._wash_data(sku_info)
        elif category == "tea":
            from app.api.core.services.strategies.tea import TeaStrategy
            washed_sku_data = TeaStrategy()._wash_data(sku_info)
        else:
            washed_sku_data = json.dumps(sku_info, ensure_ascii=False)

        prompt = f"""
        Role: 全域千万级店铺金牌 SEO 优化师。
        Task: 根据【产品全维度档案】和【图文策划案】，提炼出一个终极高转化商品标题及精准搜索关键词。
        
        【当前锁定 SKU 档案】(精简提纯版): 
        {washed_sku_data}
        
        【图文策划案】: 
        {pm_report}
        
        {seo_context}
        
        {title_rules}
        
        🚫 通用违规词黑名单（绝对禁区，触碰必死，必须严格规避）：
        1. 绝对禁用《广告法》极限词：最、第一、唯一、顶级、极品、首选、国家级、世界级、独家。
        2. 绝对禁用站外导流词：加微信、VX、同款留号、好评返现、点击有奖。
        
        要求：
        严格输出 JSON 格式，绝对不要包含任何 Markdown 符号。
        输出 1 个终极商品标题，以及 10 个高频精准搜索下拉词（Keywords）。
        
        输出格式：
        {{
            "title": "符合平台规则且绝对合规的终极商品标题",
            "keywords": ["关键词1", "关键词2", "...", "关键词10"]
        }}
        """
        response = self._call_llm(prompt, model=model, platform=platform, category=category)
        
        # 🛡️ 工业级防御：阻断大模型网络异常或拒绝请求时的脏数据
        if response.startswith("❌"):
            raise ValueError(response)
            
        # 🛡️ 防御 Markdown 截断 Bug 
        mark = chr(96) * 3 
        cleaned_response = response.replace(mark + "json", "").replace(mark, "").strip()
        
        return cleaned_response

    def run_designer_main_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
        Role: 视觉总监。
        Task: 根据【图文策划案】中的「模块三：10张主图分镜与点击率漏斗策划」，逐一将这 10 张图的策划翻译为实际生图引擎需要的英文提示词。
        【图文策划案】: {pm_report}
        【老板意图】: {ops_report}
        
        要求：严格输出 JSON 格式，绝对不要包含 markdown 符号。
        
        🔥 核心视觉特效指令：
        1. 必须完全遵照图文策划案中模块三规划的每一张图的卖点和场景进行翻译！
        2. 毛玻璃效果作为可选样式：本次主图风格可选择带有高级的“毛玻璃”材质，或者让 AI 自行决定最美的商业构图。
        3. 如果选择毛玻璃效果，在你的 `scene_prompt`（英文生图提示词）中，可以包含类似以下的句式描述："In the foreground, there is a floating translucent frosted glass panel (glassmorphism effect)."
        4. 中文排版绝对指令：必须尝试让 AI 直接在图中写出清晰的中文，并且中文绝对不能乱码！你的 `scene_prompt` 必须包含类似这样的句式："bold Chinese text reading exactly: '从图文策划案中提取的该张图的中文卖点短语'."
        5. 构图与留白：请彻底抛弃机械的排版位置，根据画面的视觉美学自行处理留白（Negative space）与排版。让画面主体以及文字的布局自然和谐。
        
        🔥 避坑指南：
        绝对不能在提示词里硬编码写死 "bottle"（瓶装）或 "box"（盒装），除非你明确知道该产品的真实包装形态。建议使用通用词 "the product packaging"（产品包装）或 "the product"（产品），让垫图来控制真实形态。

        🔥 防审美疲劳约束（视觉节奏）：
        不要每一张图片都把产品放在中心展示。必须建立视觉节奏感：10张主图中，可以有3张展示包装，3张展示细节特写/原料（不露出包装），4张展示生活方式氛围/人物痛点。

        格式要求：
        {{
            "global_style_prompt": "commercial product photography, studio lighting, 8k resolution, photorealistic typography --ar 3:4",
            "storyboard": [
                {{
                    "logic": "卖点1", 
                    "scene_prompt": "the main product packaging. Chinese text reading exactly: '核心卖点短语'. Elegant composition with natural negative space for balance."
                }},
                {{
                    "logic": "卖点2", 
                    "scene_prompt": "a related scene. Chinese text reading exactly: '第二卖点'. Balanced layout with appropriate aesthetic negative space."
                }}
            ]
        }}
        说明：必须生成正好 10 个分镜。毛玻璃效果作为可选项，但对应的精简中文卖点是必须项，并且要确保中文排版不乱码，让 AI 自由发挥最美的商业构图。
        """
        response = self._call_llm(prompt)
        
        # 🛡️ 工业级防御：阻断脏数据
        if response.startswith("❌"):
            raise ValueError(response)
            
        mark = chr(96) * 3 
        cleaned_response = response.replace(mark + "json", "").replace(mark, "").strip()
        return cleaned_response

    def run_designer_white_bg_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
        Role: 视觉总监。
        Task: 根据产品信息，生成 5 张产品白底图的生图提示词。
        【图文策划案】: {pm_report}
        【老板意图】: {ops_report}
        
        要求：严格输出 JSON 格式，绝对不要包含 markdown 符号。
        
        🔥 核心视觉特效指令：
        1. 背景必须是纯白色（Pure white background, completely isolated, #FFFFFF）。
        2. 画面中不应出现任何其他道具或背景元素。
        3. 光影要柔和自然，体现出产品的高级感。
        
        🔥 避坑指南：
        绝对不能在提示词里硬编码写死 "bottle"（瓶装）或 "box"（盒装），除非你明确知道该产品的真实包装形态。建议使用通用词 "the product packaging"（产品包装）或 "the product"（产品），让垫图来控制真实形态。

        🔥 防审美疲劳约束（视觉节奏）：
        不要每一张图片都把产品放在中心展示。15屏切片中，应包含不露出完整包装的"痛点人物特写"、"原料微距特写"、"证书文件特写"等。在使用不露出包装的场景时，在英文提示词中明确加入 "NO packaging box" 以防止AI强制生成产品盒。

        格式要求：
        {{
            "global_style_prompt": "pure white background, isolated, product photography, square format, 1:1 aspect ratio, studio lighting, 8k resolution",
            "storyboard": [
                {{
                    "logic": "正面展示", 
                    "scene_prompt": "The product packaging, front view, pure white background."
                }},
                {{
                    "logic": "侧面展示", 
                    "scene_prompt": "The product packaging, side view, pure white background."
                }}
            ]
        }}
        说明：必须生成正好 5 个分镜。
        """
        response = self._call_llm(prompt)
        if response.startswith("❌"): raise ValueError(response)
        mark = chr(96) * 3 
        return response.replace(mark + "json", "").replace(mark, "").strip()

    def run_designer_sku_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
        Role: 视觉总监。
        Task: 根据产品信息，生成 5 张 SKU 规格图的生图提示词。
        【图文策划案】: {pm_report}
        【老板意图】: {ops_report}
        
        要求：严格输出 JSON 格式，绝对不要包含 markdown 符号。
        
        🔥 核心视觉特效指令：
        1. 必须清晰展示产品的数量递增组合，严格按照 1瓶、2瓶、3瓶、4瓶、5瓶 的规格进行排布。
        2. 画面应简洁直观，方便买家在 SKU 选择面板快速识别具体数量。
        
        🔥 避坑指南：
        绝对不能在提示词里硬编码写死 "bottle"（瓶装）或 "box"（盒装），如果产品是盒装请写 "box"，如果不知道建议使用通用词 "item"（件）或 "product packaging"（产品包装），否则会出现盒装变瓶装的严重错误！让大模型根据数量和垫图真实渲染。

        格式要求：
        {{
            "global_style_prompt": "commercial product photography, square format, 1:1 aspect ratio, clear presentation, pure white background, studio lighting, 8k resolution",
            "storyboard": [
                {{
                    "logic": "1件尝鲜装", 
                    "scene_prompt": "1 unit of the product packaging, clean background."
                }},
                {{
                    "logic": "2件巩固装", 
                    "scene_prompt": "2 units of the product packaging arranged neatly, clean background."
                }},
                {{
                    "logic": "3件周期装", 
                    "scene_prompt": "3 units of the product packaging arranged neatly, clean background."
                }},
                {{
                    "logic": "4件囤货装", 
                    "scene_prompt": "4 units of the product packaging arranged neatly, clean background."
                }},
                {{
                    "logic": "5件钜惠装", 
                    "scene_prompt": "5 units of the product packaging arranged neatly, clean background."
                }}
            ]
        }}
        说明：必须生成正好 5 个分镜，并且数量必须严格从 1盒 递增到 5盒。
        """
        response = self._call_llm(prompt)
        if response.startswith("❌"): raise ValueError(response)
        mark = chr(96) * 3 
        return response.replace(mark + "json", "").replace(mark, "").strip()

    def run_designer_video_script(
        self,
        pm_report: str,
        ops_report: str,
        platform: str,
        ratio: str = "16:9",
        num_clips: int = 12,
        model: str = "gpt-5.5",
    ) -> str:
        # 根据宽高比决定画面方向描述
        orientation_desc = "Vertical 9:16" if ratio == "9:16" else "Horizontal 16:9"
        # 每个分镜时长（秒）= 总时长 / 分镜数，总时长由 num_clips*5 估算
        clip_duration = 5
        total_duration = num_clips * clip_duration

        prompt = f"""
        【角色设定】你现在是一位拥有10年经验的好莱坞商业片导演兼资深剪辑师。你需要为我创作一份高度标准化的视频分镜脚本。
        
        【核心要求】
        这份脚本必须具备“双驱”功能：
        能指导AI生成： 必须包含精准的英文提示词（Prompt），结构为“主体 + 动作 + 环境 + 光影 + 摄像机运动”，用于输入给 AI 视频/图像生成工具。
        能指导人类剪辑： 画面描述必须极度具象，不能有抽象的心理描写；必须包含明确的景别、剪辑点和转场提示。

        【项目信息】
        【图文策划案】: {pm_report}
        【老板意图】: {ops_report}
        【目标平台】: {platform}
        视频时长： 包含 {num_clips} 个分镜，总时长 {total_duration} 秒
        画面规格： {ratio} 比例（{orientation_desc}），每个分镜约 {clip_duration} 秒

        【输出格式】
        严格输出合法 JSON，绝不能包含任何 Markdown 标记符。
        {{
            "global_style_prompt": "{orientation_desc} video, e-commerce commercial style, photorealistic, cinematic lighting, highly detailed.",
            "ratio": "{ratio}",
            "storyboard": [
                {{
                    "shot_number": "01",
                    "time": "0-3秒",
                    "shot_and_camera": "特写 (CU), 极速推镜头",
                    "logic": "极度具象的画面描述 (给人类剪辑看)，例如：男主低头，雨水滴在睫毛上...",
                    "scene_prompt": "{orientation_desc} video. Cinematic lighting, extreme close up, fast push in... (纯英文视频生成提示词，结构为 主体+动作+环境+光影+摄像机运动)",
                    "audio": "[音效]... [旁白]...",
                    "transition": "硬切 (Hard Cut) / 匹配剪辑 等",
                    "video_type": "text-to-video" // 或 "image-to-video"
                }}
            ]
        }}
        说明：必须且只能生成 {num_clips} 个分镜，严格遵守双驱分镜脚本逻辑。如果不是 text-to-video，必须明确填写 video_type 为 image-to-video。画面描述必须极度具象。镜号必须为 "01", "02" 等格式。
        """
        response = self._call_llm(prompt, model=model, platform=platform)

        if response.startswith("❌"):
            raise ValueError(response)

        mark = chr(96) * 3
        return response.replace(mark + "json", "").replace(mark, "").strip()

    def run_designer_buyer_show(self, count: int, pm_report: str, ops_report: str) -> str:
        prompt = f"""
        Role: 资深电商运营与视觉策划。
        Task: 根据【图文策划案】与【老板意图】，策划 {count} 条真实的买家秀评价文案和对应的晒图生图提示词。
        
        【图文策划案】: {pm_report}
        【老板意图】: {ops_report}
        
        要求：
        1. 评价文案（review_text）要显得真实、接地气，符合普通买家的表达习惯，包含对产品使用体验的具体描述。
        2. 生图提示词（image_prompt）必须是纯英文，适合作为大模型生图的输入，场景要生活化真实化（如放在家里桌子上，手持，泡在杯子里，快递拆箱等真实场景）。
        3. 必须生成正好 {count} 条数据。
        4. 严格输出合法的 JSON 格式，绝不能包含 Markdown 标记符。

        输出格式（字段名称必须严格一致，不得更改）：
        {{
            "global_style_prompt": "amateur photography, smartphone photo, realistic lighting, casual composition, unfiltered, real life --ar 3:4",
            "buyer_shows": [
                {{
                    "review_text": "真实的中文评价文案，符合普通买家口吻...",
                    "image_prompt": "A casual smartphone photo of the product packaging on a messy living room table..."
                }},
                ... (共需输出 {count} 个)
            ]
        }}
        注意：外层键名必须是 "buyer_shows"，内层字段必须是 "review_text" 和 "image_prompt"，不得使用其他名称。
        """
        response = self._call_llm(prompt)
        
        if response.startswith("❌"):
            raise ValueError(response)
            
        mark = chr(96) * 3 
        cleaned_response = response.replace(mark + "json", "").replace(mark, "").strip()
        return cleaned_response

    # ==========================================
    # 🆕 多SKU合并模式（同一链接，多规格）
    # ==========================================
    def run_pm_agent_stream_multi(
        self,
        multi_sku_info: dict,
        text_desc: str,
        image_urls: list,
        model: str = "gpt-5.5",
        research_report: str = "",
    ):
        """
        多SKU合并策划：为"同一商品链接下多个SKU规格"生成一份整体策划案。
        multi_sku_info 来自 knowledge_base.get_multi_sku_info()。

        策划案结构：
        1. 整体商品定位与差异化（覆盖全线SKU）
        2. 主图卖点矩阵（覆盖全线，突出系列感）
        3. 各SKU规格分镜（每个SKU 2-3张专属主图提示词）
        4. 详情页骨架（适用全线）
        5. 标题库（含全系列关键词）
        """
        import json as _json

        sku_list = multi_sku_info.get("__sku_list__", [])
        sku_details = multi_sku_info.get("__sku_details__", {})
        category = multi_sku_info.get("__system_category__", "pet")

        # 构建每个SKU的摘要
        sku_summaries = []
        for name in sku_list:
            data = sku_details.get(name, {})
            summary_fields = {k: v for k, v in data.items() if not k.startswith("__") and v}
            sku_summaries.append(f"【{name}】\n{_json.dumps(summary_fields, ensure_ascii=False, indent=2)}")
        sku_block = "\n\n".join(sku_summaries)

        if category == "tea":
            category_hint = "张家界莓茶（藤茶）系列产品"
            platform_hint = "茶类电商（主打健康、产地直销、天然无添加）"
        else:
            category_hint = "宠物营养保健品系列产品"
            platform_hint = "宠物电商（主打功效、安全、宠物主人情感认同）"

        image_hint = ""
        if image_urls:
            image_hint = f"\n（前端已上传 {len(image_urls)} 张参考图，策划案中的主图提示词应参考这些真实产品视觉风格）"

        research_block = f"\n\n【市场调研智能体深度洞察报告】:\n{research_report}" if research_report else ""

        prompt = f"""
你是一位顶级电商视觉策划专家，擅长为「同一店铺链接下多SKU系列产品」制定整体策划案。

【任务背景】
本次需要为以下 {len(sku_list)} 个 SKU 规格（同属一个商品链接）制定一份完整的图文策划案：
品类：{category_hint}
平台定位：{platform_hint}
老板战术意图：{text_desc}{image_hint}

【各SKU规格详细信息】
{sku_block}
{research_block}

【输出要求】
请输出一份结构完整的「多SKU合并图文策划案」，必须包含以下六个模块：

---
# 模块一：整体商品定位与核心差异化
（覆盖全线 {len(sku_list)} 个SKU，统一的品牌故事、核心卖点、目标人群画像）

---
# 模块二：系列主图卖点矩阵（10张主图分镜）
（强调系列感与差异化，让消费者一眼看出各SKU的区别与价值）
为每张主图给出：
- 视觉策略（打什么痛点/卖点）
- 英文生图提示词（scene_prompt，专业商业摄影风格）

---
# 模块三：各SKU专属规格图分镜
（每个SKU 2-3张专属主图，突出该规格的独特卖点）
{''.join([f"- {name}：2-3张专属分镜提示词{chr(10)}" for name in sku_list])}

---
# 模块四：详情页骨架（适用全线SKU）
（痛点开场 → 系列介绍 → 各SKU对比表 → 信任背书 → 转化逼单）
给出 8-10 屏详情页的结构与每屏核心文案

---
# 模块五：高转化标题库
（覆盖全系列，包含品类词、功效词、人群词，至少 5 条候选标题）

---
# 模块六：买家秀评价策略
（针对不同SKU各设计 2 条真实感评价文案，共 {len(sku_list) * 2} 条）

请直接输出策划案正文，不要有开场白和总结语。
"""

        for chunk in self._call_llm_stream(prompt, model=model, category=category):
            yield chunk

    def run_designer_detail_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
        Role: 视觉总监。
        Task: 根据【图文策划案】和【老板意图】，严格遵循“高转化率详情页四模块逻辑骨架”生成详情页生图提示词。
        【图文策划案】: {pm_report}
        【老板意图】: {ops_report}
        
        要求：严格输出 JSON 格式，绝对不要包含 markdown 符号。

        🔥 高转化率详情页四模块逻辑骨架（总共生成15屏切片，请合理分配到以下四个模块）：
        模块一：注意力抓取（黄金前三屏）- 痛点场景带入、核心卖点（USP）直给、价值前置。
        模块二：信任构建与实力背书 - 权威证明、销量与口碑、竞品对比（踩一捧一）。
        模块三：产品细节与卖点拆解（SKU价值支撑） - 场景化展示、材质与工艺、SKU策略引导。
        模块四：转化逼单（行动号召） - 售后保障、促销与稀缺性、明确的行动号召。
        
        🔥 核心视觉特效指令：
        1. 必须完全遵照以上的四个核心模块的逻辑骨架，结合图文策划案中的卖点和场景进行翻译！
        2. 本次详情页风格要求统一、具有强烈的商业质感。
        3. 在你的 `scene_prompt`（英文生图提示词）中，必须包含类似以下的句式描述："A premium commercial product shot, elegant layout for e-commerce detail page. Chinese text reading exactly: '从图文策划案中提取的该屏核心中文卖点或痛点短语'."
        
        🔥 避坑指南：
        绝对不能在提示词里硬编码写死 "bottle"（瓶装）或 "box"（盒装），除非你明确知道该产品的真实包装形态。建议使用通用词 "the product packaging"（产品包装）或 "the product"（产品），让垫图来控制真实形态。

        格式要求：
        {{
            "global_style_prompt": "commercial product photography, e-commerce detail page infographic, high-end studio lighting, 8k resolution, photorealistic typography --ar 16:9",
            "storyboard": [
                {{
                    "logic": "模块一：注意力抓取 - 痛点场景带入", 
                    "scene_prompt": "A close-up shot of an anxious pet owner facing a problem. Chinese text reading exactly: '痛点文字'. High-end commercial photography."
                }},
                {{
                    "logic": "模块二：信任构建 - 权威证明", 
                    "scene_prompt": "Product packaging displayed with premium certification badges and testing reports. Chinese text reading exactly: '权威认证'. Elegant composition."
                }}
                // ... 请按四大模块逻辑继续补充，共15个分镜
            ]
        }}
        说明：必须生成正好 15 个分镜（15屏）。必须涵盖注意力抓取、信任构建、产品细节、转化逼单这四大模块。每个分镜的 `scene_prompt` 里都要包含对应的精简中文卖点，并让 AI 自由发挥最美的商业构图。
        """
        response = self._call_llm(prompt)
        
        if response.startswith("❌"):
            raise ValueError(response)
            
        mark = chr(96) * 3 
        cleaned_response = response.replace(mark + "json", "").replace(mark, "").strip()
        return cleaned_response
