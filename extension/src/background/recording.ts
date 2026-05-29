/**
 * Kimi WebBridge v2.0 — Tab Video Recording
 *
 * Uses chrome.tabCapture to capture the active tab as a MediaStream,
 * then MediaRecorder to produce a WebM video file.
 */

export interface RecordingSession {
  tabId: number;
  startTime: number;
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  stopped: boolean;
  error: string | undefined;
}

let activeSession: RecordingSession | null = null;

/**
 * Start recording the given tab.
 * Returns the session start timestamp or throws on error.
 */
export async function startRecording(tabId: number): Promise<number> {
  if (activeSession) {
    throw new Error("Recording already in progress");
  }

  const tab = await chrome.tabs.get(tabId);
  if (!tab.active) {
    // tabCapture only works on the active tab in a window
    await chrome.tabs.update(tabId, { active: true });
  }

  const stream = await new Promise<MediaStream | null>((resolve) => {
    chrome.tabCapture.capture({ audio: false, video: true }, (result) => {
      resolve(result);
    });
  });

  if (!stream) {
    throw new Error("tabCapture returned null stream");
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
  });

  const chunks: Blob[] = [];
  const startTime = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    // Clean up tracks when recording stops
    stream.getTracks().forEach((track) => track.stop());
  };

  recorder.onerror = (event) => {
    console.error("[Recording] MediaRecorder error:", event);
    if (activeSession) {
      activeSession.error = "MediaRecorder error";
    }
  };

  recorder.start(1000); // collect 1-second chunks

  activeSession = {
    tabId,
    startTime,
    stream,
    recorder,
    chunks,
    stopped: false,
    error: undefined,
  };

  return startTime;
}

/**
 * Stop the current recording and return the accumulated Blob.
 */
export async function stopRecording(): Promise<{
  blob: Blob;
  durationMs: number;
  tabId: number;
}> {
  if (!activeSession) {
    throw new Error("No recording in progress");
  }

  const session = activeSession;
  activeSession = null;
  session.stopped = true;

  return new Promise((resolve, reject) => {
    session.recorder.onstop = () => {
      session.stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(session.chunks, { type: "video/webm" });
      const durationMs = Date.now() - session.startTime;
      resolve({ blob, durationMs, tabId: session.tabId });
    };

    session.recorder.onerror = () => {
      reject(new Error("MediaRecorder failed during stop"));
    };

    session.recorder.stop();
  });
}

/**
 * Get the current recording status.
 */
export function getRecordingStatus(): {
  recording: boolean;
  tabId: number | undefined;
  durationMs: number | undefined;
  error: string | undefined;
} {
  if (!activeSession) {
    return {
      recording: false,
      tabId: undefined,
      durationMs: undefined,
      error: undefined,
    };
  }
  return {
    recording: !activeSession.stopped,
    tabId: activeSession.tabId,
    durationMs: Date.now() - activeSession.startTime,
    error: activeSession.error,
  };
}

/**
 * Read the current accumulated chunks as a partial Blob
 * without stopping the recorder. Useful for live preview.
 */
export function getPartialBlob(): Blob | null {
  if (!activeSession) return null;
  return new Blob(activeSession.chunks, { type: "video/webm" });
}
