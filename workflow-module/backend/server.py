from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "frontend"
DB = ROOT / "workflow.db"


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            description TEXT DEFAULT '', domain TEXT DEFAULT '', status TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1, graph TEXT NOT NULL, settings TEXT NOT NULL,
            owner TEXT DEFAULT 'You', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0
        )""")
        row = db.execute("SELECT * FROM workflows WHERE deleted=0 ORDER BY updated_at DESC LIMIT 1").fetchone()
        if row and row["name"] == "Customer Support Triage":
            db.execute("UPDATE workflows SET name=?, description=?, domain='', updated_at=? WHERE id=?", ("Workflow", "Routes requests to active experts and uses the LLM fallback when no expert matches.", now(), row["id"]))
            row = db.execute("SELECT * FROM workflows WHERE id=?", (row["id"],)).fetchone()
        if not row:
            stamp = now()
            db.execute("INSERT INTO workflows(id,name,description,domain,status,graph,settings,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), "Workflow", "Routes requests to active experts and uses the LLM fallback when no expert matches.", "", "Draft", json.dumps(default_graph()), json.dumps(default_settings()), stamp, stamp))
def row_data(row):
    item = dict(row)
    item["graph"] = json.loads(item["graph"])
    item["settings"] = json.loads(item["settings"])
    return item


def default_graph():
    specs = [
        ("request", "Request", 45, 300, "Input trigger"),
        ("orchestrator", "ORK Orchestrator", 250, 260, "Integration pending"),
        ("registry", "Expert registry", 265, 515, "Capabilities · availability"),
        ("expert", "Expert 1", 650, 105, "Integration pending"),
        ("expert", "Expert 2", 650, 215, "Integration pending"),
        ("escalation", "Larger model fallback", 650, 575, "Only when confidence is low"),
        ("aggregator", "Aggregator", 1040, 275, "Checks · combines · responds"),
        ("response", "Response", 1340, 285, "Final answer"),
    ]
    nodes = [{"id": str(uuid.uuid4()), "type": t, "label": label, "x": x, "y": y, "summary": summary, "config": {}} for t, label, x, y, summary in specs]
    by_type = {}
    for node in nodes:
        by_type.setdefault(node["type"], []).append(node)
    edges = []
    def link(source, target):
        edges.append({"id": str(uuid.uuid4()), "source": source["id"], "target": target["id"], "label": ""})
    link(by_type["request"][0], by_type["orchestrator"][0])
    link(by_type["registry"][0], by_type["orchestrator"][0])
    for expert in by_type["expert"]:
        link(by_type["orchestrator"][0], expert)
        link(expert, by_type["aggregator"][0])
    link(by_type["orchestrator"][0], by_type["escalation"][0])
    link(by_type["escalation"][0], by_type["aggregator"][0])
    link(by_type["aggregator"][0], by_type["response"][0])
    return {"nodes": nodes, "edges": edges}
def default_settings():
    return {
        "orchestrator": {"mode": "parallel", "timeout": 30, "retries": 2, "max_experts": 3},
        "router": {"type": "semantic", "confidence": 0.70, "top_k": 2, "rules": []},
        "aggregator": {"method": "highest_confidence", "answer_threshold": 0.75, "min_agreeing": 1, "conflict": "highest_weight"},
        "response": {"format": "markdown", "include_sources": True, "include_experts": False, "include_confidence": False, "fallback": "I couldn't find a confident answer. Please rephrase.", "max_length": 2000},
        "escalation": {"provider": "", "model": "", "system_prompt": "Answer carefully. Say when you are unsure.", "temperature": 0.3, "max_tokens": 1000, "timeout": 30, "label": True},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "WorkflowModule/0.1"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, code, value):
        data = json.dumps(value).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "integrations": {"orchestrator": "not_connected", "experts": "not_connected"}})
        if path == "/api/workflows":
            with connect() as db:
                rows = db.execute("SELECT * FROM workflows WHERE deleted=0 ORDER BY updated_at DESC").fetchall()
            return self.send_json(200, [row_data(r) for r in rows])
        if path.startswith("/api/workflows/"):
            wid = path.rsplit("/", 1)[-1]
            with connect() as db:
                row = db.execute("SELECT * FROM workflows WHERE id=? AND deleted=0", (wid,)).fetchone()
            if not row:
                return self.send_json(404, {"error": "Workflow not found"})
            return self.send_json(200, row_data(row))
        if path.startswith("/api/registry/") or path == "/api/experts":
            return self.send_json(200, {"items": [], "available": False, "message": "This module is an integration placeholder. Connect the Orchestrator or Experts module when it becomes available."})
        return self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        payload = self.body()
        if path == "/api/workflows":
            name = str(payload.get("name", "")).strip()
            if not 3 <= len(name) <= 60:
                return self.send_json(400, {"error": "Name must be between 3 and 60 characters."})
            wid, stamp = str(uuid.uuid4()), now()
            with connect() as db:
                existing = db.execute("SELECT id FROM workflows WHERE deleted=0 LIMIT 1").fetchone()
                if existing:
                    return self.send_json(409, {"error": "This workspace has one workflow. Open and edit the existing workflow instead."})
                try:
                    db.execute("INSERT INTO workflows(id,name,description,domain,status,graph,settings,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", (wid, name, payload.get("description", ""), payload.get("domain", ""), "Draft", json.dumps(default_graph()), json.dumps(default_settings()), stamp, stamp))
                except sqlite3.IntegrityError:
                    return self.send_json(409, {"error": "A workflow with this name already exists."})
                row = db.execute("SELECT * FROM workflows WHERE id=?", (wid,)).fetchone()
            return self.send_json(201, row_data(row))
        if path.startswith("/api/workflows/") and path.endswith("/test"):
            wid = path.split("/")[3]
            with connect() as db:
                row = db.execute("SELECT * FROM workflows WHERE id=? AND deleted=0", (wid,)).fetchone()
            if not row:
                return self.send_json(404, {"error": "Workflow not found"})
            return self.send_json(200, {"mode": "simulation", "passed": False, "message": "Run preview only. Orchestrator and Experts integrations are not connected, so no model was called.", "trace": [{"step": "Request", "status": "ready"}, {"step": "Orchestrator", "status": "waiting_for_integration"}, {"step": "Experts", "status": "waiting_for_integration"}], "prompt": payload.get("prompt", "")})
        return self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        path = urlparse(self.path).path
        bits = path.strip("/").split("/")
        if len(bits) != 3 or bits[0] != "api" or bits[1] != "workflows":
            return self.send_json(404, {"error": "Not found"})
        wid, payload = bits[2], self.body()
        with connect() as db:
            old = db.execute("SELECT * FROM workflows WHERE id=? AND deleted=0", (wid,)).fetchone()
            if not old:
                return self.send_json(404, {"error": "Workflow not found"})
            status = payload.get("status", old["status"])
            allowed = {"Draft", "Published", "Deactivated", "Warning"}
            if status not in allowed:
                return self.send_json(400, {"error": "Invalid status."})
            db.execute("UPDATE workflows SET name=?,description=?,domain=?,status=?,graph=?,settings=?,updated_at=? WHERE id=?", (payload.get("name", old["name"]), payload.get("description", old["description"]), payload.get("domain", old["domain"]), status, json.dumps(payload.get("graph", json.loads(old["graph"]))), json.dumps(payload.get("settings", json.loads(old["settings"]))), now(), wid))
            row = db.execute("SELECT * FROM workflows WHERE id=?", (wid,)).fetchone()
        return self.send_json(200, row_data(row))

    def do_DELETE(self):
        path = urlparse(self.path).path
        wid = path.rsplit("/", 1)[-1]
        with connect() as db:
            row = db.execute("SELECT * FROM workflows WHERE id=? AND deleted=0", (wid,)).fetchone()
            if not row:
                return self.send_json(404, {"error": "Workflow not found"})
            if row["status"] == "Published":
                return self.send_json(409, {"error": "Deactivate a published workflow before deleting it."})
            db.execute("UPDATE workflows SET deleted=1, updated_at=? WHERE id=?", (now(), wid))
        return self.send_json(200, {"ok": True})

    def serve_static(self, path):
        if path == "/": path = "/index.html"
        target = (WEB / path.lstrip("/")).resolve()
        if WEB.resolve() not in target.parents and target != WEB.resolve():
            return self.send_json(403, {"error": "Forbidden"})
        if not target.is_file():
            return self.send_json(404, {"error": "Not found"})
        types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", types.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    init_db()
    print("Workflow Module running at http://127.0.0.1:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()






