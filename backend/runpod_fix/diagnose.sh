#!/bin/bash
# 在 RunPod pod 终端执行，诊断模型加载状态和服务日志
# 用法: bash diagnose.sh

echo "========= 服务进程 ========="
ps aux | grep uvicorn || echo "uvicorn 未运行"

echo ""
echo "========= 最近日志 (最后 100 行) ========="
tail -n 100 /tmp/ltx_service.log 2>/dev/null || echo "日志文件不存在，尝试其他路径..."
find /workspace -name "*.log" 2>/dev/null | head -5

echo ""
echo "========= 直接调用 Python 检查 pipeline ========="
cd /workspace/ltx_video_service 2>/dev/null || cd /workspace
python3 - << 'PYEOF'
import sys, os
sys.path.insert(0, '.')

try:
    from services.engine import get_pipeline, _pipeline_t2v, _pipeline_i2v
    print(f"T2V pipeline: {_pipeline_t2v}")
    print(f"I2V pipeline: {_pipeline_i2v}")
    if _pipeline_t2v is None:
        print("❌ T2V pipeline 为 None，模型未加载成功！")
    else:
        print("✅ T2V pipeline 已加载")
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"Exception: {e}")
PYEOF

echo ""
echo "========= GPU 状态 ========="
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader 2>/dev/null || echo "nvidia-smi 不可用"

echo ""
echo "========= 模型文件检查 ========="
# 检查 HuggingFace 缓存是否有 LTX 模型
find ~/.cache/huggingface -name "config.json" 2>/dev/null | grep -i "ltx\|lightricks" | head -5 || echo "未找到 LTX 模型缓存"
