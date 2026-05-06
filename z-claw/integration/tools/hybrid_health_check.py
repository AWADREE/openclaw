#!/usr/bin/env python3
"""Check the local Z Claw OpenClaw/Hermes hybrid deployment."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


ADAPTER_HEALTH_URL = "http://127.0.0.1:18981/v1/health"


@dataclass
class CheckResult:
    ok: bool
    data: dict[str, Any]


def run_command(args: list[str], timeout: int = 30) -> CheckResult:
    try:
        proc = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    except Exception as exc:
        return CheckResult(False, {"error": str(exc), "args": args})
    return CheckResult(
        proc.returncode == 0,
        {
            "args": args,
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        },
    )


def fetch_json(url: str, timeout: int = 10) -> CheckResult:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            return CheckResult(True, json.loads(body))
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        return CheckResult(False, {"url": url, "error": str(exc)})


def parse_gateway_call(raw: str) -> dict[str, Any] | None:
    lines = raw.splitlines()
    for index, line in enumerate(lines):
        if line.strip().startswith("{"):
            payload = "\n".join(lines[index:])
            try:
                return json.loads(payload)
            except json.JSONDecodeError:
                return None
    return None


def parse_json(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def main() -> int:
    openclaw = shutil.which("openclaw") or "openclaw"
    version = run_command([openclaw, "--version"])
    gateway_status = run_command([openclaw, "gateway", "status", "--json"], timeout=60)
    gateway_status_json = parse_json(gateway_status.data.get("stdout", ""))
    gateway_rpc_ok = bool(
        gateway_status.ok
        and isinstance(gateway_status_json, dict)
        and isinstance(gateway_status_json.get("rpc"), dict)
        and gateway_status_json["rpc"].get("ok") is True
    )
    adapter_health = fetch_json(ADAPTER_HEALTH_URL)
    hybrid_status_raw = run_command([openclaw, "gateway", "call", "hybrid.status"], timeout=60)
    hybrid_status = parse_gateway_call(hybrid_status_raw.data.get("stdout", ""))

    providers = hybrid_status.get("providers", []) if isinstance(hybrid_status, dict) else []
    agents = hybrid_status.get("agents", []) if isinstance(hybrid_status, dict) else []
    hermes_provider_ok = any(
        provider.get("id") == "hermes-workers" and provider.get("reachable") is True
        for provider in providers
        if isinstance(provider, dict)
    )
    all_agents_hermes = bool(agents) and all(
        isinstance(agent, dict) and agent.get("hermesBacked") is True and agent.get("memoryOwner") == "hermes"
        for agent in agents
    )
    adapter_profiles = adapter_health.data.get("profiles", []) if adapter_health.ok else []
    expected_profiles = {"default", "zplanner", "zbuilder", "zresearcher", "zreporter", "zqa"}
    reported_profiles = {
        profile.get("profile")
        for profile in adapter_profiles
        if isinstance(profile, dict) and isinstance(profile.get("profile"), str)
    }
    profiles_ok = expected_profiles.issubset(reported_profiles)
    metrics_ok = bool(adapter_profiles) and all(
        isinstance(profile, dict)
        and isinstance(profile.get("metrics"), dict)
        and profile["metrics"].get("databaseExists") is True
        for profile in adapter_profiles
    )
    organization = hybrid_status.get("organization") if isinstance(hybrid_status, dict) else None
    org_companies = organization.get("companies") if isinstance(organization, dict) else None
    org_teams = organization.get("teams") if isinstance(organization, dict) else None
    organization_ok = (
        isinstance(organization, dict)
        and isinstance(org_companies, list)
        and isinstance(org_teams, list)
        and any(
            isinstance(company, dict) and company.get("id") == "software-studio"
            for company in org_companies
        )
        and any(
            isinstance(team, dict) and team.get("id") == "engineering"
            for team in org_teams
        )
    )
    runs = hybrid_status.get("runs") if isinstance(hybrid_status, dict) else None
    recent_runs = runs.get("recent") if isinstance(runs, dict) else None
    runs_ok = (
        isinstance(runs, dict)
        and isinstance(runs.get("root"), str)
        and isinstance(runs.get("total"), int)
        and isinstance(recent_runs, list)
    )

    summary = {
        "ok": all([
            version.ok,
            gateway_rpc_ok,
            adapter_health.ok,
            hybrid_status_raw.ok,
            isinstance(hybrid_status, dict),
            hermes_provider_ok,
            all_agents_hermes,
            profiles_ok,
            metrics_ok,
            organization_ok,
            runs_ok,
        ]),
        "checks": {
            "openclaw_version": version.ok,
            "gateway_status": gateway_rpc_ok,
            "adapter_health": adapter_health.ok,
            "hybrid_status_rpc": hybrid_status_raw.ok and isinstance(hybrid_status, dict),
            "hermes_provider_reachable": hermes_provider_ok,
            "all_agents_hermes_backed": all_agents_hermes,
            "expected_profiles_reported": profiles_ok,
            "hermes_profile_metrics_reported": metrics_ok,
            "zclaw_organization_reported": organization_ok,
            "zclaw_runs_reported": runs_ok,
        },
        "openclaw_version": version.data.get("stdout"),
        "agent_count": len(agents),
        "provider_count": len(providers),
        "adapter_profile_count": len(adapter_profiles) if isinstance(adapter_profiles, list) else 0,
        "details": {
            "gateway_status": gateway_status_json if gateway_status_json else gateway_status.data,
            "adapter_health": adapter_health.data,
            "hybrid_status": hybrid_status,
        },
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
