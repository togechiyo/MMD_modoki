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
        id: "key-search", title: "キーの条件検索・件数・前後フレーム", aliases: ["search keys", "next key", "previous", "検索", "集計", "範囲", "次のキー"],
        status: "implemented", summary: "選択中scopeのキーをフレーム範囲・種別・名前で検索。選択やseekを変えずページ取得。",
        body: "mmd_search_keyframesへtarget/scope/filterとoffset?/limit?/expectedEditRevision?を指定。scopeは現在のtimelineScopeと一致必須。別対象はmmd_select_timelineで明示選択しcontextを再取得。filter:{startFrame?:0,endFrame?:1000000,categories?:[category],names?:[正確な名前],nameContains?:部分文字列,anchorFrame?:frame,includePayload?:false}。条件はAND、範囲両端を含む。nameContainsはNFKCと小文字化後の文字列一致でregexではない。itemsは{track:{category,name},frame,payload?}、並びはtimelineのトラック順→frame昇順。limit最大200、続きはnextOffsetと同じfilter/expectedEditRevisionを指定。totalCount/matchedTrackCount/firstFrame/lastFrameは検索範囲全体、previousFrame/nextFrameは同じ条件内でanchorを含めない前後の最寄りフレーム。該当なしはnull。anchor省略は現在frameなので、再生中や複数ページで固定したいときは明示する。件数取得だけではpayloadを読み出さず、大きなトラックの範囲は二分探索。includePayload:trueでも返すページ分だけを読む。編集値/sourceキーの一覧で、物理や補間途中の動きを解析するtoolではない。UIのキー一覧を使いvirtualPhysicsOnFramesは数えない。検索結果が編集可能かは名前一意性等を編集時に再検証。モデル本体は返さない。",
    },
    {
        id: "morph-batch", title: "表情・複数モーフの一括preview", aliases: ["expression", "batch morph", "表情", "まばたき", "モーフ", "一括"],
        status: "implemented", summary: "最大100モーフを全件検証して一括調整。dryRunと1回の共有Undo。キーは明示登録。",
        body: "mmd_inspect(kind:morphs,modelInstanceId)で名前・現在weight・一意性を取得。対象モデルを選択して停止しcontextを再取得。mmd_set_morphsへmodelInstanceId/morphs:[{morphName,weight:0..1}]/mode:preview/dryRunと編集共通引数を指定。最大100件、重複名不可。dryRun既定trueでplan.itemsに変更分のbefore/after、changedMorphCount、keyframesRegistered:falseを返す。最新revisionと新operationIdでdryRun:falseを適用。同じ値の項目は変更しない。全件事前検証、途中の書込失敗は変更前へ補償し、復元できない場合は失敗として扱う。1回の共有Undo/Redoには同じモデル・frame・対象値が必要。自動キーONでもpreviewのみ。残す場合はmmd_register_keyframesへscopeとtracks:[{category:morph,name},...]を指定して現在frameへ登録する。未登録値はseek/再読込で置き換わり得る。見た目はwait/snapshotで確認。モーフoffset・モデル本体は返さない。",
    },
    {
        id: "viewport-comparison", title: "描画待機・編集前後と複数フレームの比較画像", aliases: ["wait render", "snapshot", "compare", "描画待機", "画像比較", "前後比較", "複数フレーム"],
        status: "implemented", summary: "指定revisionで描画を待ち、撮影した画像IDを指定順にまとめて返す。比較自体は編集状態を動かさない。",
        body: "停止してcontextを取得。mmd_wait_for_render(target,expectedEditRevision)は実engineのend-frameを2回待機しstatus:observed/engineFrameEnds:2/renderCompletion:engine_frames_observedを返す。前後で許可・scene・revision・busyを検査。期限2.5秒、未観測はRENDER_UNAVAILABLE。GPU完了/物理収束/指定frameの厳密な一致は保証せず、それぞれnot_observed。mmd_capture_snapshot(target,expectedEditRevision,label?)は同じ待機後compositorを観測してPNGを撮影、前後revision/frameを照合してsnapshot.idと画像を返す。編集/seekを行わず未登録値を保持。snapshotはlabel/capturedAt/frame/editRevision/camera/physicsEnabled/backend/materialMode/width/heightを持つ。カメラ回転/FOVは度。長辺1280px以下、PNG最大4MiB。1ウィンドウで8枚・base64合計24MiBまで、上限時は古い順に破棄しevictedIdsを返す。mmd_list_snapshots(target)は保持中のメタデータだけを返す。mmd_compare_snapshots(target,snapshotIds:[id,id,...])は2..4枚を指定順の画像Contentで返し、structuredContent.snapshotsのimageIndex（0始まり）で対応付ける。比較応答のbase64合計上限12MiB。画像処理による差分計算や自動判定はしない。撮影→編集→撮影→compareで前後比較。別frameは必要なpreviewをキー登録してから明示seek→撮影を繰り返す。比較tool自身はseek・復元をしないので現在の選択・ポーズ・Undoを変更しない。権限変更/OFF/reload/scene変更で画像IDは失効し、上限破棄後もSNAPSHOT_NOT_FOUND。画像のdisk保存はせず、比較対象を恒久保存したい場合は既存PNG出力を使う。参照のみのMCP許可でも撮影・待機・比較は可能。モデル本体は返さない。",
    },
    {
        id: "file-tools", title: "一括ファイル変換・体格補正", aliases: ["batch", "convert", "retarget", "BPMX", "BVMD", "ツール", "最適化", "体格補正", "リターゲット"],
        status: "implemented", summary: "最大20件のローカル変換をまとめて実行。読込済みモデルの体格補正はdryRunと共有Undo。",
        body: "mmd_start_ui_operationへoperation:{kind:fileTools,items,continueOnError}を指定。itemsは1..20件、各項目は{kind:optimizeModel,sourcePath,filePath,overwrite}（PMX/PMD→BPMX）、{kind:optimizeMotion,sourcePath,filePath,overwrite}（VMD→BVMD）、{kind:retargetMotion,sourceModelPath,sourceMotionPath,targetModelPath,filePath,overwrite,options:{retargetRotations,correctRootPosition,correctFootIkPosition}}（PMXとVMDとPMX→VMD）。すべてローカル絶対path、overwrite必須。入力上書き・保存先重複・形式不一致は開始前に拒否。出力を同一batchの入力にはできない。シーンのモデルや選択は変更しない。mmd_get_operationのprogress.operationIndexは0始まり、completedItemsは失敗も含む処理済み件数。resultsは各項目のstatus/path/byteLengthまたはerror。continueOnError:falseは最初の失敗で止まり、それまでの結果をprogressに保持。trueではjobがcompletedでもoutput.allSucceeded:falseがあり、failedItemsとresultsを必ず確認。保存済みfileはrollbackしない。mmd_cancel_operationは項目境界で取消し、処理中の変換を強制停止しない。最終項目と競合すればcompletedになり得る。モデルbytesはローカル変換の内部だけで使い、応答に含めない。出力writer上限256MiB。体格補正は対象モデルを選択し停止後、mmd_correct_body_motionへmodelInstanceId/sourceModelInstanceId/dryRunと編集共通引数を指定。別の読込済みモデルとの体格比で対象の移動キーを補正、最大10000変更キー。dryRun既定trueは比率と変更件数だけを返し、初期位置一覧は返さない。適用は最新revision・新operationId・dryRun:false。1回の共有Undo、条件不足はBODY_CORRECTION_UNAVAILABLE。見た目確認はseek後mmd_capture_viewportで描画を待つ。",
    },
    {
        id: "material-batch", title: "モデル・アクセサリ材質の一括設定", aliases: ["batch material", "reset", "材質", "一括", "リセット", "表示", "PBR"],
        status: "implemented", summary: "材質の表示・公開preset・リセットを複数対象へまとめて適用。全件事前検証とdryRun。",
        body: "mmd_list_material_presetsでsubject別のsourcePath/defaultPresetId/materials/presetsを取得。続きはoffsetとexpectedEditRevision。mmd_edit_materialsへentries:[{subject,expectedPath:sourcePath,materialKeys:[key,...]|null,action}]とdryRun、編集共通引数を指定。subjectは{kind:model,modelInstanceId}|{kind:accessory,accessoryIndex}。nullキーは全材質。actionは{kind:visibility,visible}|{kind:preset,presetId}|{kind:reset}。resetは現在の通常/PBR/アクセサリ形式の既定preset。最大100entries・展開後合計200材質操作。全対象/path/key/presetを事前検証。dryRun既定trueは無変更でcontrol.status:validatedとplanを返す。適用は最新revisionと新operationIdでdryRun:false。順番に適用し、実行時の失敗ではcontrol.status:partial_failure、resultsに操作番号・成功材質数・構造化errorを返して停止する。top-level appliedだけで全件成功と判断せずcontrol.allSucceededを確認。Undo/rollbackはなく、部分失敗後は一覧を再取得。GUIとproject状態を共有し、通常/PBRごとのpresetを保持する。モデル本体・texture・外部WGSL本文は返さず、非公開の物性値編集は追加しない。",
    },
    {
        id: "key-selection", title: "キー範囲選択・コピー・貼り付け・移動削除", aliases: ["range", "selection", "clipboard", "copy", "paste", "move", "delete", "範囲選択", "コピー", "貼り付け", "移動", "削除"],
        status: "implemented", summary: "GUIキー選択とアプリ内クリップボードをMCPで共用。最大100キー、内容変更はdryRunと共有Undo。",
        body: "mmd_get_keyframe_selection(target,offset?,limit?,expectedEditRevision?)でscope/items/totalCountを取得。続きはrevision必須。mmd_select_timelineで対象を選び、停止してcontext再取得。mmd_select_keyframesへscope、selection:{kind:range,startFrame,endFrame,tracks?:[{category,name}]}|{kind:keys,keys:[{track:{category,name},frame}]}|{kind:clear}と編集共通引数を指定。現在選択を置換、範囲両端を含む。100件超過は拒否し省略しない。mmd_copy_keyframes(scope)でGUIと共通のアプリ内キーclipboardへ選択分をコピー。OS clipboardは使わない。mmd_get_keyframe_clipboard(target,offset?,limit?,expectedClipboardId?)でID、元種別、元最小frame、itemsのframeOffset/payloadを取得。続きはclipboardId必須。GUIでコピーし直すとIDが変わる。mmd_paste_keyframesへscope/clipboardId/frame/collision:reject|replace/dryRunを指定し、元最小frameを指定frameへ合わせる。同種scopeかつ元category/nameのトラックへ貼る。別モデルでは同名・編集可否・IK構成・外部親の検証に通る必要がある。名前変換なし。mmd_edit_keyframe_selection(scope,operation:{action:move,frameOffset}|{action:delete},collision,dryRun)で選択分を移動/削除。paste/move/deleteのdryRunは無変更で差分を返す。最新revision・新operationIdで適用する。重なる移動は変更前の値から作る。選択/コピーはUndo対象外、キー変更は1回の共有Undo。適用後の選択は現存キーに従うので次の操作前に再取得。元キー変更/削除後もclipboardはコピー時の値。クリップボードのproject保存はしない。モデル本体は返さない。",
    },
    {
        id: "pose-editing", title: "複数ボーンの一括ポーズ調整", aliases: ["pose", "batch bones", "ポーズ", "一括", "複数ボーン", "dryRun"],
        status: "implemented", summary: "最大100ボーンのローカル移動・回転を全件検証して一括preview。1回の共有Undo。",
        body: "mmd_inspect(kind:bones,modelInstanceId)で名前・編集可否・現在値を取得。mmd_select_timelineでモデルを選択し、停止してcontextを再取得。mmd_set_poseへtarget/expectedEditRevision/operationId/modelInstanceId/poses:[{boneName,position:{x,y,z},rotation:{x,y,z}}]/mode:preview/dryRunを指定。positionは初期位置からのローカル移動、rotationはEuler角の度で既存mmd_set_boneと同じ。最大100個、一意な名前、有限値±100000。動かせない成分は現在値を維持。失敗のoperationIndexは0始まり。全件検証前には書き込まない。dryRun:trueは無変更でplan.itemsのbefore/afterとchangedBoneCountを返す。実行は最新revisionと新operationIdで再要求。変更したボーンだけを1回の共有Undo単位にする。Undo/Redoは同じモデル選択・停止・frame・対象値が必要。骨の選択は変えず、GUIの選択骨を最後に更新。自動キーONでも登録しない。保存やモーションへ残すにはmmd_register_keyframesへ対象トラックをまとめて指定する。未登録previewはseek/再読込で置換され得る。結果は編集値で、IK/物理適用後の最終見た目はmmd_capture_viewportで確認。world座標、複数モデルをまたぐ一括適用、IK目標からの自動ポーズ生成は未対応。モデル本体を返さない。",
    },
    {
        id: "object-editing", title: "モデル表示・IKとアクセサリの親・変形", aliases: ["IK", "accessory", "parent", "visibility", "アクセサリ", "持たせる", "モデル表示", "物理キー"],
        status: "implemented", summary: "モデル表示・影・複数IK、アクセサリの親・ローカル変形・表示・影をまとめて編集。",
        body: "mmd_get_object_stateへtargetとsubject:{kind:model,modelInstanceId}|{kind:accessory,accessoryIndex,expectedPath}を渡す。モデルIKはoffset/limit/expectedEditRevisionでページ取得。選択は変えずモデル本体は返さない。編集はmmd_select_timelineで対象を選びcontextを再取得し、mmd_set_object_stateへsubject、patch、mode:preview、dryRunと編集共通引数を指定。patchはkindに加え必要な項目のみ。モデルはvisible、castsShadow、ikStates:[{boneName,enabled}]（最大200、一意名）。アクセサリはvisible、castsShadow、transform:{position:{x,y,z},rotationDeg:{x,y,z},scale}、parent:{modelInstanceId,boneName}|null。parent:nullで解除、boneName:nullでモデル中心。親変更はローカル変形を保持しworld位置は維持しない。positionはMMD単位[-100,100]、rotationDegは度[-180,180]、scaleは[0.01,50]。dryRunは変更せずbefore/afterを返す。適用は最新revisionと新operationIdで再要求。1回の共有Undo単位で、同じ選択・frame・変更対象値が必要。自動キーONでもキー登録しない。モデル表示/IKはproperty、アクセサリ変形はaccessoryトラックへmmd_register_keyframesで明示登録してモーションへ残す。影、アクセサリ親/表示は静的なproject設定。未登録previewはseekや読込で置き換わり得る。mmd_set_editor_options(options:{kind:physicsKeyInput,enabled})は次回ボーンキー登録の物理値を選ぶ一時UI設定で、全体物理ON/OFFとは別。床衝突はphysics.floorCollision、物理ボーン表示はviewport.physicsBonesをcontrol-catalogから確認。",
    },
    {
        id: "external-parent", title: "外部親の一括編集と事前検証", aliases: ["外部親", "親子", "追従", "parent", "attach", "detach", "follow", "dryRun"],
        status: "implemented", summary: "モデルのボーン・カメラの外部親を取得、設定・解除・キー削除。複数フレームを1回でUndo。",
        body: "mmd_get_external_parent(scope:{kind:model,modelInstanceId}|{kind:camera},target,offset?,limit?,expectedEditRevision?)は選択を変えずeffectiveとitemsを返す。effectiveは現在frameの選択キーで、parentのID/pathがnullなら解除または未設定。ボーン候補はmmd_inspect(kind:bones,modelInstanceId)、モデルIDはcontext。mmd_select_timelineで子モデルまたはcameraを選択しcontextを再取得。mmd_edit_external_parentへsubject:{kind:model,modelInstanceId,boneName}|{kind:camera}、operations:[{action:set,frame,parent:{modelInstanceId,boneName}|null,poseMode:snap|keepLocal}|{action:delete,frame}]、collision:reject|replace、dryRun:booleanと編集共通引数を渡す。最大100操作、1対象、1つのUndo単位。parent:nullはそのframe以降の解除キー。deleteは外部親と一体のポーズキーも削除し、前の関係が再び有効になる場合がある。snapはモデルのローカル移動ゼロ・回転identity、カメラの位置/回転ゼロ・親あり距離0、解除距離45。keepLocalは既存キーがあればその値、なければ現在frameの編集値を保持する。別frameに既存キーがなければEXTERNAL_PARENT_LOCAL_POSE_REQUIRED。親ありカメラの距離は0へ正規化する。world位置維持は未対応。既存キーの補間/物理値を維持し、新規snapキーは現在UIの補間/物理キー入力値を使う。dryRun:trueは選択/seek/履歴を書き換えずstatus:validatedとbefore/after差分を返す。適用はdryRun:false・新operationId・最新revisionで再要求。1モデル1frameで外部親は1件。異なる子ボーンの同frameキーは黙って上書きしない。自己参照、全切替frameでの循環、古い親ID/path、曖昧な骨名を事前拒否。Undo/Redo時も現在の依存関係を検査。通常のmmd_edit_keyframesで親付きキーのポーズ変更/コピー/移動/削除も可能、externalParentフィールドを保持する。親のIDとpathは現在の関係一覧から使う。親モデル削除後は既存経路で解除キーに変わる。projectで保存復元し、VMD/BVMD/VPDでは外部親非対応の警告を確認。アクセサリの親設定、複数モデルをまたぐ1トランザクション、world位置維持、外部親付きミラー/値補正はこのtoolの対象外。モデル本体/形状/テクスチャは返さない。",
    },
    {
        id: "png-sequence", title: "PNG連番出力・進捗・取消", aliases: ["png", "sequence", "連番", "画像出力", "取消"],
        status: "implemented", summary: "現在の出力条件でPNG連番を新規フォルダーへ保存し、保存済み枚数と終端結果を取得します。",
        body: "mmd_set_editor_optionsのoutputで範囲・解像度・qualityScale・透過を設定後、mmd_start_ui_operationへoperation:{kind:exportPngSequence,outputDirectoryPath}を指定。ローカル絶対pathの新規フォルダーのみ、親フォルダーは事前に必要。既存フォルダーはOUTPUT_EXISTSで拒否し、追記や上書きはしません。最大10000枚。範囲はGUIと同じくタイムライン上限内に補正されるため、設定後にmmd_get_editor_optionsで実際の範囲を再取得。mmd_get_operationでprogress.phase/savedFiles/capturedFrames/totalFiles/frameを照会。completed.outputはoutputDirectoryPath/savedFiles/totalFiles/byteLength/format:png-sequence。ファイル名はmmd_seq_幅x高さ_フレーム番号.png、番号は最小4桁でゼロ埋め。mmd_cancel_operationへjobOperationId:元jobのoperationIdと最新の編集共通引数を指定し、元jobの終端を待つ。完了との競合ではcompletedになり得ます。開始後のfailed/canceledのprogressには保存先・保存済み枚数・partialOutput:trueが残ります。途中の画像や空フォルダーは自動削除しません。起動前の拒否では枚数情報がない場合があります。書込失敗時の未完成fileは保存済み枚数に含まれない場合があります。実行中はGUI出力ロックし、終了後に復帰。別rendererでローカル素材を読み、モデル本体やPNG bytesはMCPへ返しません。単発viewport PNGはui-operationsを参照。",
    },
    {
        id: "video-and-removal", title: "動画出力・取消と素材の指定削除", aliases: ["webm", "video", "cancel", "remove", "delete asset", "動画", "取消", "素材削除", "ステージ削除"],
        status: "partial", summary: "WebM動画の進捗・完了・取消と、素材IDを指定したシーンからの削除。元ファイルは削除しません。",
        body: "動画はmmd_set_editor_optionsの出力条件を確認後、mmd_start_ui_operationへoperation:{kind:exportWebm,filePath,overwrite}を指定。形式はWebM、ローカル絶対pathとoverwrite必須。mmd_get_operationでrunning/completed/failed/canceledを照会。progressはphase、encodedFrames、totalFrames、capturedFrames、frame、observedAt。completed.outputは最終filePath/byteLength。別ウィンドウのローカルexporterがモデルを読み、動画bytesやモデル本体はMCPへ返しません。一時fileへencodeし、成功・許可照合後のみ指定先へ保存。overwrite:falseはencode中に同名fileが作られた場合も拒否。取消はmmd_cancel_operationへ最新target/expectedEditRevision、新しいoperationId、jobOperationId:元動画IDを指定。cancel_requestedは受付で、元jobが終端になるまで待つ。完了との競合ではcompletedになり得ます。MCP開始の実行中動画・PNG連番が取消対象。素材削除はmmd_list_assetsのremovalを確認し、operation:{kind:removeAsset,assetId,expectedPath:recordedPath}を指定。モデル/アクセサリ・カメラモーション・音声・背景・外部環境・LUTに対応。モデル削除は所属モーションも、カメラモーション削除は編集キーも除去します。元fileは削除せず、Undo対象外・編集履歴をクリア。削除後のindex/sceneは一覧とcontextを再取得。統合済みモデルVMD/BVMD/VPDは読込履歴ごとに差し引けないためremovable:false、ASSET_REMOVAL_UNSUPPORTED。PNG連番はpng-sequenceを参照。MP4、モデル/アクセサリの編集状態を維持した素材差替えは未対応。",
    },
    {
        id: "ui-operations", title: "素材読込・保存・出力・通常/PBR切替", aliases: ["file", "load", "save", "export", "operation", "読込", "保存", "出力", "PBR", "PNG"],
        status: "partial", summary: "mmd_start_ui_operationでローカル作業を開始し、mmd_get_operationで完了を確認します。",
        body: "target/expectedEditRevision/operationId(UUID)/operationを指定。返却status:runningは受付のみ。mmd_get_operationへ受付時のtargetとoperationIdを渡しrunning/completed/failedを確認。runningのphase:waiting_for_userはモデルコメント等のGUI確認待ち。ロードによるscene変更後も同じ許可中なら結果を照会でき、完了outputには新target/editRevisionを含みます。同じ要求の再送は同じjobを返し、異なる入力でID再利用は拒否。処理中は他のMCP編集を拒否。permission変更/reloadで履歴を破棄し、新規file書込は旧許可で続行しません。開始済みロードやOS書込を完全に取消/rollbackする保証はありません。最大100結果。operationは{kind:materialMode,pbr:boolean}、{kind:loadAsset,assetKind,filePath,modelInstanceId?}、{kind:saveProject,filePath,overwrite}、{kind:loadProject,filePath}、{kind:exportMotion,format:vmd|vpd|bvmd,scope,filePath,overwrite}、{kind:exportPng,filePath,overwrite}。assetKindはmodel/accessory/motion/cameraMotion/pose/audio/backgroundImage/backgroundVideo/environment/lut。motion/poseは選択中モデルIDを必須指定。VPDはモデルscopeとmmd_select_bonesで選んだボーンが必要。VMD/BVMDは選択scopeのモーションを出力。外部親など非対応要素はwarningCodes/omittedExternalParentKeyCountを確認。PNGは現在の出力設定を使うviewport経路で、画像bytesは返しません。保存先はローカル絶対pathと形式に合う拡張子。overwrite:falseは既存fileを拒否。project相対LUT/WGSLの付随保存に失敗すると部分保存があり得ます。モデル読込はGUIと同じモデルコメント確認を表示し、AIから確認を自動承認するtoolはありません。モデル本体・textureをMCPへ返すことはありません。WebM動画・進捗・取消、素材指定削除はvideo-and-removalを参照。PNG連番はpng-sequenceを参照。モデル/アクセサリの編集状態を維持した差替えは後続です。ローカル一括変換と体格補正はfile-toolsを参照。",
    },
    {
        id: "control-catalog", title: "描画・物理・編集UIの設定カタログ", aliases: ["controls", "settings", "bloom", "ssao", "dof", "fog", "設定", "材質", "照明", "自動キー", "再生範囲", "プリセット"],
        status: "partial", summary: "設定IDとschemaを検索し、UIと共通のsetterで変更して適用値を確認します。",
        body: "mmd_list_controls(target,query?,offset?,limit?,expectedEditRevision?)のitemsからid/value/valueSchema/unit/availableを確認し、mmd_set_controlへcontrol:{id,value}を指定。既存15設定はmmd_get_settings/mmd_set_settingにも残ります。公開エフェクト41設定を追加済み。totalCountとページ取得で現行の全IDを確認。IDはbloom、ssao、ssr、fog、dof、lens、light、shadow、edge、contactShadow、iblShadow、environment、physics各接頭辞で検索。さらにluminous、motionBlur、ssgi、aerialPerspective、directionalLightShafts、offsetShadow、offsetHighlight、ringParticles、lutを検索可能。dof.focusModeはcamera-target/person-auto/model-target、dof.targetは{modelInstanceId,boneName}（nullで解除）でmodel-target方式のみ利用可。lut.presetはchoicesから選び、外部LUT使用中は不可。値はUIの%表示へ変換する前のscalar等でunitを参照。反映後control.requested/appliedを返し、正規化の差はappliedを採用。available:falseはbackend等の条件が合いません。値は保持設定で描画完了ではありません。Frame Graphではrender.stackの順序/有効状態と効果の値の両方を確認。stackのvalueは[{id,enabled}]で重複不可、削除や並替も全配列で指定。mmd_get_editor_options/mmd_set_editor_optionsは自動キー、再生範囲、出力サイズ/品質/FPS/透過/音声/codec/範囲、言語、UI倍率、全画面を扱います。options.kindごとのschemaに従い、変更後のcontrolを確認。自動キーはGUI編集へ適用し、MCP previewは従来どおり明示キー登録。mmd_select_bonesは選択モデルIDと一意なboneNamesを最大200件指定してGUI/VPD対象を同期。材質はmmd_list_material_presets(subject:{kind:model,modelInstanceId}|{kind:accessory,accessoryIndex})で内蔵presetとページ化された材質を取得、mmd_set_material_presetへsubject/materialKey/presetIdを指定。nullキーは全材質。通常/PBRで候補が変わり、外部shader文字列は受け付けません。材質の一括表示・reset・presetはmaterial-batchを参照。これら設定操作はUndo対象外で、編集許可・revision・operationIdを必要とします。全UI対応はまだ進行中です。",
    },
    {
        id: "detailed-diagnostics", title: "対象指定による構造情報の詳細診断", aliases: ["inspect detail", "rigid body", "joint", "bind pose", "IK", "詳細診断", "初期位置", "剛体", "ジョイント"],
        status: "implemented", summary: "ユーザーの説明付き許可後に、ボーン・モーフ・材質・剛体・ジョイントを1対象ずつ参照します。",
        body: "実験設定→AI連携→構造情報を含む詳細診断を許可。編集許可とは独立し、MCP OFF・reload・起動でOFF。MCPから自分で許可できません。mmd_get_context.status.detailedDiagnosticsで確認。mmd_list_diagnostic_targetsへtarget/modelInstanceId/kind:bone|morph|material|rigidBody|jointを指定しindex/nameをページ取得。続きはoffset:nextOffsetとexpectedEditRevision。mmd_inspect_detailへ同じtarget/modelInstanceId、subject:{kind,index}、expectedEditRevisionを渡し1対象を取得。従来mmd_inspectのindexとは混同しないこと。ボーンはbindPosition(model座標、MMD単位)、親/IK/付与、モーフは属性/現在weightのみ、材質は通常/PBRの現在値、剛体/ジョイントはアプリ保持設定を返します。物理solver実効値はnot_observed。角度はradians。未保持値はnull。IKリンク・関連参照は最大32件、件数と省略フラグ付き。関連indexの詳細は再帰取得しません。材質に存在しない値はnull。roughnessは通常材質にもあり反射のぼけを表すため、PBRの表面粗さと同一視せずmaterialModeと合わせて読む。参照で選択やUndoは変えません。詳細値は接続先のクラウドAIへ送信され得て、繰り返し取得すれば構造情報は蓄積します。モデル本体、頂点/頂点ウェイト、モーフ頂点・UV差分、テクスチャ原本は返しません。ユーザーUIの提供履歴は応答を生成した直近50対象のみで、詳細値は記録せずクラウド到達の証明ではありません。",
    },
    {
        id: "model-inventory", title: "モデルのボーン・モーフ・材質一覧", aliases: ["inventory", "list bones", "list morphs", "list materials", "名前", "一覧", "ボーン", "モーフ", "材質"],
        status: "implemented", summary: "mmd_inspectで指定モデルの編集対象を一覧取得。モデル本体の非公開とは区別します。",
        body: "mmd_get_context.modelsのinstanceIdを使い、mmd_inspectへtarget、modelInstanceId、kind:bones|morphs|materialsを指定。モデルが未選択でも参照のみの権限で取得でき、GUIの選択を変更しません。totalCount、各項目のindex/name、nextOffset、editRevisionを返します。続きはoffset:nextOffsetとexpectedEditRevisionを指定。bonesは移動/回転可否と現在transform、morphsは現在weightと名前の一意性・編集不可理由、materialsはkey・visible・プリセットIDを取得。indexは一覧内の0始まり番号で、編集toolのID引数ではありません。編集はboneName/morphName/materialKeyを使用。同名のボーン/モーフは編集不可。モーフの編集には対象選択が必要で、未選択ではeditBlockedReason:model_not_selected。取得不能weightはnull。editableはMCP編集許可を与えません。名前・編集値を返しても、頂点・モーフ形状差分・テクスチャ原本・モデルバイナリは返しません。",
    },
    {
        id: "diagnostics", title: "診断・エラー・操作できない理由", aliases: ["diagnostic", "error", "status", "busy", "診断", "エラー", "失敗", "待機"],
        status: "implemented", summary: "mmd_get_diagnosticsで現在の状態と直近MCP失敗を取得します。",
        body: "target、limit(1..50、既定10)、任意operationIdを指定。参照専用。status.busyReasonsはui_operation/user_interaction/modal/loading/exporting/switching_material_mode。editBlockersは権限とbusyの共通条件であり、個々のtoolの成功を保証しません。playingも別途確認。renderCompletion:not_observedは描画完了未確認で、物理の安定や描画品質の保証ではありません。runtimeはengine/backend/materialMode/physicsとWebGPU検証エラー累計数だけを返し、生メッセージは返しません。recentFailuresは同じ公開権限・sceneの直近失敗、最大50件のメモリ保持、limit件を新しい順に返し、省略はtruncated。OFF/権限変更/reloadで消去。失敗応答のerror.code/details、effects.state(none|unknown)、recovery、diagnosticIdを利用。operationIndexは0始まり、fieldは値または要求内の項目。noneはこの失敗要求が未適用、unknownは未変更と断定不可。同じIDの過去の成功はmmd_get_operationを優先。結果照会はapplied/no-changeに加えfailed/uncertain/unknownを返し得ます。再試行前に原因と現在状態を再評価。MCP SDKが入口で拒否するschema不正・未認証HTTP要求はこの履歴の対象外。モーション品質解析・全アプリログ取得は未実装です。",
    },
    {
        id: "getting-started", title: "AI連携の開始", aliases: ["start", "help", "使い方"],
        status: "implemented", summary: "実験設定からMCPを有効にし、必要なら編集も許可します。",
        body: "ツール→実験設定→AI連携。mmd_get_contextでtargetとeditRevisionを取得し、各toolへ渡します。書込はoperationId(UUID)とexpectedEditRevisionが必要。再生・停止・seek、カメラ・単一ボーン・モーフpreview、現在値のキー登録、一括キー編集、対象切替、設定、材質表示、AI編集Undo/Redoに対応。モデル本体・テクスチャ・頂点等の形状データは返しません。UI全項目の対応は進行中。ui-coverageで対応状況、keyframesで値の単位、timeline-transformsでミラー・補正・列編集を確認してください。手動入力やフレーム移動後はcontextを再取得してください。",
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
        body: "camera:{target:{x,y,z},rotation:{x,y,z},distance,fov}。targetは注視点、rotationとfovは度。fovは10〜120。mode:preview、playbackPolicy:pauseまたはrejectを必須指定。キーは登録しません。mmd_capture_viewportで確認し、返されたeditIdをmmd_undoへ渡せます。現在値を残すにはカメラ対象でmmd_register_keyframesを呼びます。source単位への変換はGUIと同じ処理に任せられます。",
    },
    {
        id: "pose", title: "ポーズ・表情", aliases: ["pose", "bone", "morph", "ボーン", "モーフ"],
        status: "partial", summary: "単一ボーンとモーフの未登録編集・キー登録に対応します。",
        body: "mmd_inspectのkind:bonesまたはmorphsとmodelInstanceIdで名前と現在値を参照。mmd_set_boneへmodelInstanceId、boneName、position、rotationを渡します。rotationは度。mmd_set_morphは選択中モデルのmodelInstanceId、morphName、weight(0..1)を指定。同名の対象は拒否します。両toolでmode:preview、playbackPolicy:pauseまたはrejectが必要。キーは自動登録せず、mmd_register_keyframesで現在値を登録できます。rawキーのbone rotationsはquaternionなのでpreviewの度と混同しないこと。一括ポーズpreviewはpose-editing、一括表情previewはmorph-batchを参照。",
    },
    {
        id: "materials", title: "材質の表示と設定", aliases: ["material visibility", "材質を消す", "表示切替", "PBR"],
        status: "partial", summary: "モデル/アクセサリの表示・内蔵preset・リセットを一括操作できます。",
        body: "mmd_inspect(kind:materials,modelInstanceId)でkey/name/visibleとプリセットIDを参照。mmd_set_material_visibilityへmodelInstanceId,materialKey,visibleを指定。通常/PBR共通。非表示はalpha=0と区別します。mmd_list_material_presets/mmd_set_material_presetはモデル/アクセサリの内蔵presetを扱います。使い方はcontrol-catalog、通常/PBR切替はui-operationsを参照。一括操作・事前検証はmaterial-batchを参照。詳細値の参照は追加許可付きdetailed-diagnostics。これら材質設定はUndo対象外。モデルやテクスチャ本体は返しません。",
    },
    {
        id: "keyframes", title: "キーフレームと補間の一括編集", aliases: ["keyframe", "timeline", "キーフレーム", "補間", "登録", "移動", "コピー", "削除"],
        status: "partial", summary: "set/delete/move/copyを100操作までまとめて1つのUndoにします。",
        body: "mmd_select_timeline(scope:{kind:camera}|{kind:model,modelInstanceId}|{kind:accessory,accessoryIndex})でUIの対象を選び、contextを再取得。mmd_inspect(kind:tracks)は空トラックも返し、kind:keyframesはキーのpayloadを返します。mmd_edit_keyframesには同じscope、collision:reject|replace、operations:[{action:set,track:{category,name},frame,payload}|{action:delete,track,frame}|{action:move|copy,track,frame,toFrame}]を指定。再生中は停止してから操作。コピー/移動は変更前の値から作成するため重なる一括移動も可能。現在UI値の登録はmmd_register_keyframesへscope、tracks:[{category,name}]、collisionを渡します。現在frameの整数部分へ最大100トラックを1履歴で登録し、GUIと同じ補間・物理キー入力モードを使います。raw値はsource形式: camera positions=注視点xyz、rotations=Euler radians xyz、distances=[負のMMD距離]、fovs=[度]。bone/movableBone rotations=単位quaternion xyzw、movableBone positions=ローカル移動xyz、morph weights=[0..1]。補間は各軸4値[x1,x2,y1,y2] (0..127整数)、positionInterpolationsはxyz各4値で計12値。線形例[20,107,20,107]。physicsTogglesは[0|1]。light/shadow/gravity/accessory/propertyにも対応。新規propertyは現在のIK名と順序が必要。外部親付きキーも編集可能で、参照先と全frameの循環を検証します。外部親の専用一括操作はexternal-parentを参照。共有GUI/MCP Undo/Redoには同じ編集対象を選択してください。列挿入・ミラー・補正はtimeline-transformsを参照。自動キー設定はmmd_set_editor_optionsを参照。MCP previewは明示キー登録を維持します。",
    },
    {
        id: "timeline-transforms", title: "フレーム列・ミラー・値補正", aliases: ["insert", "delete frames", "mirror", "correct", "ミラー", "反転", "列挿入", "列削除", "補正"],
        status: "implemented", summary: "mmd_transform_keyframesで選択対象のsourceキーをまとめて編集します。",
        body: "scopeとoperationを指定。列操作は{action:insertFrames|deleteFrames,frame,count}で、その対象の全トラックに適用します。挿入はframe以降を後ろへ、削除は[frame,frame+count)を除去して後続を前へ移動。影響する既存キーは最大1000、countは1..10000、frameは0..1000000。ミラーは{action:mirror,keys:[{track:{category,name},frame}],frameOffset,collision:reject|replace}。モデルのボーンを既存GUIの左右名解決・反転計算でコピーします。補正は{action:correct,keys,correction}。correctionはkind:boneのposition/rotation、kind:cameraのcenter/rotation/distance/fov、kind:morphのweightを指定。各スカラーは{multiply,add}、ベクトルは{x,y,z}各スカラー。計算は値*multiply+add、角度補正は度、カメラdistanceは負のsource値へ適用。変更しない成分はmultiply:1,add:0。ミラー/補正は最大100キー。型違い・範囲外・外部親リンク・同名トラックは編集前に拒否し、値を黙って丸めません。全体を1回でUndo/Redo可能。GUI範囲選択やクリップボードは変更しません。",
    },
    {
        id: "ui-settings", title: "表示・実行・色調整の設定", aliases: ["settings", "設定", "物理", "AA", "背景", "色調整", "コントラスト", "ガンマ", "彩度"],
        status: "partial", summary: "基本15設定に加えて、control-catalogから描画・物理・編集UI設定を操作します。",
        body: "mmd_get_settingsはid別のvalue/availableを返します。mmd_set_settingにはsetting:{id,value}と通常の編集revisionを渡します。地面、空、背景メディア、AA、物理、影、剛体表示と、コントラスト%、ガンマ%、露出、ディザ、ビネット、粒子、シャープ%、彩度に対応。範囲はtool schemaを参照。UIと同じsetter・表示同期・project保存値を使います。設定はUndo対象外。背景メディア未読込などavailable:falseの項目は操作不可。再生中は変更不可。未対応のUI項目はui-coverageを参照。",
    },
    {
        id: "ui-coverage", title: "UI全項目への対応状況", aliases: ["capabilities", "coverage", "UI", "対応一覧", "全機能", "操作一覧"],
        status: "implemented", summary: "公開UIへの対応表。非公開・没機能は追加対象にしません。",
        body: "対応済み: キー条件検索・件数・前後キー（key-search）、複数モーフの一括preview/dryRun/Undo（morph-batch）、描画待機・画像ID保存・比較画像（viewport-comparison）、GUIキー範囲選択・クリップボード・選択キー移動/削除（key-selection参照）、最大100ボーンの一括ポーズpreview・dryRun（pose-editing参照）、モデル表示・影・複数IK、アクセサリ親・変形・表示・影、物理キー入力（object-editing参照）、床衝突・物理ボーン表示、モデル/カメラ外部親の取得・一括編集・dryRun（external-parent参照）、接続ON/OFF(ユーザーUI)、context/素材元path/viewport画像、対象指定診断、再生・停止・seek、カメラ・単一ボーン・モーフpreview、タイムライン対象切替、キーの値/補間取得とset/delete/move/copy、現在値登録、ミラー、列挿入/削除、値補正、AI Undo/Redo、基本15設定、モデル材質表示、複数ボーン選択、自動キー/再生範囲/loop/出力設定/言語/UI倍率/全画面。ui-operationsは素材読込、project保存/復元、PNG/VMD/VPD/BVMD出力、通常/PBR切替。video-and-removalはWebM動画/取消/進捗と素材指定削除。png-sequenceは別プロセスPNG連番/取消/保存済み枚数。control-catalogはBloom/DOF/SSAO/SSR/Fog/照明/影/物理等とFrame Graph効果順序、モデル/アクセサリ材質プリセット。後続: 統合済みモデルモーションの個別削除/素材差替え、別プロセス単発PNG出力、描画/物理backend切替、公開設定の残りの個別検証、レイアウト詳細・入力機器設定。file-toolsは最適化/BPMX/BVMD/リターゲットの一括変換と体格補正、material-batchは材質表示/preset/resetの一括操作。control-catalogは公開スタック詳細（SSGI・Luminous・空気遠近・光芒・オフセット影/光・粒子・DOF対象・LUT等）を追加済み。非公開の水面・外部WGSL・材質物性値を復活させる作業は対象外。UIに存在するだけではMCP実行可能とは扱いません。MCP自身の権限拡張・認証情報取得やモデル本体の送信は公開対象にしません。",
    },
    {
        id: "files-and-output", title: "読込・保存・出力", aliases: ["file", "load", "save", "export", "読込", "保存", "出力", "動画", "VMD", "VPD", "PNG"],
        status: "partial", summary: "明示pathで素材読込・指定削除、project保存/復元、PNG・WebM・モーション出力を実行できます。",
        body: "mmd_start_ui_operationを使用し、詳細はui-operationsを参照。path、形式、対象と上書き条件を指定し、mmd_get_operationで完了を確認します。返却は結果とpathに限定し、モデル本体を送信しない条件を維持します。mmd_list_assetsは元pathの参照。WebM動画・取消・進捗と素材指定削除はvideo-and-removal、PNG連番はpng-sequenceを参照。別プロセス単発PNG出力、統合済みモデルモーションの個別削除/素材差替えは後続です。",
    },
    {
        id: "undo-and-conflicts", title: "Undoと競合", aliases: ["undo", "redo", "競合", "取り消し"],
        status: "implemented", summary: "mmd_undo/mmd_redoは指定AI編集が共有履歴の次の対象の場合だけ実行します。",
        body: "contextのundoId/redoIdと元のeditIdを使用し、Undo/Redo自体には新しいoperationIdを付けます。previewは同じframe・対象で値が一致する必要があり、キー編集は同じ対象とsource値を照合します。手動編集を飛び越えません。再生中・手動操作中・モーダル中は拒否します。操作結果はscene世代内で最大100件。タイムアウト時はmmd_get_operationで確認。unknownでは自動再実行せずcontextから再評価します。同じoperationIdの異なる入力は拒否します。UIで変更後にcontextを再取得してください。",
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
