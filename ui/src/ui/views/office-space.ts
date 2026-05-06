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

function latestRun(agent: HybridAgentSummary) {
  return agent.recentRuns[0] ?? null;
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
  if (agent.status === "active") {
    return "Working";
  }
  if (agent.status === "idle") {
    return "Resting";
  }
  return "Standby";
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
  return html`
    <details class="office-agent office-agent--${agent.status}">
      <summary class="office-agent__summary">
        <span class="office-agent__sprite" aria-hidden="true">
          <span class="office-agent__head"></span>
          <span class="office-agent__body"></span>
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
        ${room.agents.length > 0
          ? room.agents.map(renderAgentSprite)
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
            ${index < latest.agents.length - 1 ? html`<b aria-hidden="true"></b>` : nothing}
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
