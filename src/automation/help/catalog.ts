export type AutomationHelpTopic = {
    id: string;
    title: string;
    aliases: readonly string[];
    status: "implemented" | "partial" | "planned";
    summary: string;
    body: string;
};

// Only bundled, trusted documentation belongs here. Asset names and paths are data.
export const automationHelpTopics: readonly AutomationHelpTopic[] = [
    {
        id: "getting-started", title: "AI連携の開始", aliases: ["start", "help", "使い方"],
        status: "implemented", summary: "実験設定からMCPを有効にし、必要なら編集も許可します。",
        body: "ツール→実験設定→AI連携。mmd_get_contextでtargetとeditRevisionを取得し、各toolへ渡します。書込はoperationId(UUID)とexpectedEditRevisionが必要。再生・停止・seek、カメラ・単一ボーンpreview、キーフレームの一括編集、対象切替、設定、材質表示、AI編集Undoに対応。モデル本体・テクスチャ・頂点等の形状データは返しません。UI全項目の対応は進行中。ui-coverageで対応状況、keyframesで値の単位を確認してください。手動入力やフレーム移動後はcontextを再取得してください。",
    },
    {
        id: "assets-and-paths", title: "素材と読込元パス", aliases: ["assets", "path", "モデル", "ステージ", "モーション", "元パス"],
        status: "implemented", summary: "mmd_list_assetsで現在のシーンの素材参照と使用先を一覧にします。",
        body: "recordedPathは保持された参照です。初版は絶対パスの再解決や存在確認をしません。モデル・アクセサリ・モーション取込履歴・カメラモーション・音声・背景・環境・LUTが対象。次ページはnextOffsetとexpectedAssetRevisionを指定します。モデル本体は取得できず、file:// Resource、汎用ファイル読込、バイナリのtoolはありません。編集後のモーションと元ファイルは一致するとは限りません。",
    },
    {
        id: "viewport", title: "ビューポート画像", aliases: ["capture", "screenshot", "画像", "見た目"],
        status: "implemented", summary: "mmd_capture_viewportで現在の表示をPNG画像Contentとして取得します。",
        body: "長辺1280px以下。モデルファイルではなく表示画像です。取得前後のframeとrevisionを返します。consistency:observedはcompositorの観測画像で、厳密なフレーム同期は保証しません。非表示・最小化・モーダル表示中は取得できません。カメラや再生状態を勝手に変更しません。",
    },
    {
        id: "camera", title: "カメラ編集", aliases: ["camera", "構図", "視点"],
        status: "implemented", summary: "mmd_set_cameraで既存CommandとUndoを共有する未登録編集を行います。",
        body: "camera:{target:{x,y,z},rotation:{x,y,z},distance,fov}。targetは注視点、rotationとfovは度。fovは10〜120。mode:preview、playbackPolicy:pauseまたはrejectを必須指定。キーは登録しません。mmd_capture_viewportで確認し、返されたeditIdをmmd_undoへ渡せます。",
    },
    {
        id: "pose", title: "ポーズ・表情", aliases: ["pose", "bone", "morph", "ボーン", "モーフ"],
        status: "implemented", summary: "mmd_set_boneによる単一ボーンの未登録編集に対応します。",
        body: "mmd_inspectのkind:bonesとmodelInstanceIdで名前と編集値を参照。mmd_set_boneへmodelInstanceId、boneName、position、rotation、mode:preview、playbackPolicy:pauseまたはrejectを渡します。rotationは度。同名ボーンは拒否します。ボーン・モーフのキー値はmmd_edit_keyframesで一括登録できます。キーのbone rotationsはquaternionなのでpreviewの度と混同しないこと。複数ボーンやモーフの未登録previewは後続です。",
    },
    {
        id: "materials", title: "材質の表示と設定", aliases: ["material visibility", "材質を消す", "表示切替", "PBR"],
        status: "partial", summary: "モデルの材質表示切替に対応。プリセット・詳細値・アクセサリ材質は後続です。",
        body: "mmd_inspect(kind:materials,modelInstanceId)でkey/name/visibleとプリセットIDを参照。mmd_set_material_visibilityへmodelInstanceId,materialKey,visibleを指定。通常/PBR共通。非表示はalpha=0と区別します。Undo対象外。モデルやテクスチャ本体は返しません。",
    },
    {
        id: "keyframes", title: "キーフレームと補間の一括編集", aliases: ["keyframe", "timeline", "キーフレーム", "補間", "登録", "移動", "コピー", "削除"],
        status: "partial", summary: "set/delete/move/copyを100操作までまとめて1つのUndoにします。",
        body: "mmd_select_timeline(scope:{kind:camera}|{kind:model,modelInstanceId}|{kind:accessory,accessoryIndex})でUIの対象を選び、contextを再取得。mmd_inspect(kind:tracks)は空トラックも返し、kind:keyframesはキーのpayloadを返します。mmd_edit_keyframesには同じscope、collision:reject|replace、operations:[{action:set,track:{category,name},frame,payload}|{action:delete,track,frame}|{action:move|copy,track,frame,toFrame}]を指定。再生中は停止してから操作。コピー/移動は変更前の値から作成するため重なる一括移動も可能。衝突は既定で自動上書きせずcollisionの指定に従います。値はsource形式: camera positions=注視点xyz、rotations=Euler radians xyz、distances=[負のMMD距離]、fovs=[度]。bone/movableBone rotations=単位quaternion xyzw、movableBone positions=ローカル移動xyz、morph weights=[0..1]。補間は各軸4値[x1,x2,y1,y2] (0..127整数)、positionInterpolationsはxyz各4値で計12値。線形例[20,107,20,107]。physicsTogglesは[0|1]。light/shadow/gravity/accessory/propertyのキー値にも対応。新規propertyは現在のIK名と順序が必要。external-parent付きキーの編集は未対応として拒否し、リンクを失わないようにします。共有GUI Undo/Redoも利用できますが、同じ編集対象を選択してください。frame列挿入・ミラー・専用補正・自動キー設定は後続。",
    },
    {
        id: "ui-settings", title: "表示・実行・色調整の設定", aliases: ["settings", "設定", "物理", "AA", "背景", "色調整", "コントラスト", "ガンマ", "彩度"],
        status: "partial", summary: "mmd_get_settingsとmmd_set_settingで対応済み15項目を操作します。",
        body: "mmd_get_settingsはid別のvalue/availableを返します。mmd_set_settingにはsetting:{id,value}と通常の編集revisionを渡します。地面、空、背景メディア、AA、物理、影、剛体表示と、コントラスト%、ガンマ%、露出、ディザ、ビネット、粒子、シャープ%、彩度に対応。範囲はtool schemaを参照。UIと同じsetter・表示同期・project保存値を使います。設定はUndo対象外。背景メディア未読込などavailable:falseの項目は操作不可。再生中は変更不可。未対応のUI項目はui-coverageを参照。",
    },
    {
        id: "ui-coverage", title: "UI全項目への対応状況", aliases: ["capabilities", "coverage", "UI", "対応一覧", "全機能", "操作一覧"],
        status: "implemented", summary: "UI全項目への接続を目標とする対応表。未対応項目も検索できます。",
        body: "対応済み: 接続ON/OFF(ユーザーUI)、context/素材元path/viewport画像、再生・停止・seek、カメラ・単一ボーンpreview、タイムライン対象切替、キーの値/補間取得とset/delete/move/copy、AI Undo、設定15項目、モデル材質表示。部分対応: ポーズ・表情、キー編集、材質、表示・物理・色調整。後続: 複数ボーン/モーフpreview、キー範囲選択・ミラー・フレーム列挿入/削除・補正・自動キー、IKと外部親の専用編集、モデル/ステージ/モーション/音声/背景の読込と削除、project保存/読込、PNG/動画/VMD/VPD出力、通常/PBRと描画backend切替、材質プリセット/詳細、ライト/影/物理の詳細、Bloom/DOF/SSAO/SSR等、出力条件、UIレイアウト・言語・入力機器設定。UIに存在するだけではMCP実行可能とは扱いません。MCP自身の権限拡張・認証情報取得やモデル本体の送信は公開対象にしません。",
    },
    {
        id: "files-and-output", title: "読込・保存・出力", aliases: ["file", "load", "save", "export", "読込", "保存", "出力", "動画", "VMD", "VPD", "PNG"],
        status: "planned", summary: "明示pathによるローカル読込・保存・出力は後続です。",
        body: "OSダイアログを遠隔クリックするのではなく、path、形式、対象と上書き条件を指定し、完了結果を照会できる入口を追加する計画です。返却は結果とpathに限定し、モデル本体を送信しない条件を維持します。現時点でmmd_list_assetsは元pathの参照のみ。未実装toolを呼ばないでください。",
    },
    {
        id: "undo-and-conflicts", title: "Undoと競合", aliases: ["undo", "redo", "競合", "取り消し"],
        status: "implemented", summary: "mmd_undoは指定AI編集が共有履歴末尾にある場合だけ取り消します。",
        body: "再生中・手動操作中・モーダル中は編集を拒否します。操作履歴はscene世代内で最大100件。タイムアウト時はmmd_get_operationで確認。unknownでは自動再実行せずcontextから再評価します。同じoperationIdの異なる入力は拒否します。手動編集を巻き戻しません。UIで変更後にcontextを再取得してください。",
    },
];

export function searchAutomationHelp(query: string, limit: number): AutomationHelpTopic[] {
    const terms = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return automationHelpTopics.filter(topic => {
        const text = [topic.id, topic.title, ...topic.aliases, topic.summary, topic.body].join(" ").normalize("NFKC").toLocaleLowerCase();
        return terms.every(term => text.includes(term));
    }).slice(0, limit);
}
