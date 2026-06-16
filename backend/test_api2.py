import requests

res = requests.post(
    'http://127.0.0.1:8000/api/v1/agents/pm-analyze',
    json={'platform':'pinduoduo','text_desc':'test','image_urls':[]},
    stream=True
)

print(res.status_code)
for line in res.iter_lines():
    if line:
        print(line.decode('utf-8'))
