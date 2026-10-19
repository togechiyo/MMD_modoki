export function resolveRetainedNumberInput(text: string, display: string, source: number): number {
    const value = Number(text);
    return Number.isFinite(source) && value === Number(display) ? source : value;
}
