import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceConfigFile } from "../../config/config.js";
import { hybridHandlers } from "./hybrid.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

vi.mock("../../config/config.js", () => ({
  replaceConfigFile: vi.fn(async () => undefined),
}));

function createContext() {
  return {
    getRuntimeConfig: () => ({
      agents: {
        defaults: {
          model: { primary: "hermes-workers/main" },
        },
        list: [
          {
            id: "builder",
            workspace: "/tmp/builder",
            identity: { name: "Owen Carter" },
            model: { primary: "hermes-workers/builder" },
          },
        ],
      },
      models: {
        providers: {
          "hermes-workers": {
            baseUrl: "http://127.0.0.1:18981/v1",
            apiKey: "must-not-be-returned",
          },
        },
      },
    }),
  };
}

describe("hybridHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns sanitized Hermes worker telemetry", async () => {
    const runsRoot = await mkdtemp(join(tmpdir(), "openclaw-hybrid-runs-"));
    const catalogRoot = await mkdtemp(join(tmpdir(), "openclaw-hybrid-workflows-"));
    const catalogPath = join(catalogRoot, "zclaw_workflows.json");
    const runDir = join(runsRoot, "software_change_small", "20260506-193546-password-cli");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "manifest.json"),
      JSON.stringify({
        run_id: "20260506-193546-password-cli",
        workflow: "software_change_small",
        task_id: "password-cli",
        objective: "Create password CLI.",
        status: "accepted",
        created_at: "2026-05-06T16:35:46Z",
        updated_at: "2026-05-06T16:46:23Z",
        durable_memory_used: false,
        agents: [{ agent: "builder", role: "engineering", model: "gpt-5.4-mini" }],
        artifacts: [
          {
            path: "/home/z/Claw/workspace/tools/password_cli.py",
            kind: "implementation",
            agent: "builder",
          },
        ],
        decisions: [{ decision: "accept", reason: "verified" }],
        workflow_deviations: [],
      }),
      "utf8",
    );
    await writeFile(
      catalogPath,
      JSON.stringify({
        schemaVersion: 1,
        workflows: [
          {
            id: "software_change_small",
            name: "Small Software Change",
            status: "tested",
            description: "Scoped software implementation.",
            suitableFor: ["small CLI tools"],
            notFor: ["broad refactors"],
            agentPath: ["main", "planner", "builder", "qa-tester", "reporter", "main"],
          },
        ],
      }),
      "utf8",
    );
    vi.stubEnv("Z_CLAW_RUNS_ROOT", runsRoot);
    vi.stubEnv("Z_CLAW_WORKFLOWS_PATH", catalogPath);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          models: ["main", "builder"],
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
              log: {
                lastInvokeAt: 1778097500,
                lastCompleteAt: 1778097600,
                lastErrorAt: null,
                recentErrorCount: 0,
              },
            },
          ],
        }),
      })),
    );
    let payload: unknown = null;
    await hybridHandlers["hybrid.status"]?.({
      params: {},
      context: createContext(),
      respond: (ok, result) => {
        expect(ok).toBe(true);
        payload = result;
      },
    } as unknown as GatewayRequestHandlerOptions);

    expect(payload).toMatchObject({
      ok: true,
      providers: [
        {
          id: "hermes-workers",
          kind: "hermes-worker",
          baseUrl: "http://127.0.0.1:18981/v1",
          reachable: true,
          health: {
            ok: true,
            models: ["main", "builder"],
            profiles: [
              {
                model: "builder",
                profile: "zbuilder",
                name: "Owen Carter",
                sessionId: "20260506_builder",
                profileHomeExists: true,
                sessionFileExists: true,
              },
            ],
          },
          agentIds: ["builder"],
        },
      ],
      agents: [
        {
          id: "builder",
          name: "Owen Carter",
          modelPrimary: "hermes-workers/builder",
          hermesBacked: true,
          hermesProfile: "zbuilder",
          memoryOwner: "hermes",
        },
      ],
      runs: {
        root: runsRoot,
        total: 1,
        recent: [
          {
            runId: "20260506-193546-password-cli",
            workflow: "software_change_small",
            taskId: "password-cli",
            status: "accepted",
          },
        ],
      },
      workflows: {
        sourcePath: catalogPath,
        catalog: [
          {
            id: "software_change_small",
            name: "Small Software Change",
            status: "tested",
          },
        ],
      },
    });
    expect(JSON.stringify(payload)).not.toContain("must-not-be-returned");
  });

  it("provisions Hermes-backed Z-Claw agents through the dedicated create flow", async () => {
    const root = await mkdtemp(join(tmpdir(), "openclaw-zclaw-create-"));
    const sourceRoot = join(root, "source");
    const runtimeRoot = join(root, "runtime");
    const hermesHome = join(root, "hermes");
    await mkdir(join(sourceRoot, "integration"), { recursive: true });
    await writeFile(
      join(sourceRoot, "integration", "zclaw_organization.json"),
      JSON.stringify({
        schemaVersion: 1,
        systemName: "Z Claw",
        companies: [{ id: "shared", name: "Shared", kind: "shared", teamIds: ["research"] }],
        teams: [{ id: "research", name: "Research", scope: "shared", agentIds: [] }],
        agents: [],
      }),
      "utf8",
    );
    vi.stubEnv("Z_CLAW_ROOT", sourceRoot);
    vi.stubEnv("Z_CLAW_RUNTIME_ROOT", runtimeRoot);
    vi.stubEnv("HERMES_HOME", hermesHome);

    let payload: unknown = null;
    await hybridHandlers["zclaw.agents.create"]?.({
      params: {
        name: "Alice Morgan",
        role: "History research analyst",
        teamId: "research",
        companyScope: "shared",
        modelBudget: "local-default",
        toolUse: "research-readonly",
      },
      context: createContext(),
      respond: (ok, result, error) => {
        expect(error).toBeUndefined();
        expect(ok).toBe(true);
        payload = result;
      },
    } as unknown as GatewayRequestHandlerOptions);

    expect(payload).toMatchObject({
      agentId: "alice-morgan",
      name: "Alice Morgan",
      hermesProfile: "zalicemorgan",
      modelPrimary: "hermes-workers/alice-morgan",
      workspace: join(runtimeRoot, "agents", "alice-morgan"),
      agentDir: join(sourceRoot, "agents", "alice-morgan"),
      organizationPath: join(sourceRoot, "integration", "zclaw_organization.json"),
      runtimeOrganizationPath: join(runtimeRoot, "integration", "zclaw_organization.json"),
      hermesProfileHome: join(hermesHome, "profiles", "zalicemorgan"),
    });

    const runtimeSoul = await readFile(
      join(runtimeRoot, "agents", "alice-morgan", "SOUL.md"),
      "utf8",
    );
    const sourceIdentity = await readFile(
      join(sourceRoot, "agents", "alice-morgan", "IDENTITY.md"),
      "utf8",
    );
    const profileConfig = await readFile(
      join(hermesHome, "profiles", "zalicemorgan", "config.yaml"),
      "utf8",
    );
    const org = JSON.parse(
      await readFile(join(sourceRoot, "integration", "zclaw_organization.json"), "utf8"),
    ) as {
      teams: Array<{ id: string; agentIds: string[] }>;
      agents: Array<{ id: string; hermesProfile: string; memoryOwner: string }>;
    };

    expect(runtimeSoul).toContain("History research analyst");
    expect(sourceIdentity).toContain("Alice Morgan");
    expect(profileConfig).toContain('provider: "custom"');
    expect(profileConfig).toContain("192.168.1.34:11434");
    expect(org.agents).toContainEqual(
      expect.objectContaining({
        id: "alice-morgan",
        hermesProfile: "zalicemorgan",
        memoryOwner: "hermes",
      }),
    );
    expect(org.teams.find((team) => team.id === "research")?.agentIds).toContain("alice-morgan");
    expect(replaceConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        nextConfig: expect.objectContaining({
          agents: expect.objectContaining({
            list: expect.arrayContaining([
              expect.objectContaining({
                id: "alice-morgan",
                workspace: join(runtimeRoot, "agents", "alice-morgan"),
                agentDir: join(sourceRoot, "agents", "alice-morgan"),
                model: "hermes-workers/alice-morgan",
                identity: { name: "Alice Morgan" },
              }),
            ]),
          }),
        }),
        afterWrite: { mode: "auto" },
      }),
    );
  });
});
