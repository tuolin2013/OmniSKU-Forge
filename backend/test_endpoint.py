import requests
import json

url = "http://127.0.0.1:8000/api/v1/agents/pm-analyze"
headers = {"Content-Type": "application/json"}
data = {
    "platform": "pinduoduo",
    "sku_name": "猫静宝",
    "text_desc": "测试",
    "image_urls": [],
    "model": "gpt-5.5"
}

try:
    response = requests.post(url, headers=headers, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {response.headers}")
    print(f"Response Body: {response.text[:500]}")
except Exception as e:
    print(f"Error: {e}")
