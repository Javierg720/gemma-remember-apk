from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import asyncio
import hashlib
import os

VOICE = "en-US-EmmaMultilingualNeural"

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        text = params.get("text", [""])[0]
        if not text:
            self.send_error(400, "Missing text")
            return

        try:
            import edge_tts
        except Exception as e:
            self.send_error(500, f"edge-tts not available: {e}")
            return

        out = f"/tmp/{hashlib.md5(text.encode()).hexdigest()}.mp3"
        if not os.path.exists(out):
            try:
                async def gen():
                    c = edge_tts.Communicate(text, VOICE)
                    await c.save(out)
                asyncio.run(gen())
            except Exception as e:
                self.send_error(500, f"TTS failed: {e}")
                return

        try:
            with open(out, "rb") as f:
                data = f.read()
        except Exception as e:
            self.send_error(500, f"Read failed: {e}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
