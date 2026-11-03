"""ElectroCat local web service. Start with: python app.py"""

import argparse
import json
import mimetypes
import os
import re
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from electrocat.data import TEMPLATES
from electrocat.lookup import autofill
from electrocat.store import Inventory

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"


def create_handler(inventory):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ElectroCat/1.0"

        def _respond(self, payload, code=200, content_type="application/json; charset=utf-8",
                     filename=None):
            body = (json.dumps(payload, ensure_ascii=False).encode("utf-8")
                    if isinstance(payload, (dict, list)) else payload)
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if filename:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self):
            if not self.headers.get("Content-Type", "").startswith("application/json"):
                raise ValueError("Expected application/json")
            if int(self.headers.get("Content-Length", "0")) > 150000:
                raise ValueError("Request too large")
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
            return data

        def _host_valid(self):
            host = self.headers.get("Host", "").split(":")[0].lower()
            return host in {"127.0.0.1", "localhost", "[::1]"}

        def _origin_valid(self):
            origin = self.headers.get("Origin", "")
            return not origin or origin.startswith(("http://127.0.0.1:", "http://localhost:",
                                                    "chrome-extension://"))

        def _route(self):
            try:
                if not self._host_valid():
                    return self._respond({"error": "Invalid host"}, 403)
                if self.command != "GET" and not self._origin_valid():
                    return self._respond({"error": "Invalid origin"}, 403)
                path = urlparse(self.path).path
                if path == "/api/health" and self.command == "GET":
                    return self._respond({"ok": True, "data_folder": str(inventory.folder)})
                if path == "/api/templates" and self.command == "GET":
                    return self._respond(TEMPLATES)
                if path == "/api/entries" and self.command == "GET":
                    return self._respond(inventory.list())
                if path == "/api/entries" and self.command == "POST":
                    return self._respond(inventory.add(self._read_json()), 201)
                if path == "/api/autofill" and self.command == "POST":
                    data = self._read_json()
                    return self._respond(autofill(data.get("name", ""), data.get("source_url", ""),
                                                  bool(data.get("use_ai")), data.get("title", "")))
                if path == "/api/capture" and self.command == "POST":
                    data = self._read_json()
                    draft = autofill(data.get("name") or data.get("title", ""), data.get("url", ""),
                                     bool(data.get("use_ai")), data.get("title", ""))
                    entry = inventory.add(draft["entry"])
                    return self._respond({"entry": entry, "warnings": draft["warnings"]}, 201)
                match = re.fullmatch(r"/api/entries/(\d+)", path)
                if match:
                    id_ = int(match.group(1))
                    if self.command == "GET":
                        return self._respond(inventory.get(id_))
                    if self.command == "PATCH":
                        return self._respond(inventory.update(id_, self._read_json()))
                    if self.command == "DELETE":
                        inventory.delete(id_)
                        return self._respond({"deleted": id_})
                if path == "/api/export.xlsx" and self.command == "GET":
                    saved = inventory.folder / "ElectroCat_inventory.xlsx"
                    return self._respond(saved.read_bytes(), content_type=
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        filename="ElectroCat_inventory.xlsx")
                if self.command == "GET":
                    clean = path.lstrip("/") or "index.html"
                    file_path = (WEB / clean).resolve()
                    if file_path.is_file() and file_path.is_relative_to(WEB):
                        mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
                        return self._respond(file_path.read_bytes(), content_type=mime)
                return self._respond({"error": "Not found"}, 404)
            except (ValueError, KeyError) as exc:
                return self._respond({"error": str(exc)}, 400 if isinstance(exc, ValueError) else 404)
            except Exception as exc:
                print("ElectroCat error:", exc)
                return self._respond({"error": "Internal server error"}, 500)

        do_GET = _route
        do_POST = _route
        do_PATCH = _route
        do_DELETE = _route

        def log_message(self, format, *args):
            if not self.path.startswith("/api/health"):
                super().log_message(format, *args)

    return Handler


def run(port=8765, folder=None, no_browser=False):
    inventory = Inventory(folder)
    server = ThreadingHTTPServer(("127.0.0.1", port), create_handler(inventory))
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"ElectroCat running at {url}")
    print(f"Inventory and automatic Excel backups: {inventory.folder}")
    if not no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local electronics catalog and 384px label maker")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", default=os.getenv("ELECTROCAT_DATA_DIR"))
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    run(args.port, args.data_dir, args.no_browser)
