import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const locales = ["ja", "en", "zh-Hant", "zh-Hans", "ko"];
const parseDictionary = (locale) => JSON.parse(readFileSync(
  resolve(repoRoot, "language", `${locale}.json`),
  "utf8",
).replace(/^\uFEFF/, ""));
const dictionaries = Object.fromEntries(locales.map((locale) => [locale, parseDictionary(locale)]));
const intentionalSharedUiText = /^(?:GND|BG|SKY|AA|PHY|PHYx|SHD|GI|UI|FPS|WebGPU|WGSL|Bullet MPR Immediate|FrameGraph \/ Post|[XYZRGB]|Toon)$/;

const collectTranslatedTextLayout = (page) => page.evaluate(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && bounds.width > 0
      && bounds.height > 0;
  };

  return [...document.querySelectorAll("[data-i18n]")]
    .filter((element) => element instanceof HTMLElement && visible(element))
    .map((element) => {
      const bounds = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const textBounds = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      const availableWidth = Math.max(0, bounds.width
        - Number.parseFloat(style.paddingLeft || "0")
        - Number.parseFloat(style.paddingRight || "0"));
      const textWidth = textBounds.width;
      return {
        key: element.dataset.i18n ?? "",
        text: element.textContent?.trim() ?? "",
        id: element.id,
        className: element.className,
        availableWidth: Math.round(availableWidth * 10) / 10,
        textWidth: Math.round(textWidth * 10) / 10,
        fitRatio: textWidth > 0 ? Math.round((availableWidth / textWidth) * 100) / 100 : 1,
        overflowX: style.overflowX,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    })
    .filter((entry) => entry.textWidth > entry.availableWidth + 1)
    .sort((left, right) => left.fitRatio - right.fitRatio);
});

const collectVisibleUnmarkedControls = (page) => page.evaluate(() => {
  const candidates = document.querySelectorAll([
    "button",
    "label",
    "summary",
    ".section-header",
    ".effect-panel-section-title",
  ].join(","));
  return [...candidates]
    .filter((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0
        && bounds.height > 0
        && style.display !== "none"
        && style.visibility !== "hidden"
        && !element.hasAttribute("data-i18n")
        && !element.hasAttribute("data-i18n-title")
        && !element.hasAttribute("data-i18n-aria-label")
        && !element.querySelector("[data-i18n]");
    })
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
    }))
    .filter((entry) => entry.text.length > 0 && !/^[+\-×▶◀■|]+$/.test(entry.text));
});

test("supported locales keep translated labels inspectable", async ({}, testInfo) => {
  const englishKeys = Object.keys(dictionaries.en);
  for (const locale of ["zh-Hant", "zh-Hans", "ko"]) {
    expect(Object.keys(dictionaries[locale]), `${locale} dictionary keys`).toEqual(englishKeys);
    const copiedEnglishMenuKeys = englishKeys.filter((key) => key.startsWith("menu.")
      && dictionaries[locale][key] === dictionaries.en[key]);
    expect(copiedEnglishMenuKeys, `${locale} menu translations`).toEqual([]);
  }

  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const localeSelect = page.locator("#toolbar-locale-select");
    await expect(localeSelect).toBeVisible();

    for (const locale of locales) {
      await page.locator(".toast").evaluateAll((elements) => elements.forEach((element) => element.remove()));
      await localeSelect.selectOption(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);

      const clipped = await collectTranslatedTextLayout(page);
      expect(clipped, `${locale} main labels`).toEqual([]);
      if (locale === "zh-Hant" || locale === "zh-Hans" || locale === "ko") {
        const visibleKeys = await page.locator("[data-i18n]").evaluateAll((elements) => [...new Set(elements
          .filter((element) => {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return bounds.width > 0 && bounds.height > 0
              && style.display !== "none" && style.visibility !== "hidden";
          })
          .map((element) => element.getAttribute("data-i18n"))
          .filter(Boolean))]);
        const copiedVisibleKeys = visibleKeys.filter((key) => dictionaries[locale][key] === dictionaries.en[key]
          && !intentionalSharedUiText.test(dictionaries.en[key]));
        expect(copiedVisibleKeys, `${locale} visible translations copied from English`).toEqual([]);
      }

      const mainScreenshot = testInfo.outputPath(`main-${locale}.png`);
      await page.screenshot({ path: mainScreenshot, fullPage: true });
      await testInfo.attach(`main-${locale}`, { path: mainScreenshot, contentType: "image/png" });

      await page.locator("#btn-toggle-shader-panel").click();
      await expect(page.locator("#main-content")).not.toHaveClass(/shader-panel-collapsed/);
      await expect(page.locator(".toast").last()).toHaveText(dictionaries[locale]["toast.fx.shown"]);
      const effectClipped = await collectTranslatedTextLayout(page);
      expect(effectClipped, `${locale} effect-panel labels`).toEqual([]);
      const unmarkedControls = await collectVisibleUnmarkedControls(page);
      expect(unmarkedControls, `${locale} controls without i18n markers`).toEqual([]);

      const effectScreenshot = testInfo.outputPath(`effect-${locale}.png`);
      await page.screenshot({ path: effectScreenshot, fullPage: true });
      await testInfo.attach(`effect-${locale}`, { path: effectScreenshot, contentType: "image/png" });
      await page.locator("#btn-toggle-shader-panel").click();
      await expect(page.locator("#main-content")).toHaveClass(/shader-panel-collapsed/);
      await expect(page.locator(".toast").last()).toHaveText(dictionaries[locale]["toast.fx.hidden"]);

      const menuTriggers = page.locator("#app-menu-bar .app-menu-trigger");
      for (let index = 0; index < await menuTriggers.count(); index += 1) {
        const trigger = menuTriggers.nth(index);
        const menuKey = await trigger.getAttribute("data-i18n");
        await trigger.click();
        await expect(trigger.locator("..")).toHaveClass(/menu-open/);
        const menuClipped = await collectTranslatedTextLayout(page);
        expect(menuClipped, `${locale} ${menuKey} menu labels`).toEqual([]);
        await page.keyboard.press("Escape");
      }

      const unresolvedKeys = await page.locator("[data-i18n]").evaluateAll((elements) => elements
        .filter((element) => element.textContent?.trim() === element.getAttribute("data-i18n"))
        .map((element) => element.getAttribute("data-i18n")));
      expect(unresolvedKeys).toEqual([]);
    }

    await launched.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1120, 630);
    });
    await page.waitForTimeout(250);
    for (const locale of locales) {
      await localeSelect.selectOption(locale);
      const compactClipped = await collectTranslatedTextLayout(page);
      expect(compactClipped, `${locale} minimum-window labels`).toEqual([]);
    }
  } finally {
    await launched.close();
  }
});
