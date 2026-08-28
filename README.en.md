# MMD modoki

MMD modoki is a local editing tool inspired by MMD, built on top of Babylon.js and `babylon-mmd`.

It is being developed as a practical alternative for environments where the original MMD is hard to use. Public builds for Windows, Linux, and macOS are being verified incrementally, and the UI can be switched between English, Japanese, Traditional Chinese, Simplified Chinese, and Korean.

## Download

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

- Load PMX/PMD models
- Load `.x` / OBJ accessories
- Load VMD motions, camera VMD data, and VPD poses
- Load MP3/WAV audio for timeline preview
- Edit bones, morphs, camera, lighting, post effects, and accessory transforms on a timeline
- Save and reload project files
- Import built-in and external LUT files (`.3dl`, `.cube`) from the LUT picker or by drag and drop
- Adjust post effects such as DoF, Bloom, LUT, SSR, fog, and lens distortion
- Use material shader presets including `AlphaCutOff` and `Luminous`
- Export PNG images, numbered PNG sequences, and WebM videos
- Export model/camera VMD files (beta) and selected-bone VPD poses

Notes:

- `.vmd` files are routed as model motion or camera motion depending on their contents.
- `.x` files are expected to be text-format DirectX X files.
- SSAO is currently kept disabled in public builds to reduce load.
- Anti-aliasing uses `MSAA x4 + FXAA`.

## Supported File Types

Available through normal open operations or drag and drop:

- Models: `.pmx` `.pmd`
- Accessories: `.x` `.obj`
- Motion / pose: `.vmd` `.vpd`
- Camera motion: `.vmd`
- Audio: `.mp3` `.wav`

Available from dedicated UI:

- Project: `.json` (default file name pattern: `*.modoki.json`)
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

- Node.js 18 or later
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
