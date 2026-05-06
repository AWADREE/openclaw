import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import type {
  AgentsListResult,
  HybridStatusResult,
  SessionsListResult,
  SessionsUsageResult,
} from "../types.ts";
import { summarizeHybridState, type HybridAgentSummary, type HybridSummary } from "./hybrid.ts";

export type OfficeSpaceProps = {
  connected: boolean;
  agentsList: AgentsListResult | null;
  sessionsResult: SessionsListResult | null;
  usageResult: SessionsUsageResult | null;
  hybridResult: HybridStatusResult | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
};

type OfficeRoom = {
  id: string;
  name: string;
  mission: string | null;
  kind: "executive" | "team" | "common";
  agents: HybridAgentSummary[];
};

type OfficeActivity = "working" | "handoff" | "coffee" | "snack" | "nap" | "smoke" | "standby";

function latestRun(agent: HybridAgentSummary) {
  return agent.recentRuns[0] ?? null;
}

function stableIndex(value: string, modulo: number): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return modulo > 0 ? hash % modulo : 0;
}

function runProgress(agent: HybridAgentSummary): number | null {
  const run = latestRun(agent);
  if (!run) {
    return null;
  }
  const status = run.status.toLowerCase();
  if (status === "accepted") {
    return 100;
  }
  if (status === "verified") {
    return 90;
  }
  if (status === "reporting") {
    return 78;
  }
  if (status === "qa") {
    return 64;
  }
  if (status === "building") {
    return 45;
  }
  if (status === "planning") {
    return 24;
  }
  if (status === "blocked" || status === "rejected") {
    return 0;
  }
  return agent.status === "active" ? 35 : null;
}

function activityLabel(agent: HybridAgentSummary): string {
  const activity = agentActivity(agent);
  if (activity === "working") return "Working";
  if (activity === "handoff") return "Delivering";
  if (activity === "coffee") return "Coffee";
  if (activity === "snack") return "Snack";
  if (activity === "nap") return "Resting";
  if (activity === "smoke") return "Break";
  return "Standby";
}

function agentActivity(agent: HybridAgentSummary): OfficeActivity {
  if (agent.status === "active") {
    const run = latestRun(agent);
    if (run && run.agents.length > 1) {
      const index = run.agents.findIndex((entry) => entry.agent === agent.id);
      if (index >= 0 && index < run.agents.length - 1 && run.status.toLowerCase() !== "accepted") {
        return "handoff";
      }
    }
    return "working";
  }
  if (agent.status === "idle") {
    return (["coffee", "snack", "nap", "smoke"] as const)[stableIndex(agent.id, 4)];
  }
  return "standby";
}

function teamMission(summary: HybridSummary, teamId: string): string | null {
  return summary.organization?.teams.find((team) => team.id === teamId)?.mission ?? null;
}

function buildRooms(summary: HybridSummary): OfficeRoom[] {
  const byTeam = new Map<string, HybridAgentSummary[]>();
  const common: HybridAgentSummary[] = [];
  for (const agent of summary.agents) {
    if (agent.status === "active" && agent.teamId) {
      const existing = byTeam.get(agent.teamId) ?? [];
      existing.push(agent);
      byTeam.set(agent.teamId, existing);
    } else {
      common.push(agent);
    }
  }

  const teamIds = new Set<string>();
  for (const team of summary.organization?.teams ?? []) {
    teamIds.add(team.id);
  }
  for (const agent of summary.agents) {
    if (agent.teamId) {
      teamIds.add(agent.teamId);
    }
  }

  const rooms: OfficeRoom[] = [];
  for (const teamId of teamIds) {
    const agents = byTeam.get(teamId) ?? [];
    const team = summary.organization?.teams.find((entry) => entry.id === teamId);
    if (agents.length === 0 && teamId !== "executive") {
      continue;
    }
    rooms.push({
      id: teamId,
      name: team?.name ?? teamId,
      mission: team?.mission ?? null,
      kind: teamId === "executive" ? "executive" : "team",
      agents,
    });
  }

  rooms.push({
    id: "common",
    name: "Common Room",
    mission: "Idle and standby agents wait here until OpenClaw routes new work.",
    kind: "common",
    agents: common,
  });

  return rooms;
}

function renderAgentSprite(agent: HybridAgentSummary) {
  const progress = runProgress(agent);
  const run = latestRun(agent);
  const metrics = agent.profileTelemetry?.metrics;
  const hasRecentErrors = (agent.profileTelemetry?.log.recentErrorCount ?? 0) > 0;
  const activity = agentActivity(agent);
  const hue = 185 + stableIndex(agent.id, 95);
  return html`
    <details
      class="office-agent office-agent--${agent.status} office-agent--${activity}"
      style=${`--agent-hue: ${hue}`}
    >
      <summary class="office-agent__summary">
        <span class="office-agent__sprite" aria-hidden="true">
          <span class="office-agent__head"></span>
          <span class="office-agent__hair"></span>
          <span class="office-agent__body"></span>
          <span class="office-agent__arm office-agent__arm--left"></span>
          <span class="office-agent__arm office-agent__arm--right"></span>
          <span class="office-agent__prop"></span>
        </span>
        <span class="office-agent__main">
          <strong>${agent.name}</strong>
          <span>${agent.role ?? agent.id}</span>
        </span>
        <span class="office-agent__state">${activityLabel(agent)}</span>
      </summary>
      ${progress === null
        ? nothing
        : html`
            <div class="office-agent__progress" aria-label="Latest workflow progress">
              <span style=${`width: ${progress}%`}></span>
            </div>
          `}
      <dl class="office-agent__facts">
        <div>
          <dt>Profile</dt>
          <dd>${agent.hermesProfile ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Model route</dt>
          <dd>${agent.modelPrimary ?? "default"}</dd>
        </div>
        <div>
          <dt>Latest run</dt>
          <dd>${run ? `${run.taskId} · ${run.status}` : "none"}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>${agent.lastActiveAt ? formatRelativeTimestamp(agent.lastActiveAt) : "never"}</dd>
        </div>
        <div>
          <dt>Tool calls</dt>
          <dd>${metrics?.toolCalls ?? 0}</dd>
        </div>
        <div>
          <dt>Adapter errors</dt>
          <dd>${hasRecentErrors ? agent.profileTelemetry?.log.recentErrorCount : 0}</dd>
        </div>
      </dl>
    </details>
  `;
}

function renderRoom(room: OfficeRoom) {
  const workstations = Math.max(2, Math.min(5, room.agents.length || 2));
  return html`
    <section class="office-room office-room--${room.kind}">
      <div class="office-room__header">
        <div>
          <h3>${room.name}</h3>
          ${room.mission ? html`<p>${room.mission}</p>` : nothing}
        </div>
        <span>${room.agents.length}</span>
      </div>
      <div class="office-room__floor">
        <span class="office-room__wall" aria-hidden="true"></span>
        <span class="office-room__plant" aria-hidden="true"></span>
        ${room.kind === "common"
          ? html`
              <span class="office-room__sofa" aria-hidden="true"></span>
              <span class="office-room__table" aria-hidden="true"></span>
            `
          : Array.from({ length: workstations }, (_, index) => index).map(
              (index) =>
                html`<span
                  class="office-room__desk office-room__desk--${index + 1}"
                  aria-hidden="true"
                ></span>`,
            )}
        ${room.agents.length > 0
          ? room.agents.map(
              (agent, index) =>
                html`<div class="office-agent-slot office-agent-slot--${(index % 6) + 1}">
                  ${renderAgentSprite(agent)}
                </div>`,
            )
          : html`<div class="office-room__empty">No active agents in this room.</div>`}
      </div>
    </section>
  `;
}

function renderHandoffs(summary: HybridSummary) {
  const latest = summary.runs?.recent[0] ?? null;
  if (!latest || latest.agents.length < 2) {
    return html`<div class="muted">No recent multi-agent handoff recorded.</div>`;
  }
  return html`
    <ol class="office-handoff">
      ${latest.agents.map(
        (agent, index) => html`
          <li>
            <strong>${agent.agent}</strong>
            <span>${agent.role ?? "role n/a"}${agent.note ? ` · ${agent.note}` : ""}</span>
            ${index < latest.agents.length - 1 ? html`<b aria-hidden="true"><i></i></b>` : nothing}
          </li>
        `,
      )}
    </ol>
  `;
}

export function renderOfficeSpace(props: OfficeSpaceProps) {
  const summary = summarizeHybridState(props);
  const rooms = buildRooms(summary);
  const activeAgents = summary.agents.filter((agent) => agent.status === "active").length;
  const ready = props.connected && !props.error;
  return html`
    <section class="office-view">
      <div class="office-hero">
        <div>
          <div class="hybrid-eyebrow">Live office space</div>
          <h2>Z-Claw agents at work</h2>
          <p>
            A real-time visualization of Hermes-backed agents, OpenClaw team routing, active
            sessions, recent workflow participation, and handoffs.
          </p>
        </div>
        <div class="office-hero__actions">
          <button
            class="btn btn--subtle btn--sm"
            @click=${props.onRefresh}
            ?disabled=${props.loading}
          >
            ${props.loading ? "Refreshing" : "Refresh"}
          </button>
          <button class="btn btn--sm" @click=${() => props.onNavigate("hybrid")}>Hybrid</button>
        </div>
      </div>

      ${props.error ? html`<div class="alert danger">${props.error}</div>` : nothing}
      ${!ready
        ? html`<div class="muted">Connect to the OpenClaw gateway to load office state.</div>`
        : nothing}

      <section class="office-stats">
        <div>
          <span>Agents</span>
          <strong>${summary.agentCount}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>${activeAgents}</strong>
        </div>
        <div>
          <span>Rooms</span>
          <strong>${rooms.length}</strong>
        </div>
        <div>
          <span>Latest runs</span>
          <strong>${summary.runs?.total ?? 0}</strong>
        </div>
      </section>

      <section class="office-panel">
        <div class="office-panel__header">
          <h3>Current Handoff Chain</h3>
          <span>${summary.runs?.recent[0]?.taskId ?? "No run"}</span>
        </div>
        ${renderHandoffs(summary)}
      </section>

      <section class="office-map">${rooms.map(renderRoom)}</section>
    </section>
  `;
}
