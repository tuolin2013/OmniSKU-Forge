import requests

api_key = "ark-2f1c0042-2c28-4830-b582-705fc49f7860-d425c"
url = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
payload = {
    "model": "ep-20250228185038-f9mxc",  # Use a valid model ID (e.g. text generation) to see if chat completions works
    "messages": [
        {"role": "user", "content": "Hello"}
    ]
}

response = requests.post(url, headers=headers, json=payload)
print("status_code:", response.status_code)
print("text:", response.text)
