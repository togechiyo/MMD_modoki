import type { MmdManager } from "../mmd-manager";
import type { AutomationFileToolItem, AutomationPermission } from "./ui-operation-schema";
import { convertVmdForPmxModels } from "../tools/vmd-retarget-file-service";
import { AutomationError } from "./diagnostics";
import { assertAutomationPermission, saveAutomationBytes } from "./file-access";

export async function runFileTool(manager: MmdManager, item: AutomationFileToolItem, permission: AutomationPermission) {
    const read = async (filePath: string) => {
        await assertAutomationPermission(permission);
        const bytes = await window.electronAPI.readBinaryFile(filePath);
        if (!bytes) throw new AutomationError("ASSET_LOAD_FAILED");
        return new Uint8Array(bytes);
    };
    try {
        if (item.kind === "retargetMotion") {
            const converted = await convertVmdForPmxModels(await read(item.sourceModelPath), await read(item.sourceMotionPath), await read(item.targetModelPath), item.options);
            await assertAutomationPermission(permission);
            const saved = await window.electronAPI.automation.saveMotion({ filePath: item.filePath, overwrite: item.overwrite, format: "vmd", document: converted.document }, permission);
            if (saved.status !== "saved") throw new AutomationError(saved.code);
            const r = converted.report;
            return { ...saved, report: { inputBoneKeyCount: r.inputBoneKeyCount, outputBoneKeyCount: r.outputBoneKeyCount,
                mappedBoneTrackCount: r.mappedBoneTrackCount, mappedMorphTrackCount: r.mappedMorphTrackCount,
                rotationKeyCount: r.rotationKeyCount, positionKeyCount: r.positionKeyCount,
                omittedBoneTrackCount: r.omittedBoneTracks.length, omittedMorphTrackCount: r.omittedMorphTracks.length,
                warningCount: r.warnings.length } };
        }
        await assertAutomationPermission(permission);
        const bytes = item.kind === "optimizeModel" ? await manager.convertPmxFileToBpmx(item.sourcePath)
            : await manager.convertVmdBytesToBvmd(item.sourcePath.split(/[\\/]/).pop() ?? "motion.vmd", await read(item.sourcePath));
        await assertAutomationPermission(permission);
        return await saveAutomationBytes({ filePath: item.filePath, overwrite: item.overwrite, format: item.kind === "optimizeModel" ? "bpmx" : "bvmd", bytes }, permission);
    } catch (error) {
        if (error instanceof AutomationError) throw error;
        window.electronAPI.logError("asset", "MCP file tool conversion failed", { kind: item.kind, message: error instanceof Error ? error.message : String(error) });
        throw new AutomationError("CONVERSION_FAILED");
    }
}
