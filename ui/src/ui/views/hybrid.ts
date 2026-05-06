import { html, nothing } from "lit";
import { formatCost, formatTokens, formatRelativeTimestamp } from "../format.ts";
import { resolveAgentIdFromSessionKey } from "../session-key.ts";
import type {
  AgentsListResult,
  GatewayAgentRow,
  GatewaySessionRow,
  SessionsListResult,
  SessionsUsageResult,
  HybridStatusResult,
} from "../types.ts";

type HybridAgentStatus = "active" | "idle" | "unknown";

export type HybridAgentSummary = {
  id: string;
  name: string;
  workspace: string | null;
  modelPrimary: string | null;
  hermesBacked: boolean;
  hermesProfile: string | null;
  runtimeSource: string | null;
  sessionCount: number;
  activeSessionCount: number;
  lastActiveAt: number | null;
  status: HybridAgentStatus;
  usageTokens: number;
  usageCost: number;
};

export type HybridSummary = {
  connected: boolean;
  agentCount: number;
  hermesBackedCount: number;
  activeSessionCount: number;
  openclawNativeCost: number;
  openclawNativeTokens: number;
  agents: HybridAgentSummary[];
  providers: HybridStatusResult["providers"];
  caveats: string[];
};

export type HybridProps = {
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

function toNumberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function modelPrimary(agent: GatewayAgentRow): string | null {
  const primary = agent.model?.primary?.trim();
  return primary || null;
}

function isHermesWorkerModel(model: string | null): boolean {
  return Boolean(model && /^hermes-workers\//i.test(model));
}

function hermesProfileFromModel(model: string | null): string | null {
  if (!model) {
    return null;
  }
  const match = /^hermes-workers\/(.+)$/i.exec(model);
  return match?.[1]?.trim() || null;
}

function sessionAgentId(row: GatewaySessionRow): string | null {
  return resolveAgentIdFromSessionKey(row.key);
}

function isActiveSession(row: GatewaySessionRow): boolean {
  return row.hasActiveRun === true || row.status === "running";
}

function usageForAgent(result: SessionsUsageResult | null, agentId: string) {
  const fromAggregate = result?.aggregates?.byAgent?.find((entry) => entry.agentId === agentId);
  if (fromAggregate?.totals) {
    return {
      tokens: toNumberOrZero(fromAggregate.totals.totalTokens),
      cost: toNumberOrZero(fromAggregate.totals.totalCost),
    };
  }
  let tokens = 0;
  let cost = 0;
  for (const session of result?.sessions ?? []) {
    if (session.agentId !== agentId || !session.usage) {
      continue;
    }
    tokens += toNumberOrZero(session.usage.totalTokens);
    cost += toNumberOrZero(session.usage.totalCost);
  }
  return { tokens, cost };
}

function statusForAgent(sessions: GatewaySessionRow[]): HybridAgentStatus {
  if (sessions.some(isActiveSession)) {
    return "active";
  }
  return sessions.length > 0 ? "idle" : "unknown";
}

export function summarizeHybridState(props: {
  connected: boolean;
  agentsList: AgentsListResult | null;
  sessionsResult: SessionsListResult | null;
  usageResult: SessionsUsageResult | null;
  hybridResult?: HybridStatusResult | null;
}): HybridSummary {
  const sessions = props.sessionsResult?.sessions ?? [];
  const backendAgentsById = new Map(
    (props.hybridResult?.agents ?? []).map((agent) => [agent.id, agent] as const),
  );
  const sourceAgents =
    props.agentsList?.agents ??
    props.hybridResult?.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      identity: { name: agent.name },
      workspace: agent.workspace ?? undefined,
      model: agent.modelPrimary ? { primary: agent.modelPrimary } : undefined,
      agentRuntime: agent.runtimeSource
        ? { id: agent.id, source: agent.runtimeSource as "env" | "agent" | "defaults" | "implicit" }
        : undefined,
    })) ??
    [];
  const agents = sourceAgents.map((agent) => {
    const primary = modelPrimary(agent);
    const backend = backendAgentsById.get(agent.id);
    const agentSessions = sessions.filter((row) => sessionAgentId(row) === agent.id);
    const lastActiveAt =
      agentSessions.reduce<number | null>((latest, row) => {
        const updatedAt = toNumberOrZero(row.updatedAt);
        return updatedAt > (latest ?? 0) ? updatedAt : latest;
      }, null) ?? null;
    const usage = usageForAgent(props.usageResult, agent.id);
    return {
      id: agent.id,
      name: backend?.name ?? agent.identity?.name?.trim() ?? agent.name?.trim() ?? agent.id,
      workspace: backend?.workspace ?? agent.workspace?.trim() ?? null,
      modelPrimary: backend?.modelPrimary ?? primary,
      hermesBacked: backend?.hermesBacked ?? isHermesWorkerModel(primary),
      hermesProfile: backend?.hermesProfile ?? hermesProfileFromModel(primary),
      runtimeSource: backend?.runtimeSource ?? agent.agentRuntime?.source ?? null,
      sessionCount: agentSessions.length,
      activeSessionCount: agentSessions.filter(isActiveSession).length,
      lastActiveAt,
      status: statusForAgent(agentSessions),
      usageTokens: usage.tokens,
      usageCost: usage.cost,
    } satisfies HybridAgentSummary;
  });
  const openclawNativeCost = toNumberOrZero(props.usageResult?.totals?.totalCost);
  const openclawNativeTokens = toNumberOrZero(props.usageResult?.totals?.totalTokens);
  const hermesBackedCount = agents.filter((agent) => agent.hermesBacked).length;
  const caveats: string[] = [...(props.hybridResult?.caveats ?? [])];
  if (agents.length > 0 && hermesBackedCount < agents.length) {
    caveats.push("Some agents are not routed through the Hermes worker provider.");
  }
  if (hermesBackedCount > 0) {
    caveats.push(
      "OpenClaw usage totals only reflect OpenClaw-observed session usage. Hermes subscription windows, memory writes, and self-improvement telemetry need a Hermes telemetry bridge before they can be treated as authoritative here.",
    );
  }
  if (!props.usageResult) {
    caveats.push("Usage data has not loaded yet, so token and cost figures are unavailable.");
  }
  return {
    connected: props.connected,
    agentCount: agents.length,
    hermesBackedCount,
    activeSessionCount: sessions.filter(isActiveSession).length,
    openclawNativeCost,
    openclawNativeTokens,
    agents,
    providers: props.hybridResult?.providers ?? [],
    caveats,
  };
}

function renderMetric(label: string, value: unknown, hint: string) {
  return html`
    <div class="hybrid-metric">
      <div class="hybrid-metric__label">${label}</div>
      <div class="hybrid-metric__value">${value}</div>
      <div class="hybrid-metric__hint">${hint}</div>
    </div>
  `;
}

function renderStatusPill(status: HybridAgentStatus) {
  const label = status === "active" ? "Active" : status === "idle" ? "Idle" : "No sessions";
  return html`<span class="hybrid-pill hybrid-pill--${status}">${label}</span>`;
}

function renderAgentCard(agent: HybridAgentSummary) {
  return html`
    <article class="hybrid-agent">
      <div class="hybrid-agent__topline">
        <div>
          <h3>${agent.name}</h3>
          <div class="hybrid-agent__id">${agent.id}</div>
        </div>
        ${renderStatusPill(agent.status)}
      </div>
      <dl class="hybrid-agent__facts">
        <div>
          <dt>Brain</dt>
          <dd>${agent.hermesBacked ? "Hermes worker" : "OpenClaw model"}</dd>
        </div>
        <div>
          <dt>Profile</dt>
          <dd>${agent.hermesProfile ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Model route</dt>
          <dd>${agent.modelPrimary ?? "default"}</dd>
        </div>
        <div>
          <dt>Sessions</dt>
          <dd>${agent.activeSessionCount}/${agent.sessionCount} active</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>${agent.lastActiveAt ? formatRelativeTimestamp(agent.lastActiveAt) : "never"}</dd>
        </div>
        <div>
          <dt>OpenClaw usage</dt>
          <dd>${formatTokens(agent.usageTokens)} · ${formatCost(agent.usageCost)}</dd>
        </div>
      </dl>
    </article>
  `;
}

function renderProvider(provider: HybridStatusResult["providers"][number]) {
  const status =
    provider.reachable === true
      ? html`<span class="hybrid-pill hybrid-pill--active">Reachable</span>`
      : provider.reachable === false
        ? html`<span class="hybrid-pill hybrid-pill--idle">Unavailable</span>`
        : html`<span class="hybrid-pill">Not probed</span>`;
  const profiles = provider.health?.profiles ?? [];
  return html`
    <article class="hybrid-provider">
      <div class="hybrid-agent__topline">
        <div>
          <h3>${provider.id}</h3>
          <div class="hybrid-agent__id">${provider.kind}</div>
        </div>
        ${status}
      </div>
      <dl class="hybrid-agent__facts">
        <div>
          <dt>Endpoint</dt>
          <dd>${provider.baseUrl ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Agents</dt>
          <dd>${provider.agentIds.join(", ") || "none"}</dd>
        </div>
        <div>
          <dt>Adapter models</dt>
          <dd>${provider.health?.models?.join(", ") || "not reported"}</dd>
        </div>
        <div>
          <dt>Hermes profiles</dt>
          <dd>${profiles.length || "not reported"}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>${provider.error ?? "none"}</dd>
        </div>
      </dl>
      ${profiles.length > 0
        ? html`
            <div class="hybrid-profile-list">
              ${profiles.map(
                (profile) => html`
                  <div class="hybrid-profile">
                    <div>
                      <strong>${profile.name}</strong>
                      <span>${profile.model} -> ${profile.profile}</span>
                    </div>
                    <div>
                      <span
                        >${profile.sessionId ? "Resume session active" : "No resume session"}</span
                      >
                      <span>${profile.sessions.count} Hermes sessions</span>
                    </div>
                  </div>
                `,
              )}
            </div>
          `
        : nothing}
    </article>
  `;
}

export function renderHybrid(props: HybridProps) {
  const summary = summarizeHybridState(props);
  const ready = props.connected && !props.error;
  return html`
    <section class="hybrid-view">
      <div class="hybrid-hero">
        <div>
          <div class="hybrid-eyebrow">Hybrid control plane</div>
          <h2>OpenClaw orchestration, Hermes cognition</h2>
          <p>
            This view tracks whether OpenClaw agents are routed through Hermes worker profiles and
            separates OpenClaw-observed activity from Hermes-owned memory and subscription
            telemetry.
          </p>
        </div>
        <div class="hybrid-hero__actions">
          <button
            class="btn btn--subtle btn--sm"
            @click=${props.onRefresh}
            ?disabled=${props.loading}
          >
            ${props.loading ? "Refreshing" : "Refresh"}
          </button>
          <button class="btn btn--sm" @click=${() => props.onNavigate("agents")}>Agents</button>
        </div>
      </div>

      ${props.error ? html`<div class="alert danger">${props.error}</div>` : nothing}
      ${!ready
        ? html`<div class="muted">Connect to the OpenClaw gateway to load hybrid status.</div>`
        : nothing}

      <section class="hybrid-metrics">
        ${renderMetric(
          "Agents",
          `${summary.hermesBackedCount}/${summary.agentCount}`,
          "Hermes-backed",
        )}
        ${renderMetric("Active sessions", summary.activeSessionCount, "OpenClaw session state")}
        ${renderMetric(
          "Observed tokens",
          formatTokens(summary.openclawNativeTokens),
          "OpenClaw usage",
        )}
        ${renderMetric(
          "Observed cost",
          formatCost(summary.openclawNativeCost),
          "Not Hermes billing",
        )}
      </section>

      <section class="hybrid-split">
        <div class="hybrid-panel">
          <h3>System Contract</h3>
          <ul class="hybrid-list">
            <li>
              <strong>OpenClaw</strong> owns routing, channels, sessions, cron, and task dispatch.
            </li>
            <li>
              <strong>Hermes</strong> owns agent cognition, memory, profile continuity, and skill
              growth.
            </li>
            <li>
              <strong>Dashboard costs</strong> are labeled as observed usage until Hermes billing
              telemetry is connected.
            </li>
            <li>
              <strong>Agent state</strong> is inferred from sessions today; richer worker telemetry
              is the next integration layer.
            </li>
          </ul>
        </div>
        <div class="hybrid-panel">
          <h3>Telemetry Gaps</h3>
          ${summary.caveats.length > 0
            ? html`<ul class="hybrid-list">
                ${summary.caveats.map((item) => html`<li>${item}</li>`)}
              </ul>`
            : html`<div class="muted">No telemetry caveats detected.</div>`}
        </div>
      </section>

      <section class="hybrid-panel">
        <h3>Provider Telemetry</h3>
        ${summary.providers.length > 0
          ? html`<div class="hybrid-providers">${summary.providers.map(renderProvider)}</div>`
          : html`<div class="muted" style="margin-top: 12px">
              No provider telemetry is available from this gateway yet.
            </div>`}
      </section>

      <section class="hybrid-agents">
        ${summary.agents.length > 0
          ? summary.agents.map(renderAgentCard)
          : html`<div class="hybrid-panel muted">No agents returned by OpenClaw yet.</div>`}
      </section>
    </section>
  `;
}
