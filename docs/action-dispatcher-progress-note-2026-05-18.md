# Action Dispatcher 進捗メモ

更新日: 2026-05-18

## 目的

現 UI の見た目や DOM 構造を大きく変えずに、既存操作を少しずつ Action 駆動へ寄せる作業メモ。

方針や候補一覧は次を参照する。

- [Action / Command / 入力管理 調査メモ](./action-command-input-management-note-2026-05-17.md)
- [Action Catalog Draft](./action-catalog-draft-2026-05-17.md)
- [Action 仕様 Index](./actions/action-spec-index.md)

## 追加した基盤

- `src/actions/types.ts`
  - `ActionSource`
  - `PlaybackAction`
  - `TimelineAction`
  - `KeyframeAction`
  - `InterpolationAction`
  - `SelectionAction`
  - `ViewportAction`
  - `ProjectAction`
  - `LayoutAction`
  - `RuntimeAction`
  - `ModelAction`
  - `ShaderAction`
  - `AccessoryAction`
  - `CameraAction`
  - `OutputAction`
  - `EffectAction`
  - `EditorAction`
  - `EditorActionType`
- `src/actions/action-dispatcher.ts`
  - `ActionDispatcher`
  - `register(type, handler)`
  - `dispatch(action)`
  - `hasHandler(type)`
- `src/actions/action-availability.ts`
  - `EditorActionAvailabilitySnapshot`
  - `canExecuteEditorAction(action, snapshot)`
- `test/actions/action-dispatcher.test.ts`
  - register / dispatch / unregister の最小 Vitest
- `test/actions/action-availability.test.ts`
  - keyframe / playback / project / output / effect Action の最小 canExecute Vitest

`UIController` には `ActionDispatcher` を 1 つ持たせ、`setupActionHandlers()` で既存 private method や各 UI controller の公開 method に橋渡ししている。

現段階では Action はまだ Command / History には変換していない。目的はまず、button / shortcut / panel input の入口を共通化し、次に `canExecute` や undo / redo の設計へ進めること。

## Action 化済み

`playback.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `playback.toggle` | play button / `Space` | `togglePlayback()` |
| `playback.seekFrame` | timeline seek / current frame input / shortcut | `mmdManager.seekAnimation()` + UI 同期 |
| `playback.stepFrame` | arrow shortcut | current frame から相対 seek |
| `playback.setLoop` | loop checkbox | `mmdManager.setLoop()` |

`timeline.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `timeline.seekFrame` | timeline canvas drag / click seek | `mmdManager.seekToBoundary()` + section keyframe state update |
| `timeline.selectionChanged` | timeline selection callback | bone visualizer / bottom panel / edit state 同期 |

`keyframe.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `keyframe.addCurrent` | key button / `K` | `addKeyframeAtCurrentFrame()` |
| `keyframe.deleteSelected` | delete button / `Delete` | `deleteSelectedKeyframe()` |
| `keyframe.nudgeSelected` | `Alt+ArrowLeft/Right` | `nudgeSelectedKeyframe()` |
| `keyframe.addSection` | section key button | `addKeyframeForSection()` |
| `keyframe.deleteSection` | section delete button | `deleteKeyframeForSection()` |

`interpolation.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `interpolation.applyPreset` | preset buttons | `applyInterpolationPresetToSelection()` |
| `interpolation.reset` | reset button | `resetInterpolationCurvesToLinear()` |
| `interpolation.applyLinear` | linear button | `resetInterpolationCurvesToLinear()` |
| `interpolation.updateHandle` | interpolation SVG drag move | interpolation curve value update |
| `interpolation.finishHandleDrag` | interpolation SVG drag end | runtime animation / timeline edit state refresh |

`selection.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `selection.cycleActiveModel` | `Tab`, `Shift+Tab`, `IntlRo` | `cycleActiveModelByShortcut()` |
| `selection.pickBone` | viewport bone visualizer click | bottom panel / timeline bone selection sync |
| `selection.setBone` | bottom panel bone select | timeline / UI 同期 |
| `selection.setMorphFrame` | bottom panel morph frame select | section keyframe button state update |

`edit.*`:

| Action type | 迴ｾ蝨ｨ縺ｮ蜈･蜿｣ | 迴ｾ蝨ｨ縺ｮ蜃ｦ逅・|
| --- | --- | --- |
| `edit.boneTransformChanged` | bottom panel / viewport bone transform callback | pose snapshot / dirty state / panel sync |
| `edit.cameraTransformChanged` | camera panel / viewport camera callback | camera dirty state / bottom panel sync |
| `edit.morphValueChanged` | bottom panel morph slider callback | morph dirty state |

`viewport.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `viewport.toggleGround` | `G` | ground visibility toggle |
| `viewport.toggleEdge` | `E` | edge width toggle |
| `viewport.toggleBackgroundMedia` | background media button | background media toggle |
| `viewport.toggleBackgroundBlack` | `B` | black background toggle |
| `viewport.toggleSkydome` | skydome button | skydome toggle |

`project.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `project.openFile` | load file button | `loadFileFromDialog()` |
| `project.dropFiles` | file drag and drop | ordered `loadFileByPath(..., "drop")` |
| `project.openModel` | `Ctrl+O` | `loadPMX()` |
| `project.openMotion` | `Ctrl+M` | `loadVMD()` |
| `project.openCameraMotion` | `Ctrl+Shift+M` | `loadCameraVMD()` |
| `project.openAudio` | `Ctrl+Shift+A` | `loadMP3()` |
| `project.save` | save button / `Ctrl+Alt+S` | `saveProject()` |
| `project.load` | load project button / `Ctrl+Alt+O` | `loadProject()` |
| `project.exportPng` | PNG button / `Ctrl+Shift+S` | `exportPNG()` |
| `project.exportPngSequence` | PNG sequence button | `exportPNGSequence()` |
| `project.exportWebm` | WebM button | `exportWebm()` |

`layout.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `layout.fullscreen.toggle` | `Alt+Enter` | `toggleUiFullscreenMode()` |
| `layout.fullscreen.exit` | `Escape` while UI fullscreen | `exitUiFullscreenMode()` |
| `layout.shaderPanel.toggle` | FX panel button | `toggleShaderPanel()` |

`runtime.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `runtime.toggleAntialias` | AA button | antialias toggle |
| `runtime.togglePhysics` | physics button | physics toggle |
| `runtime.toggleShadow` | shadow button | shadow toggle |
| `runtime.toggleRigidBodies` | rigid bodies button | rigid bodies toggle |
| `runtime.toggleGlobalIllumination` | GI button | global illumination toggle |

`model.*` / `shader.*` / `accessory.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `model.selectTimelineTarget` | model info select | timeline target select |
| `model.toggleActiveVisibility` | model visibility button | active model visibility toggle |
| `model.setActiveShadow` | model shadow checkbox | active model shadow setting |
| `model.deleteActive` | model delete button | active model delete |
| `shader.selectModelTarget` | shader model select | shader target select |
| `shader.applySelected` | shader apply selected button | shader preset apply selected |
| `shader.applyAll` | shader apply all button | shader preset apply all |
| `shader.reset` | shader reset button | shader preset reset |
| `accessory.select` | accessory select | accessory selection |
| `accessory.setParentModel` | accessory parent model select | parent model setting |
| `accessory.setParentBone` | accessory parent bone select | parent bone setting |
| `accessory.setVisibility` | accessory visibility checkbox | selected accessory visibility setting |
| `accessory.setShadow` | accessory shadow checkbox | selected accessory shadow-caster setting |
| `accessory.deleteSelected` | accessory delete button | selected accessory delete |

`camera.*` / `output.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `camera.setViewPreset` | camera view preset buttons | camera preset apply |
| `camera.setMirroringFloorEnabled` | mirroring floor enabled checkbox | mirroring floor enabled setting |
| `camera.setMirroringFloorResolution` | mirroring floor resolution select | mirroring floor resolution setting |
| `output.applyPreset` | output aspect / size preset select | output preset apply |
| `output.syncDimension` | output width / height input | aspect lock aware dimension sync |
| `output.setLockAspect` | output lock aspect checkbox | aspect lock setting |
| `output.markFrameRangeCustomized` | output start / end frame input | frame range customized flag |
| `output.sanitizeFrameRange` | output start / end frame change | frame range normalization |

`effect.*`:

| Action type | 現在の入口 | 現在の処理 |
| --- | --- | --- |
| `effect.setModelEdgeWidth` | model edge slider / static input | model edge width setting |
| `effect.setContrastOffset` | contrast slider | contrast setting |
| `effect.setGammaOffset` | gamma slider | gamma setting |
| `effect.setExposure` | exposure slider | exposure setting |
| `effect.setDitheringIntensity` | dithering slider | dithering setting |
| `effect.setVignetteWeight` | vignette slider | vignette setting |
| `effect.setGrainIntensity` | grain slider | grain setting |
| `effect.setSharpenEdge` | sharpen slider | sharpen setting |
| `effect.setColorCurvesSaturation` | color curves slider | saturation setting |
| `effect.setToneMappingType` | tone mapping select | tone mapping setting |
| `effect.setBloom` | bloom checkbox / sliders | bloom setting |
| `effect.setGlowIntensity` | glow slider | glow setting |
| `effect.setDofEnabled` | DoF checkbox | DoF enabled setting |
| `effect.setDofQuality` | DoF quality select | DoF blur level setting |
| `effect.setDofFocusDistance` | DoF focus slider | focus distance setting |
| `effect.setDofFocusOffset` | DoF focus offset slider | autofocus offset setting |
| `effect.setDofFStop` | DoF f-stop slider | f-stop setting |
| `effect.setDofNearSuppression` | DoF near suppression slider | near suppression setting |
| `effect.setDofFocalInvert` | DoF focal invert checkbox | focal invert setting |
| `effect.setDofLensBlur` | DoF lens blur slider | lens blur setting |
| `effect.setDofLensSize` | DoF lens size slider | lens size setting |
| `effect.setDofFocalLength` | DoF focal length slider | focal length setting |
| `effect.setDofTargetModel` | DoF target model select | focus target model setting |
| `effect.setDofTargetBone` | DoF target bone select | focus target bone setting |
| `effect.setMotionBlurStrength` | motion blur slider | motion blur setting |
| `effect.setSsrStrength` | SSR slider | SSR setting |
| `effect.setVlsExposure` | VLS slider | volumetric light scattering setting |
| `effect.setFrameGraphSsao` | Frame Graph SSAO checkbox / sliders | Frame Graph SSAO setting |
| `effect.setFrameGraphSsr` | Frame Graph SSR checkbox / slider | Frame Graph SSR setting |
| `effect.setFrameGraphDofEnabled` | Frame Graph DoF checkbox | Frame Graph DoF enabled setting |
| `effect.setFrameGraphDofFocusDistance` | Frame Graph DoF focus slider | Frame Graph DoF focus setting |
| `effect.setFrameGraphDofFocusOffset` | Frame Graph DoF focus offset slider | Frame Graph DoF autofocus offset setting |
| `effect.setFrameGraphDofFStop` | Frame Graph DoF f-stop slider | Frame Graph DoF f-stop setting |
| `effect.setFrameGraphDofLensSize` | Frame Graph DoF lens size slider | Frame Graph DoF lens size setting |
| `effect.setFrameGraphDofFocalLength` | Frame Graph DoF focal length slider | Frame Graph DoF focal length setting |
| `effect.setFrameGraphDofTargetModel` | Frame Graph DoF target model select | Frame Graph DoF focus target model setting |
| `effect.setFrameGraphDofTargetBone` | Frame Graph DoF target bone select | Frame Graph DoF focus target bone setting |
| `effect.setLightDirection` | light direction sliders | light direction setting |
| `effect.setLightIntensity` | light intensity slider | light intensity setting |
| `effect.setAmbientIntensity` | ambient intensity slider | ambient intensity setting |
| `effect.setLightColor` | light color sliders | light color setting |
| `effect.setLightFlatStrength` | light flat strength slider | flat light strength setting |
| `effect.setLightFlatColorInfluence` | light flat color influence slider | flat color influence setting |
| `effect.setShadowDarkness` | shadow darkness slider | shadow darkness setting |
| `effect.setShadowFrustumSize` | shadow frustum slider | shadow frustum setting |
| `effect.setShadowMaxZ` | shadow max Z slider | shadow max Z setting |
| `effect.setShadowFilteringQuality` | shadow filter quality slider | shadow filter quality setting |
| `effect.setSoftTransparentShadow` | soft transparent shadow slider | soft transparent shadow setting |
| `effect.setIblShadows` | IBL shadows slider | IBL shadows setting |
| `effect.setIblShadowOpacity` | IBL shadow opacity slider | IBL shadow opacity setting |
| `effect.setIblShadowDistanceScale` | IBL shadow range slider | IBL shadow distance scale setting |
| `effect.setCharacterContactShadow` | character contact shadow slider | character contact shadow setting |
| `effect.setCharacterContactShadowOpacity` | character contact shadow opacity slider | contact shadow opacity setting |
| `effect.setCharacterContactShadowScale` | character contact shadow scale slider | contact shadow scale setting |
| `effect.setShadowBias` | shadow bias slider | shadow bias setting |
| `effect.setShadowNormalBias` | shadow normal bias slider | shadow normal bias setting |
| `effect.setShadowColor` | shadow color sliders | shadow color setting |
| `effect.setToonShadowInfluence` | toon shadow influence slider | toon shadow influence setting |
| `effect.setSelfShadowSoftness` | self shadow softness slider | self shadow softness setting |
| `effect.setOcclusionShadowSoftness` | occlusion shadow softness slider | occlusion shadow softness setting |
| `effect.setLightColorTemperature` | color temperature slider | light color temperature setting |
| `effect.setFogEnabled` | fog checkbox | fog enabled setting |
| `effect.setFogStart` | fog start slider / input | fog start setting |
| `effect.setFogEnd` | fog end slider / input | fog end setting |
| `effect.setFogDensity` | fog density slider / input | fog density setting |
| `effect.setFogOpacity` | fog opacity slider / input | fog opacity setting |
| `effect.setFogColor` | fog color input | fog color setting |
| `effect.setChromaticAberration` | chromatic aberration slider / input | chromatic aberration setting |
| `effect.setLensDistortion` | lens distortion slider / input | lens distortion setting |
| `effect.setLensDistortionInfluence` | lens influence slider / input | lens influence setting |
| `effect.setLensEdgeBlur` | edge blur slider / input | edge blur setting |
| `effect.applyLut` | LUT select / checkbox / intensity slider | LUT setting |
| `effect.chooseExternalLut` | LUT file button | external LUT file selection |

## まだ Action 化していないもの

優先度高め:

- timeline canvas pointer drag は `timeline.seekFrame` の `phase` (`dragStart` / `dragMove` / `dragEnd`) まで Action 化済み。低レベル DOM event wiring は `Timeline` 内に残す。

後続でよいもの:

- viewport camera drag / bone pick
- panel resize other than fullscreen
- keyboard shortcut customization / gamepad / MIDI 向け InputBinding
- undo / redo 用 Command / History

## 現時点の制約

- `ActionDispatcher` は handler を呼ぶだけで、`canExecute` はまだ dispatch 経路に組み込んでいない。
- Action は Command に変換されていない。
- undo / redo 用の `HistoryManager` は未実装。
- `source` は入れ始めたが、`device` / `scope` / shortcut customization 用の binding 定義は未実装。
- 連続入力系の slider は、現時点では Action を直接 dispatch している。undo / redo 対応時は pointerdown / input / change の単位で merge する設計が必要。
- `timeline.selectionChanged` は `KeyframeTrack` 参照を含むため、永続化・履歴化用 Action ではなく UI 内部通知 Action として扱う。

## 確認結果

2026-05-18:

- `npm.cmd run test:unit`
  - 12 files / 66 tests passed
- `npm.cmd run lint`
  - 0 errors / 467 warnings
  - warnings は既存の `any` / non-null assertion など
- `npm.cmd run smoke:launch`
  - pass
  - `engine=WebGPU`
  - `physics=Bullet MPR`
  - `crossOriginIsolated=true`

## 次にやること

1. `canExecuteEditorAction()` を button enabled / shortcut guard に少しずつ接続する。
2. `keyframe.nudgeSelected` から `CommandDiff` 設計を始める。
