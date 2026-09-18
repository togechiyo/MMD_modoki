# MMD modoki

MMD modoki is a local editing tool inspired by MMD, built on top of Babylon.js and `babylon-mmd`.

It is being developed as a practical alternative for environments where the original MMD is hard to use. Public builds for Windows, Linux, and macOS are being verified incrementally, and the UI can be switched between English, Japanese, Traditional Chinese, Simplified Chinese, and Korean.

## Download

The v0.2.4 release is in preparation. This README describes the source prepared for v0.2.4. See the [release notes](./docs/v0.2.4-release-note.md) for changes; published downloads are listed on GitHub Releases.

- Releases: https://github.com/togechiyo/MMD_modoki/releases

Distributed builds are provided as OS-specific zip archives and an Apple Silicon macOS DMG. `<version>` is replaced with the release version.

- `MMD.modoki-windows-x64-<version>.zip`
- `MMD.modoki-mac-<version>.zip`
- `MMD.modoki-mac-arm64-<version>.dmg`
- `MMD.modoki-linux-x64-<version>.zip`

## Supported UI Languages

- English
- Japanese
- Traditional Chinese
- Simplified Chinese
- Korean

## Launch

1. Download the zip file for your OS from `Releases`.
2. Extract the zip file.
3. Launch the application from the extracted folder.

Windows:

- `MMD modoki.exe`

macOS:

- `MMD modoki.app`

Linux:

- Depending on your environment, the Linux build may need to be launched with `--no-sandbox`.
- This is a temporary workaround for some `chrome-sandbox` startup failures.

## First Launch Notes

- The macOS build is unsigned, so Gatekeeper warnings may appear.
- If macOS blocks the app at launch, you can temporarily open it from `System Settings > Privacy & Security > Open Anyway`.
- This is a temporary workaround while signed distribution is not yet available.
- The Linux build may require additional libraries depending on the environment.
- The project file format and UI are still evolving.

## Features

- Load PMX/PMD/BPMX models
- Load `.x` / OBJ accessories
- Load VMD/BVMD model and camera motions, and VPD poses
- Load MP3/WAV audio for timeline preview
- Edit bones, morphs, camera, lighting, shadows, gravity, and accessory transforms on a timeline
- Save and reload project files
- Import built-in and external LUT files (`.3dl`, `.cube`) from the LUT picker or by drag and drop
- Adjust post effects such as DoF, Bloom, LUT, SSR, fog, and lens distortion
- Use material shader presets including `AlphaCutOff` and `Luminous`
- Export PNG images, numbered PNG sequences, and WebM videos
- Export model/camera VMD files (beta), BVMD files, and selected-bone VPD poses
- Convert PMX/PMD models to BPMX and VMD motions to BVMD
- Enable experimental PBR materials, external WGSL materials, and local MCP integration from Settings → Experimental settings

Notes:

- `.vmd` files are routed as model motion or camera motion depending on their contents.
- `.x` files are expected to be text-format DirectX X files.
- Adjust expensive effects such as SSAO to suit your GPU and resolution.
- Post-effect keyframe editing is restricted to a development opt-in and is not available in the normal UI.

## Supported File Types

Available through normal open operations or drag and drop:

- Models: `.pmx` `.pmd` `.bpmx`
- Accessories: `.x` `.obj`
- Motion / pose: `.vmd` `.bvmd` `.vpd`
- Camera motion: `.vmd` `.bvmd`
- Audio: `.mp3` `.wav`
- Projects: `.mmdproj` / project-format `.json`. Dropping a project opens it in the current window if empty, or in a new window if work is already present.

Available from dedicated UI:

- LUT: `.3dl` `.cube`
- Image output: `.png`
- Video output: `.webm`

## Basic Controls

- `Ctrl + O`: Open PMX/PMD
- `Ctrl + M`: Open VMD
- `Ctrl + Shift + M`: Open camera VMD
- `Ctrl + Shift + A`: Open audio
- `Ctrl + S`: Save project / overwrite save
- `Ctrl + Alt + S`: Save as
- `Ctrl + Shift + S`: Save PNG
- `Space` or `P`: Play / stop
- `Delete`: Delete selected keyframes

Mouse:

- Middle-button drag: Move view
- Right drag: Rotate
- Wheel: Zoom

## Development

Requirements:

- Node.js 22 (used by release CI)
- npm

Setup:

```bash
npm install
```

Run in development:

```bash
npm start
```

Lint:

```bash
npm run lint
```

Build distributables:

```bash
npm run package
npm run make
```

Create zip packages:

```bash
npm run make:zip
```

## Documentation

- Documentation entry point: [docs/README.md](./docs/README.md)
- Architecture: [docs/architecture.md](./docs/architecture.md)
- MmdManager guide: [docs/mmd-manager.md](./docs/mmd-manager.md)
- UI flow: [docs/ui-flow.md](./docs/ui-flow.md)
- Troubleshooting: [docs/troubleshooting.md](./docs/troubleshooting.md)

## License

- This project: [MIT](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
