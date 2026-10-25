import { selectTimelineTrack } from "../electron-app.mjs";

export async function expandEffectInstance(row) {
  const header = row.locator('[data-instance-action="select"]');
  if (await header.getAttribute("aria-expanded") !== "true") await header.click();
}

export async function selectEffectInstance(row) {
  await expandEffectInstance(row);
  const page = row.page(), id = await row.getAttribute("data-effect-instance-row");
  if (!id) throw new Error("Effect instance ID is missing");
  await page.locator("#info-model-select").selectOption("__camera__");
  await selectTimelineTrack(page, "effect", id);
}

export async function registerEffectInstance(row) {
  await row.locator('[data-instance-action="registerKeyframe"]').click();
}

export async function dragEffectStackRow(source, target, placement) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Effect drop target is not visible");
  await source.locator('[data-effect-stack-drag]').dragTo(target, {
    targetPosition: { x: Math.min(40, box.width / 2), y: placement === "before" ? 2 : box.height - 2 },
  });
}
