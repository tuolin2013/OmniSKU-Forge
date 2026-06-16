import requests

url = "https://www.right.codes/codex/v1/chat/completions"
res = requests.post(
    url,
    json={"model": "gpt-4o", "messages": [{"role":"user", "content":"hello"}]},
    headers={"Authorization": "Bearer sk-7cfa82e6f0d94f9d927628f3b9359fe8", "Content-Type": "application/json"}
)
print(url, res.status_code, res.text)
