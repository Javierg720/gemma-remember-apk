#!/usr/bin/env python3
"""Combined static + Edge TTS server for Gemma Remember."""
import asyncio
import hashlib
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

CACHE_DIR = "/tmp/gemma-tts-cache"
VOICE = "en-US-EmmaMultilingualNeural"
os.makedirs(CACHE_DIR, exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/tts":
            self._handle_tts(parsed)
        elif parsed.path == "/clear.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b'<html><body><script>localStorage.clear();window.location.href="/";</script></body></html>')
        else:
            super().do_GET()

    def _handle_tts(self, parsed):
        params = parse_qs(parsed.query)
        text = params.get("text", [""])[0]
        if not text:
            self.send_error(400, "Missing text")
            return

        key = hashlib.md5(text.encode()).hexdigest()
        path = os.path.join(CACHE_DIR, f"{key}.mp3")

        if not os.path.exists(path):
            try:
                import edge_tts
                asyncio.run(self._gen(text, path))
            except Exception as e:
                self.send_error(500, str(e))
                return

        if os.path.exists(path):
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Cache-Control", "public, max-age=86400")
            with open(path, "rb") as f:
                data = f.read()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_error(500, "TTS failed")

    async def _gen(self, text, out):
        import edge_tts
        c = edge_tts.Communicate(text, VOICE)
        await c.save(out)

    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    s = HTTPServer(("", 3000), Handler)
    print("Gemma Remember: http://localhost:3000")
    s.serve_forever()
