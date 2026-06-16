import io
import random
from PIL import Image, ImageEnhance

class AntiReviewShield:
    """
    拼多多/淘宝物理级防机审护盾
    核心功能：
    1. 彻底擦除生成图片的 C2PA/EXIF/ICC 等数字基因水印
    2. 频域混淆：微调图像对比度/亮度，打乱 AI 频域特征
    3. 空间域混淆：打破图片原始像素网格规律，实现哈希一致性破坏
    """
    
    @staticmethod
    def apply_shield(image_path: str, output_path: str = None) -> str:
        if not output_path:
            output_path = image_path
            
        try:
            # 1. 擦除 C2PA 和 EXIF 数据
            # 通过打开文件并提取纯数据，不继承原图的 info 字典
            with Image.open(image_path) as img:
                clean_img = img.convert("RGB")
                
                # 2. 频域混淆 & 哈希打破
                # 轻微调整亮度和对比度，幅度在 0.5% 内，人眼无法察觉
                enhancer = ImageEnhance.Brightness(clean_img)
                clean_img = enhancer.enhance(random.uniform(0.995, 1.005))
                
                enhancer = ImageEnhance.Contrast(clean_img)
                clean_img = enhancer.enhance(random.uniform(0.995, 1.005))
                
                # 3. 空间域混淆（微小重采样破坏AI网格特征）
                orig_w, orig_h = clean_img.size
                resized = clean_img.resize((orig_w - 1, orig_h - 1), Image.Resampling.LANCZOS)
                clean_img = resized.resize((orig_w, orig_h), Image.Resampling.LANCZOS)
                
                # 4. 重新封包为全新 JPEG，丢弃所有头部信息，JPEG 质量随机浮动防逆向探测
                quality = random.randint(94, 97)
                clean_img.save(output_path, format="JPEG", quality=quality)
                
            print(f"🛡️ [物理护盾激活] 成功洗除机审特征: {image_path}")
            return output_path
        except Exception as e:
            print(f"⚠️ [护盾异常] 洗除失败: {e}")
            return image_path

    @staticmethod
    def apply_shield_to_bytes(image_bytes: bytes) -> bytes:
        try:
            # 内存级洗稿
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(random.uniform(0.995, 1.005))
            
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(random.uniform(0.995, 1.005))
            
            orig_w, orig_h = img.size
            resized = img.resize((orig_w - 1, orig_h - 1), Image.Resampling.LANCZOS)
            img = resized.resize((orig_w, orig_h), Image.Resampling.LANCZOS)
            
            out_buffer = io.BytesIO()
            quality = random.randint(94, 97)
            img.save(out_buffer, format="JPEG", quality=quality)
            
            print(f"🛡️ [物理护盾激活] 内存图片字节流洗稿成功！")
            return out_buffer.getvalue()
        except Exception as e:
            print(f"⚠️ [护盾异常] 内存图片处理失败: {e}")
            return image_bytes


