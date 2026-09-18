export function isProjectFilePath(filePath: string): boolean {
    return /\.(?:mmdproj|json)$/i.test(filePath);
}

export function classifyProjectDrop(filePaths: readonly string[]): "assets" | "project" | "mixed" {
    if (!filePaths.some(isProjectFilePath)) return "assets";
    return filePaths.length === 1 ? "project" : "mixed";
}

/** Compare persisted content, excluding the timestamp generated on every export. */
export function projectDropSnapshot(project: object): string {
    return JSON.stringify({ ...project, savedAt: undefined });
}

export function canReuseProjectWindow(input: {
    initialSnapshot: string;
    getCurrentProject: () => object;
    filePath: string | null;
    historyRevision: number;
    busy: boolean;
}): boolean {
    return !input.busy && input.filePath === null && input.historyRevision === 0
        && input.initialSnapshot === projectDropSnapshot(input.getCurrentProject());
}
