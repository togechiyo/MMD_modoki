export async function expandEffectInstance(row) {
  const header = row.locator('[data-instance-action="select"]');
  if (await header.getAttribute("aria-expanded") !== "true") await header.click();
}

export async function selectEffectInstance(row) {
  await expandEffectInstance(row);
  await row.locator('[data-instance-action="keyEdit"]').click();
}

export async function dragEffectStackRow(source, target, placement) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Effect drop target is not visible");
  await source.locator('[data-effect-stack-drag]').dragTo(target, {
    targetPosition: { x: Math.min(40, box.width / 2), y: placement === "before" ? 2 : box.height - 2 },
  });
}
