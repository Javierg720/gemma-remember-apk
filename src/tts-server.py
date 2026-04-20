#!/usr/bin/env python3
"""Tiny Edge TTS server — serves audio for Gemma Remember web app."""
import asyncio
import hashlib
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import edge_tts

CACHE_DIR = "/tmp/gemma-tts-cache"
VOICE = "en-US-EmmaMultilingualNeural"
os.makedirs(CACHE_DIR, exist_ok=True)

class TTSHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/tts":
            params = parse_qs(parsed.query)
            text = params.get("text", [""])[0]
            if not text:
                self.send_error(400, "Missing text parameter")
                return

            # Check cache
            key = hashlib.md5(text.encode()).hexdigest()
            cache_path = os.path.join(CACHE_DIR, f"{key}.mp3")

            if not os.path.exists(cache_path):
                # Generate
                asyncio.run(self._generate(text, cache_path))

            if os.path.exists(cache_path):
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=86400")
                with open(cache_path, "rb") as f:
                    data = f.read()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_error(500, "TTS generation failed")
        else:
            # Serve static files
            super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.end_headers()

    async def _generate(self, text, output_path):
        try:
            communicate = edge_tts.Communicate(text, VOICE)
            await communicate.save(output_path)
        except Exception as e:
            print(f"TTS error: {e}", file=sys.stderr)

    def log_message(self, format, *args):
        pass  # Silence logs

if __name__ == "__main__":
    port = 3001
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(("", port), TTSHandler)
    print(f"TTS server on http://localhost:{port}/tts?text=hello")
    server.serve_forever()
