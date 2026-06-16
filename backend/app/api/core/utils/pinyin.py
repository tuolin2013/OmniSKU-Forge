# backend/app/api/core/utils/pinyin.py
"""汉字转拼音首字母工具，用于生成 R2 文件名。"""


def get_pinyin_initials(text: str) -> str:
    """
    将中文字符串转为拼音首字母小写拼接。
    依赖可选包 pypinyin，未安装时降级返回 "unknown"。

    Examples:
        "艾留平" -> "alp"
        "宠物保健品" -> "cwbjp"
    """
    if not text or text == "product":
        return "unknown"
    try:
        from pypinyin import pinyin, Style

        initials = pinyin(text, style=Style.FIRST_LETTER, strict=False)
        return "".join(
            item[0][0] for item in initials if item and item[0]
        ).lower()
    except Exception:
        return "unknown"
