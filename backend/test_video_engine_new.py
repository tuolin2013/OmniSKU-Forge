import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.api.core.services.video_engine import generate_video

if __name__ == "__main__":
    prompt = "A cute cat playing with a ball of yarn, high quality, 4k"
    print(f"Testing video generation with prompt: {prompt}")
    result = generate_video(prompt)
    print(f"Result: {result}")
