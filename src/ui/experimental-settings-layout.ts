import { createPopupFormField } from "./popup-form-helpers";

export function createExperimentalSection(name: "PBR" | "WGSL" | "MCP", input: HTMLInputElement): HTMLElement {
    const section = document.createElement("section");
    section.className = "experimental-settings-section";
    section.dataset.experimentSection = name.toLowerCase();
    const title = document.createElement("h3");
    const label = document.createElement("label");
    label.className = "experimental-settings-heading-toggle";
    const text = document.createElement("span");
    text.id = `experiment-section-${name.toLowerCase()}`;
    text.textContent = name;
    label.append(input, text);
    title.append(label);
    title.setAttribute("aria-labelledby", text.id);
    section.setAttribute("aria-labelledby", text.id);
    section.append(title);
    return section;
}

export function createExperimentalToggle(label: string, input: HTMLInputElement): HTMLElement {
    const field = createPopupFormField(label, input);
    field.classList.add("experimental-settings-toggle");
    field.prepend(input);
    return field;
}
