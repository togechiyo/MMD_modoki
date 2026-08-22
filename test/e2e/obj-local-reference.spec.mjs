import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const referenceRoot = resolve(repoRoot, "local-references", "babylonjs");

const references = [
  {
    id: "Chair",
    path: resolve(referenceRoot, "chair", "Chair.obj"),
    selectorLabel: "Chair [OBJ]",
    expectsTextures: false,
  },
  {
    id: "Box",
    path: resolve(referenceRoot, "box", "Box.obj"),
    selectorLabel: "Box [OBJ]",
    expectsTextures: true,
  },
  {
    id: "PowerPlant",
    path: resolve(referenceRoot, "powerplant", "powerplant.obj"),
    selectorLabel: "powerplant [OBJ]",
    expectsTextures: true,
  },
];

for (const reference of references) {
  test(`loads the local Babylon.js ${reference.id} OBJ reference`, async () => {
    test.skip(!existsSync(reference.path), `local ${reference.id} reference asset is not installed`);
    const launched = await launchMmdModoki(repoRoot);
    try {
      const page = await launched.app.firstWindow();
      const pageErrors = [];
      const externalRequests = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          (url.protocol === "http:" || url.protocol === "https:")
          && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ) {
          externalRequests.push(request.url());
        }
      });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

      expect(await page.evaluate(
        async (filePath) => window.mmdModokiE2e.loadAccessory(filePath),
        reference.path,
      )).toBe(true);

      const targetSelect = page.locator("#info-model-select");
      await expect(targetSelect.locator('option[value="__accessory__:0"]')).toContainText(reference.selectorLabel);
      await expect(targetSelect).toHaveValue("__accessory__:0");
      await expect(page.locator("#accessory-info-content")).toBeVisible();
      await expect(page.locator("#accessory-transform-content")).toBeVisible();
      await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
      await expect(page.locator("#chk-accessory-shadow")).toBeChecked();

      if (reference.expectsTextures) {
        await expect.poll(async () => page.evaluate(() => {
          const textured = window.mmdModokiE2e.getAccessoryMaterialDiagnostics()
            .filter(({ diffuseTextureUrl }) => diffuseTextureUrl !== null);
          return textured.length > 0
            && textured.every(({ diffuseTextureUrl }) => diffuseTextureUrl.startsWith("data:image/"))
            && textured.every(({ diffuseTextureReady }) => diffuseTextureReady);
        }), { timeout: 30_000 }).toBe(true);
      }

      const materials = await page.evaluate(
        () => window.mmdModokiE2e.getAccessoryMaterialDiagnostics(),
      );
      expect(materials.length).toBeGreaterThan(0);
      expect(materials.every(({ hasUvs }) => hasUvs)).toBe(true);
      const texturedMaterials = materials.filter(({ diffuseTextureUrl }) => diffuseTextureUrl !== null);
      expect(texturedMaterials.length > 0).toBe(reference.expectsTextures);

      const vertexBuffers = await page.evaluate(
        () => window.mmdModokiE2e.getAccessoryVertexBufferDiagnostics(),
      );
      expect(vertexBuffers).toHaveLength(materials.length);
      expect(vertexBuffers.every(({ buffers }) => (
        buffers.length > 0
        && buffers.every(({ byteStride, effectiveByteStride, byteOffset, effectiveByteOffset }) => (
          effectiveByteStride === byteStride && effectiveByteOffset === byteOffset
        ))
      ))).toBe(true);

      const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(project.accessories).toHaveLength(1);
      expect(project.accessories[0]).toMatchObject({
        path: reference.path,
        visible: true,
        castsShadow: true,
      });

      await page.evaluate(async () => {
        for (let frame = 0; frame < 5; frame += 1) {
          await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        }
      });
      expect(pageErrors).toEqual([]);
      expect(externalRequests).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}
