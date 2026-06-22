"""
直接测试 RunPod 异步接口，拿到 task_id 后轮询，打印完整错误信息。
用法：python backend/test_runpod_async.py
"""
import requests, warnings, time
warnings.filterwarnings('ignore')

RUNPOD_URL = 'https://a2eo0ad3gvsn0n-8000.proxy.runpod.net'

payload = {
    'shots': [{
        'prompt': 'close-up of product on wooden table, cinematic lighting',
        'width': 704, 'height': 480,
        'num_frames': 25,
        'num_inference_steps': 5,
        'fps': 24,
        'fast': True,
        'background_style': 'gradient'
    }]
}

print('POST /api/v1/generate/storyboard/async ...')
r = requests.post(
    f'{RUNPOD_URL}/api/v1/generate/storyboard/async',
    json=payload, timeout=15, verify=False
)
print('提交状态:', r.status_code)
print('响应:', r.text[:400])

if r.status_code != 200:
    raise SystemExit('提交失败')

task_id = r.json().get('task_id')
print('task_id:', task_id)

for i in range(24):  # 最多轮询 2 分钟
    time.sleep(5)
    s = requests.get(f'{RUNPOD_URL}/api/v1/tasks/{task_id}', timeout=10, verify=False)
    d = s.json()
    status = d.get('status', '?')
    progress = d.get('progress', 0)
    error = d.get('error', '')
    print(f'  [{(i+1)*5:3d}s] status={status} progress={progress}% error={str(error)[:300]}')
    if status in ('done', 'failed'):
        break
else:
    print('超时，任务未完成')
