import requests

api_key = "ark-2f1c0042-2c28-4830-b582-705fc49f7860-d425c"
url = "https://ark.cn-beijing.volces.com/api/v3/models"
headers = {
    "Authorization": f"Bearer {api_key}"
}

response = requests.get(url, headers=headers)
print("status_code:", response.status_code)
data = response.json()
for model in data.get("data", []):
    print(f"ID: {model['id']}, Name: {model['name']}")
