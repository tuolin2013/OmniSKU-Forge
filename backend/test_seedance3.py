from volcenginesdkarkruntime import Ark

client = Ark(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key="ark-2f1c0042-2c28-4830-b582-705fc49f7860-d425c"
)

# Non-streaming:
print("----- standard request -----")
completion = client.chat.completions.create(
    model="ep-20250215181654-qdtq8",
    messages=[
        {"role": "system", "content": "你是豆包，是由字节跳动开发的 AI 人工智能助手"},
        {"role": "user", "content": "常见的十字花科植物有哪些？"},
    ],
)
print(completion.choices[0].message.content)
