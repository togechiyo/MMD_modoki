import { t } from "../i18n";
import type { EffectParameter, EffectValue } from "../external-wgsl/contract";
import { installEnterCommitNumberInput } from "./panel-control-helpers";
import { createPopupFormField } from "./popup-form-helpers";

/** A parameter editor retains exact stored values; only the edited component is committed. */
export function createExternalWgslParameter(options: {
    name: string; parameter: EffectParameter; value: EffectValue; disabled: boolean;
    expanded: boolean; expand: (open: boolean) => void; commit: (value: EffectValue) => void;
}): HTMLElement {
    const { name, parameter, value, disabled, commit } = options;
    const values = Array.isArray(value) ? value : [value];
    const label = parameter.ui?.label ?? name;
    const colour = parameter.ui?.control === "color";
    const row = document.createElement("div"); row.className = "external-wgsl-parameter";
    const components = document.createElement("div"); components.className = "external-wgsl-components";
    const numeric = values.map((component, index) => {
        const input = document.createElement("input"); input.type = "number";
        input.className = "popup-form-control"; input.value = String(component); input.title = String(component);
        input.step = String(parameter.ui?.step ?? "any"); input.disabled = disabled;
        input.dataset.wgslParameter = name; input.dataset.component = String(index);
        input.setAttribute("aria-label", label + (values.length > 1 ? ` ${colour ? "RGBA"[index] : "XYZW"[index]}` : ""));
        if (parameter.ui?.min !== undefined) input.min = String(parameter.ui.min);
        if (parameter.ui?.max !== undefined) input.max = String(parameter.ui.max);
        installEnterCommitNumberInput(input, {
            commit: () => {
                const next = [...values]; next[index] = input.value === "" ? NaN : Number(input.value);
                commit(Array.isArray(value) ? next : next[0]);
            },
            revert: () => { input.value = String(component); },
        });
        return input;
    });
    if (colour) {
        const picker = document.createElement("input"); picker.type = "color";
        picker.className = "popup-form-control"; picker.disabled = disabled;
        picker.dataset.wgslColor = name;
        picker.value = "#" + values.slice(0, 3).map(n => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0")).join("");
        const controls = document.createElement("div"); controls.className = "external-wgsl-color";
        const hex = document.createElement("span"); hex.textContent = picker.value.toUpperCase();
        controls.append(hex, picker);
        picker.setAttribute("aria-label", label);
        row.append(createPopupFormField(label, controls, "div"));
        picker.addEventListener("change", () => {
            picker.blur();
            const rgb = [1, 3, 5].map(offset => parseInt(picker.value.slice(offset, offset + 2), 16) / 255);
            commit(values.length === 4 ? [...rgb, values[3]] : rgb);
        });
        const details = document.createElement("details"); details.className = "external-wgsl-color-details";
        details.dataset.wgslColorDetails = name;
        details.open = options.expanded;
        details.addEventListener("toggle", () => options.expand(details.open));
        const summary = document.createElement("summary"); summary.textContent = t("wgsl.colorComponents");
        details.append(summary, components); row.append(details);
    } else if (values.length === 1) {
        row.append(createPopupFormField(label, numeric[0]));
        const min = parameter.ui?.min; const max = parameter.ui?.max;
        if (min !== undefined && max !== undefined && max > min) {
            const slider = document.createElement("input"); slider.type = "range";
            slider.className = "light-slider external-wgsl-range"; slider.disabled = disabled;
            slider.min = String(min); slider.max = String(max);
            slider.step = String(parameter.type === "f32" ? parameter.ui?.step ?? (max - min) / 100 : Math.max(1, Math.round(parameter.ui?.step ?? 1)));
            slider.value = String(value); slider.dataset.wgslRange = name;
            slider.setAttribute("aria-label", label);
            slider.addEventListener("input", () => { numeric[0].value = slider.value; });
            slider.addEventListener("change", () => { slider.blur(); commit(Number(slider.value)); });
            row.append(slider);
        }
    } else {
        const title = document.createElement("span"); title.className = "popup-form-label"; title.textContent = label;
        row.append(title, components);
    }
    if (values.length > 1) numeric.forEach((input, index) => {
        components.append(createPopupFormField(colour ? "RGBA"[index] : "XYZW"[index], input));
    });
    return row;
}
