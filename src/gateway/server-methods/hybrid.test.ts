import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hybridHandlers } from "./hybrid.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

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
});
