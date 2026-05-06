import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { listAgentsForGateway } from "../session-utils.js";
import type { GatewayRequestHandlers } from "./types.js";

type ProviderStatus = {
  id: string;
  kind: "hermes-worker" | "model-provider";
  baseUrl: string | null;
  agentIds: string[];
  reachable: boolean | null;
  health?: {
    ok?: boolean;
    models?: string[];
    profiles?: AdapterProfileStatus[];
  };
  error?: string;
};

type AdapterProfileStatus = {
  model: string;
  profile: string;
  name: string;
  sessionId: string | null;
  profileHomeExists: boolean;
  sessionFileExists: boolean;
  sessions: {
    count: number;
    latestSessionId: string | null;
    latestSessionMtime: number | null;
  };
  metrics?: {
    databaseExists: boolean;
    sessions?: number;
    messages?: number;
    toolCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    estimatedCostUsd?: number;
    actualCostUsd?: number;
    models?: string[];
    billingProviders?: string[];
    lastStartedAt?: number | null;
    lastEndedAt?: number | null;
    error?: string;
  };
  log: {
    lastInvokeAt: number | null;
    lastCompleteAt: number | null;
    lastErrorAt: number | null;
    recentErrorCount: number;
  };
};

type HybridAgentStatus = {
  id: string;
  name: string;
  role: string | null;
  companyScope: string | null;
  teamId: string | null;
  workspace: string | null;
  modelPrimary: string | null;
  providerId: string | null;
  hermesBacked: boolean;
  hermesProfile: string | null;
  runtimeSource: string | null;
  memoryOwner: "hermes" | "openclaw" | "unknown";
  modelBudget: string | null;
  toolUse: string | null;
  description: string | null;
};

type HybridRunSummary = {
  runId: string;
  workflow: string;
  taskId: string;
  objective: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  durableMemoryUsed: boolean;
  runDir: string;
  agents: Array<{
    agent: string;
    role: string | null;
    model: string | null;
    note: string | null;
  }>;
  artifacts: Array<{
    path: string;
    kind: string;
    agent: string | null;
    note: string | null;
  }>;
  decisions: Array<{
    decision: string;
    reason: string | null;
  }>;
  workflowDeviations: Array<{
    deviation: string;
    reason: string | null;
  }>;
};

export type HybridStatusResult = {
  ok: true;
  generatedAt: number;
  organization: HybridOrganization | null;
  runs: {
    root: string;
    total: number;
    recent: HybridRunSummary[];
    error?: string;
  };
  providers: ProviderStatus[];
  agents: HybridAgentStatus[];
  telemetry: {
    openclawUsageAuthority: "observed";
    hermesSessionMetricsAuthority: "observed";
    hermesBillingAuthority: "unavailable";
    hermesMemoryAuthority: "external";
  };
  caveats: string[];
};

type HybridOrganization = {
  schemaVersion: number;
  systemName: string;
  sourcePath: string;
  companies: HybridCompany[];
  teams: HybridTeam[];
};

type HybridCompany = {
  id: string;
  name: string;
  kind: "shared" | "company";
  mission: string | null;
  teamIds: string[];
  teams: Array<{
    id: string;
    name: string;
    agentIds: string[];
  }>;
};

type HybridTeam = {
  id: string;
  name: string;
  scope: string;
  mission: string | null;
  agentIds: string[];
};

type OrganizationAgent = {
  id: string;
  name: string;
  role: string | null;
  companyScope: string | null;
  teamId: string | null;
  hermesProfile: string | null;
  defaultModel: string | null;
  modelBudget: string | null;
  toolUse: string | null;
  memoryOwner: string | null;
  description: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function modelPrimary(value: unknown): string | null {
  if (typeof value === "string") {
    return asTrimmedString(value);
  }
  if (isRecord(value)) {
    return asTrimmedString(value.primary);
  }
  return null;
}

function providerIdFromModel(model: string | null): string | null {
  if (!model) {
    return null;
  }
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : null;
}

function hermesProfileFromModel(model: string | null): string | null {
  if (!model) {
    return null;
  }
  const match = /^hermes-workers\/(.+)$/i.exec(model);
  return match?.[1]?.trim() || null;
}

function providerModelName(model: string | null): string | null {
  if (!model) {
    return null;
  }
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(slash + 1) : model;
}

function isHermesProvider(providerId: string, provider: Record<string, unknown> | undefined) {
  if (/hermes/i.test(providerId)) {
    return true;
  }
  const baseUrl = asTrimmedString(provider?.baseUrl);
  return Boolean(baseUrl && /hermes/i.test(baseUrl));
}

function healthUrlFromBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return `${trimmed}/health`;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function firstExistingDirectory(candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? "/home/z/Claw";
}

function zClawSourceRoot(): string {
  const configured = process.env.Z_CLAW_ROOT?.trim();
  if (configured) {
    return configured;
  }
  return firstExistingDirectory([
    `${process.cwd()}/z-claw`,
    "/home/z/openclaw-hybrid/z-claw",
    "/home/z/Claw",
  ]);
}

function zClawRuntimeRoot(): string {
  const configured = process.env.Z_CLAW_RUNTIME_ROOT?.trim();
  if (configured) {
    return configured;
  }
  return firstExistingDirectory(["/home/z/Claw", `${zClawSourceRoot()}/runtime`]);
}

function organizationPath(): string {
  return (
    process.env.Z_CLAW_ORGANIZATION_PATH?.trim() ||
    `${zClawSourceRoot()}/integration/zclaw_organization.json`
  );
}

function runsRoot(): string {
  return process.env.Z_CLAW_RUNS_ROOT?.trim() || `${zClawRuntimeRoot()}/workspace/runs`;
}

function parseOrganizationAgent(entry: unknown): OrganizationAgent | null {
  if (!isRecord(entry)) {
    return null;
  }
  const id = asTrimmedString(entry.id);
  const name = asTrimmedString(entry.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    role: asTrimmedString(entry.role),
    companyScope: asTrimmedString(entry.companyScope),
    teamId: asTrimmedString(entry.teamId),
    hermesProfile: asTrimmedString(entry.hermesProfile),
    defaultModel: asTrimmedString(entry.defaultModel),
    modelBudget: asTrimmedString(entry.modelBudget),
    toolUse: asTrimmedString(entry.toolUse),
    memoryOwner: asTrimmedString(entry.memoryOwner),
    description: asTrimmedString(entry.description),
  };
}

function parseOrganization(
  body: unknown,
  sourcePath: string,
): {
  organization: HybridOrganization;
  agents: Map<string, OrganizationAgent>;
} | null {
  if (!isRecord(body)) {
    return null;
  }
  const schemaVersion = asNumberOrNull(body.schemaVersion) ?? 1;
  const systemName = asTrimmedString(body.systemName) ?? "Z Claw";
  const rawTeams = Array.isArray(body.teams) ? body.teams : [];
  const teams: HybridTeam[] = [];
  for (const entry of rawTeams) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = asTrimmedString(entry.id);
    const name = asTrimmedString(entry.name);
    if (!id || !name) {
      continue;
    }
    teams.push({
      id,
      name,
      scope: asTrimmedString(entry.scope) ?? "shared",
      mission: asTrimmedString(entry.mission),
      agentIds: asStringArray(entry.agentIds),
    });
  }
  const teamsById = new Map(teams.map((team) => [team.id, team] as const));
  const rawCompanies = Array.isArray(body.companies) ? body.companies : [];
  const companies: HybridCompany[] = [];
  for (const entry of rawCompanies) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = asTrimmedString(entry.id);
    const name = asTrimmedString(entry.name);
    if (!id || !name) {
      continue;
    }
    const kind = entry.kind === "company" ? "company" : "shared";
    const teamIds = asStringArray(entry.teamIds);
    companies.push({
      id,
      name,
      kind,
      mission: asTrimmedString(entry.mission),
      teamIds,
      teams: teamIds
        .map((teamId) => teamsById.get(teamId))
        .filter((team): team is HybridTeam => Boolean(team))
        .map((team) => ({
          id: team.id,
          name: team.name,
          agentIds: team.agentIds,
        })),
    });
  }
  const agents = new Map<string, OrganizationAgent>();
  for (const entry of Array.isArray(body.agents) ? body.agents : []) {
    const agent = parseOrganizationAgent(entry);
    if (agent) {
      agents.set(agent.id, agent);
    }
  }
  return {
    organization: {
      schemaVersion,
      systemName,
      sourcePath,
      companies,
      teams,
    },
    agents,
  };
}

async function readOrganization(): Promise<{
  organization: HybridOrganization | null;
  agents: Map<string, OrganizationAgent>;
  error?: string;
}> {
  const sourcePath = organizationPath();
  try {
    const raw = await readFile(sourcePath, "utf8");
    const parsed = parseOrganization(JSON.parse(raw) as unknown, sourcePath);
    if (!parsed) {
      return { organization: null, agents: new Map(), error: "invalid organization registry" };
    }
    return parsed;
  } catch (err) {
    const code = isRecord(err) && typeof err.code === "string" ? err.code : null;
    if (code === "ENOENT") {
      return { organization: null, agents: new Map(), error: "organization registry missing" };
    }
    return {
      organization: null,
      agents: new Map(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseManifestItems(value: unknown, kind: "agents"): HybridRunSummary["agents"];
function parseManifestItems(value: unknown, kind: "artifacts"): HybridRunSummary["artifacts"];
function parseManifestItems(value: unknown, kind: "decisions"): HybridRunSummary["decisions"];
function parseManifestItems(
  value: unknown,
  kind: "workflowDeviations",
): HybridRunSummary["workflowDeviations"];
function parseManifestItems(value: unknown, kind: string): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: unknown[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (kind === "agents") {
      const agent = asTrimmedString(entry.agent);
      if (!agent) {
        continue;
      }
      out.push({
        agent,
        role: asTrimmedString(entry.role),
        model: asTrimmedString(entry.model),
        note: asTrimmedString(entry.note),
      });
    } else if (kind === "artifacts") {
      const path = asTrimmedString(entry.path);
      const artifactKind = asTrimmedString(entry.kind);
      if (!path || !artifactKind) {
        continue;
      }
      out.push({
        path,
        kind: artifactKind,
        agent: asTrimmedString(entry.agent),
        note: asTrimmedString(entry.note),
      });
    } else if (kind === "decisions") {
      const decision = asTrimmedString(entry.decision);
      if (!decision) {
        continue;
      }
      out.push({
        decision,
        reason: asTrimmedString(entry.reason),
      });
    } else if (kind === "workflowDeviations") {
      const deviation = asTrimmedString(entry.deviation);
      if (!deviation) {
        continue;
      }
      out.push({
        deviation,
        reason: asTrimmedString(entry.reason),
      });
    }
  }
  return out;
}

function parseRunManifest(body: unknown, runDir: string): HybridRunSummary | null {
  if (!isRecord(body)) {
    return null;
  }
  const runId = asTrimmedString(body.run_id);
  const workflow = asTrimmedString(body.workflow);
  const taskId = asTrimmedString(body.task_id);
  const status = asTrimmedString(body.status);
  if (!runId || !workflow || !taskId || !status) {
    return null;
  }
  return {
    runId,
    workflow,
    taskId,
    objective: asTrimmedString(body.objective),
    status,
    createdAt: asTrimmedString(body.created_at),
    updatedAt: asTrimmedString(body.updated_at),
    durableMemoryUsed: body.durable_memory_used === true,
    runDir,
    agents: parseManifestItems(body.agents, "agents"),
    artifacts: parseManifestItems(body.artifacts, "artifacts"),
    decisions: parseManifestItems(body.decisions, "decisions"),
    workflowDeviations: parseManifestItems(body.workflow_deviations, "workflowDeviations"),
  };
}

function runUpdatedAt(run: HybridRunSummary): number {
  const parsed = Date.parse(run.updatedAt ?? run.createdAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readRunLedger(): Promise<{
  root: string;
  total: number;
  recent: HybridRunSummary[];
  error?: string;
}> {
  const root = runsRoot();
  const runs: HybridRunSummary[] = [];
  try {
    const workflows = await readdir(root, { withFileTypes: true });
    for (const workflowEntry of workflows) {
      if (!workflowEntry.isDirectory()) {
        continue;
      }
      const workflowDir = `${root}/${workflowEntry.name}`;
      const runEntries = await readdir(workflowDir, { withFileTypes: true });
      for (const runEntry of runEntries) {
        if (!runEntry.isDirectory()) {
          continue;
        }
        const runDir = `${workflowDir}/${runEntry.name}`;
        try {
          const raw = await readFile(`${runDir}/manifest.json`, "utf8");
          const run = parseRunManifest(JSON.parse(raw) as unknown, runDir);
          if (run) {
            runs.push(run);
          }
        } catch {
          continue;
        }
      }
    }
  } catch (err) {
    const code = isRecord(err) && typeof err.code === "string" ? err.code : null;
    return {
      root,
      total: 0,
      recent: [],
      error:
        code === "ENOENT" ? "run ledger missing" : err instanceof Error ? err.message : String(err),
    };
  }
  runs.sort((a, b) => runUpdatedAt(b) - runUpdatedAt(a));
  return {
    root,
    total: runs.length,
    recent: runs.slice(0, 12),
  };
}

function parseAdapterProfiles(body: unknown): AdapterProfileStatus[] | undefined {
  if (!isRecord(body) || !Array.isArray(body.profiles)) {
    return undefined;
  }
  const profiles: AdapterProfileStatus[] = [];
  for (const entry of body.profiles) {
    if (!isRecord(entry)) {
      continue;
    }
    const model = asTrimmedString(entry.model);
    const profile = asTrimmedString(entry.profile);
    if (!model || !profile) {
      continue;
    }
    const sessions = isRecord(entry.sessions) ? entry.sessions : {};
    const metrics = isRecord(entry.metrics) ? entry.metrics : null;
    const log = isRecord(entry.log) ? entry.log : {};
    profiles.push({
      model,
      profile,
      name: asTrimmedString(entry.name) ?? profile,
      sessionId: asTrimmedString(entry.sessionId),
      profileHomeExists: asBoolean(entry.profileHomeExists),
      sessionFileExists: asBoolean(entry.sessionFileExists),
      sessions: {
        count: asNumberOrNull(sessions.count) ?? 0,
        latestSessionId: asTrimmedString(sessions.latestSessionId),
        latestSessionMtime: asNumberOrNull(sessions.latestSessionMtime),
      },
      metrics: metrics
        ? {
            databaseExists: asBoolean(metrics.databaseExists),
            sessions: asNumberOrNull(metrics.sessions) ?? undefined,
            messages: asNumberOrNull(metrics.messages) ?? undefined,
            toolCalls: asNumberOrNull(metrics.toolCalls) ?? undefined,
            inputTokens: asNumberOrNull(metrics.inputTokens) ?? undefined,
            outputTokens: asNumberOrNull(metrics.outputTokens) ?? undefined,
            reasoningTokens: asNumberOrNull(metrics.reasoningTokens) ?? undefined,
            cacheReadTokens: asNumberOrNull(metrics.cacheReadTokens) ?? undefined,
            cacheWriteTokens: asNumberOrNull(metrics.cacheWriteTokens) ?? undefined,
            estimatedCostUsd: asNumberOrNull(metrics.estimatedCostUsd) ?? undefined,
            actualCostUsd: asNumberOrNull(metrics.actualCostUsd) ?? undefined,
            models: Array.isArray(metrics.models)
              ? metrics.models.filter((item): item is string => typeof item === "string")
              : undefined,
            billingProviders: Array.isArray(metrics.billingProviders)
              ? metrics.billingProviders.filter((item): item is string => typeof item === "string")
              : undefined,
            lastStartedAt: asNumberOrNull(metrics.lastStartedAt),
            lastEndedAt: asNumberOrNull(metrics.lastEndedAt),
            error: asTrimmedString(metrics.error) ?? undefined,
          }
        : undefined,
      log: {
        lastInvokeAt: asNumberOrNull(log.lastInvokeAt),
        lastCompleteAt: asNumberOrNull(log.lastCompleteAt),
        lastErrorAt: asNumberOrNull(log.lastErrorAt),
        recentErrorCount: asNumberOrNull(log.recentErrorCount) ?? 0,
      },
    });
  }
  return profiles.length > 0 ? profiles : undefined;
}

async function probeProviderHealth(baseUrl: string | null): Promise<{
  reachable: boolean;
  health?: { ok?: boolean; models?: string[]; profiles?: AdapterProfileStatus[] };
  error?: string;
}> {
  if (!baseUrl) {
    return { reachable: false, error: "missing baseUrl" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(healthUrlFromBaseUrl(baseUrl), { signal: controller.signal });
    if (!response.ok) {
      return { reachable: false, error: `HTTP ${response.status}` };
    }
    const body = (await response.json().catch(() => null)) as unknown;
    const models =
      isRecord(body) && Array.isArray(body.models)
        ? body.models.filter((entry): entry is string => typeof entry === "string")
        : undefined;
    const ok = isRecord(body) && typeof body.ok === "boolean" ? body.ok : undefined;
    return { reachable: true, health: { ok, models, profiles: parseAdapterProfiles(body) } };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

function readProviders(cfg: { models?: unknown }): Record<string, Record<string, unknown>> {
  const models = isRecord(cfg.models) ? cfg.models : {};
  const providers = isRecord(models.providers) ? models.providers : {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, provider] of Object.entries(providers)) {
    if (isRecord(provider)) {
      out[id] = provider;
    }
  }
  return out;
}

export const hybridHandlers: GatewayRequestHandlers = {
  "hybrid.status": async ({ context, respond }) => {
    const cfg = context.getRuntimeConfig();
    const organization = await readOrganization();
    const runs = await readRunLedger();
    const providers = readProviders(cfg);
    const agentRows = listAgentsForGateway(cfg).agents;
    const agents = agentRows.map((agent) => {
      const orgAgent = organization.agents.get(agent.id);
      const primary = modelPrimary(agent.model);
      const providerId = providerIdFromModel(primary);
      const hermesBacked = Boolean(
        providerId && isHermesProvider(providerId, providers[providerId]),
      );
      return {
        id: agent.id,
        name: orgAgent?.name ?? agent.identity?.name?.trim() ?? agent.name?.trim() ?? agent.id,
        role: orgAgent?.role ?? null,
        companyScope: orgAgent?.companyScope ?? null,
        teamId: orgAgent?.teamId ?? null,
        workspace: agent.workspace?.trim() || null,
        modelPrimary: primary,
        providerId,
        hermesBacked,
        hermesProfile:
          orgAgent?.hermesProfile ?? (hermesBacked ? hermesProfileFromModel(primary) : null),
        runtimeSource: agent.agentRuntime?.source ?? null,
        memoryOwner: hermesBacked ? "hermes" : providerId ? "openclaw" : "unknown",
        modelBudget: orgAgent?.modelBudget ?? null,
        toolUse: orgAgent?.toolUse ?? null,
        description: orgAgent?.description ?? null,
      } satisfies HybridAgentStatus;
    });
    const providerAgentIds = new Map<string, string[]>();
    for (const agent of agents) {
      if (!agent.providerId) {
        continue;
      }
      const existing = providerAgentIds.get(agent.providerId) ?? [];
      existing.push(agent.id);
      providerAgentIds.set(agent.providerId, existing);
    }
    const providerStatuses: ProviderStatus[] = [];
    for (const [providerId, agentIds] of providerAgentIds) {
      const provider = providers[providerId];
      const kind = isHermesProvider(providerId, provider) ? "hermes-worker" : "model-provider";
      const baseUrl = asTrimmedString(provider?.baseUrl);
      const probe =
        kind === "hermes-worker"
          ? await probeProviderHealth(baseUrl)
          : { reachable: null as boolean | null };
      providerStatuses.push({
        id: providerId,
        kind,
        baseUrl,
        agentIds,
        ...probe,
      });
    }
    const adapterProfilesByModel = new Map<string, AdapterProfileStatus>();
    for (const provider of providerStatuses) {
      for (const profile of provider.health?.profiles ?? []) {
        adapterProfilesByModel.set(profile.model, profile);
      }
    }
    const finalAgents = agents.map((agent) => {
      const profile = adapterProfilesByModel.get(providerModelName(agent.modelPrimary) ?? "");
      if (!profile) {
        return agent;
      }
      return {
        ...agent,
        name: profile.name,
        hermesProfile: profile.profile,
      } satisfies HybridAgentStatus;
    });
    const hermesBackedCount = finalAgents.filter((agent) => agent.hermesBacked).length;
    const caveats: string[] = [];
    if (finalAgents.length > 0 && hermesBackedCount < finalAgents.length) {
      caveats.push("Some agents are not backed by a Hermes worker provider.");
    }
    if (hermesBackedCount > 0) {
      caveats.push(
        "Hermes aggregate session metrics are available through the worker adapter. Exact subscription billing and durable-memory semantics remain external to OpenClaw.",
      );
    }
    if (organization.error) {
      caveats.push(`Z-Claw organization registry: ${organization.error}.`);
    }
    if (runs.error) {
      caveats.push(`Z-Claw run ledger: ${runs.error}.`);
    }
    respond(true, {
      ok: true,
      generatedAt: Date.now(),
      organization: organization.organization,
      runs,
      providers: providerStatuses,
      agents: finalAgents,
      telemetry: {
        openclawUsageAuthority: "observed",
        hermesSessionMetricsAuthority: "observed",
        hermesBillingAuthority: "unavailable",
        hermesMemoryAuthority: "external",
      },
      caveats,
    } satisfies HybridStatusResult);
  },
};
