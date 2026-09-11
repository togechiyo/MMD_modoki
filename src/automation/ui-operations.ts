import type { MmdManager } from "../mmd-manager";
import { createCameraVmdExportDocument, createModelVmdExportDocument } from "../export/vmd-export-adapter";
import { serializeCameraBvmd, serializeModelBvmd } from "../export/bvmd-exporter";
import { AutomationError } from "./diagnostics";
import type { AutomationUiOperation, AutomationOutput, AutomationPermission } from "./ui-operation-schema";
import type { KeyframeScope } from "../actions/keyframe-transaction";
import type { AutomationJobContext } from "./ui-jobs";

export async function assertAutomationPermission(permission: AutomationPermission): Promise<void> {
    const current = await window.electronAPI.automation.getState();
    if (!current.enabled || !current.editable || current.sessionId !== permission.sessionId || current.grant !== permission.grant) throw new AutomationError("ACCESS_REVOKED");
}

export async function saveAutomationBytes(input: AutomationOutput, permission: AutomationPermission): Promise<Record<string, unknown>> {
    const result = await window.electronAPI.automation.writeOutput(input, permission);
    if (result.status !== "saved") throw new AutomationError(result.code);
    return result;
}
export type UiOperationHost = {
    permission: AutomationPermission;
    manager: MmdManager;
    scope(): KeyframeScope | null;
    materialMode(pbr: boolean): Promise<void>;
    saveProject(target: { filePath: string; overwrite: boolean }): Promise<Record<string, unknown>>;
    exportPng(target: { filePath: string; overwrite: boolean }): Promise<Record<string, unknown>>;
    exportWebm(target: { filePath: string; overwrite: boolean }, context: AutomationJobContext): Promise<Record<string, unknown>>;
    removeAsset(assetId: string, expectedPath: string): Promise<Record<string, unknown>>;
    loadProject(filePath: string): Promise<Record<string, unknown>>;
    loadModel(filePath: string): Promise<unknown>;
    loadAccessory(filePath: string): Promise<boolean>;
    loadLut(filePath: string): Promise<boolean>;
    refresh(): void;
};
const extensions = {
    model: ["pmx", "pmd", "bpmx"], accessory: ["x", "obj"], motion: ["vmd", "bvmd"], cameraMotion: ["vmd", "bvmd"], pose: ["vpd"],
    audio: ["mp3", "wav", "ogg"], backgroundImage: ["png", "jpg", "jpeg", "bmp", "webp"], backgroundVideo: ["webm", "mp4", "avi"], environment: ["hdr", "env", "dds"], lut: ["cube", "3dl"],
};
export async function runAutomationUiOperation(host: UiOperationHost, operation: AutomationUiOperation, context: AutomationJobContext): Promise<Record<string, unknown>> {
    const m = host.manager;
    if (operation.kind === "materialMode") {
        await host.materialMode(operation.pbr);
        if (m.getMmdMaterialPipelinePreset() !== (operation.pbr ? "pbr-standard" : "mmd-standard")) throw new AutomationError("OPERATION_FAILED");
        return { materialMode: m.getMmdMaterialPipelinePreset() };
    }
    if (operation.kind === "saveProject") return host.saveProject(operation);
    if (operation.kind === "exportPng") return host.exportPng(operation);
    if (operation.kind === "exportWebm") return host.exportWebm(operation, context);
    if (operation.kind === "removeAsset") return host.removeAsset(operation.assetId, operation.expectedPath);
    if (operation.kind === "loadProject") return host.loadProject(operation.filePath);
    if (operation.kind === "loadAsset") {
        const ext = operation.filePath.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
        if (!extensions[operation.assetKind].includes(ext)) throw new AutomationError("INVALID_OUTPUT");
        if (["motion", "pose"].includes(operation.assetKind)) {
            const scope = host.scope();
            if (!operation.modelInstanceId || scope?.kind !== "model" || scope.modelInstanceId !== operation.modelInstanceId) throw new AutomationError("TIMELINE_TARGET_CHANGED");
        } else if (operation.modelInstanceId !== undefined) throw new AutomationError("INVALID_EDIT");
        let loaded: unknown;
        switch (operation.assetKind) {
            case "model": loaded = await host.loadModel(operation.filePath); break;
            case "accessory": loaded = await host.loadAccessory(operation.filePath); break;
            case "motion": case "pose": loaded = await m.loadVMD(operation.filePath); break;
            case "cameraMotion": loaded = await m.loadCameraVMD(operation.filePath); break;
            case "audio": loaded = await m.loadMP3(operation.filePath); break;
            case "environment": loaded = await m.setEnvironmentLightingSourcePath(operation.filePath); if (loaded) m.setEnvironmentLightingEnabled(true); break;
            case "lut": loaded = await host.loadLut(operation.filePath); break;
            case "backgroundImage": await m.setBackgroundImageFromPath(operation.filePath); loaded = m.getBackgroundImagePath() === operation.filePath; break;
            case "backgroundVideo": await m.setBackgroundVideoFromPath(operation.filePath); loaded = m.getBackgroundVideoPath() === operation.filePath; break;
        }
        if (!loaded) throw new AutomationError("ASSET_LOAD_FAILED");
        host.refresh();
        return { filePath: operation.filePath, assetKind: operation.assetKind, modelContentShared: false };
    }
    const scope = host.scope();
    if (!scope || scope.kind !== operation.scope.kind || (operation.scope.kind === "model" && (scope.kind !== "model" || scope.modelInstanceId !== operation.scope.modelInstanceId))) throw new AutomationError("TIMELINE_TARGET_CHANGED");
    if (!operation.filePath.toLowerCase().endsWith(`.${operation.format}`)) throw new AutomationError("INVALID_OUTPUT");
    const source = operation.scope.kind === "camera" ? m.getCameraVmdExportSource() : m.getActiveModelVmdExportSource();
    if (!source && operation.format !== "vpd") throw new AutomationError("NO_EXPORT_DATA");
    if (operation.format === "bvmd") {
        if (!source) throw new AutomationError("NO_EXPORT_DATA");
        const bytes = operation.scope.kind === "camera" ? serializeCameraBvmd(source.animation) : serializeModelBvmd(source.animation);
        const result = await saveAutomationBytes({ ...operation, bytes }, host.permission);
        return { ...result, omittedExternalParentKeyCount: source.externalParentKeyCount };
    }
    let document: unknown;
    if (operation.format === "vpd") {
        if (operation.scope.kind !== "model") throw new AutomationError("INVALID_EDIT");
        const pose = m.getSelectedModelVpdExportSource();
        if (!pose || !m.hasSelectedModelVpdExportBones()) throw new AutomationError("NO_EXPORT_DATA");
        const header = await window.electronAPI.readMmdModelHeader(pose.modelInfo.path);
        document = { modelName: header?.modelName?.trim() || pose.modelInfo.name, bones: pose.bones, unsupportedExternalParentBoneCount: pose.unsupportedExternalParentBoneCount };
    } else if (operation.scope.kind === "camera") {
        if (!source) throw new AutomationError("NO_EXPORT_DATA");
        document = createCameraVmdExportDocument(source.animation.cameraTrack, source.externalParentKeyCount);
    } else {
        if (!source) throw new AutomationError("NO_EXPORT_DATA");
        const model = m.getActiveModelInfo();
        if (!model) throw new AutomationError("MODEL_NOT_FOUND");
        const header = await window.electronAPI.readMmdModelHeader(model.path);
        document = createModelVmdExportDocument(source.animation, header?.modelName?.trim() || model.name, source.externalParentKeyCount);
    }
    const result = await window.electronAPI.automation.saveMotion({ filePath: operation.filePath, overwrite: operation.overwrite, format: operation.format, document }, host.permission);
    if (result.status !== "saved") throw new AutomationError(result.code);
    return result;
}
