import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { observeCsp } from "./csp-observer.mjs";
import { verifyCspRestrictions } from "./csp-probes.mjs";

const root = resolve(import.meta.dirname, "../..");

test("CSP permits WebGPU and MPR while blocking dynamic, inline and external scripts", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  const report = {};
  try {
    const page = await launched.app.firstWindow();
    const observer = await observeCsp(page.context());
    // The launch helper returns after navigation began; reload to observe its entire startup.
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    report.runtime = await page.evaluate(() => ({
      isolated: crossOriginIsolated, sharedMemory: typeof SharedArrayBuffer,
      physics: window.mmdModokiE2e.getPhysicsRuntimeState().active,
      engine: window.mmdModokiE2e.getShadowRuntimeDiagnostics().engine,
    }));
    expect(report.runtime).toMatchObject({ isolated: true, sharedMemory: "function", engine: "WebGPU" });
    expect(report.runtime.physics).toContain("MPR");
    report.startupEvents = observer.events.slice();
    expect(report.startupEvents).toEqual([]);
    const firstProbeEvent = observer.events.length;
    report.probes = await verifyCspRestrictions(page);
    report.probeEvents = observer.events.slice(firstProbeEvent);
    expect(report.probeEvents.some(event => event.kind === "violation")).toBe(true);
  } finally {
    await writeFile(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
