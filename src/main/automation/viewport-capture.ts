import type { BrowserWindow, NativeImage } from "electron";
import { AutomationError } from "../../automation/diagnostics";

export type ViewportRect = { x: number; y: number; width: number; height: number };

export async function captureViewportImage(window: BrowserWindow, rect: ViewportRect, maxEdge: number): Promise<NativeImage> {
    if (window.isDestroyed() || window.isMinimized() || !window.isVisible()) throw new AutomationError("CAPTURE_UNAVAILABLE");
    const zoom = window.webContents.getZoomFactor();
    const [width, height] = window.getContentSize();
    const x = Math.max(0, Math.round(rect.x * zoom));
    const y = Math.max(0, Math.round(rect.y * zoom));
    const w = Math.min(width - x, Math.round(rect.width * zoom));
    const h = Math.min(height - y, Math.round(rect.height * zoom));
    if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1) throw new AutomationError("CAPTURE_UNAVAILABLE");
    let picture = await window.webContents.capturePage({ x, y, width: w, height: h });
    if (picture.isEmpty()) throw new AutomationError("CAPTURE_UNAVAILABLE");
    const dimensions = picture.getSize();
    if (Math.max(dimensions.width, dimensions.height) > maxEdge) picture = picture.resize(dimensions.width >= dimensions.height ? { width: maxEdge } : { height: maxEdge });
    return picture;
}
