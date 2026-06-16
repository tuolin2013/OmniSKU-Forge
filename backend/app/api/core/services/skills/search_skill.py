# backend/app/api/core/services/skills/search_skill.py
# 联网搜索探针 — 挂载到 0 号特工的外部情报能力
# 依赖：pip install tavily-python

import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

try:
    from tavily import TavilyClient
    _TAVILY_AVAILABLE = True
except ImportError:
    _TAVILY_AVAILABLE = False
    logger.warning(
        "[SearchSkill] tavily-python 未安装，联网搜索功能不可用。"
        "请执行: pip install tavily-python"
    )

# 各平台对应的高质量数据源域名白名单
_PLATFORM_DOMAINS = {
    "pinduoduo": [
        "pinduoduo.com",
        "mobile.yangkeduo.com",
        "zhihu.com",
        "36kr.com",
        "ebrun.com",
        "leiphone.com",
    ],
    "taobao": [
        "taobao.com",
        "tmall.com",
        "1688.com",
        "zhihu.com",
        "36kr.com",
        "ebrun.com",
    ],
    "jd": [
        "jd.com",
        "zhihu.com",
        "36kr.com",
    ],
    "douyin": [
        "douyin.com",
        "toutiao.com",
        "zhihu.com",
        "36kr.com",
        "ebrun.com",
    ],
    "default": [
        "zhihu.com",
        "36kr.com",
        "ebrun.com",
        "leiphone.com",
        "youzan.com",
    ],
}

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


def _get_domains(platform: str) -> list:
    return _PLATFORM_DOMAINS.get(platform.lower(), _PLATFORM_DOMAINS["default"])


# 通用噪音域名黑名单（游戏攻略、无关新闻等）
_NOISE_DOMAINS = [
    "zhihu.com/p/456254865",  # 部落冲突
    "game.com", "gamer.com", "nga.cn",
]

def _run_single_query(
    client: "TavilyClient",
    query: str,
    max_results: int = 5,
    include_domains: list = None,
    exclude_domains: list = None,
    timeout: float = 8.0,
) -> list:
    """执行单次 Tavily 搜索，返回 results 列表，失败返回空列表。
    timeout: 单次查询最长等待秒数，超时直接返回空列表，防止卡死全流程。
    """
    import threading

    kwargs = {
        "query": query,
        "search_depth": "advanced",
        "max_results": max_results,
    }
    if include_domains:
        kwargs["include_domains"] = include_domains
    if exclude_domains:
        kwargs["exclude_domains"] = exclude_domains

    result_box: list = []
    error_box: list = []

    def _do_search():
        try:
            response = client.search(**kwargs)
            result_box.extend(response.get("results", []))
        except Exception as e:
            error_box.append(e)

    t = threading.Thread(target=_do_search, daemon=True)
    t.start()
    t.join(timeout=timeout)

    if t.is_alive():
        logger.warning(f"[SearchSkill] 单次查询超时 ({timeout}s)，已跳过 query='{query}'")
        return []
    if error_box:
        logger.warning(f"[SearchSkill] 单次查询失败 query='{query}': {error_box[0]}")
        return []
    return result_box


def _filter_relevant(results: list, keyword: str) -> list:
    """
    相关性过滤：去掉标题和摘要里完全找不到关键词任何字符的结果，
    防止 Tavily 在无精确匹配时返回无关内容。
    """
    if not keyword:
        return results
    # 取关键词中任意一个字做粗过滤（中文词足够细）
    chars = set(keyword.replace(" ", ""))
    filtered = []
    for item in results:
        text = (item.get("title", "") + item.get("content", "")).lower()
        # 关键词中至少有 2 个字符命中，才算相关
        hit = sum(1 for c in chars if c in text)
        if hit >= min(2, len(chars)):
            filtered.append(item)
    if not filtered:
        logger.warning(f"[SearchSkill] 相关性过滤后无结果，放宽至返回全部 {len(results)} 条")
        return results  # 保底：过滤后为空时返回原始结果
    return filtered


def _format_results(results: list, section_title: str) -> str:
    """将结果列表格式化为可读情报段落。"""
    if not results:
        return ""
    lines = [f"\n{'='*10} {section_title} {'='*10}"]
    for i, item in enumerate(results, start=1):
        title = item.get("title", "无标题").strip()
        content = (item.get("content") or "").strip()
        url = item.get("url", "")
        if not content:
            continue
        # 截取前 400 字，避免 token 爆炸
        snippet = content[:400] + ("…" if len(content) > 400 else "")
        lines.append(f"[{i}] {title}\n    摘要：{snippet}\n    来源：{url}")
    return "\n".join(lines)


def web_search_competitors(keyword: str, platform: str) -> str:
    """
    多角度联网搜索竞品情报探针。

    策略：
    1. 竞品标题 & 卖点查询   → 了解头部卖家在打什么牌
    2. 买家真实评价查询      → 了解真实痛点与期望
    3. 行业洞察 & 运营策略   → 了解市场趋势与打法

    Args:
        keyword: 精炼后的核心品类/功效词，如 "宠物老年保健品"
        platform: 目标平台标识，如 "pinduoduo"

    Returns:
        结构化的多维度竞品情报字符串，保证永不抛出异常。
    """
    if not _TAVILY_AVAILABLE:
        return "[系统警告：tavily-python 未安装，切换至大模型内部知识库推演]"

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        logger.error("环境变量 TAVILY_API_KEY 未加载！")
        return "[系统警告：未配置 TAVILY_API_KEY，切换至大模型内部知识库推演]"

    platform_cn = _get_platform_cn(platform)
    domains = _get_domains(platform)

    try:
        client = TavilyClient(api_key=api_key)

        # ── 维度 1：竞品卖点与标题 ──────────────────────────────
        # 先全网搜，不加 include_domains 限制，避免品类过细时白名单里找不到内容
        query_1 = f"{keyword} {platform_cn} 爆款商品 核心卖点 差异化竞争 2024 2025"
        results_1_raw = _run_single_query(client, query_1, max_results=8)
        results_1 = _filter_relevant(results_1_raw, keyword)[:5]

        # ── 维度 2：买家真实痛点与评价 ──────────────────────────
        query_2 = f"{keyword} 用户真实评价 使用体验 效果 好不好用 踩坑"
        results_2_raw = _run_single_query(
            client, query_2, max_results=6,
            include_domains=["zhihu.com", "xiaohongshu.com", "weibo.com", "bilibili.com"]
        )
        # 如果带白名单搜不到相关内容，降级到全网搜
        results_2_filtered = _filter_relevant(results_2_raw, keyword)
        if not results_2_filtered:
            results_2_raw = _run_single_query(client, query_2, max_results=6)
            results_2_filtered = _filter_relevant(results_2_raw, keyword)
        results_2 = results_2_filtered[:4]

        # ── 维度 3：行业运营策略与趋势 ──────────────────────────
        query_3 = f"{keyword} 电商运营 市场趋势 消费者 行业分析 2024 2025"
        results_3_raw = _run_single_query(
            client, query_3, max_results=6,
            include_domains=["36kr.com", "ebrun.com", "zhihu.com", "leiphone.com"]
        )
        results_3_filtered = _filter_relevant(results_3_raw, keyword)
        if not results_3_filtered:
            results_3_raw = _run_single_query(client, query_3, max_results=6)
            results_3_filtered = _filter_relevant(results_3_raw, keyword)
        results_3 = results_3_filtered[:4]

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
