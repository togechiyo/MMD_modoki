export type UiLocale = "ja" | "en";

type TranslationTable = Record<string, string>;

const STORAGE_KEY = "mmd.ui.locale";
const DEFAULT_LOCALE: UiLocale = "ja";

const translations: Record<UiLocale, TranslationTable> = {
    ja: {
        "toolbar.loadFile.label": "ファイル読込",
        "toolbar.loadFile.title": "PMX / VMD / VPD / 音源を読み込む",
        "toolbar.saveProject.label": "プロジェクト保存",
        "toolbar.saveProject.title": "プロジェクトJSONを保存する",
        "toolbar.loadProject.label": "プロジェクト読込",
        "toolbar.loadProject.title": "プロジェクトJSONを読み込む",
        "toolbar.toggleGroup.ariaLabel": "表示と機能の切替",
        "toolbar.ground.short": "床",
        "toolbar.ground.title.on": "地面表示: ON (G, クリックでOFF)",
        "toolbar.ground.title.off": "地面表示: OFF (G, クリックでON)",
        "toolbar.sky.short": "空",
        "toolbar.sky.title.on": "スカイドーム: ON (クリックでOFF)",
        "toolbar.sky.title.off": "スカイドーム: OFF (クリックでON)",
        "toolbar.aa.short": "AA",
        "toolbar.aa.title.on": "アンチエイリアス: ON (クリックでOFF)",
        "toolbar.aa.title.off": "アンチエイリアス: OFF (クリックでON)",
        "toolbar.physics.short": "物理",
        "toolbar.physics.naShort": "物理×",
        "toolbar.physics.title.on": "物理演算: ON (クリックでOFF)",
        "toolbar.physics.title.off": "物理演算: OFF (クリックでON)",
        "toolbar.physics.title.unavailable": "物理演算: 利用不可",
        "toolbar.fx.short": "FX",
        "toolbar.fx.title.on": "エフェクト欄: 表示中 (クリックで非表示)",
        "toolbar.fx.title.off": "エフェクト欄: 非表示 (クリックで表示)",
        "toolbar.ui.short": "UI",
        "toolbar.ui.title.on": "UI非表示: ON (Alt+Enter / ESC)",
        "toolbar.ui.title.off": "UI非表示: OFF (Alt+Enter)",
        "playback.skipStart.title": "先頭へ (Home)",
        "playback.play.title": "再生 (P / Space)",
        "playback.pause.title": "一時停止 (P / Space)",
        "playback.stop.title": "停止",
        "playback.skipEnd.title": "末尾へ (End)",
        "playback.nudgeLeft.title": "選択キーを1フレーム前へ (Alt+←)",
        "playback.nudgeRight.title": "選択キーを1フレーム後へ (Alt+→)",
        "timeline.key.add.title": "現在フレームにキーフレーム登録 (Enter / I / K / +)",
        "timeline.key.delete.title": "選択キーフレームを削除 (Delete)",
        "viewport.empty.title": "PMXモデルを読み込んでください",
        "viewport.empty.hint": "ツールバーの「ファイル読込」ボタンか、Ctrl+Oで開く",
        "toast.ground.on": "床: ON",
        "toast.ground.off": "床: OFF",
        "toast.sky.on": "空: ON",
        "toast.sky.off": "空: OFF",
        "toast.aa.on": "AA: ON",
        "toast.aa.off": "AA: OFF",
        "toast.physics.on": "物理: ON",
        "toast.physics.off": "物理: OFF",
        "toast.physics.unavailable": "この環境では物理演算は利用できません",
        "toast.fx.shown": "エフェクト欄を表示",
        "toast.fx.hidden": "エフェクト欄を非表示",
        "toast.ui.hidden": "UIを非表示にしました (ESCで戻る)",
        "toast.edge.on": "エッジ: ON",
        "toast.edge.off": "エッジ: OFF",
        "toast.background.black": "背景: 黒",
        "toast.background.default": "背景: 標準",
        "shader.note.wgslUnavailable": "WebGPU (WGSL) 時のみ有効",
        "shader.note.loadModel": "モデルを読み込んでください",
        "shader.note.noMaterial": "このモデルには割り当て可能な材質がありません",
        "shader.apply.selected": "選択へ割り当て",
        "shader.apply.all": "全材質へ割り当て",
        "shader.reset.selected": "選択を標準化",
        "shader.reset.all": "全材質を標準化",
        "shader.note.selectedMaterial": "選択材質: {name}",
        "shader.note.mixedPresets": "材質未選択: 全材質に適用（現在は混在）",
        "shader.note.applyAll": "材質未選択: 全材質に適用",
        "shader.camera.postfx": "ポストエフェクト",
        "shader.camera.note": "カメラ用ポストエフェクト",
    },
    en: {
        "toolbar.loadFile.label": "Load File",
        "toolbar.loadFile.title": "Load PMX / VMD / VPD / audio",
        "toolbar.saveProject.label": "Save Project",
        "toolbar.saveProject.title": "Save project JSON",
        "toolbar.loadProject.label": "Load Project",
        "toolbar.loadProject.title": "Load project JSON",
        "toolbar.toggleGroup.ariaLabel": "Visibility and feature toggles",
        "toolbar.ground.short": "GND",
        "toolbar.ground.title.on": "Ground: ON (G, click to turn OFF)",
        "toolbar.ground.title.off": "Ground: OFF (G, click to turn ON)",
        "toolbar.sky.short": "SKY",
        "toolbar.sky.title.on": "Skydome: ON (click to turn OFF)",
        "toolbar.sky.title.off": "Skydome: OFF (click to turn ON)",
        "toolbar.aa.short": "AA",
        "toolbar.aa.title.on": "Anti-aliasing: ON (click to turn OFF)",
        "toolbar.aa.title.off": "Anti-aliasing: OFF (click to turn ON)",
        "toolbar.physics.short": "PHY",
        "toolbar.physics.naShort": "PHYx",
        "toolbar.physics.title.on": "Physics: ON (click to turn OFF)",
        "toolbar.physics.title.off": "Physics: OFF (click to turn ON)",
        "toolbar.physics.title.unavailable": "Physics: unavailable",
        "toolbar.fx.short": "FX",
        "toolbar.fx.title.on": "Effect panel: shown (click to hide)",
        "toolbar.fx.title.off": "Effect panel: hidden (click to show)",
        "toolbar.ui.short": "UI",
        "toolbar.ui.title.on": "UI hidden: ON (Alt+Enter / ESC)",
        "toolbar.ui.title.off": "UI hidden: OFF (Alt+Enter)",
        "playback.skipStart.title": "Jump to start (Home)",
        "playback.play.title": "Play (P / Space)",
        "playback.pause.title": "Pause (P / Space)",
        "playback.stop.title": "Stop",
        "playback.skipEnd.title": "Jump to end (End)",
        "playback.nudgeLeft.title": "Move selected key 1 frame left (Alt+Left)",
        "playback.nudgeRight.title": "Move selected key 1 frame right (Alt+Right)",
        "timeline.key.add.title": "Add keyframe at current frame (Enter / I / K / +)",
        "timeline.key.delete.title": "Delete selected keyframe (Delete)",
        "viewport.empty.title": "Load a PMX model",
        "viewport.empty.hint": "Use toolbar 'Load File' or press Ctrl+O",
        "toast.ground.on": "Ground: ON",
        "toast.ground.off": "Ground: OFF",
        "toast.sky.on": "Skydome: ON",
        "toast.sky.off": "Skydome: OFF",
        "toast.aa.on": "AA: ON",
        "toast.aa.off": "AA: OFF",
        "toast.physics.on": "Physics: ON",
        "toast.physics.off": "Physics: OFF",
        "toast.physics.unavailable": "Physics is unavailable in this environment",
        "toast.fx.shown": "Effect panel shown",
        "toast.fx.hidden": "Effect panel hidden",
        "toast.ui.hidden": "UI hidden (press ESC to restore)",
        "toast.edge.on": "Edge: ON",
        "toast.edge.off": "Edge: OFF",
        "toast.background.black": "Background: Black",
        "toast.background.default": "Background: Default",
        "shader.note.wgslUnavailable": "Available only with WebGPU (WGSL)",
        "shader.note.loadModel": "Load a model first",
        "shader.note.noMaterial": "No assignable materials in this model",
        "shader.apply.selected": "Assign selected",
        "shader.apply.all": "Assign all materials",
        "shader.reset.selected": "Reset selected",
        "shader.reset.all": "Reset all materials",
        "shader.note.selectedMaterial": "Selected material: {name}",
        "shader.note.mixedPresets": "No material selected: apply to all (currently mixed)",
        "shader.note.applyAll": "No material selected: apply to all",
        "shader.camera.postfx": "PostFX",
        "shader.camera.note": "Camera post effects",
    },
};

let currentLocale: UiLocale = DEFAULT_LOCALE;

const isLocale = (value: string | null | undefined): value is UiLocale => {
    return value === "ja" || value === "en";
};

const replaceParams = (template: string, params?: Record<string, string | number>): string => {
    if (!params) return template;
    let result = template;
    for (const [name, value] of Object.entries(params)) {
        result = result.replaceAll(`{${name}}`, String(value));
    }
    return result;
};

const resolveLocaleFromEnvironment = (): UiLocale => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLocale(stored)) return stored;
    const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
    return nav.startsWith("ja") ? "ja" : DEFAULT_LOCALE;
};

const applyKeyToAttribute = (
    root: ParentNode,
    dataAttr: string,
    targetAttr: string,
): void => {
    const selector = `[${dataAttr}]`;
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        const key = element.getAttribute(dataAttr);
        if (!key) return;
        element.setAttribute(targetAttr, t(key));
    });
};

export const t = (key: string, params?: Record<string, string | number>): string => {
    const table = translations[currentLocale];
    const fallback = translations[DEFAULT_LOCALE];
    const template = table[key] ?? fallback[key] ?? key;
    return replaceParams(template, params);
};

export const getLocale = (): UiLocale => currentLocale;

export const applyI18nToDom = (root: ParentNode = document): void => {
    root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
        const key = element.dataset.i18n;
        if (!key) return;
        element.textContent = t(key);
    });
    applyKeyToAttribute(root, "data-i18n-title", "title");
    applyKeyToAttribute(root, "data-i18n-aria-label", "aria-label");
    applyKeyToAttribute(root, "data-i18n-placeholder", "placeholder");
};

export const setLocale = (
    locale: UiLocale,
    options?: {
        persist?: boolean;
        applyToDom?: boolean;
        root?: ParentNode;
        emitEvent?: boolean;
    },
): void => {
    if (!isLocale(locale)) return;
    const persist = options?.persist ?? true;
    const applyToDom = options?.applyToDom ?? true;
    const emitEvent = options?.emitEvent ?? true;

    currentLocale = locale;
    if (persist && typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, locale);
    }
    if (applyToDom) {
        applyI18nToDom(options?.root ?? document);
    }
    if (emitEvent && typeof document !== "undefined") {
        document.dispatchEvent(
            new CustomEvent("app:locale-changed", {
                detail: { locale },
            }),
        );
    }
};

export const initializeI18n = (root: ParentNode = document): UiLocale => {
    const initialLocale = resolveLocaleFromEnvironment();
    setLocale(initialLocale, {
        persist: false,
        applyToDom: true,
        root,
        emitEvent: false,
    });
    return initialLocale;
};
