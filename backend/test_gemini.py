import asyncio
from app.main import app, ProductInput
from fastapi.testclient import TestClient

client = TestClient(app)

data = {
    "platform": "pinduoduo",
    "sku_name": "猫静宝",
    "text_desc": "测试",
    "image_urls": [],
    "model": "gemini-3.5-flash"
}

with client.stream("POST", "/api/v1/agents/pm-analyze", json=data) as response:
    print(f"Status Code: {response.status_code}")
    if response.status_code == 500:
        print("Response:", response.text)
    else:
        for chunk in response.iter_bytes():
            print(chunk.decode())
