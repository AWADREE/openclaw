import type { DebugState } from "./controllers/debug.ts";
import { loadDebug } from "./controllers/debug.ts";
import type { HybridState } from "./controllers/hybrid.ts";
import { loadHybridStatus } from "./controllers/hybrid.ts";
import type { LogsState } from "./controllers/logs.ts";
import { loadLogs } from "./controllers/logs.ts";
import type { NodesState } from "./controllers/nodes.ts";
import { loadNodes } from "./controllers/nodes.ts";

type PollingHost = {
  nodesPollInterval: number | null;
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  hybridPollInterval?: number | null;
  tab: string;
  connected?: boolean;
};

export function startNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval != null) {
    return;
  }
  host.nodesPollInterval = window.setInterval(
    () => void loadNodes(host as unknown as NodesState, { quiet: true }),
    5000,
  );
}

export function stopNodesPolling(host: PollingHost) {
  if (host.nodesPollInterval == null) {
    return;
  }
  clearInterval(host.nodesPollInterval);
  host.nodesPollInterval = null;
}

export function startLogsPolling(host: PollingHost) {
  if (host.logsPollInterval != null) {
    return;
  }
  host.logsPollInterval = window.setInterval(() => {
    if (host.tab !== "logs") {
      return;
    }
    void loadLogs(host as unknown as LogsState, { quiet: true });
  }, 2000);
}

export function stopLogsPolling(host: PollingHost) {
  if (host.logsPollInterval == null) {
    return;
  }
  clearInterval(host.logsPollInterval);
  host.logsPollInterval = null;
}

export function startDebugPolling(host: PollingHost) {
  if (host.debugPollInterval != null) {
    return;
  }
  host.debugPollInterval = window.setInterval(() => {
    if (host.tab !== "debug") {
      return;
    }
    void loadDebug(host as unknown as DebugState);
  }, 3000);
}

export function stopDebugPolling(host: PollingHost) {
  if (host.debugPollInterval == null) {
    return;
  }
  clearInterval(host.debugPollInterval);
  host.debugPollInterval = null;
}

function shouldPollHybrid(host: PollingHost): boolean {
  return host.connected === true && (host.tab === "hybrid" || host.tab === "officeSpace");
}

export function startHybridPolling(host: PollingHost) {
  if (host.hybridPollInterval != null) {
    return;
  }
  host.hybridPollInterval = window.setInterval(() => {
    if (!shouldPollHybrid(host)) {
      return;
    }
    void loadHybridStatus(host as unknown as HybridState);
  }, 2500);
}

export function stopHybridPolling(host: PollingHost) {
  if (host.hybridPollInterval == null) {
    return;
  }
  clearInterval(host.hybridPollInterval);
  host.hybridPollInterval = null;
}
