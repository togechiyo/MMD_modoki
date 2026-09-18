import { afterEach, describe, expect, it } from "vitest";

import { getTimelineTrackDisplayName } from "./timeline";
import { setLocale, type UiLocale } from "./i18n";

const changeLocale = (locale: UiLocale): void => setLocale(locale, {
    persist: false, applyToDom: false, emitEvent: false,
});

afterEach(() => changeLocale("ja"));

describe("timeline track display names", () => {
    it.each([
        ["Camera", "camera", "カメラ"],
        ["Light", "light", "照明"],
        ["Shadow", "shadow", "影"],
        ["Gravity", "gravity", "重力"],
        ["センター", "bone", "センター"],
    ] as const)("displays %s as %s category label", (name, category, expected) => {
        expect(getTimelineTrackDisplayName({ name, category })).toBe(expected);
    });

    it.each([
        ["ja", ["カメラ", "照明", "影", "重力"]],
        ["en", ["Camera", "Lighting", "Shadow", "Gravity"]],
        ["zh-Hant", ["相機", "照明", "陰影", "重力"]],
        ["zh-Hans", ["相机", "照明", "阴影", "重力"]],
        ["ko", ["카메라", "조명", "그림자", "중력"]],
    ] as const)("localizes scene labels in %s while preserving source names", (locale, expected) => {
        changeLocale(locale);
        const tracks = [
            { name: "Camera", category: "camera" },
            { name: "Light", category: "light" },
            { name: "Shadow", category: "shadow" },
            { name: "Gravity", category: "gravity" },
        ] as const;
        expect(tracks.map(getTimelineTrackDisplayName)).toEqual(expected);
        expect(tracks.map(track => track.name)).toEqual(["Camera", "Light", "Shadow", "Gravity"]);
        for (const category of ["bone", "morph", "accessory"] as const) {
            expect(getTimelineTrackDisplayName({ name: "カメラ", category })).toBe("カメラ");
        }
    });
});
