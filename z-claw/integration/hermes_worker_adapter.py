#!/usr/bin/env python3
"""OpenAI-compatible adapter that routes OpenClaw worker calls to Hermes profiles."""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = os.environ.get("HERMES_WORKER_ADAPTER_HOST", "127.0.0.1")
PORT = int(os.environ.get("HERMES_WORKER_ADAPTER_PORT", "18981"))
HERMES = os.environ.get("HERMES_BIN", "/home/z/.local/bin/hermes")
LOG_PATH = Path(os.environ.get("HERMES_WORKER_ADAPTER_LOG", "/home/z/Claw/integration/hermes_worker_adapter.log"))
STATE_DIR = Path(os.environ.get("HERMES_WORKER_ADAPTER_STATE", "/home/z/Claw/integration/hermes_worker_adapter_state"))

MODEL_TO_PROFILE = {
    "main": "default",
    "planner": "zplanner",
    "builder": "zbuilder",
    "researcher": "zresearcher",
    "reporter": "zreporter",
    "qa-tester": "zqa",
}

PROFILE_NAMES = {
    "default": "Zayne Clawson",
    "zplanner": "Eleanor Brooks",
    "zbuilder": "Owen Carter",
    "zresearcher": "Clara Whitfield",
    "zreporter": "Nathan Reed",
    "zqa": "Maya Bennett",
}

HERMES_HOME = Path(os.environ.get("HERMES_HOME", "/home/z/.hermes"))
Z_CLAW_ROOT = Path(os.environ.get("Z_CLAW_ROOT", "/home/z/Claw"))
Z_CLAW_ORGANIZATION_PATH = Path(
    os.environ.get("Z_CLAW_ORGANIZATION_PATH", str(Z_CLAW_ROOT / "integration" / "zclaw_organization.json"))
)


def load_registry_agents() -> list[dict[str, Any]]:
    try:
        body = json.loads(Z_CLAW_ORGANIZATION_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    agents = body.get("agents") if isinstance(body, dict) else None
    return [agent for agent in agents if isinstance(agent, dict)] if isinstance(agents, list) else []


def model_profile_map() -> dict[str, str]:
    mapped = dict(MODEL_TO_PROFILE)
    for agent in load_registry_agents():
        agent_id = str(agent.get("id", "")).strip()
        profile = str(agent.get("hermesProfile", "")).strip()
        if agent_id and profile:
            mapped[agent_id] = profile
    return mapped


def profile_name_map() -> dict[str, str]:
    mapped = dict(PROFILE_NAMES)
    for agent in load_registry_agents():
        profile = str(agent.get("hermesProfile", "")).strip()
        name = str(agent.get("name", "")).strip()
        if profile and name:
            mapped[profile] = name
    return mapped


def model_metadata() -> list[dict[str, Any]]:
    return [
        {"id": model, "object": "model", "created": 0, "owned_by": "hermes"}
        for model in model_profile_map()
    ]


def log(event: dict[str, Any]) -> None:
    event = {"ts": time.time(), **event}
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def normalize_model(model: str) -> str:
    if "/" in model:
        model = model.split("/", 1)[1]
    return model


def content_to_text(content: Any) -> str:
    if isinstance(content, list):
        chunks = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    chunks.append(str(item.get("text", "")))
                elif "text" in item:
                    chunks.append(str(item.get("text", "")))
            elif item is not None:
                chunks.append(str(item))
        return "\n".join(chunks)
    return "" if content is None else str(content)


def messages_to_prompt(messages: list[dict[str, Any]]) -> str:
    latest_user = ""
    for msg in messages:
        if str(msg.get("role", "user")) == "user":
            text = content_to_text(msg.get("content", "")).strip()
            if text:
                latest_user = text

    if not latest_user:
        latest_user = "\n\n".join(
            content_to_text(msg.get("content", "")).strip()
            for msg in messages
            if content_to_text(msg.get("content", "")).strip()
        )

    return (
        "You are being invoked as a Hermes worker through OpenClaw. "
        "Use your Hermes profile, SOUL, memory, skills, and tools. "
        "Return only the worker result requested by the user task.\n\n"
        f"USER_TASK:\n{latest_user.strip()}"
    )


def profile_home(profile: str) -> Path:
    if profile == "default":
        return HERMES_HOME
    return HERMES_HOME / "profiles" / profile


def discover_latest_session_id(profile: str) -> str | None:
    sessions_dir = profile_home(profile) / "sessions"
    if not sessions_dir.exists():
        return None
    files = sorted(sessions_dir.glob("session_*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not files:
        return None
    stem = files[0].stem
    if not stem.startswith("session_"):
        return None
    return stem.removeprefix("session_")


def session_file_for_profile(profile: str) -> Path:
    return STATE_DIR / f"{profile}.session"


def read_adapter_session_id(profile: str) -> str | None:
    session_file = session_file_for_profile(profile)
    if not session_file.exists():
        return None
    session_id = session_file.read_text(encoding="utf-8").strip()
    return session_id or None


def profile_session_stats(profile: str) -> dict[str, Any]:
    sessions_dir = profile_home(profile) / "sessions"
    if not sessions_dir.exists():
        return {"count": 0, "latestSessionId": None, "latestSessionMtime": None}
    files = sorted(sessions_dir.glob("session_*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    latest = files[0] if files else None
    latest_id = latest.stem.removeprefix("session_") if latest and latest.stem.startswith("session_") else None
    latest_mtime = latest.stat().st_mtime if latest else None
    return {"count": len(files), "latestSessionId": latest_id, "latestSessionMtime": latest_mtime}


def profile_metrics(profile: str) -> dict[str, Any]:
    db_path = profile_home(profile) / "state.db"
    if not db_path.exists():
        return {
            "databaseExists": False,
            "sessions": 0,
            "messages": 0,
            "toolCalls": 0,
            "inputTokens": 0,
            "outputTokens": 0,
            "reasoningTokens": 0,
            "cacheReadTokens": 0,
            "cacheWriteTokens": 0,
            "estimatedCostUsd": 0.0,
            "actualCostUsd": 0.0,
            "models": [],
            "billingProviders": [],
            "lastStartedAt": None,
            "lastEndedAt": None,
        }
    uri = f"file:{db_path}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True, timeout=1.0)
        con.row_factory = sqlite3.Row
        totals = con.execute(
            """
            select
              count(*) as sessions,
              coalesce(sum(message_count), 0) as messages,
              coalesce(sum(tool_call_count), 0) as tool_calls,
              coalesce(sum(input_tokens), 0) as input_tokens,
              coalesce(sum(output_tokens), 0) as output_tokens,
              coalesce(sum(reasoning_tokens), 0) as reasoning_tokens,
              coalesce(sum(cache_read_tokens), 0) as cache_read_tokens,
              coalesce(sum(cache_write_tokens), 0) as cache_write_tokens,
              coalesce(sum(estimated_cost_usd), 0) as estimated_cost_usd,
              coalesce(sum(actual_cost_usd), 0) as actual_cost_usd,
              max(started_at) as last_started_at,
              max(ended_at) as last_ended_at
            from sessions
            """
        ).fetchone()
        models = [
            row["model"]
            for row in con.execute(
                "select distinct model from sessions where model is not null and model != '' order by model"
            )
        ]
        billing_providers = [
            row["billing_provider"]
            for row in con.execute(
                """
                select distinct billing_provider
                from sessions
                where billing_provider is not null and billing_provider != ''
                order by billing_provider
                """
            )
        ]
        con.close()
    except sqlite3.Error as exc:
        return {"databaseExists": True, "error": str(exc)}
    return {
        "databaseExists": True,
        "sessions": int(totals["sessions"] or 0),
        "messages": int(totals["messages"] or 0),
        "toolCalls": int(totals["tool_calls"] or 0),
        "inputTokens": int(totals["input_tokens"] or 0),
        "outputTokens": int(totals["output_tokens"] or 0),
        "reasoningTokens": int(totals["reasoning_tokens"] or 0),
        "cacheReadTokens": int(totals["cache_read_tokens"] or 0),
        "cacheWriteTokens": int(totals["cache_write_tokens"] or 0),
        "estimatedCostUsd": float(totals["estimated_cost_usd"] or 0.0),
        "actualCostUsd": float(totals["actual_cost_usd"] or 0.0),
        "models": models,
        "billingProviders": billing_providers,
        "lastStartedAt": totals["last_started_at"],
        "lastEndedAt": totals["last_ended_at"],
    }


def adapter_log_stats(profile: str) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "lastInvokeAt": None,
        "lastCompleteAt": None,
        "lastErrorAt": None,
        "recentErrorCount": 0,
    }
    if not LOG_PATH.exists():
        return stats
    try:
        lines = LOG_PATH.read_text(encoding="utf-8").splitlines()[-500:]
    except OSError:
        return stats
    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("profile") != profile:
            continue
        ts = event.get("ts")
        if not isinstance(ts, (int, float)):
            continue
        match event.get("event"):
            case "invoke":
                stats["lastInvokeAt"] = ts
            case "complete":
                stats["lastCompleteAt"] = ts
            case "error":
                stats["lastErrorAt"] = ts
                stats["recentErrorCount"] += 1
    return stats


def adapter_status() -> dict[str, Any]:
    profiles = []
    names = profile_name_map()
    model_profiles = model_profile_map()
    for model, profile in model_profiles.items():
        session_file = session_file_for_profile(profile)
        sessions = profile_session_stats(profile)
        profiles.append({
            "model": model,
            "profile": profile,
            "name": names.get(profile, profile),
            "profileHomeExists": profile_home(profile).exists(),
            "sessionFileExists": session_file.exists(),
            "sessionId": read_adapter_session_id(profile),
            "sessions": sessions,
            "metrics": profile_metrics(profile),
            "log": adapter_log_stats(profile),
        })
    return {
        "ok": True,
        "adapter": "hermes-worker-adapter",
        "version": "0.2",
        "models": list(model_profiles),
        "profiles": profiles,
    }


def run_hermes(profile: str, prompt: str, model: str) -> str:
    session_file = session_file_for_profile(profile)
    resume_session_id = None
    cmd = [
        HERMES,
        "--profile",
        profile,
        "chat",
        "--quiet",
        "--source",
        "openclaw-hermes-adapter",
        "--max-turns",
        os.environ.get("HERMES_WORKER_MAX_TURNS", "60"),
        "--query",
        prompt,
    ]
    if session_file.exists():
        session_id = session_file.read_text(encoding="utf-8").strip()
        if session_id:
            resume_session_id = session_id
            cmd.extend(["--resume", session_id])
    started = time.time()
    log({"event": "invoke", "profile": profile, "model": model, "resume_session_id": resume_session_id})
    proc = subprocess.run(
        cmd,
        cwd="/home/z",
        text=True,
        capture_output=True,
        timeout=int(os.environ.get("HERMES_WORKER_TIMEOUT", "900")),
    )
    elapsed = time.time() - started
    if proc.returncode != 0:
        log({
            "event": "error",
            "profile": profile,
            "model": model,
            "returncode": proc.returncode,
            "stderr": proc.stderr[-4000:],
            "elapsed": elapsed,
        })
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"Hermes exited {proc.returncode}")
    output = proc.stdout.strip()
    content, session_id = split_session_id(output)
    if not session_id:
        session_id = discover_latest_session_id(profile)
    if session_id:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        session_file.write_text(session_id + "\n", encoding="utf-8")
    log({
        "event": "complete",
        "profile": profile,
        "model": model,
        "elapsed": elapsed,
        "chars": len(content),
        "session_id": session_id,
        "resumed_session_id": resume_session_id,
    })
    return content


def split_session_id(output: str) -> tuple[str, str | None]:
    lines = output.splitlines()
    session_id: str | None = None
    kept: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("session_id:"):
            session_id = stripped.split(":", 1)[1].strip()
            continue
        if stripped.startswith("↻ Resumed session "):
            continue
        kept.append(line)
    return "\n".join(kept).strip(), session_id


class Handler(BaseHTTPRequestHandler):
    server_version = "HermesWorkerAdapter/0.1"

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/v1/models" or self.path.rstrip("/") == "/models":
            self._send_json(200, {"object": "list", "data": model_metadata()})
            return
        if self.path.rstrip("/") in {"", "/health", "/v1/health"}:
            self._send_json(200, adapter_status())
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            if self.path.rstrip("/") in {"/v1/chat/completions", "/chat/completions"}:
                self._handle_chat()
                return
            if self.path.rstrip("/") in {"/v1/completions", "/completions"}:
                self._handle_completion()
                return
            self._send_json(404, {"error": "not found"})
        except Exception as exc:
            self._send_json(500, {"error": {"message": str(exc), "type": "adapter_error"}})

    def _handle_chat(self) -> None:
        req = self._read_json()
        model = normalize_model(str(req.get("model", "")))
        profile = model_profile_map().get(model)
        if not profile:
            self._send_json(400, {"error": {"message": f"unknown model/profile: {model}"}})
            return
        prompt = messages_to_prompt(req.get("messages", []))
        content = run_hermes(profile, prompt, model)
        if req.get("stream"):
            self._send_stream(model, content)
            return
        self._send_json(200, chat_response(model, content))

    def _handle_completion(self) -> None:
        req = self._read_json()
        model = normalize_model(str(req.get("model", "")))
        profile = model_profile_map().get(model)
        if not profile:
            self._send_json(400, {"error": {"message": f"unknown model/profile: {model}"}})
            return
        prompt = str(req.get("prompt", ""))
        content = run_hermes(profile, prompt, model)
        self._send_json(200, completion_response(model, content))

    def _send_stream(self, model: str, content: str) -> None:
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.end_headers()
        chunk = {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
        }
        self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
        done = {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        self.wfile.write(f"data: {json.dumps(done)}\n\n".encode("utf-8"))
        self.wfile.write(b"data: [DONE]\n\n")


def chat_response(model: str, content: str) -> dict[str, Any]:
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def completion_response(model: str, content: str) -> dict[str, Any]:
    return {
        "id": f"cmpl-{uuid.uuid4().hex}",
        "object": "text_completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "text": content, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log({"event": "start", "host": HOST, "port": PORT})
    print(f"Hermes worker adapter listening on http://{HOST}:{PORT}/v1", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
