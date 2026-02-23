/**
 * MMD Motion Editor - Renderer Entry Point
 * Initializes Babylon.js, babylon-mmd, and all UI components.
 */

import "./index.css";
import { MmdManager } from "./mmd-manager";
import { Timeline } from "./timeline";
import { BottomPanel } from "./bottom-panel";
import { UIController } from "./ui-controller";

// Wait for DOM
document.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});

async function initializeApp(): Promise<void> {
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
