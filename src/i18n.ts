import { createInstance, type Resource } from "i18next";
import type { UiLocale } from "./types";
import { DEFAULT_UI_LOCALE as DEFAULT_LOCALE, isUiLocale as isLocale, uiTranslations as translations } from "./shared/ui-locales";

export type { UiLocale } from "./types";

const STORAGE_KEY = "mmd.ui.locale";

const resources: Resource = {
    ja: { translation: translations.ja },
    en: { translation: translations.en },
    "zh-Hant": { translation: translations["zh-Hant"] },
    "zh-Hans": { translation: translations["zh-Hans"] },
    ko: { translation: translations.ko },
};

const i18nInstance = createInstance();

let currentLocale: UiLocale = DEFAULT_LOCALE;
let i18nInitialized = false;

const resolveLocaleFromEnvironment = (): UiLocale => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLocale(stored)) return stored;
    return DEFAULT_LOCALE;
};

const ensureI18nInitialized = (locale: UiLocale): void => {
    if (i18nInitialized) return;
    void i18nInstance.init({
        resources,
        lng: locale,
        fallbackLng: "en",
        initImmediate: false,
        interpolation: {
            escapeValue: false,
            prefix: "{",
            suffix: "}",
        },
    });
    i18nInitialized = true;
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

const syncDocumentLocale = (locale: UiLocale): void => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.setAttribute("lang", locale);
};

export const t = (key: string, params?: Record<string, string | number>): string => {
    ensureI18nInitialized(currentLocale);
    return i18nInstance.t(key, {
        ...params,
        defaultValue: key,
        lng: currentLocale,
    });
};

export const getLocale = (): UiLocale => currentLocale;

export function getEffectInstanceDisplayName(type: string, label: string): string {
    if (type !== "ringParticles") return label;
    const defaultName = /^Particles( [1-9]\d*)?$/.exec(label);
    return defaultName ? t("effect.frameGraphPost.effects.ringParticles") + (defaultName[1] ?? "") : label;
}

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
    if (typeof window !== "undefined") window.electronAPI?.setUiLocale?.(locale);
    ensureI18nInitialized(locale);
    syncDocumentLocale(locale);
    if (i18nInstance.language !== locale) {
        void i18nInstance.changeLanguage(locale);
    }
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
    const storedLocale = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const initialLocale = resolveLocaleFromEnvironment();
    ensureI18nInitialized(initialLocale);
    setLocale(initialLocale, {
        persist: !isLocale(storedLocale),
        applyToDom: true,
        root,
        emitEvent: false,
    });
    return initialLocale;
};

if (typeof window !== "undefined") {
    window.mmdI18n = {
        getLocale,
        setLocale,
        apply: applyI18nToDom,
    };
}
