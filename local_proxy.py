import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse

app = FastAPI()

# 👇 在这里填入你那个中转商的真实接口地址（不要带 /v1，结尾不要带 /）
TARGET_API = "https://www.right.codes/claude-aws"

@app.api_route("/{path:path}", methods=["GET", "POST", "OPTIONS"])
async def proxy(request: Request, path: str):
    # 1. 秒杀跨域预检，安抚 Cline
    if request.method == "OPTIONS":
        return Response(headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*"
        })

    body = await request.body()
    
    # 2. 继承 Cline 的原始请求头（比如 API Key）
    headers = dict(request.headers)
    
    # 3. 核心大招：强行伪装成官方命令行工具
    headers["user-agent"] = "@anthropic-ai/claude-code/0.2.29"
    headers["x-api-client"] = "claude-code"
    
    # 4. 去除可能暴露本地环境的脏数据
    headers.pop("host", None)
    headers.pop("content-length", None)
    headers.pop("origin", None)
    headers.pop("referer", None)

    # 5. 组装目标地址并流式转发（保证代码能像打字机一样吐出来）
    url = f"{TARGET_API}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    async def stream_response():
        async with httpx.AsyncClient(timeout=120.0) as client:
            req = client.build_request(request.method, url, headers=headers, content=body)
            async with client.stream(req.method, req.url, headers=req.headers, content=req.content) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream_response())

if __name__ == "__main__":
    print(f"🚀 本地洗白代理已启动！请将 Cline 的 Base URL 改为: http://127.0.0.1:8964")
    uvicorn.run(app, host="127.0.0.1", port=8964, log_level="warning")