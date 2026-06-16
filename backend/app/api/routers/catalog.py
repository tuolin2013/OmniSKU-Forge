from fastapi import APIRouter
from app.api.core.services.knowledge_base import product_db

router = APIRouter()

@router.get("/tree")
async def get_catalog_tree():
    """
    返回聚合的前端 Cascader 所需的树状类目及产品数据
    """
    tree_data = product_db.get_category_tree()
    return {"code": 200, "data": tree_data}
