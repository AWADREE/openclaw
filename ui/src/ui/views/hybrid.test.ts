import { describe, expect, it } from "vitest";
import type { AgentsListResult, SessionsListResult, SessionsUsageResult } from "../types.ts";
import { summarizeHybridState } from "./hybrid.ts";

describe("summarizeHybridState", () => {
  it("detects Hermes-backed workers and separates observed OpenClaw usage", () => {
    const agentsList: AgentsListResult = {
      defaultId: "main",
      mainKey: "main",
      scope: "per-channel-peer",
      agents: [
        {
          id: "builder",
          identity: { name: "Owen Carter" },
          workspace: "/home/z/Claw/agents/builder",
          model: { primary: "hermes-workers/builder" },
          agentRuntime: { id: "builder", source: "agent" },
        },
        {
          id: "legacy",
          model: { primary: "openai/gpt-5" },
          agentRuntime: { id: "legacy", source: "defaults" },
        },
      ],
    };
    const sessionsResult = {
      ts: 1,
      path: "sessions.json",
      count: 2,
      defaults: {},
      sessions: [
        {
          key: "agent:builder:main",
          hasActiveRun: true,
          updatedAt: 1000,
        },
        {
          key: "agent:legacy:main",
          status: "done",
          updatedAt: 500,
        },
      ],
    } as SessionsListResult;
    const usageResult = {
      updatedAt: 1,
      startDate: "2026-05-06",
      endDate: "2026-05-06",
      sessions: [],
      totals: { totalTokens: 1200, totalCost: 0.42 },
      aggregates: {
        messages: { total: 0, user: 0, assistant: 0, system: 0, tool: 0, errors: 0 },
        tools: { totalCalls: 0, tools: [] },
        byModel: [],
        byProvider: [],
        byChannel: [],
        daily: [],
        byAgent: [{ agentId: "builder", totals: { totalTokens: 900, totalCost: 0.3 } }],
      },
    } as SessionsUsageResult;

    const summary = summarizeHybridState({
      connected: true,
      agentsList,
      sessionsResult,
      usageResult,
      hybridResult: null,
    });

    expect(summary.agentCount).toBe(2);
    expect(summary.hermesBackedCount).toBe(1);
    expect(summary.activeSessionCount).toBe(1);
    expect(summary.openclawNativeTokens).toBe(1200);
    expect(summary.openclawNativeCost).toBe(0.42);
    expect(summary.agents[0]).toMatchObject({
      id: "builder",
      name: "Owen Carter",
      hermesBacked: true,
      hermesProfile: "builder",
      status: "active",
      usageTokens: 900,
      usageCost: 0.3,
    });
    expect(summary.caveats.some((item) => item.includes("not routed through"))).toBe(true);
    expect(summary.caveats.some((item) => item.includes("Hermes telemetry bridge"))).toBe(true);
  });

  it("uses gateway hybrid telemetry when available", () => {
    const summary = summarizeHybridState({
      connected: true,
      agentsList: null,
      sessionsResult: null,
      usageResult: null,
      hybridResult: {
        ok: true,
        generatedAt: 1,
        organization: {
          schemaVersion: 1,
          systemName: "Z Claw",
          sourcePath: "/home/z/Claw/integration/zclaw_organization.json",
          companies: [
            {
              id: "shared",
              name: "Shared Services",
              kind: "shared",
              mission: "Reusable teams.",
              teamIds: ["engineering"],
              teams: [{ id: "engineering", name: "Engineering", agentIds: ["builder"] }],
            },
          ],
          teams: [
            {
              id: "engineering",
              name: "Engineering",
              scope: "shared",
              mission: "Build software.",
              agentIds: ["builder"],
            },
          ],
        },
        runs: {
          root: "/home/z/Claw/workspace/runs",
          total: 1,
          recent: [
            {
              runId: "20260506-193546-password-cli",
              workflow: "software_change_small",
              taskId: "password-cli",
              objective: "Create password CLI.",
              status: "accepted",
              createdAt: "2026-05-06T16:35:46Z",
              updatedAt: "2026-05-06T16:46:23Z",
              durableMemoryUsed: false,
              runDir:
                "/home/z/Claw/workspace/runs/software_change_small/20260506-193546-password-cli",
              agents: [
                { agent: "builder", role: "engineering", model: "gpt-5.4-mini", note: null },
              ],
              artifacts: [
                {
                  path: "/home/z/Claw/workspace/tools/password_cli.py",
                  kind: "implementation",
                  agent: "builder",
                  note: "Builder-created password CLI",
                },
              ],
              decisions: [{ decision: "accept", reason: "verified" }],
              workflowDeviations: [],
            },
          ],
        },
        providers: [
          {
            id: "hermes-workers",
            kind: "hermes-worker",
            baseUrl: "http://127.0.0.1:18981/v1",
            agentIds: ["builder"],
            reachable: true,
            health: {
              ok: true,
              models: ["builder"],
              profiles: [
                {
                  model: "builder",
                  profile: "zbuilder",
                  name: "Owen Carter",
                  sessionId: "20260506_builder",
                  profileHomeExists: true,
                  sessionFileExists: true,
                  sessions: {
                    count: 3,
                    latestSessionId: "20260506_builder",
                    latestSessionMtime: 1778097600,
                  },
                  metrics: {
                    databaseExists: true,
                    sessions: 2,
                    messages: 12,
                    toolCalls: 4,
                    inputTokens: 1000,
                    outputTokens: 200,
                    models: ["gpt-5.4-mini"],
                    billingProviders: ["openai-codex"],
                  },
                  log: {
                    lastInvokeAt: 1778097500,
                    lastCompleteAt: 1778097600,
                    lastErrorAt: null,
                    recentErrorCount: 0,
                  },
                },
              ],
            },
          },
        ],
        agents: [
          {
            id: "builder",
            name: "Owen Carter",
            role: "Software Coder",
            companyScope: "shared",
            teamId: "engineering",
            workspace: "/home/z/Claw/agents/builder",
            modelPrimary: "hermes-workers/builder",
            providerId: "hermes-workers",
            hermesBacked: true,
            hermesProfile: "builder",
            runtimeSource: "agent",
            memoryOwner: "hermes",
            modelBudget: "tool-execution",
            toolUse: "filesystem-and-tests",
            description: "Owns scoped implementation work.",
          },
        ],
        telemetry: {
          openclawUsageAuthority: "observed",
          hermesSessionMetricsAuthority: "observed",
          hermesBillingAuthority: "unavailable",
          hermesMemoryAuthority: "external",
        },
        caveats: ["Hermes metrics bridge pending."],
      },
    });

    expect(summary.providers).toHaveLength(1);
    expect(summary.providers[0]?.reachable).toBe(true);
    expect(summary.agents[0]).toMatchObject({
      id: "builder",
      name: "Owen Carter",
      role: "Software Coder",
      teamId: "engineering",
      hermesBacked: true,
      hermesProfile: "builder",
      profileTelemetry: { profile: "zbuilder" },
    });
    expect(summary.agents[0]?.recentRuns[0]?.taskId).toBe("password-cli");
    expect(summary.organization?.companies[0]?.name).toBe("Shared Services");
    expect(summary.runs?.recent[0]?.status).toBe("accepted");
    expect(summary.caveats).toContain("Hermes metrics bridge pending.");
  });
});
