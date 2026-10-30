import { t } from "../i18n";
import { refreshSectionKeyframeButton, type SectionKeyframeButtonState } from "./section-keyframe-button";

export type RcLightingEffectCardOptions = {
    expanded: boolean;
    keyframeState: () => SectionKeyframeButtonState;
};

/** Scene lighting shares the effect list, but keeps one field and one key track per effect. */
export function createRcLightingEffectCard(parent: HTMLElement, id: "rcSkyOcclusion" | "rcDiffuseGi", options: RcLightingEffectCardOptions) {
    const section = document.createElement("section");
    section.className = "effect-layer-placeholder effect-layer-placeholder--active effect-layer-placeholder--check rc-lighting-effect";
    section.dataset.effectStackRow = id;
    const heading = document.createElement("div");
    heading.className = "effect-layer-header";
    const toggle = document.createElement("label");
    toggle.className = "effect-layer-check-wrap";
    const enabled = document.createElement("input");
    enabled.type = "checkbox"; enabled.className = "effect-layer-check"; enabled.name = `${id}Enabled`;
    enabled.setAttribute("aria-label", t(`effect.frameGraphPost.effects.${id}`));
    toggle.append(enabled);
    const title = document.createElement("button");
    title.type = "button"; title.className = "effect-layer-main";
    title.dataset.effectStackItem = id; title.dataset.effectStackDrag = id;
    title.setAttribute("aria-expanded", String(options.expanded));
    const label = document.createElement("span");
    label.className = "effect-layer-name"; label.textContent = t(`effect.frameGraphPost.effects.${id}`);
    title.append(label);
    const register = document.createElement("button");
    register.type = "button"; register.className = "section-kf-btn effect-instance-keyframe-button";
    register.dataset.rcRegisterKey = id;
    heading.append(toggle, title, register);
    const content = document.createElement("div");
    content.className = "effect-layer-details"; content.hidden = !options.expanded;
    const advanced = document.createElement("details");
    advanced.dataset.rcVolumeControls = id;
    const summary = document.createElement("summary");
    summary.textContent = t("effect.rcLighting.volume");
    advanced.append(summary);
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "effect-layer-control-button";
    remove.dataset.effectStackRemove = id; remove.textContent = t("effect.instance.delete");
    section.append(heading, content);
    parent.append(section);
    return {
        section, content, advanced, enabled, register, remove,
        refresh(isEnabled: boolean, playing: boolean): void {
            section.classList.toggle("effect-layer-placeholder--off", !isEnabled);
            enabled.checked = isEnabled; enabled.disabled = playing;
            title.disabled = playing; title.draggable = !playing; remove.disabled = playing;
            const state = options.keyframeState();
            refreshSectionKeyframeButton(register, state, playing);
            const text = t(`experiment.${id}.${state === "registered" ? "updateKey" : "registerKey"}`);
            register.title = text; register.setAttribute("aria-label", text);
        },
    };
}
