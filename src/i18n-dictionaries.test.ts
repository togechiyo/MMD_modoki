import { describe, expect, it } from "vitest";
import { uiTranslations } from "./shared/ui-locales";

const placeholders = (value: string): string[] =>
    [...new Set(Array.from(value.matchAll(/\{([^{}]+)\}/g), match => match[1]))].sort();

describe("UI dictionaries", () => {
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
