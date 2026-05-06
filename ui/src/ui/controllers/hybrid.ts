import type { GatewayBrowserClient } from "../gateway.ts";
import type { HybridStatusResult } from "../types.ts";

export type HybridState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  hybridLoading: boolean;
  hybridResult: HybridStatusResult | null;
  hybridError: string | null;
};

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function loadHybridStatus(state: HybridState) {
  if (!state.client || !state.connected || state.hybridLoading) {
    return;
  }
  state.hybridLoading = true;
  state.hybridError = null;
  try {
    state.hybridResult = await state.client.request<HybridStatusResult>("hybrid.status", {});
  } catch (err) {
    state.hybridResult = null;
    state.hybridError = toErrorMessage(err);
  } finally {
    state.hybridLoading = false;
  }
}
