from pydantic import BaseModel, Field
from typing import List

class ProductGenerateRequest(BaseModel):
    product_name: str = Field(..., description="产品名称，例如：辰荣贝康 感克消")
    ingredients: str = Field(..., description="核心成分")
    pain_points: str = Field(..., description="解决的核心痛点")
    target_platform: str = Field(default="taobao", description="目标平台")

class AIProductCopywriting(BaseModel):
    title: str = Field(..., max_length=60, description="电商高转化标题，包含品牌和痛点，符合平台规范")
    sub_title: str = Field(..., max_length=150, description="促销短语或卖点提炼")
    selling_points: List[str] = Field(..., min_items=3, max_items=5, description="核心卖点数组，用于详情页排版")
    image_prompts: List[str] = Field(..., description="为该产品生成的5个用于AI绘画的英文场景Prompt")

class ProductGenerateResponse(BaseModel):
    status: str
    data: AIProductCopywriting