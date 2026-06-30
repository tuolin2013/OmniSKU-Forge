import json
import math

_INVALID_VALUES = {"", "nan", "none", "null", "None", "NaN", "NULL"}

def _safe_str(val, default: str = "") -> str:
    """将任意值安全转换为字符串，NaN/None/空均返回 default。"""
    if val is None:
        return default
    # 处理 float('nan') 等真实浮点 NaN
    try:
        if isinstance(val, float) and math.isnan(val):
            return default
    except Exception:
        pass
    s = str(val).strip()
    if s in _INVALID_VALUES:
        return default
    return s

class TeaStrategy:
    def _wash_data(self, sku_info: dict) -> str:
        """
        莓茶轻量级数据清洗与防空包弹逻辑（防御性重构版）
        """
        name = _safe_str(sku_info.get("产品名称"), "未知产品")
        weight = _safe_str(sku_info.get("克数"), "暂无规格")
        unit = _safe_str(sku_info.get("单位"), "")

        selling_point = _safe_str(
            sku_info.get("卖点"),
            "张家界核心产区，纯手工采摘，富含高纯度黄酮类化合物，天然回甘生津，高端送礼优选。"
        )

        price = _safe_str(
            sku_info.get("价格"),
            "（具体价格请参考前端运营标价）"
        )

        washed_text = (
            f"产品名称：{name}\n"
            f"规格参数：{weight}{unit}\n"
            f"核心卖点：{selling_point}\n"
            f"参考价格：{price}"
        )
        return washed_text

    def get_seo_context(self) -> str:
        """
        茶饮专属 SEO 逻辑
        """
        return """
        📌 茶饮专属 SEO 核心词库与逻辑：
        1. 核心长尾词：张家界莓茶、核心产区、高黄酮、礼盒装、长辈送礼、嫩芽、回甘生津、手工采摘。
        2. 🚨 合规红线（绝对禁用）：严禁出现“降三高、治病、医疗、药用”等违规词。
        """

    def build_prompt(self, sku_info: dict, text_desc: str, sku_name: str, platform_style: str) -> str:
        washed_sku_data = self._wash_data(sku_info)
        return f"""
        Role: {platform_style}金牌产品经理、视觉策划操盘手与短视频编导。
        Task: 根据【产品全维度档案】和【老板的战术意图】，深度输出一份覆盖“图文+视频矩阵”的《全域高转化内容策划案》。
        
        【当前锁定 SKU 档案】(精简提纯版): 
        {washed_sku_data}
        
        【老板战术意图】: 
        {text_desc}
        
        🚨 【平台类目合规生死线（最高指令）】🚨
        当前产品所在类目为【代用茶】，商家**绝对没有医疗资质**！
        1. 绝对禁用“明确的疾病名称”和“医疗与治疗功效词”。
        2. 突出原产地优势。
        3. 突出高黄酮等核心卖点。
        
        ⚠️ 核心铁律：策划案中出现的所有【产品名称】必须严格等于 "{sku_name}"！
        
        要求：必须严格按照以下【五个大模块】输出，严禁说废话，直接输出可执行的脚本与大纲！
        
        ### 模块一：受众画像与极致痛点剖析
        - 目标买家是谁？终极焦虑和痛点场景是什么？（合规表达）
        
        ### 模块二：硬核数据卖点降维提取
        - 提取原产地、高黄酮等至少3个绝对优势数据，翻译成合规的“扎心卖点文案”。
        
        ### 模块三：10张主图分镜与点击率漏斗策划
        - 规划10张主图的核心画面和卖点文案（首图吸睛、中段信任、后段促单）。
        
        ### 模块四：15屏详情页深度转化排版大纲
        - 严格遵循高转化率详情页四模块逻辑骨架：
          1. 模块一：注意力抓取（黄金前三屏） - 痛点场景带入、核心卖点（USP）直给、价值前置。
          2. 模块二：信任构建与实力背书 - 权威证明、销量与口碑、竞品对比（踩一捧一）。
          3. 模块三：产品细节与卖点拆解（SKU价值支撑） - 场景化展示、材质与工艺、SKU策略引导。
          4. 模块四：转化逼单（行动号召） - 售后保障、促销与稀缺性、明确的行动号召。
          请将15个切片逻辑合理分配到以上四个模块中。
        
        🎬 ---------------- 视频矩阵编导脚本 ---------------- 🎬
        
        ### 模块五：60秒商品视频脚本 (首图位置，比例3:4)
        - 核心逻辑：黄金前3秒极速抓人！快节奏展示原产地、核心成分与冲泡场景，直接促单。
        - 请按时间轴（如 0-3秒, 3-10秒）输出：画面镜头描述 + 核心配音/字幕词。
        """
