/**
 * Kimi WebBridge v2.0 — Shared Protocol Types (Sections 1–2)
 *
 * Copy of extension/src/shared/protocol.ts. Kept in sync by Worker-0.
 */

// ---------------------------------------------------------------------------
// 0. DOM compatibility (daemon does not include DOM lib)
// ---------------------------------------------------------------------------

export type DocumentReadyState = "loading" | "interactive" | "complete";

// ---------------------------------------------------------------------------
// 1. Shared Types
// ---------------------------------------------------------------------------

export type TargetRef = {
  ref?: string;
  tabId?: number;
  frameId?: number;
  selector?: string;
  generation?: number;
  textHash?: string;
  rect?: Rect;
  xpath?: string;
  text?: string;
  name?: string;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type VerifyCondition =
  | { type: "none" }
  | { type: "url_changed" }
  | { type: "url_contains"; text: string }
  | { type: "text_visible"; text: string }
  | { type: "selector_visible"; selector: string }
  | { type: "element_gone"; target: TargetRef };

export type WaitAfterPolicy = {
  domStable?: boolean;
  quietMs?: number;
  timeoutMs?: number;
};

export type RetryPolicy = {
  attempts?: number;
  onStale?: boolean;
  onCovered?: boolean;
};

export type ElementInfo = {
  ref?: string;
  role?: string;
  name?: string;
  inferredName?: string;
  tag: string;
  text?: string;
  valuePreview?: string;
  visible: boolean;
  enabled: boolean;
  actionable: boolean;
  rect?: Rect;
  selector?: string;
  confidence?: number;
  warnings?: string[];
};

export type PossibleAction = {
  id: string;
  type: "click" | "fill" | "submit" | "select" | "focus" | "press_key";
  label: string;
  target?: TargetRef;
  risk: "low" | "medium" | "high";
  confidence: number;
  reason?: string;
};

export type PageStateDiff = {
  urlChanged: boolean;
  urlBefore?: string;
  urlAfter?: string;
  newText: string[];
  removedText: string[];
  dialogsOpened: ElementInfo[];
  dialogsClosed: string[];
  newElements?: ElementInfo[];
  removedElements?: string[];
};

// ---------------------------------------------------------------------------
// 2. Protocol Envelopes
// ---------------------------------------------------------------------------

export type BridgeCommand<TArgs = unknown> = {
  v: "2.0";
  id: string;
  tool: string;
  tabId?: number;
  frameId?: number;
  args: TArgs;
  timeoutMs?: number;
};

export type BridgeResponse<TResult = unknown> = {
  v: "2.0";
  id: string;
  ok: boolean;
  tool: string;
  result: TResult | null;
  error: BridgeError | null;
  warnings: BridgeWarning[];
  telemetry: BridgeTelemetry;
};

// ---------------------------------------------------------------------------
// Error & Warning Types
// ---------------------------------------------------------------------------

export type BridgeErrorCode =
  | "ELEMENT_NOT_FOUND"
  | "STALE_ELEMENT"
  | "ELEMENT_NOT_VISIBLE"
  | "ELEMENT_COVERED"
  | "ELEMENT_DISABLED"
  | "NO_FORM_FOUND"
  | "NAVIGATION_TIMEOUT"
  | "DOM_STABLE_TIMEOUT"
  | "EVALUATION_ERROR"
  | "SNAPSHOT_TOO_LARGE"
  | "PERMISSION_DENIED"
  | "USER_INTERVENTION_REQUIRED"
  | "INVALID_ARGUMENT"
  | "SCREENSHOT_ERROR"
  | "RECORDING_ERROR"
  | "FILE_UPLOAD_ERROR"
  | "UNKNOWN_ERROR";

export type BridgeError = {
  code: BridgeErrorCode;
  message: string;
  recoverable: boolean;
  suggestedNextTools?: string[];
  details?: unknown;
};

export type BridgeWarning = {
  code: string;
  message: string;
  details?: unknown;
};

// ---------------------------------------------------------------------------
// Telemetry Type
// ---------------------------------------------------------------------------

export type BridgeTelemetry = {
  durationMs: number;
  urlBefore?: string;
  urlAfter?: string;
  domChanged?: boolean;
  timedOut?: boolean;
};

// ---------------------------------------------------------------------------
// Extra observation types referenced by PageState and other APIs
// ---------------------------------------------------------------------------

export type BrowserError = {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: number;
};

export type NetworkFailure = {
  url: string;
  method?: string;
  status?: number;
  error: string;
  timestamp: number;
};

export type TextBlock = {
  type: "heading" | "paragraph" | "list" | "link" | "button" | "input";
  text: string;
  level?: number;
  href?: string;
  elementRef?: string;
};

export type TextExtractionResult = {
  format: "plain" | "markdown" | "blocks";
  text?: string;
  blocks?: TextBlock[];
  chars: number;
  truncated: boolean;
  nextCursor?: string;
  stats: {
    totalTextEstimate?: number;
    blocksReturned?: number;
  };
};

export type FullTextResult = {
  text: string;
  truncated: boolean;
  chars: number;
};

export type ElementListResult = {
  elements: ElementInfo[];
  total: number;
  truncated: boolean;
};

export type ActionListResult = {
  actions: PossibleAction[];
  total: number;
};

export type ElementDescription = {
  info: ElementInfo;
  html?: string;
  neighbors?: ElementInfo[];
  computedStyle?: Record<string, string>;
  ancestors?: Array<{ tag: string; class?: string; id?: string }>;
  children?: ElementInfo[];
};

export type SelectOptionResult = {
  action: "select_option";
  success: boolean;
  matched?: number;
};

export type EvaluateResult = {
  type: "json" | "text" | "preview";
  value?: unknown;
  text?: string;
  preview: string;
  bytes: number;
  truncated: boolean;
  sideEffects?: {
    domMutated?: boolean;
    navigationStarted?: boolean;
  };
};

export type ScreenshotResult = {
  format: "png" | "jpeg";
  data: string;
  sizeBytes: number;
};

export type RecoveryReport = {
  pageState?: PageState;
  lastErrors: BridgeError[];
  possibleActions: PossibleAction[];
  suggestion: string;
  screenshot?: ScreenshotResult;
};

export type BridgeStatus = {
  daemon: {
    version: string;
    port: number;
    protocol: string;
  };
  extension: {
    connected: boolean;
    version?: string;
    manifestVersion?: number;
  };
  browser: {
    activeTabId?: number;
    url?: string;
    title?: string;
  };
  capabilities: Record<string, boolean>;
};

export type ApprovalResult = {
  approved: boolean;
  timedOut: boolean;
};

export type UploadFileArgs = {
  target: TargetRef;
  data: string;
  fileName: string;
  mimeType?: string;
};

export type UploadFileResult = {
  success: boolean;
  fileName: string;
  bytesUploaded: number;
};

// ---------------------------------------------------------------------------
// PageState
// ---------------------------------------------------------------------------

export type PageState = {
  page: {
    url: string;
    title: string;
    readyState: DocumentReadyState;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number; maxX: number; maxY: number };
    activeElement?: ElementInfo;
  };

  summary: {
    headings: Array<{ level: number; text: string }>;
    forms: number;
    links: number;
    buttons: number;
    inputs: number;
    contentEditables: number;
    dialogs: ElementInfo[];
    alerts: ElementInfo[];
  };

  elements: ElementInfo[];
  possibleActions: PossibleAction[];
  recentErrors: BrowserError[];
  recentNetworkFailures: NetworkFailure[];

  truncated: boolean;
  nextCursor?: string;
  snapshotId: string;
};
