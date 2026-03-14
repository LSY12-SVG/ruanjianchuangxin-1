from PIL import Image
import base64
import json

# 生成一个简单的测试图片（至少28x28像素）
img = Image.new('RGB', (448, 448), color=(128, 128, 128))
img.save('test_image.png')

# 转换为base64
with open('test_image.png', 'rb') as f:
    img_data = f.read()
    img_base64 = base64.b64encode(img_data).decode('utf-8')

# 创建测试请求
test_request = {
    "mode": "initial_visual_suggest",
    "transcript": "",
    "currentParams": {
        "exposure": 0,
        "contrast": 0,
        "highlights": 0,
        "shadows": 0,
        "saturation": 0,
        "temperature": 0,
        "tint": 0
    },
    "locale": "zh-CN",
    "image": {
        "mimeType": "image/png",
        "width": 448,
        "height": 448,
        "base64": img_base64
    },
    "imageStats": {
        "lumaMean": 0.5,
        "lumaStd": 0.2,
        "highlightClipPct": 0.05,
        "shadowClipPct": 0.05,
        "saturationMean": 0.6
    },
    "sceneHints": ["test"]
}

# 保存测试请求
with open('test_request.json', 'w', encoding='utf-8') as f:
    json.dump(test_request, f, ensure_ascii=False, indent=2)

print("测试请求已生成：test_request.json")
print(f"图片尺寸：448x448")
print(f"Base64长度：{len(img_base64)}")