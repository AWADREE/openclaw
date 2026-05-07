import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { ensureAgentWorkspace } from "../../agents/workspace.js";
import {
  applyAgentConfig,
  findAgentEntryIndex,
  listAgentEntries,
} from "../../commands/agents.config.js";
import { replaceConfigFile } from "../../config/config.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { resolveUserPath } from "../../utils.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
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

type HybridWorkflowCatalogEntry = {
  id: string;
  name: string;
  status: "tested" | "planned" | "deprecated";
  description: string | null;
  suitableFor: string[];
  notFor: string[];
  agentPath: string[];
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
  workflows: {
    sourcePath: string;
    catalog: HybridWorkflowCatalogEntry[];
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

type ZClawCreateAgentParams = {
  id?: unknown;
  name?: unknown;
  role?: unknown;
  teamId?: unknown;
  companyScope?: unknown;
  hermesProfile?: unknown;
  defaultModel?: unknown;
  modelBudget?: unknown;
  toolUse?: unknown;
  description?: unknown;
};

type ZClawCreateAgentResult = {
  agentId: string;
  name: string;
  hermesProfile: string;
  modelPrimary: string;
  workspace: string;
  agentDir: string;
  organizationPath: string;
  runtimeOrganizationPath: string | null;
  hermesProfileHome: string;
  files: string[];
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

function runtimeOrganizationPath(): string {
  return `${zClawRuntimeRoot()}/integration/zclaw_organization.json`;
}

function zClawAgentSourceDir(agentId: string): string {
  return `${zClawSourceRoot()}/agents/${agentId}`;
}

function zClawAgentRuntimeDir(agentId: string): string {
  return `${zClawRuntimeRoot()}/agents/${agentId}`;
}

function hermesProfileHome(profile: string): string {
  return profile === "default"
    ? process.env.HERMES_HOME?.trim() || "/home/z/.hermes"
    : `${process.env.HERMES_HOME?.trim() || "/home/z/.hermes"}/profiles/${profile}`;
}

function runsRoot(): string {
  return process.env.Z_CLAW_RUNS_ROOT?.trim() || `${zClawRuntimeRoot()}/workspace/runs`;
}

function workflowCatalogPath(): string {
  return (
    process.env.Z_CLAW_WORKFLOWS_PATH?.trim() ||
    `${zClawSourceRoot()}/integration/zclaw_workflows.json`
  );
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
    if (kind === "agents") {
      if (typeof entry === "string") {
        const agent = entry.trim();
        if (agent) {
          out.push({
            agent,
            role: null,
            model: null,
            note: null,
          });
        }
        continue;
      }
      if (!isRecord(entry)) {
        continue;
      }
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
      if (typeof entry === "string") {
        const path = entry.trim();
        if (path) {
          out.push({
            path,
            kind: "artifact",
            agent: null,
            note: null,
          });
        }
        continue;
      }
      if (!isRecord(entry)) {
        continue;
      }
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
      if (typeof entry === "string") {
        const decision = entry.trim();
        if (decision) {
          out.push({
            decision,
            reason: null,
          });
        }
        continue;
      }
      if (!isRecord(entry)) {
        continue;
      }
      const decision = asTrimmedString(entry.decision);
      if (!decision) {
        continue;
      }
      out.push({
        decision,
        reason: asTrimmedString(entry.reason),
      });
    } else if (kind === "workflowDeviations") {
      if (typeof entry === "string") {
        const deviation = entry.trim();
        if (deviation) {
          out.push({
            deviation,
            reason: null,
          });
        }
        continue;
      }
      if (!isRecord(entry)) {
        continue;
      }
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

function parseWorkflowCatalogEntry(entry: unknown): HybridWorkflowCatalogEntry | null {
  if (!isRecord(entry)) {
    return null;
  }
  const id = asTrimmedString(entry.id);
  const name = asTrimmedString(entry.name);
  if (!id || !name) {
    return null;
  }
  const rawStatus = asTrimmedString(entry.status);
  const status =
    rawStatus === "tested" || rawStatus === "deprecated" || rawStatus === "planned"
      ? rawStatus
      : "planned";
  return {
    id,
    name,
    status,
    description: asTrimmedString(entry.description),
    suitableFor: asStringArray(entry.suitableFor),
    notFor: asStringArray(entry.notFor),
    agentPath: asStringArray(entry.agentPath),
  };
}

function parseWorkflowCatalog(body: unknown): HybridWorkflowCatalogEntry[] {
  if (!isRecord(body) || !Array.isArray(body.workflows)) {
    return [];
  }
  return body.workflows
    .map(parseWorkflowCatalogEntry)
    .filter((entry): entry is HybridWorkflowCatalogEntry => Boolean(entry));
}

async function readWorkflowCatalog(): Promise<{
  sourcePath: string;
  catalog: HybridWorkflowCatalogEntry[];
  error?: string;
}> {
  const sourcePath = workflowCatalogPath();
  try {
    const raw = await readFile(sourcePath, "utf8");
    const catalog = parseWorkflowCatalog(JSON.parse(raw) as unknown);
    if (catalog.length === 0) {
      return { sourcePath, catalog: [], error: "workflow catalog empty or invalid" };
    }
    return { sourcePath, catalog };
  } catch (err) {
    const code = isRecord(err) && typeof err.code === "string" ? err.code : null;
    return {
      sourcePath,
      catalog: [],
      error:
        code === "ENOENT"
          ? "workflow catalog missing"
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
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

function slugFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function requiredString(params: ZClawCreateAgentParams, key: keyof ZClawCreateAgentParams) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(
  params: ZClawCreateAgentParams,
  key: keyof ZClawCreateAgentParams,
  fallback: string,
) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function defaultHermesProfile(agentId: string): string {
  return `z${agentId.replace(/[^a-z0-9]+/g, "")}`;
}

function defaultModelForBudget(modelBudget: string): string {
  return modelBudget === "tool-execution" ? "openai-codex/gpt-5.4-mini" : "ollama-lan/qwen3.5:9b";
}

function hermesConfigForModel(model: string): string {
  if (model.startsWith("openai-codex/")) {
    return `model:
  default: "${model.slice("openai-codex/".length)}"
  provider: "openai-codex"
`;
  }
  if (model.startsWith("ollama-lan/")) {
    return `model:
  default: "${model.slice("ollama-lan/".length)}"
  provider: "custom"
  base_url: "http://192.168.1.34:11434/v1"
  api_key: "ollama-local"
  context_length: 65536
`;
  }
  return `model:
  default: "${model}"
`;
}

function soulMarkdown(params: {
  name: string;
  agentId: string;
  companyScope: string;
  teamId: string;
  role: string;
  description: string;
  defaultModel: string;
  modelBudget: string;
  toolUse: string;
  workspace: string;
}) {
  return `# ${params.name}

## Identity

Agent ID: \`${params.agentId}\`

Company scope: \`${params.companyScope}\`

Team: \`${params.teamId}\`

Role: ${params.role}

## Mission

${params.description}

## Default Model

Default: \`${params.defaultModel}\`

Model budget: \`${params.modelBudget}\`

Escalation reviewer: \`openai-codex/gpt-5.5\` through Hermes CEO.

## Best Used For

- Work matching this role and team.
- Tasks routed by OpenClaw with clear acceptance criteria.
- Focused contributions that can be verified by another agent or the CEO.

## Do Not Use For

- Work owned by another specialized agent.
- High-risk decisions without CEO review.
- Durable memory updates without explicit CEO acceptance.

## Inputs Expected

This agent expects a packet or task brief with objective, relevant context,
constraints, acceptance criteria, allowed tools, deliverable format, and
escalation triggers.

## Outputs Required

Return the protocol packet that matches the work. Include assumptions,
verification, risks, blockers, and memory candidates.

## Tools and Workspace

- Workspace: \`${params.workspace}\`
- Tool-use class: \`${params.toolUse}\`
- External side effects: only when explicitly allowed by the task packet.

## Memory Rules

- Treat task context as working memory.
- Do not write durable memory directly.
- Propose durable facts as \`memory_candidates\`.
- Mark uncertainty clearly.

## Escalation Triggers

Escalate to Hermes CEO when requirements are ambiguous, confidence is low, tool
access is missing, security/privacy/destructive/public actions are involved, the
task requires architecture or product judgment, or the same attempt fails twice.

## Style

- Be concise.
- Use concrete outputs.
- Do not narrate irrelevant reasoning.
- Prefer checklists for status and verification.
`;
}

function agentsMarkdown(params: { agentId: string; role: string }) {
  return `# ${params.agentId}

- \`SOUL.md\` defines this agent's role behavior.
- Follow \`/home/z/Claw/integration/OPERATING_PROTOCOL.md\`.
- Follow \`/home/z/Claw/integration/STANDARD_WORKFLOWS.md\` when routed through a standard workflow.
- Role: ${params.role}
`;
}

function identityMarkdown(params: { name: string; agentId: string; role: string }) {
  return `# Identity

Name: ${params.name}

Agent ID: \`${params.agentId}\`

Role: ${params.role}
`;
}

async function writeTextFile(pathname: string, content: string, files: string[]) {
  await mkdir(pathname.slice(0, pathname.lastIndexOf("/")), { recursive: true });
  await writeFile(pathname, content, "utf8");
  files.push(pathname);
}

async function writeJsonAtomic(pathname: string, body: unknown) {
  await mkdir(pathname.slice(0, pathname.lastIndexOf("/")), { recursive: true });
  const tmp = `${pathname}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  await rename(tmp, pathname);
}

async function ensureAuthSymlink(profileHome: string, files: string[]) {
  const target = "/home/z/.hermes/auth.json";
  const link = `${profileHome}/auth.json`;
  try {
    const stat = await lstat(link);
    if (stat.isSymbolicLink() || stat.isFile()) {
      return;
    }
  } catch {
    // Missing link is created below.
  }
  await symlink(target, link);
  files.push(link);
}

async function ensureHermesProfile(params: {
  profile: string;
  soul: string;
  config: string;
  files: string[];
}) {
  const home = hermesProfileHome(params.profile);
  await mkdir(home, { recursive: true, mode: 0o700 });
  for (const child of ["sessions", "memories", "skills", "logs", "workspace", "home"]) {
    await mkdir(`${home}/${child}`, { recursive: true });
  }
  await writeTextFile(`${home}/SOUL.md`, params.soul, params.files);
  await writeTextFile(`${home}/config.yaml`, params.config, params.files);
  await ensureAuthSymlink(home, params.files);
}

async function readOrganizationBody(): Promise<Record<string, unknown>> {
  const raw = await readFile(organizationPath(), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Z-Claw organization registry is not an object");
  }
  return parsed;
}

function updateOrganizationForAgent(params: {
  body: Record<string, unknown>;
  agent: OrganizationAgent;
}) {
  const teamId = params.agent.teamId ?? "research";
  const companyScope = params.agent.companyScope ?? "shared";
  const agents = Array.isArray(params.body.agents) ? [...params.body.agents] : [];
  if (
    agents.some(
      (entry) =>
        isRecord(entry) &&
        asTrimmedString(entry.id)?.toLowerCase() === params.agent.id.toLowerCase(),
    )
  ) {
    throw new Error(`Z-Claw agent "${params.agent.id}" already exists`);
  }
  agents.push({
    id: params.agent.id,
    name: params.agent.name,
    role: params.agent.role,
    companyScope: params.agent.companyScope,
    teamId: params.agent.teamId,
    hermesProfile: params.agent.hermesProfile,
    defaultModel: params.agent.defaultModel,
    modelBudget: params.agent.modelBudget,
    toolUse: params.agent.toolUse,
    memoryOwner: "hermes",
    description: params.agent.description,
  });

  const teams = Array.isArray(params.body.teams) ? [...params.body.teams] : [];
  const teamIndex = teams.findIndex(
    (entry) => isRecord(entry) && asTrimmedString(entry.id) === teamId,
  );
  if (teamIndex >= 0) {
    const team = isRecord(teams[teamIndex]) ? { ...teams[teamIndex] } : {};
    const ids = asStringArray(team.agentIds);
    team.agentIds = ids.includes(params.agent.id) ? ids : [...ids, params.agent.id];
    teams[teamIndex] = team;
  } else {
    teams.push({
      id: teamId,
      name: teamId
        .split("-")
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(" "),
      scope: companyScope,
      mission: params.agent.description,
      agentIds: [params.agent.id],
    });
  }

  const companies = Array.isArray(params.body.companies) ? [...params.body.companies] : [];
  const companyIndex = companies.findIndex(
    (entry) => isRecord(entry) && asTrimmedString(entry.id) === companyScope,
  );
  if (companyIndex >= 0) {
    const company = isRecord(companies[companyIndex]) ? { ...companies[companyIndex] } : {};
    const teamIds = asStringArray(company.teamIds);
    company.teamIds = teamIds.includes(teamId) ? teamIds : [...teamIds, teamId];
    companies[companyIndex] = company;
  }

  return {
    ...params.body,
    generatedBy: "zclaw-agent-provisioner",
    companies,
    teams,
    agents,
  };
}

async function provisionZClawAgent(
  cfg: OpenClawConfig,
  params: ZClawCreateAgentParams,
): Promise<ZClawCreateAgentResult> {
  const rawName = requiredString(params, "name");
  const rawRole = requiredString(params, "role");
  if (!rawName || !rawRole) {
    throw new Error("name and role are required");
  }
  const agentId = normalizeAgentId(requiredString(params, "id") ?? slugFromName(rawName));
  if (!agentId || agentId === DEFAULT_AGENT_ID) {
    throw new Error(`invalid or reserved agent id: ${agentId || "(empty)"}`);
  }
  if (findAgentEntryIndex(listAgentEntries(cfg), agentId) >= 0) {
    throw new Error(`OpenClaw agent "${agentId}" already exists`);
  }

  const companyScope = optionalString(params, "companyScope", "shared");
  const teamId = optionalString(params, "teamId", "research");
  const modelBudget = optionalString(params, "modelBudget", "local-default");
  const defaultModel = optionalString(params, "defaultModel", defaultModelForBudget(modelBudget));
  const toolUse = optionalString(params, "toolUse", "role-specific");
  const description = optionalString(params, "description", rawRole);
  const hermesProfile = optionalString(params, "hermesProfile", defaultHermesProfile(agentId));
  const workspace = resolveUserPath(zClawAgentRuntimeDir(agentId));
  const sourceDir = zClawAgentSourceDir(agentId);
  const files: string[] = [];

  const soul = soulMarkdown({
    name: rawName,
    agentId,
    companyScope,
    teamId,
    role: rawRole,
    description,
    defaultModel,
    modelBudget,
    toolUse,
    workspace,
  });

  await ensureAgentWorkspace({ dir: workspace, ensureBootstrapFiles: true });
  await mkdir(sourceDir, { recursive: true });
  for (const dir of [workspace, sourceDir]) {
    await writeTextFile(`${dir}/SOUL.md`, soul, files);
    await writeTextFile(`${dir}/AGENTS.md`, agentsMarkdown({ agentId, role: rawRole }), files);
    await writeTextFile(
      `${dir}/IDENTITY.md`,
      identityMarkdown({ name: rawName, agentId, role: rawRole }),
      files,
    );
    await writeTextFile(`${dir}/TOOLS.md`, `# Tools\n\nTool-use class: \`${toolUse}\`\n`, files);
    await writeTextFile(
      `${dir}/USER.md`,
      "# User Context\n\nFollow task packets and CEO instructions.\n",
      files,
    );
    await writeTextFile(
      `${dir}/HEARTBEAT.md`,
      "# Heartbeat\n\nReport concise status when asked.\n",
      files,
    );
  }
  await ensureHermesProfile({
    profile: hermesProfile,
    soul,
    config: hermesConfigForModel(defaultModel),
    files,
  });

  const body = await readOrganizationBody();
  const orgAgent: OrganizationAgent = {
    id: agentId,
    name: rawName,
    role: rawRole,
    companyScope,
    teamId,
    hermesProfile,
    defaultModel,
    modelBudget,
    toolUse,
    memoryOwner: "hermes",
    description,
  };
  const nextOrg = updateOrganizationForAgent({ body, agent: orgAgent });
  await writeJsonAtomic(organizationPath(), nextOrg);
  files.push(organizationPath());
  const runtimeOrg = runtimeOrganizationPath();
  if (runtimeOrg !== organizationPath()) {
    await writeJsonAtomic(runtimeOrg, nextOrg);
    files.push(runtimeOrg);
  }

  const agentDir = resolveUserPath(sourceDir);
  const nextConfig = applyAgentConfig(cfg, {
    agentId,
    name: rawName,
    workspace,
    agentDir,
    model: `hermes-workers/${agentId}`,
    identity: { name: rawName },
  });
  await replaceConfigFile({ nextConfig, afterWrite: { mode: "auto" } });

  return {
    agentId,
    name: rawName,
    hermesProfile,
    modelPrimary: `hermes-workers/${agentId}`,
    workspace,
    agentDir,
    organizationPath: organizationPath(),
    runtimeOrganizationPath: runtimeOrg === organizationPath() ? null : runtimeOrg,
    hermesProfileHome: hermesProfileHome(hermesProfile),
    files,
  };
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
  "zclaw.agents.create": async ({ params, respond, context }) => {
    try {
      if (!isRecord(params)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "params must be an object"),
        );
        return;
      }
      const result = await provisionZClawAgent(
        context.getRuntimeConfig(),
        params as ZClawCreateAgentParams,
      );
      respond(true, result satisfies ZClawCreateAgentResult);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, err instanceof Error ? err.message : String(err)),
      );
    }
  },
  "hybrid.status": async ({ context, respond }) => {
    const cfg = context.getRuntimeConfig();
    const organization = await readOrganization();
    const runs = await readRunLedger();
    const workflows = await readWorkflowCatalog();
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
    if (workflows.error) {
      caveats.push(`Z-Claw workflow catalog: ${workflows.error}.`);
    }
    respond(true, {
      ok: true,
      generatedAt: Date.now(),
      organization: organization.organization,
      runs,
      workflows,
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
