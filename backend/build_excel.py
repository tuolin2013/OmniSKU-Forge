import os
import openpyxl

# 准备纯净数据
data = [
    ["sku_name", "target_pain_points", "dosage_instructions", "contraindications", "vitamin_A_D_E", "standard_code"],
    ["猫静宝", "适用于犬猫发情前期及发情期问题", "猫：每天2片。犬：每5公斤1片/天", "不得饲喂反刍动物", "A:20万 / D3:8千 / E:3千", "Q/HBCY 326-2025"],
    ["重重没", "改善犬猫营养丢失健康问题", "每5公斤1片/次 早晚各1次 连用7-14天；也可碾碎加沐浴液", "妊娠期禁用；不得饲喂反刍动物", "A:15万 / D3:1万 / E:5千", "Q/HBCY 322-2025"],
    ["护圣宝", "改善犬猫体液代谢健康营养问题", "每5公斤1片/次 早晚各1次 连用7-10天。长期每天1次", "不得饲喂反刍动物", "A:20万 / D3:8千 / E:4千", "Q/HBCY 325-2025"],
    ["护宫宝", "改善犬猫生殖营养健康问题", "每5公斤1片/次 早晚各1次 连用7-10天。分娩前后减半", "妊娠期禁用；不得饲喂反刍动物", "A:20万 / D3:1万 / E:5千", "Q/HBCY 324-2025"],
    ["感克消", "改善犬猫呼吸道健康营养问题", "每5公斤1片/次 早晚各1次 连用7-14天(严重时加倍)", "不得饲喂反刍动物", "A:15万 / D3:1万 / E:4千", "Q/HBCY 323-2025"],
    ["艾留平", "改善老年犬猫宠物生理健康问题", "每10公斤1片/次 早晚各1次 连用15-30天；长期每阶段间隔3天", "不得饲喂反刍动物", "A:15万 / D3:1万 / E:5千", "Q/HBCY 321-2025"]
]

# 确保 data 目录存在
os.makedirs("app/data", exist_ok=True)

# 创建并写入 Excel
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Products"

for row in data:
    ws.append(row)

# 强制输出绝对干净的 xlsx
output_path = "app/data/product_info.xlsx"
wb.save(output_path)
print(f"✅ 搞定！绝无乱码的表格已生成在：{output_path}")