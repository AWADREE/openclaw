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
    });
    expect(JSON.stringify(payload)).not.toContain("must-not-be-returned");
  });
});
