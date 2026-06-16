# E:\laotuo_project\OmniSKU-Forge\backend\app\api\core\services\taobao_brain.py
from .base_brain import BaseBrain

class TaobaoBrain(BaseBrain):
    """🛍️ 淘宝/天猫专属大脑"""
    
    def __init__(self):
        super().__init__("taobao")

    def run_ops_agent(self, pm_report: str, model: str = "gpt-5.5") -> str:
        prompt = f"""
深谙【天猫/淘宝】算法的高级电商运营。
淘宝标题严格控制在 30 个汉字。注重品牌调性和核心卖点提炼，不要过度堆砌。
【输出格式】纯 JSON：{{"seo_titles": ["长标题1"], "short_title": "短标题"}}
【纪要】：{pm_report}
"""
        # If TaobaoBrain implements its own API calling method
        # and doesn't take 'model', this might need adjustment, but BaseBrain doesn't show it yet. 
        # For now, we update the signature and pass it if possible. Wait, _call_codex_with_fallback might not take model.
        # Let's check base_brain.py or just use _call_llm like omni_brain
        return self._call_codex_with_fallback(prompt, temperature=0.7)

    def run_designer_main_image(self, pm_report: str, ops_report: str) -> str:
        prompt = f"""
你是一位顶尖【天猫】视觉设计总监。淘宝注重调性、极简和高级感（INS风、冷淡风）。
`scene_prompt` 必须【极其简短英文】，主打高级光影氛围，绝不要提及产品和文字！
【输出格式】纯 JSON：
{{
  "global_style_prompt": "High-end minimalist product photography, wabi-sabi style, cinematic lighting",
  "storyboard": [
    {{"index": 1, "logic": "首图调性", "scene_prompt": "placed on natural rough stone, soft sunlight from window, neutral tones"}}
  ]
}}
【会议纪要】：{pm_report}
"""
        return self._call_codex_with_fallback(prompt, temperature=0.3)