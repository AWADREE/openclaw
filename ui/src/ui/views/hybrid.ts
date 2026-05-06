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

type HybridProviderProfile = NonNullable<
  NonNullable<HybridStatusResult["providers"][number]["health"]>["profiles"]
>[number];

type HybridRunSummary = HybridStatusResult["runs"]["recent"][number];

export type HybridAgentSummary = {
  id: string;
  name: string;
  role: string | null;
  companyScope: string | null;
  teamId: string | null;
  workspace: string | null;
  modelPrimary: string | null;
  hermesBacked: boolean;
  hermesProfile: string | null;
  runtimeSource: string | null;
  modelBudget: string | null;
  toolUse: string | null;
  description: string | null;
  sessionCount: number;
  activeSessionCount: number;
  lastActiveAt: number | null;
  status: HybridAgentStatus;
  usageTokens: number;
  usageCost: number;
  profileTelemetry: HybridProviderProfile | null;
  recentRuns: HybridRunSummary[];
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
  organization: HybridStatusResult["organization"];
  runs: HybridStatusResult["runs"] | null;
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
  const profilesByModel = new Map<string, HybridProviderProfile>();
  const profilesByProfile = new Map<string, HybridProviderProfile>();
  for (const provider of props.hybridResult?.providers ?? []) {
    for (const profile of provider.health?.profiles ?? []) {
      profilesByModel.set(profile.model, profile);
      profilesByProfile.set(profile.profile, profile);
    }
  }
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
    const modelParts = (backend?.modelPrimary ?? primary)?.split("/") ?? [];
    const providerModel = modelParts.length > 1 ? modelParts[1] : null;
    const profileTelemetry =
      profilesByProfile.get(backend?.hermesProfile ?? "") ??
      profilesByModel.get(providerModel ?? agent.id) ??
      null;
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
      role: backend?.role ?? null,
      companyScope: backend?.companyScope ?? null,
      teamId: backend?.teamId ?? null,
      workspace: backend?.workspace ?? agent.workspace?.trim() ?? null,
      modelPrimary: backend?.modelPrimary ?? primary,
      hermesBacked: backend?.hermesBacked ?? isHermesWorkerModel(primary),
      hermesProfile: backend?.hermesProfile ?? hermesProfileFromModel(primary),
      runtimeSource: backend?.runtimeSource ?? agent.agentRuntime?.source ?? null,
      modelBudget: backend?.modelBudget ?? null,
      toolUse: backend?.toolUse ?? null,
      description: backend?.description ?? null,
      sessionCount: agentSessions.length,
      activeSessionCount: agentSessions.filter(isActiveSession).length,
      lastActiveAt,
      status: statusForAgent(agentSessions),
      usageTokens: usage.tokens,
      usageCost: usage.cost,
      profileTelemetry,
      recentRuns:
        props.hybridResult?.runs.recent.filter((run) =>
          run.agents.some((entry) => entry.agent === agent.id),
        ) ?? [],
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
    organization: props.hybridResult?.organization ?? null,
    runs: props.hybridResult?.runs ?? null,
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
  const metrics = agent.profileTelemetry?.metrics;
  return html`
    <details class="hybrid-agent">
      <summary class="hybrid-agent__summary">
        <div>
          <h3>${agent.name}</h3>
          <div class="hybrid-agent__id">${agent.role ?? agent.id}</div>
        </div>
        ${renderStatusPill(agent.status)}
      </summary>
      <dl class="hybrid-agent__facts">
        <div>
          <dt>Routing ID</dt>
          <dd>${agent.id}</dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>${agent.teamId ?? "unassigned"}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>${agent.companyScope ?? "unknown"}</dd>
        </div>
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
          <dt>Budget</dt>
          <dd>${agent.modelBudget ?? "not declared"}</dd>
        </div>
        <div>
          <dt>Tool use</dt>
          <dd>${agent.toolUse ?? "not declared"}</dd>
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
      ${agent.description
        ? html`<p class="hybrid-agent__description">${agent.description}</p>`
        : nothing}
      <div class="hybrid-agent-detail">
        <div>
          <h4>Hermes Profile</h4>
          <dl class="hybrid-agent__facts">
            <div>
              <dt>Profile</dt>
              <dd>${agent.profileTelemetry?.profile ?? agent.hermesProfile ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Resume session</dt>
              <dd>${agent.profileTelemetry?.sessionId ?? "none"}</dd>
            </div>
            <div>
              <dt>Session files</dt>
              <dd>${agent.profileTelemetry?.sessions.count ?? 0}</dd>
            </div>
            <div>
              <dt>DB sessions</dt>
              <dd>${metrics?.sessions ?? 0}</dd>
            </div>
            <div>
              <dt>Messages</dt>
              <dd>${metrics?.messages ?? 0}</dd>
            </div>
            <div>
              <dt>Tool calls</dt>
              <dd>${metrics?.toolCalls ?? 0}</dd>
            </div>
            <div>
              <dt>Input tokens</dt>
              <dd>${formatTokens(metrics?.inputTokens ?? 0)}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>${formatTokens(metrics?.outputTokens ?? 0)}</dd>
            </div>
            <div>
              <dt>Models seen</dt>
              <dd>${metrics?.models?.join(", ") || "not reported"}</dd>
            </div>
            <div>
              <dt>Billing labels</dt>
              <dd>${metrics?.billingProviders?.join(", ") || "not reported"}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h4>Workflow Participation</h4>
          ${agent.recentRuns.length > 0
            ? html`<ul class="hybrid-agent-runs">
                ${agent.recentRuns.slice(0, 4).map(
                  (run) => html`
                    <li>
                      <strong>${run.taskId}</strong>
                      <span>${run.workflow} · ${run.status}</span>
                    </li>
                  `,
                )}
              </ul>`
            : html`<div class="muted">No recorded workflow participation yet.</div>`}
        </div>
        <div>
          <h4>Operating Policy</h4>
          <dl class="hybrid-agent__facts">
            <div>
              <dt>Memory owner</dt>
              <dd>${agent.hermesBacked ? "Hermes" : "OpenClaw/unknown"}</dd>
            </div>
            <div>
              <dt>Escalation</dt>
              <dd>
                ${agent.modelBudget === "tool-execution"
                  ? "CEO review for risky tool work"
                  : "CEO review for judgment or failure"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </details>
  `;
}

function renderOrganization(organization: HybridStatusResult["organization"]) {
  if (!organization) {
    return html`<div class="muted" style="margin-top: 12px">
      No Z-Claw organization registry is available yet.
    </div>`;
  }
  return html`
    <div class="hybrid-org">
      ${organization.companies.map(
        (company) => html`
          <article class="hybrid-company">
            <div>
              <h4>${company.name}</h4>
              <span>${company.kind}</span>
            </div>
            ${company.mission ? html`<p>${company.mission}</p>` : nothing}
            <div class="hybrid-company__teams">
              ${company.teams.map(
                (team) => html`
                  <span
                    >${team.name} · ${team.agentIds.length}
                    agent${team.agentIds.length === 1 ? "" : "s"}</span
                  >
                `,
              )}
            </div>
          </article>
        `,
      )}
    </div>
  `;
}

function renderRunStatus(status: string) {
  const normalized = status.toLowerCase();
  const pillStatus =
    normalized === "accepted" || normalized === "verified"
      ? "active"
      : normalized === "blocked" || normalized === "rejected"
        ? "idle"
        : "unknown";
  return html`<span class="hybrid-pill hybrid-pill--${pillStatus}">${status}</span>`;
}

function renderRuns(runs: HybridStatusResult["runs"] | null) {
  if (!runs) {
    return html`<div class="muted" style="margin-top: 12px">
      No Z-Claw run ledger is available yet.
    </div>`;
  }
  if (runs.recent.length === 0) {
    return html`<div class="muted" style="margin-top: 12px">
      No workflow runs have been recorded under ${runs.root}.
    </div>`;
  }
  return html`
    <div class="hybrid-run-summary">
      <span>${runs.total} total runs</span>
      <span>${runs.root}</span>
    </div>
    <div class="hybrid-runs">
      ${runs.recent.map(
        (run) => html`
          <article class="hybrid-run">
            <div class="hybrid-run__topline">
              <div>
                <h4>${run.taskId}</h4>
                <span>${run.workflow} · ${run.runId}</span>
              </div>
              ${renderRunStatus(run.status)}
            </div>
            ${run.objective ? html`<p>${run.objective}</p>` : nothing}
            <dl class="hybrid-agent__facts">
              <div>
                <dt>Updated</dt>
                <dd>
                  ${run.updatedAt ? formatRelativeTimestamp(Date.parse(run.updatedAt)) : "unknown"}
                </dd>
              </div>
              <div>
                <dt>Agents</dt>
                <dd>${run.agents.length}</dd>
              </div>
              <div>
                <dt>Artifacts</dt>
                <dd>${run.artifacts.length}</dd>
              </div>
              <div>
                <dt>Memory</dt>
                <dd>${run.durableMemoryUsed ? "durable write used" : "not used"}</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>${run.decisions[0]?.decision ?? "none"}</dd>
              </div>
              <div>
                <dt>Deviations</dt>
                <dd>${run.workflowDeviations.length}</dd>
              </div>
            </dl>
          </article>
        `,
      )}
    </div>
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
                      <span
                        >${profile.sessions.count} files, ${profile.metrics?.sessions ?? 0} DB
                        sessions</span
                      >
                      <span>${formatTokens(profile.metrics?.inputTokens ?? 0)} input tokens</span>
                      <span>${formatTokens(profile.metrics?.outputTokens ?? 0)} output tokens</span>
                      <span>${formatCost(profile.metrics?.estimatedCostUsd ?? 0)} estimated</span>
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
        <h3>Companies and Teams</h3>
        ${renderOrganization(summary.organization)}
      </section>

      <section class="hybrid-panel">
        <h3>Workflow Runs</h3>
        ${renderRuns(summary.runs)}
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
