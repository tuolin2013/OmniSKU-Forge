# E:\laotuo_project\OmniSKU-Forge\backend\app\api\core\services\image_compositor.py
import os
from PIL import Image, ImageDraw, ImageFont

class ImageCompositor:
    
    @staticmethod
    def _wrap_text_chinese(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.Draw) -> list[str]:
        """中文字符级精准断行"""
        lines = []
        current_line = ""
        for char in text:
            test_line = current_line + char
            bbox = draw.textbbox((0, 0), test_line, font=font)
            width = bbox[2] - bbox[0]
            if width <= max_width:
                current_line = test_line
            else:
                lines.append(current_line)
                current_line = char
        if current_line:
            lines.append(current_line)
        return lines

    @staticmethod
    def _calculate_optimal_layout(text: str, font_path: str, box_width: int, box_height: int, draw: ImageDraw.Draw, max_font_size=100, min_font_size=24):
        """自适应字号探测器：寻找能在碰撞盒内舒服躺下的最大字号"""
        for size in range(max_font_size, min_font_size - 1, -2):
            font = ImageFont.truetype(font_path, size)
            test_bbox = draw.textbbox((0, 0), "测", font=font)
            line_height = test_bbox[3] - test_bbox[1]
            line_spacing = int(line_height * 1.4) 
            
            lines = ImageCompositor._wrap_text_chinese(text, font, box_width, draw)
            total_text_height = len(lines) * line_spacing
            
            if total_text_height <= box_height:
                return font, lines, line_spacing, total_text_height
                
        font = ImageFont.truetype(font_path, min_font_size)
        lines = ImageCompositor._wrap_text_chinese(text, font, box_width, draw)
        return font, lines, int(min_font_size * 1.4), len(lines) * int(min_font_size * 1.4)

    @classmethod
    def render_final_ad(cls, pure_image_path: str, copy_json: dict, layout_direction: str, font_path: str, output_path: str) -> str:
        """组装车间主程序"""
        print(f"🏭 开始合成图文... 指定排版方位: {layout_direction}")
        img = Image.open(pure_image_path).convert("RGBA")
        draw = ImageDraw.Draw(img)
        img_w, img_h = img.size
        
        # 定义安全物理碰撞盒 (留出 60px 的高级呼吸感边界)
        margin = 60 
        if layout_direction == "right":
            box_x0 = int(img_w * 0.5) + margin
            box_x1 = img_w - margin
        else: # left
            box_x0 = margin
            box_x1 = int(img_w * 0.5) - margin
            
        box_y0 = margin + 100 
        box_y1 = img_h - margin - 100 
        
        box_width = box_x1 - box_x0
        box_height = box_y1 - box_y0

        if not os.path.exists(font_path):
            raise Exception(f"⚠️ 找不到字体文件: {font_path}")

        main_title = copy_json.get("main_title", "")
        if main_title:
            font, lines, line_spacing, total_height = cls._calculate_optimal_layout(
                text=main_title, font_path=font_path, box_width=box_width, box_height=box_height, draw=draw
            )
            # 垂直居中算法
            current_y = box_y0 + (box_height - total_height) // 2
            for line in lines:
                # 默认深色高级黑，如果是暗调图，这里可以加入亮度反转逻辑
                draw.text((box_x0, current_y), line, font=font, fill=(30, 30, 30, 255)) 
                current_y += line_spacing

        img.convert("RGB").save(output_path, quality=95)
        print(f"🎉 动态排版合成成功！已保存至: {output_path}")
        return output_path

# =================测试入口=================
if __name__ == "__main__":
    # 测试前，请在同目录下放一张 test_bg.jpg 和一个字体文件 msyh.ttc (微软雅黑)
    try:
        ImageCompositor.render_final_ad(
            pure_image_path="test_bg.jpg", 
            copy_json={"main_title": "辰荣研究院重磅推出：艾留平草本微粉，换季咳不伤肝！"}, 
            layout_direction="right",
            font_path="C:/Windows/Fonts/msyh.ttc", # 直接调用 Win10 系统自带字体测试
            output_path="test_result.jpg"
        )
    except Exception as e:
        print(f"测试出错: {e}")