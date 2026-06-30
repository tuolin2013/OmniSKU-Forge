# backend/app/api/core/services/skills/search_skill.py
# 联网搜索探针 — 挂载到 0 号特工的外部情报能力
# 依赖：pip install requests（已内置）；需在 .env 配置 SERPAPI_KEY

import os
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")

# 平台中文名映射，让 query 更贴近真实用户搜索词
_PLATFORM_CN = {
    "pinduoduo": "拼多多",
    "taobao": "淘宝",
    "jd": "京东",
    "douyin": "抖音",
    "default": "电商",
}


def _get_platform_cn(platform: str) -> str:
    return _PLATFORM_CN.get(platform.lower(), _PLATFORM_CN["default"])


def _serpapi_search(query: str, max_results: int = 8, timeout: float = 15.0) -> list:
    """
    调用 SerpAPI Google Search，返回 organic_results 列表，失败返回空列表。
    每条结果标准化为 {title, snippet, link} 字段。
    """
    if not SERPAPI_KEY:
        logger.warning("[SearchSkill] SERPAPI_KEY 未配置，跳过本次搜索")
        return []

    params = {
        "engine": "google",
        "q": query,
        "api_key": SERPAPI_KEY,
        "hl": "zh-cn",
        "gl": "cn",
        "num": max_results,
        "safe": "off",
    }
    try:
        resp = requests.get(
            "https://serpapi.com/search",
            params=params,
            timeout=timeout,
        )
        if resp.status_code != 200:
            logger.warning(f"[SearchSkill] SerpAPI 返回异常状态码 {resp.status_code}: {resp.text[:200]}")
            return []
        data = resp.json()
        organic = data.get("organic_results", [])
        # 标准化字段
        results = []
        for item in organic[:max_results]:
            results.append({
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "link": item.get("link", ""),
            })
        return results
    except Exception as e:
        logger.warning(f"[SearchSkill] SerpAPI 请求失败 query='{query}': {e}")
        return []


def _format_results(results: list, section_title: str) -> str:
    """将结果列表格式化为可读情报段落。"""
    if not results:
        return ""
    lines = [f"\n{'='*10} {section_title} {'='*10}"]
    for i, item in enumerate(results, start=1):
        title = item.get("title", "无标题").strip()
        content = (item.get("snippet") or "").strip()
        url = item.get("link", "")
        if not content:
            continue
        snippet = content[:400] + ("…" if len(content) > 400 else "")
        lines.append(f"[{i}] {title}\n    摘要：{snippet}\n    来源：{url}")
    return "\n".join(lines)


# 品类关键词识别 → 定制化搜索词
_CATEGORY_PET = {"宠物", "猫", "狗", "犬", "保健品", "营养品", "宠物营养", "宠物保健", "益生菌", "维生素", "鱼油", "软骨素"}
_CATEGORY_TEA = {"莓茶", "藤茶", "张家界", "显齿蛇葡萄", "莓茶保健", "湘西莓茶"}


def _detect_category(keyword: str) -> str:
    """根据关键词判断品类：pet / tea；未命中宠物关键词则默认走莓茶逻辑"""
    kw = keyword.lower()
    for tag in _CATEGORY_PET:
        if tag in kw:
            return "pet"
    return "tea"


def _build_queries(keyword: str, platform_cn: str, category: str) -> tuple:
    """按品类返回三个维度的搜索 query。"""
    if category == "pet":
        q1 = f"{keyword} {platform_cn} 爆款 宠物营养保健品 核心卖点 差异化 宠物主粮伴侣 2024 2025"
        q2 = f"{keyword} 宠物主人 真实评价 使用效果 宠物健康 踩坑 知乎 小红书 B站"
        q3 = f"宠物营养保健品 电商运营 市场趋势 功能性宠物食品 行业分析 2024 2025"
    elif category == "tea":
        q1 = f"{keyword} {platform_cn} 爆款 张家界莓茶 藤茶 差异化卖点 产地直销 2024 2025"
        q2 = f"{keyword} 消费者 真实评价 口感 功效 抗氧化 健康茶 踩坑 知乎 小红书"
        q3 = f"莓茶 藤茶 张家界特产 电商运营 市场趋势 健康茶饮 行业分析 2024 2025"
    return q1, q2, q3


def web_search_competitors(keyword: str, platform: str) -> str:
    """
    多角度联网搜索竞品情报探针（SerpAPI Google 版）。

    策略：
    1. 竞品标题 & 卖点查询   → 了解头部卖家在打什么牌
    2. 买家真实痛点与评价查询 → 了解真实痛点与期望
    3. 行业洞察 & 运营策略   → 了解市场趋势与打法

    支持品类（自动识别并定制搜索词）：
    - 宠物营养保健品
    - 张家界莓茶（藤茶）

    Args:
        keyword: 精炼后的核心品类/功效词，如 "宠物益生菌保健品" / "张家界莓茶"
        platform: 目标平台标识，如 "pinduoduo"

    Returns:
        结构化的多维度竞品情报字符串，保证永不抛出异常。
    """
    if not SERPAPI_KEY:
        return "[系统警告：SERPAPI_KEY 未配置，切换至大模型内部知识库推演]"

    platform_cn = _get_platform_cn(platform)
    category = _detect_category(keyword)
    logger.info(f"[SearchSkill] 品类识别结果: {category}（keyword='{keyword}'）")

    try:
        query_1, query_2, query_3 = _build_queries(keyword, platform_cn, category)

        # ── 维度 1：竞品卖点与标题 ──────────────────────────────
        results_1 = _serpapi_search(query_1, max_results=8)[:5]

        # ── 维度 2：买家真实痛点与评价 ──────────────────────────
        results_2 = _serpapi_search(query_2, max_results=6)[:4]

        # ── 维度 3：行业运营策略与趋势 ──────────────────────────
        results_3 = _serpapi_search(query_3, max_results=6)[:4]

        # 如果三轮均无结果，降级
        if not results_1 and not results_2 and not results_3:
            return "[系统提示：联网搜索无结果，切换至大模型内部知识库推演]"

        # ── 组装结构化情报 ────────────────────────────────────
        header = (
            f"【全网实时多维竞品情报】\n"
            f"搜索标的：{keyword}  |  目标平台：{platform_cn}\n"
        )
        body = "\n".join(filter(None, [
            _format_results(results_1, f"维度1：{platform_cn}竞品卖点与爆款标题"),
            _format_results(results_2,  "维度2：买家真实痛点与评价"),
            _format_results(results_3,  "维度3：行业运营策略与趋势"),
        ]))

        intel = header + body
        logger.info(f"[SearchSkill] 情报采集完成，总字符数: {len(intel)}")
        return intel

    except Exception as e:
        logger.error(f"[SearchSkill] 联网搜索失败: {e}", exc_info=True)
        return f"[系统警告：联网搜索失败({str(e)})，切换至大模型内部知识库推演]"
