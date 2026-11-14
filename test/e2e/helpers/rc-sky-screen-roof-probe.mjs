// Test-only switch for comparing the production world query with the production
// screen path in one isolated app. No shader, field, material or saved settings change.
// eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
import { MmdManager } from "/src/mmd-manager.ts";
// eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
import { RcSkyAmbientScreen } from "/src/render/rc-sky-ambient-screen.ts";

let manager;
const getSettings = MmdManager.prototype.getRcSkyAmbientSettings;
MmdManager.prototype.getRcSkyAmbientSettings = function (...args) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Capture the isolated app manager at this test boundary.
  manager = this; return getSettings.apply(this, args);
};
let enabled = true, attached = null;
const events = [];
const renderScreen = RcSkyAmbientScreen.prototype.render;
RcSkyAmbientScreen.prototype.render = function (...args) {
  const matrices = [], renderer = this.geometry.objectRenderer;
  const collect = () => matrices.push(Array.from(this.scene.getTransformMatrix().m));
  const before = renderer.onBeforeRenderingManagerRenderObservable.add(collect);
  const fast = renderer.onFastPathRenderObservable.add(collect);
  try {
    const result = renderScreen.apply(this, args);
    if (result) {
      const publishedViewProjection = Array.from(result.viewProjection.m);
      events.push({ width: result.width, height: result.height, published: false,
        geometryViewProjections: matrices, publishedViewProjection,
        matrixMaxError: matrices.length ? Math.max(...matrices.flatMap(matrix =>
          matrix.map((value, index) => Math.abs(value - publishedViewProjection[index])))) : null });
    }
    return result;
  } finally {
    renderer.onBeforeRenderingManagerRenderObservable.remove(before);
    renderer.onFastPathRenderObservable.remove(fast);
  }
};

function controller() {
  const value = manager?.rcSkyAmbientController;
  if (!value) throw new Error("Sky Ambient controller unavailable; open its settings first");
  if (attached !== value) {
    const render = value.prepareScreen.bind(value);
    value.prepareScreen = () => {
      if (!enabled) return;
      const before = events.length;
      render();
      for (const event of events.slice(before)) event.published = Boolean(value.view?.screen);
    };
    attached = value;
  }
  return value;
}

export function setSkyScreenPath(active) {
  const value = controller(); enabled = active;
  // Material references must be detached immediately when selecting the hard
  // reference, including when auto-render is stopped between output captures.
  if (value.view?.screen) value.view = { ...value.view, screen: undefined };
}

export function beginSkyScreenCapture() { controller(); events.length = 0; }
export function inspectSkyScreenCapture() {
  const value = controller();
  return { enabled, events: events.slice(), diagnostics: value.diagnostics,
    settings: manager.getRcSkyAmbientSettings(), frame: manager.scene.getFrameId() };
}
