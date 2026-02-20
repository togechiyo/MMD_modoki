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
  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  // Initialize components
  const mmdManager = new MmdManager(canvas);
  const timeline = new Timeline(
    "timeline-canvas",
    "timeline-tracks-scroll",
    "timeline-label-canvas",
    "timeline-labels"
  );
  const bottomPanel = new BottomPanel();
  bottomPanel.setMmdManager(mmdManager);

  // Initialize UI controller (connects everything)
  const uiController = new UIController(mmdManager, timeline, bottomPanel);

  // Handle window resize
  window.addEventListener("resize", () => {
    mmdManager.resize();
  });

  console.log("🎬 MMD Motion Editor initialized");
});
