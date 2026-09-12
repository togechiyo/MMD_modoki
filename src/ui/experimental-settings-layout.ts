import { createPopupFormField } from "./popup-form-helpers";

export function createExperimentalSection(name: "PBR" | "WGSL" | "MCP"): HTMLElement {
    const section = document.createElement("section");
    section.className = "experimental-settings-section";
    section.dataset.experimentSection = name.toLowerCase();
    const title = document.createElement("h3");
    title.id = `experiment-section-${name.toLowerCase()}`;
    title.textContent = name;
    section.setAttribute("aria-labelledby", title.id);
    section.append(title);
    return section;
}

export function createExperimentalToggle(label: string, input: HTMLInputElement): HTMLElement {
    const field = createPopupFormField(label, input);
    field.classList.add("experimental-settings-toggle");
    field.prepend(input);
    return field;
}
