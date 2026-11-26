import { describe, expect, it } from "vitest";
import { uiTranslations } from "./shared/ui-locales";
import { getEffectInstanceDisplayName, t } from "./i18n";
import { INSTANCE_EFFECT_NAMES } from "./editor/effect-instance-names";

const placeholders = (value: string): string[] =>
    [...new Set(Array.from(value.matchAll(/\{([^{}]+)\}/g), match => match[1]))].sort();

describe("UI dictionaries", () => {
    it("localizes generated instance names and their suffixes while preserving custom names", () => {
        for (const [type, base] of Object.entries(INSTANCE_EFFECT_NAMES)) {
            const name = t(`effect.frameGraphPost.effects.${type}`);
            expect(getEffectInstanceDisplayName(type, base)).toBe(name);
            expect(getEffectInstanceDisplayName(type, base + " 12")).toBe(name + " 12");
            expect(getEffectInstanceDisplayName(type, base + " 調整用")).toBe(base + " 調整用");
        }
    });
    const english: Record<string, string> = uiTranslations.en;
    const englishKeys = Object.keys(english).sort();
    for (const [locale, dictionary] of Object.entries(uiTranslations)) {
        it(`provides every label and interpolation parameter in ${locale}`, () => {
            expect(Object.keys(dictionary).sort()).toEqual(englishKeys);
            for (const [key, value] of Object.entries(dictionary)) {
                expect(value, key).toBeTypeOf("string");
                expect(value.trim(), key).not.toBe("");
                expect(placeholders(value), key).toEqual(placeholders(english[key]));
            }
        });
    }
});
