import { app, BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import fs from "node:fs";
import path from "node:path";
import { WgslRecoveryGuard } from "../external-wgsl/recovery-state";

/** The marker is deliberately separate from renderer storage so a hung renderer cannot block recovery. */
export function installWgslRecovery(report: (message: string, error?: unknown) => void): { handlesFailure: (id: number) => boolean } {
    const marker = path.join(app.getPath("userData"), "external-wgsl-active");
    const guard = new WgslRecoveryGuard(fs.existsSync(marker), unsafe => {
        if (unsafe) {
            fs.mkdirSync(path.dirname(marker), { recursive: true });
            fs.writeFileSync(marker, "External WGSL was active. Re-enable explicitly after recovery.\n", { flush: true });
        } else fs.rmSync(marker, { force: true });
    }, process.argv.includes("--disable-external-wgsl"));
    const dialogs = new Set<number>();
    const restarting = new Set<number>();
    const failed = new Set<number>();
    const block = (): void => {
        try { guard.fail(); } finally {
            for (const window of BrowserWindow.getAllWindows()) {
                const contents = window.webContents;
                if (!contents.isDestroyed() && !contents.isCrashed() && !contents.isLoadingMainFrame()) contents.send("wgsl:blocked");
            }
        }
    };
    const recover = async (window: BrowserWindow, crashed: boolean): Promise<void> => {
        const contents = window.webContents;
        const id = contents.id;
        if (dialogs.has(id)) return;
        dialogs.add(id);
        try {
            const ja = app.getLocale().startsWith("ja");
            const result = await dialog.showMessageBox(window, {
                type: "warning", noLink: true, defaultId: 1, cancelId: 1,
                title: "MMD modoki — WGSL",
                message: ja ? "描画が停止したか、応答していません。" : "Rendering has stopped or is not responding.",
                detail: ja ? "再読込すると未保存の変更は失われます。プロジェクト内のWGSLも、実験設定で再度許可するまで実行しません。" : "Reloading discards unsaved changes. Project shaders will stay disabled until you enable external WGSL again in experimental settings.",
                buttons: ja ? ["WGSLを無効にして再読込", crashed ? "閉じる" : "待機"] : ["Reload without WGSL", crashed ? "Dismiss" : "Wait"],
            });
            if (result.response !== 0 || contents.isDestroyed()) return;
            // Persist BEFORE killing the renderer. Do not reload synchronously inside render-process-gone.
            block();
            restarting.add(id);
            if (!contents.isCrashed()) {
                await new Promise<void>((resolve, reject) => {
                    const gone = (): void => {
                        clearTimeout(timer);
                        // Electron 40 can start reload before the asynchronous kill finishes.
                        // Leave its process-death notification before starting a new navigation.
                        setImmediate(resolve);
                    };
                    const timer = setTimeout(() => {
                        contents.removeListener("render-process-gone", gone);
                        reject(new Error("WGSL renderer termination timed out; restart the app with external WGSL disabled"));
                    }, 5000);
                    contents.once("render-process-gone", gone);
                    try { contents.forcefullyCrashRenderer(); }
                    catch (error) { clearTimeout(timer); contents.removeListener("render-process-gone", gone); reject(error); }
                });
            }
            if (!contents.isDestroyed()) contents.reload();
        } catch (error) {
            restarting.delete(id);
            throw error;
        } finally { dialogs.delete(id); }
    };
    app.on("browser-window-created", (_event, window) => {
        const contents = window.webContents;
        const id = contents.id;
        const fault = (crashed: boolean): void => {
            if (!guard.isActive(id) || restarting.has(id)) return;
            failed.add(id);
            try { block(); } catch (error) { report("WGSL recovery marker could not be saved", error); }
            report(crashed ? "Renderer exited while external WGSL was active" : "Renderer unresponsive while external WGSL was active");
            // Tests simulate this event and supply a native-dialog response; no real GPU hang is needed.
            void recover(window, crashed).catch(error => report("WGSL recovery dialog failed", error));
        };
        contents.on("render-process-gone", (_event, details) => { if (details.reason !== "clean-exit") fault(true); });
        window.on("unresponsive", () => fault(false));
        contents.on("did-finish-load", () => { failed.delete(id); restarting.delete(id); });
        contents.once("destroyed", () => {
            failed.delete(id);
            restarting.delete(id);
            try { guard.close(id); } catch (error) { report("WGSL recovery marker could not be cleared", error); }
        });
    });
    const senderId = (contents: WebContents): number => {
        if (!BrowserWindow.fromWebContents(contents)) throw new Error("WGSL recovery requires an app window");
        return contents.id;
    };
    for (const action of ["state", "allow", "arm", "disarm", "fail"] as const) {
        ipcMain.handle("wgsl:" + action, event => {
            if (event.senderFrame !== event.sender.mainFrame) throw new Error("WGSL recovery requires the main frame");
            const id = senderId(event.sender);
            if (action === "state") return { blocked: guard.blocked };
            if (action === "allow") guard.allow();
            if (action === "arm") guard.arm(id);
            if (action === "disarm") guard.close(id);
            if (action === "fail") block();
        });
    }
    return { handlesFailure: id => failed.has(id) };
}
