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
  workspace: string | null;
  modelPrimary: string | null;
  providerId: string | null;
  hermesBacked: boolean;
  hermesProfile: string | null;
  runtimeSource: string | null;
  memoryOwner: "hermes" | "openclaw" | "unknown";
};

export type HybridStatusResult = {
  ok: true;
  generatedAt: number;
  providers: ProviderStatus[];
  agents: HybridAgentStatus[];
  telemetry: {
    openclawUsageAuthority: "observed";
    hermesBillingAuthority: "unavailable";
    hermesMemoryAuthority: "external";
  };
  caveats: string[];
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
    const providers = readProviders(cfg);
    const agentRows = listAgentsForGateway(cfg).agents;
    const agents = agentRows.map((agent) => {
      const primary = modelPrimary(agent.model);
      const providerId = providerIdFromModel(primary);
      const hermesBacked = Boolean(
        providerId && isHermesProvider(providerId, providers[providerId]),
      );
      return {
        id: agent.id,
        name: agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
        workspace: agent.workspace?.trim() || null,
        modelPrimary: primary,
        providerId,
        hermesBacked,
        hermesProfile: hermesBacked ? hermesProfileFromModel(primary) : null,
        runtimeSource: agent.agentRuntime?.source ?? null,
        memoryOwner: hermesBacked ? "hermes" : providerId ? "openclaw" : "unknown",
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
    const hermesBackedCount = agents.filter((agent) => agent.hermesBacked).length;
    const caveats: string[] = [];
    if (agents.length > 0 && hermesBackedCount < agents.length) {
      caveats.push("Some agents are not backed by a Hermes worker provider.");
    }
    if (hermesBackedCount > 0) {
      caveats.push(
        "Hermes memory and subscription telemetry are external to OpenClaw until a Hermes metrics bridge is connected.",
      );
    }
    respond(true, {
      ok: true,
      generatedAt: Date.now(),
      providers: providerStatuses,
      agents,
      telemetry: {
        openclawUsageAuthority: "observed",
        hermesBillingAuthority: "unavailable",
        hermesMemoryAuthority: "external",
      },
      caveats,
    } satisfies HybridStatusResult);
  },
};
