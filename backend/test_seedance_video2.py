import requests

api_key = "ark-2f1c0042-2c28-4830-b582-705fc49f7860-d425c"
url = "https://ark.cn-beijing.volces.com/api/v3/videos/generations"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
payload = {
    "model": "doubao-seedance-2-0-260128",
    "messages": [
        {"role": "user", "content": "A cat playing with a ball of yarn"}
    ]
}

response = requests.post(url, headers=headers, json=payload)
print("status_code:", response.status_code)
print("text:", response.text)
