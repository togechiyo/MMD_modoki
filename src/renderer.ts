/**
 * MMD Motion Editor - Renderer Entry Point
 * Initializes Babylon.js, babylon-mmd, and all UI components.
 */

import "./index.css";
import { MmdManager } from "./mmd-manager";
import { Timeline } from "./timeline";
import { BottomPanel } from "./bottom-panel";
import { UIController } from "./ui-controller";
import { runPngSequenceExportJob } from "./png-sequence-exporter";

// Wait for DOM
document.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});

async function initializeApp(): Promise<void> {
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode");
  if (mode === "exporter") {
    await initializePngSequenceExporter(searchParams);
    return;
  }

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  try {
    // Initialize components
    const mmdManager = await MmdManager.create(canvas);
    const timeline = new Timeline(
      "timeline-canvas",
      "timeline-tracks-scroll",
      "timeline-label-canvas",
      "timeline-labels"
    );
    const bottomPanel = new BottomPanel();
    bottomPanel.setMmdManager(mmdManager);

    // Initialize UI controller (connects everything)
    new UIController(mmdManager, timeline, bottomPanel);

    console.log("🎬 MMD Motion Editor initialized");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to initialize MMD Motion Editor:", message);

    const statusText = document.getElementById("status-text");
    if (statusText) {
      statusText.textContent = "初期化失敗";
    }

    const overlay = document.getElementById("viewport-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      const title = overlay.querySelector("p");
      const hint = overlay.querySelector(".hint-text");
      if (title) title.textContent = "初期化に失敗しました";
      if (hint) hint.textContent = `詳細: ${message}`;
    }
  }
}

async function initializePngSequenceExporter(searchParams: URLSearchParams): Promise<void> {
  document.body.classList.add("exporter-mode");

  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement | null;
  const busyOverlay = document.getElementById("ui-busy-overlay");
  const busyText = document.getElementById("ui-busy-text");
  const viewportOverlay = document.getElementById("viewport-overlay");
  const statusText = document.getElementById("status-text");

  const setStatus = (message: string): void => {
    if (statusText) statusText.textContent = message;
    if (busyText) busyText.textContent = message;
    document.title = `PNG Sequence Export - ${message}`;
  };

  const closeExporterWindowSoon = (): void => {
    window.setTimeout(() => {
      window.close();
    }, 300);
  };

  if (!canvas) {
    console.error("Canvas not found");
    setStatus("Canvas not found");
    closeExporterWindowSoon();
    return;
  }

  if (viewportOverlay) {
    viewportOverlay.classList.add("hidden");
  }
  if (busyOverlay) {
    busyOverlay.classList.remove("hidden");
    busyOverlay.setAttribute("aria-hidden", "false");
  }

  const jobId = searchParams.get("jobId");
  if (!jobId) {
    setStatus("Export job id is missing");
    closeExporterWindowSoon();
    return;
  }

  try {
    const request = await window.electronAPI.takePngSequenceExportJob(jobId);
    if (!request) {
      setStatus("Export job is unavailable");
      closeExporterWindowSoon();
      return;
    }

    let lastProgressReportAt = 0;
    const result = await runPngSequenceExportJob(canvas, request, {
      onStatus: (message) => {
        setStatus(message);
      },
      onProgress: (saved, total, frame, captured) => {
        setStatus(`Exporting... ${saved}/${total} (frame ${frame})`);
        const now = performance.now();
        if (saved === total || now - lastProgressReportAt >= 200) {
          lastProgressReportAt = now;
          window.electronAPI.reportPngSequenceExportProgress({
            jobId,
            saved,
            captured,
            total,
            frame,
          });
        }
      },
    });

    setStatus(`Done: ${result.exportedFrames} frame(s)`);
    closeExporterWindowSoon();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PNG sequence export failed:", message);
    setStatus(`Export failed: ${message}`);
    closeExporterWindowSoon();
  }
}
