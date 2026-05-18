/**
 * Extension status and health reporting.
 */

export type PolicyState = {
  allowedDomains: string[] | "all";
  blockedDomains: string[];
  requireApproval: boolean;
  maxActionsPerMinute: number;
};

export type ExtensionStatus = {
  version: string;
  connected: boolean;
  daemonUrl: string;
  activeTabId: number | null;
  policy: PolicyState;
  lastHeartbeat: number;
  tracesActive: boolean;
};

const STORAGE_KEY = "kimi_bridge_policy";

let connectionState = {
  connected: false,
  activeTabId: null as number | null,
};

let lastHeartbeat = 0;
let tracesActive = false;
let cachedPolicy: PolicyState = getDefaultPolicy();
let policyInitialized = false;

export function setConnectionState(connected: boolean, activeTabId: number | null): void {
  connectionState.connected = connected;
  connectionState.activeTabId = activeTabId;
  if (connected) {
    lastHeartbeat = Date.now();
  }
}

export function recordHeartbeat(): void {
  lastHeartbeat = Date.now();
}

export function setTracesActive(active: boolean): void {
  tracesActive = active;
}

export function getDefaultPolicy(): PolicyState {
  return {
    allowedDomains: "all",
    blockedDomains: [],
    requireApproval: false,
    maxActionsPerMinute: 60,
  };
}

export function getCurrentPolicy(): PolicyState {
  return cachedPolicy;
}

export async function loadPolicy(): Promise<PolicyState> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const policy = stored[STORAGE_KEY] as PolicyState | undefined;
    if (policy && typeof policy === "object") {
      return { ...getDefaultPolicy(), ...policy };
    }
  } catch {
    // Ignore storage read errors
  }
  return getDefaultPolicy();
}

export async function savePolicy(policy: PolicyState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: policy });
}

export function setPolicy(policy: Partial<PolicyState>): void {
  cachedPolicy = { ...cachedPolicy, ...policy };
  void savePolicy(cachedPolicy);
}

export function getStatus(): ExtensionStatus {
  return {
    version: chrome.runtime.getManifest().version,
    connected: connectionState.connected,
    daemonUrl: `ws://127.0.0.1:10086/extension`,
    activeTabId: connectionState.activeTabId,
    policy: cachedPolicy,
    lastHeartbeat,
    tracesActive,
  };
}

// Initialize cached policy asynchronously on module load
void (async (): Promise<void> => {
  if (!policyInitialized) {
    cachedPolicy = await loadPolicy();
    policyInitialized = true;
  }
})();
