import en from "../../language/en.json";
import ja from "../../language/ja.json";
import ko from "../../language/ko.json";
import zhHans from "../../language/zh-Hans.json";
import zhHant from "../../language/zh-Hant.json";
import type { UiLocale } from "../types";

export const DEFAULT_UI_LOCALE: UiLocale = "ja";
export const uiTranslations = { ja, en, ko, "zh-Hans": zhHans, "zh-Hant": zhHant } satisfies Record<UiLocale, Record<string, string>>;

export function isUiLocale(value: unknown): value is UiLocale {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(uiTranslations, value);
}
