export type SectionKeyframeButtonState = "none" | "dirty" | "registered";

/** Shared with the bottom panels: pending edit, registered key, or no edit. */
export function refreshSectionKeyframeButton(button: HTMLButtonElement, state: SectionKeyframeButtonState, playing: boolean): void {
    button.classList.remove("is-none", "is-empty", "is-registered");
    button.hidden = playing;
    button.disabled = playing || state === "none";
    button.textContent = playing ? "" : state === "registered" ? "♦" : state === "dirty" ? "♢" : "";
    if (!playing) button.classList.add(state === "none" ? "is-none" : state === "dirty" ? "is-empty" : "is-registered");
}
