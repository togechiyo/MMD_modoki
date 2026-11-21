import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { expandEffectInstance, registerEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { openPostEffects, openRcLighting, rcLightingInput, registerRcLighting } from "./helpers/rc-lighting-controls.mjs";
import { restoreRetiredRcLightingFixture } from "./helpers/rc-lighting-fixture.mjs";

const root = resolve(import.meta.dirname, "../..");
const rcIds = ["rcSkyOcclusion", "rcSkyAmbient", "rcDiffuseGi"];

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

async function selectFrameKeys(page, frame) {
  await seek(page, frame);
  const ruler = page.locator("#timeline-overlay-canvas");
  const x = await page.evaluate(() => {
    const tracks = document.getElementById("timeline-tracks-scroll");
    const labels = document.getElementById("timeline-labels");
    return Math.max(12, Math.round((tracks.clientWidth - labels.clientWidth) / 2));
  });
  await ruler.dblclick({ position: { x, y: 10 } });
}

test("mixed effect keys keep their values through batch history and reject a deleted paste target", async () => {
  test.setTimeout(120000);
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#info-model-select").selectOption("__camera__");
    await restoreRetiredRcLightingFixture(page, "rcSkyOcclusion", { enabled: false });
    await seek(page, 10);
    for (const id of rcIds) {
      await openRcLighting(page, id);
      const enabled = rcLightingInput(page, id, "Enabled");
      await enabled.setChecked(!await enabled.isChecked());
      await registerRcLighting(page, id);
    }
    await openPostEffects(page);
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="gamma"]').click();
    const gammaRow = page.locator('[data-effect-instance-row]');
    const gamma = await gammaRow.getAttribute("data-effect-instance-row");
    await expandEffectInstance(gammaRow);
    await gammaRow.locator('[data-instance-field="enabled"]').uncheck();
    await registerEffectInstance(gammaRow);
    const ids = [...rcIds, gamma];
    const keys = () => page.evaluate(({ ids, gamma }) => {
      const project = window.mmdModokiE2e.exportProjectState();
      return ids.map(id => {
        const track = id === gamma
          ? project.effects.frameGraphInstances?.instances.find(item => item.instanceId === id)?.animation.tracks[0]
          : project.keyframes?.effectAnimations?.tracks.find(item => item.effectId === id);
        return track?.keys ?? [];
      });
    }, { ids, gamma });
    const original = await keys();
    for (const track of original) expect(track.map(key => key.frame)).toEqual([10]);
    const withCopies = frame => original.map(([key]) => [key, { ...key, frame }]);
    const history = action => page.locator(`.app-menu-quick-button[data-menu-command="edit.${action}"]`).click();
    const paste = page.locator("#btn-kf-paste");
    const selectKeys = async frame => {
      await selectFrameKeys(page, frame);
      const selected = await page.evaluate(() => window.mmdModokiE2e.getTimelineSelection().selectedKeys);
      expect(selected.map(key => key.trackName).sort()).toEqual([...ids].sort());
      expect(selected.every(key => key.frame === frame)).toBe(true);
    };

    await selectKeys(10);
    await page.locator("#btn-kf-copy").click();
    await seek(page, 30);
    await paste.click();
    expect(await keys()).toEqual(withCopies(30));
    await history("undo"); expect(await keys()).toEqual(original);
    await history("redo"); expect(await keys()).toEqual(withCopies(30));
    await selectKeys(30);
    await page.keyboard.press("Alt+ArrowRight");
    expect(await keys()).toEqual(withCopies(31));
    await history("undo"); expect(await keys()).toEqual(withCopies(30));
    await history("redo"); expect(await keys()).toEqual(withCopies(31));
    await page.locator("#btn-kf-delete").click();
    expect(await keys()).toEqual(original);
    await history("undo"); expect(await keys()).toEqual(withCopies(31));
    await history("redo"); expect(await keys()).toEqual(original);

    // RC tracks precede the deleted instance in the clipboard. A shortcut must
    // reject the whole operation before it can leave any of those RC keys behind.
    await expandEffectInstance(gammaRow);
    await gammaRow.locator('[data-instance-action="delete"]').click();
    await selectTimelineTrack(page, "effect", "rcSkyAmbient");
    await seek(page, 40);
    await expect(paste).toBeDisabled();
    await page.locator("#btn-kf-nudge-right").focus();
    await page.keyboard.press("Control+v");
    await expect(page.locator(".toast.error").filter({ hasText: "No compatible paste target" })).toBeVisible();
    expect(await keys()).toEqual([...original.slice(0, rcIds.length), []]);
    await history("undo");
    expect(await keys()).toEqual(original);
    await selectTimelineTrack(page, "effect", "rcSkyAmbient");
    await seek(page, 40);
    await paste.click();
    expect(await keys()).toEqual(withCopies(40));
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});
