type Route = { tool: string; fixedArguments: Record<string, unknown> };
type MenuItem = { command: string; labelKey: string; groupKey: string; status: "supported" | "partial" | "informational"; routes: Route[]; note: string };
const route = (tool: string, fixedArguments: Record<string, unknown> = {}): Route => ({ tool, fixedArguments });
const item = (command: string, routes: Route[], note = ""): MenuItem => ({ command, labelKey: "menu." + command,
    groupKey: "menu." + command.split(".")[0], status: "supported", routes, note });
const setting = (command: string, id: string) => item(command, [route("mmd_set_setting", { setting: { id } })]);
const control = (command: string, id: string, value?: unknown) => item(command,
    [route("mmd_list_controls", { query: id }), route("mmd_set_control", { control: { id, ...(value === undefined ? {} : { value }) } })]);
const details = (command: string, query: string, note = "") => item(command, [route("mmd_list_controls", { query }), route("mmd_set_control")], note);
const action = (command: string, args: Record<string, unknown>, note = "") => item(command, [route("mmd_execute_menu_action", { action: args })], note);
const operation = (command: string, args: Record<string, unknown>, note = "") => item(command, [route("mmd_start_ui_operation", { operation: args }), route("mmd_get_operation")], note);
const register = (command: string) => item(command, [route("mmd_register_keyframes")], "現在のscope、登録するtracks、collisionを明示する。previewとは別操作。");

/** Partial argument templates for explicit tools, never an arbitrary command dispatcher. */
export const menuItems: readonly MenuItem[] = [
    operation("file.openFile", { kind: "loadAsset" }, "assetKindとローカル絶対filePathを指定する。"),
    ...(["Model", "Motion", "CameraMotion", "Audio"] as const).map(name => operation("file.open" + name,
        { kind: "loadAsset", assetKind: name[0].toLowerCase() + name.slice(1) }, "filePath必須。モデルモーションは対象modelInstanceIdも指定。")),
    operation("file.newProjectWindow", { kind: "newProjectWindow" }, "新ウィンドウのMCPはOFF。ユーザーが有効化するまで公開しない。"),
    operation("file.loadProject", { kind: "loadProject" }), operation("file.saveProject", { kind: "saveProject" }),
    ...(["ModelVmd", "ModelBvmd", "CameraVmd", "CameraBvmd", "ModelVpd"] as const).map(name => operation("file.export" + name,
        { kind: "exportMotion", format: name.replace(/^(Model|Camera)/, "").toLowerCase(), scope: { kind: name.startsWith("Model") ? "model" : "camera" } },
        "filePath・overwrite、モデルならscope.modelInstanceIdを指定。VPDは選択ボーン。")),
    operation("file.exportPng", { kind: "exportPng" }, "出力条件はmmd_set_editor_options。PNGはviewport経路。"),
    operation("file.exportPngSequence", { kind: "exportPngSequence" }, "outputDirectoryPathを指定。進捗と取消に対応。"),
    operation("file.webmExportSettings", { kind: "exportWebm" }, "mmd_set_editor_optionsで出力条件を設定。"),
    item("edit.undo", [route("mmd_undo")], "editIdを指定。共有履歴末尾のAI編集のみ。"),
    item("edit.redo", [route("mmd_redo")], "editIdを指定。共有履歴先頭のAI編集のみ。"),
    item("edit.copyKeyframe", [route("mmd_copy_keyframes")], "現在の選択から最大100キー。"),
    item("edit.pasteKeyframe", [route("mmd_get_keyframe_clipboard"), route("mmd_paste_keyframes")], "clipboardId・frame・collisionを指定。最大100キー。"),
    item("edit.mirrorPasteKeyframe", [route("mmd_transform_keyframes", { operation: { action: "mirror" } })], "source keys・frameOffset・collisionを指定。GUIクリップボード方式とは入力が異なる。"),
    item("edit.deleteKeyframe", [route("mmd_edit_keyframe_selection", { operation: { action: "delete" } })]),
    ...(["insertEmptyFrame", "deleteFrameColumn"] as const).map((name, index) => item("edit." + name,
        [route("mmd_transform_keyframes", { operation: { action: index === 0 ? "insertFrames" : "deleteFrames", count: 1 } })], "frameを指定。")),
    register("edit.addKeyframe"),
    ...(["all", "bone", "morph", "camera"] as const).map(scope => item("edit.autoKeyScope." + scope,
        [route("mmd_get_editor_options"), route("mmd_set_editor_options", { options: { kind: "autoKey", scope } })], "現在のenabledを保持して指定。")),
    action("edit.prevKeyframe", { kind: "adjacentKey", direction: -1 }), action("edit.nextKeyframe", { kind: "adjacentKey", direction: 1 }),
    ...([ ["Camera", "camera"], ["Light", "light"], ["SelfShadow", "shadow"], ["Gravity", "gravity"], ["Bone", "bone"], ["Morph", "morph"] ] as const)
        .map(([name, category]) => action("edit.selectAll" + name + "Keys", { kind: "selectAllKeys", category }, "現在scopeを全選択。コピー・一括編集の100キー上限は維持。")),
    ...([ ["correctBonePosition", "bone"], ["correctCamera", "camera"], ["correctMorph", "morph"] ] as const).map(([name, kind]) => item("edit." + name,
        [route("mmd_transform_keyframes", { operation: { action: "correct", correction: { kind } } })], "keysと補正値を指定。")),
    item("edit.correctMotionForBody", [route("mmd_correct_body_motion")]),
    operation("edit.deleteActiveModel", { kind: "removeAsset" }, "mmd_list_assetsでモデルのassetId・expectedPathを確認。"),
    action("edit.clearModelMotion", { kind: "clearModelMotion", dryRun: true }, "modelInstanceId必須。dryRun:falseで適用。全モーションと外部親を削除、共有Undo対応。"),
    { ...item("dialog.preferences", [], "現行GUIは説明文のみで設定操作はない。"), status: "informational", labelKey: "menu.edit.preferences", groupKey: "menu.edit" },
    control("view.toggleEdge", "edge.width"), details("view.edgeSettings", "edge.", "幅0で非表示。再表示の幅は取得して保持。"),
    { ...details("view.renderOrderSettings", "render."), routes: [route("mmd_list_controls", { query: "render." }), route("mmd_set_control"), route("mmd_execute_menu_action", { action: { kind: "moveModelRenderOrder" } })] },
    setting("view.toggleAntialias", "runtime.antialias"), setting("view.toggleShadow", "runtime.shadow"),
    details("view.lightShadowSettings", "shadow."), control("view.toggleCharacterContactShadow", "contactShadow.enabled"), details("view.contactShadowSettings", "contactShadow."),
    control("view.toggleMirrorFloor", "mirror.enabled"), details("view.mirrorFloorSettings", "mirror."), control("view.togglePhysicsBones", "viewport.physicsBones"),
    ...(["front", "back", "left", "right", "top", "bottom"] as const).map(view => action("view.camera." + view, { kind: "cameraView", view }, "カメラpreview。自動キー登録なし。")),
    item("view.toggleActiveModel", [route("mmd_set_object_state")], "subjectに選択モデル、patch.visibleを指定。"),
    ...([ ["Unlimited", 0], ["60", 60], ["30", 30] ] as const).map(([name, value]) => control("view.fps" + name, "runtime.fpsLimit", value)),
    { ...setting("view.toggleSkydome", "viewport.skydome"), groupKey: "menu.background" },
    { ...details("background.settings", "viewport.skyStyle"), routes: [route("mmd_list_controls", { query: "viewport.skyStyle" }), route("mmd_set_control"), route("mmd_execute_menu_action", { action: { kind: "resetSky" } })] },
    { ...setting("view.toggleGround", "viewport.ground"), groupKey: "menu.background" }, setting("background.toggleMedia", "viewport.backgroundMedia"),
    control("background.setWhite", "viewport.backgroundMode", "white"), control("background.toggleBlack", "viewport.backgroundMode", "black"), control("background.setChecker", "viewport.backgroundMode", "checker"),
    register("expression.addKeyframe"), register("expression.registerMorph"),
    setting("physics.togglePhysics", "runtime.physics"), control("physics.toggleFloorCollision", "physics.floorCollision"), setting("physics.toggleRigidBodies", "runtime.rigidBodies"),
    { ...details("physics.settings", "physics.", "補正とbufferは設定可能。runtime・Bullet backend切替はユーザー操作。"), status: "partial" },
    details("physics.gravitySettings", "physics.gravity"),
    item("window.toggleUi", [route("mmd_set_editor_options", { options: { kind: "fullscreen" } })], "enabled=trueでUIを隠し、falseで戻す。"),
    ...([75, 100, 125, 150] as const).map(value => item("window.uiScale." + value, [route("mmd_set_editor_options", { options: { kind: "uiScale", value } })])),
    { ...item("tools.experimentalSettings", [route("mmd_start_ui_operation", { operation: { kind: "materialMode" } }), route("mmd_list_controls", { query: "environment." })],
        "通常/PBR・環境設定は操作可能。MCP有効化・編集/詳細診断許可、外部WGSL有効化、ログのOS操作はユーザー設定。"), status: "partial", groupKey: "menu.window" },
    operation("tools.mmdOptimizedFormat", { kind: "fileTools" }, "itemsにoptimizeModel/optimizeMotionと明示path・overwriteを指定。"),
    operation("tools.vmdRetarget", { kind: "fileTools" }, "itemsにretargetMotionと明示path・options・overwriteを指定。"),
];

export function readMenuItems(query: string, translate: (key: string) => string) {
    const normalized = query.normalize("NFKC").toLowerCase();
    const items = menuItems.map(entry => ({ ...entry,
        label: entry.command.startsWith("window.uiScale.") ? entry.command.slice("window.uiScale.".length) + "%" : translate(entry.command === "window.toggleUi" ? "menu.window.showUi" : entry.labelKey),
        group: translate(entry.groupKey),
    })).filter(entry => JSON.stringify(entry).normalize("NFKC").toLowerCase().includes(normalized));
    return { items, totalCount: items.length, argumentTemplates: "partial; add target/revision/operationId and required values from tool schema", modelContentShared: false };
}
