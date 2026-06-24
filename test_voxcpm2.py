import urllib.request
import urllib.parse
import urllib.error
import http.client
import socket

BASE = "https://tuolin2011--voxcpm2-api-factory-voxcpm2service-api-endpoint.modal.run"

def check_get(path, timeout=30):
    url = BASE + path
    print(f"GET {url}")
    try:
        r = urllib.request.urlopen(url, timeout=timeout)
        data = r.read()
        print(f"  -> HTTP {r.status}  {r.headers.get('Content-Type','')}  {len(data)} bytes")
        return True
    except urllib.error.HTTPError as e:
        print(f"  -> HTTP {e.code} {e.reason}: {e.read()[:300].decode('utf-8','replace')}")
        return False
    except urllib.error.URLError as e:
        print(f"  -> URLError: {e.reason}")
        return False
    except socket.timeout:
        print(f"  -> Timed out after {timeout}s")
        return False
    except Exception as e:
        print(f"  -> {type(e).__name__}: {e}")
        return False

# 1. Check /docs (GET, no GPU needed, just routing)
check_get("/docs", timeout=15)

# 2. Check /openapi.json 
check_get("/openapi.json", timeout=15)

# 3. Try the actual POST with long timeout
# VoxCPM2 requires the natural-language voice prompt format:
# "(voice description)spoken text"
params = urllib.parse.urlencode({
    "text": "(声音甜美，语速正常)张家界高山莓茶，纯天然好物！",
    "cfg_value": "2.0",
    "timesteps": "5",
})
url = f"{BASE}?{params}"
print(f"\nPOST {url}")
req = urllib.request.Request(url, method="POST")
try:
    print("Sending POST (timeout=300s)...")
    resp = urllib.request.urlopen(req, timeout=300)
    data = resp.read()
    ct = resp.headers.get("Content-Type", "unknown")
    print(f"HTTP {resp.status}  Content-Type: {ct}  Size: {len(data)} bytes")
    with open("test_voxcpm2.wav", "wb") as f:
        f.write(data)
    print("Saved to test_voxcpm2.wav")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", errors="replace")
    print(f"HTTP Error {e.code}: {e.reason}")
    print(body[:1000])
except Exception as e:
    print(f"{type(e).__name__}: {e}")
