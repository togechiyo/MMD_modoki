# PNG sequence export: main-thread vs 1 vs 2 Web Workers (macOS)

- Commit: togechiyo/MMD_modoki `f1bf2f200b218c5a9659c3c65378928f3e732445` (main) + local, uncommitted worker-count override (worker-count-override.patch, 4 lines: `MMD_MODOKI_PNG_WORKERS` env -> `pngWorkers` query -> `PngEncoderWebWorkerPool({ size })`). Reverted after the run.
- Machine: VirtualMac2,1, Apple M4 Pro (Virtual), 12 vCPU (hardwareConcurrency 12 -> default pool 2), 16 GiB, macOS 26.6.2 (25G83), Electron 45.3.1, Node 24.21.0, WebGPU.
- Settings: 1920x1080, frames 0-99 (100 frames), step 1, precision 1, fps 30, opaque background. Scenes = `scripts/benchmark-export-rgba.mjs` scenarios `empty` and `tofu-plate-ssgi-dof` (tofu + plate, SSGI + DoF), PNG part only (WebM removed).
- Each config: fresh app launch, 1 warmup run (discarded) + 3 measured runs; 2 rounds (round 2 in reverse order) -> n=6 per cell.
- "main" = `MMD_MODOKI_PNG_ENCODER=main` (pre-worker path: RGBA->BGRA + `nativeImage.createFromBitmap().toPNG()` in Electron main, still selectable on main).
- Encode total = sum of per-frame encode ms (worker: filter+deflate+assemble inside the worker; main: BGRA swap + toPNG in main). With 2 workers it is summed across workers, so it overlaps wall time.

## Commands
```
. ~/.nvm/nvm.sh
git apply worker-count-override.patch   # only needed for 1-worker runs; default pool is 2 here
cp bench-png-workers.local.mjs scripts/
# per cell (3 measured runs after 1 warmup):
MMD_MODOKI_PNG_ENCODER=main BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 empty
MMD_MODOKI_PNG_WORKERS=1    BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 empty
MMD_MODOKI_PNG_WORKERS=2    BENCH_WARMUP=1 node scripts/bench-png-workers.local.mjs 3 empty
# same three with tofu-plate-ssgi-dof instead of empty; full loop: run-matrix.sh
```

## Summary (measured runs only)
| scene | config | n | wall median | wall min–max | encode total median | encode/frame median | capture median |
|---|---|---:|---:|---:|---:|---:|---:|
| empty | main | 6 | 24853.7 | 23202.8–27524.1 | 20041.7 | 200.4 | 2781.6 |
| empty | 1 | 6 | 19173.3 | 18630.4–22692.0 | 15543.6 | 155.4 | 2474.0 |
| empty | 2 | 6 | 12572.5 | 10309.1–16192.0 | 16110.9 | 161.1 | 2827.3 |
| tofu-plate-ssgi-dof | main | 6 | 7585.4 | 6949.8–9225.4 | 2224.3 | 22.2 | 3534.2 |
| tofu-plate-ssgi-dof | 1 | 6 | 7176.2 | 6488.5–9763.6 | 1761.8 | 17.6 | 3504.8 |
| tofu-plate-ssgi-dof | 2 | 6 | 6839.9 | 6481.1–7372.8 | 1748.1 | 17.5 | 2964.7 |

Ratios (wall median): empty main/1w 1.30x, 1w/2w 1.52x, main/2w 1.98x. tofu main/1w 1.06x, 1w/2w 1.05x, main/2w 1.11x.
Per-frame encode: worker 155-161 ms vs main 200 ms (empty), 17.5 ms vs 22.2 ms (tofu): the worker encoder itself is ~1.26-1.29x faster per frame; the rest of the empty-scene 2x is the second worker running in parallel.
Note: main-mode "save IPC" sums 4 overlapping in-flight IPC calls, so it is not comparable to wall time.

## All runs (raw)
| scene | config | round | run | wall ms | encode total ms | deflate ms | capture ms | save IPC ms | dispatch wait ms | pool | PNG bytes |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| empty | main | 1 | warmup | 29427.6 | 20883.2 | 0.0 | 4522.9 | 95784.0 | 0.0 | 0 | 56019600 |
| empty | main | 1 | 1 | 27524.1 | 20685.9 | 0.0 | 3559.3 | 87874.3 | 0.0 | 0 | 56019600 |
| empty | main | 1 | 2 | 25505.8 | 20196.2 | 0.0 | 2751.2 | 87697.6 | 0.0 | 0 | 56019600 |
| empty | main | 1 | 3 | 27420.1 | 21531.2 | 0.0 | 3642.2 | 95735.7 | 0.0 | 0 | 56019600 |
| empty | 1 | 1 | warmup | 23804.6 | 16698.7 | 16387.1 | 3549.8 | 2200.9 | 667.4 | 1 | 41424100 |
| empty | 1 | 1 | 1 | 22692.0 | 16165.7 | 15870.8 | 2770.7 | 2731.2 | 68.0 | 1 | 41424100 |
| empty | 1 | 1 | 2 | 20721.2 | 16309.8 | 15984.4 | 2465.3 | 589.1 | 82.4 | 1 | 41424100 |
| empty | 1 | 1 | 3 | 19321.5 | 15712.5 | 15400.4 | 2566.1 | 305.7 | 55.9 | 1 | 41424100 |
| empty | 2 | 1 | warmup | 12265.0 | 16299.5 | 15956.1 | 2668.9 | 482.9 | 164.1 | 2 | 41424100 |
| empty | 2 | 1 | 1 | 13268.3 | 16695.3 | 16327.5 | 3269.1 | 1341.5 | 214.9 | 2 | 41424100 |
| empty | 2 | 1 | 2 | 14156.8 | 18488.2 | 18116.5 | 4290.1 | 2461.0 | 187.4 | 2 | 41424100 |
| empty | 2 | 1 | 3 | 16192.0 | 16409.4 | 16102.8 | 2991.9 | 677.1 | 4770.6 | 2 | 41424100 |
| tofu-plate-ssgi-dof | main | 1 | warmup | 10491.0 | 2369.1 | 0.0 | 5512.2 | 11850.9 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | main | 1 | 1 | 8007.7 | 2167.6 | 0.0 | 3660.8 | 11140.9 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | main | 1 | 2 | 8990.6 | 2535.8 | 0.0 | 4240.4 | 17047.3 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | main | 1 | 3 | 9225.4 | 2456.5 | 0.0 | 4461.0 | 14851.3 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | 1 | 1 | warmup | 7564.7 | 1765.7 | 1609.5 | 2984.5 | 298.1 | 153.9 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 1 | 1 | 9763.6 | 1904.5 | 1719.9 | 5226.0 | 427.5 | 225.4 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 1 | 2 | 8104.2 | 1771.8 | 1618.6 | 3931.2 | 345.8 | 209.6 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 1 | 3 | 7433.0 | 1730.4 | 1570.6 | 3781.5 | 312.5 | 163.5 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 1 | warmup | 6527.5 | 1735.5 | 1588.8 | 2645.6 | 251.9 | 236.7 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 1 | 1 | 6611.7 | 1664.3 | 1529.3 | 2535.3 | 170.5 | 191.6 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 1 | 2 | 6481.1 | 1734.0 | 1565.8 | 2784.8 | 298.7 | 222.0 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 1 | 3 | 6720.2 | 1762.2 | 1580.6 | 3274.9 | 256.0 | 263.1 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 2 | warmup | 6992.0 | 1757.4 | 1575.3 | 2980.7 | 349.0 | 323.7 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 2 | 1 | 7372.8 | 1782.7 | 1623.6 | 3110.6 | 476.5 | 336.2 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 2 | 2 | 7005.0 | 1795.8 | 1638.3 | 3250.0 | 345.4 | 262.6 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 2 | 2 | 3 | 6959.5 | 1727.9 | 1589.9 | 2818.8 | 350.5 | 195.8 | 2 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 2 | warmup | 6825.0 | 1680.2 | 1540.2 | 3091.6 | 274.9 | 206.2 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 2 | 1 | 6919.4 | 1829.2 | 1642.7 | 3228.0 | 323.3 | 257.6 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 2 | 2 | 6903.7 | 1751.8 | 1595.6 | 3123.2 | 400.5 | 211.8 | 1 | 5706400 |
| tofu-plate-ssgi-dof | 1 | 2 | 3 | 6488.5 | 1711.9 | 1562.4 | 2774.4 | 342.4 | 234.0 | 1 | 5706400 |
| tofu-plate-ssgi-dof | main | 2 | warmup | 7348.3 | 2231.8 | 0.0 | 3623.1 | 11425.2 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | main | 2 | 1 | 7163.1 | 2210.7 | 0.0 | 3278.1 | 11220.3 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | main | 2 | 2 | 7040.8 | 2237.9 | 0.0 | 3407.7 | 11060.3 | 0.0 | 0 | 5103600 |
| tofu-plate-ssgi-dof | main | 2 | 3 | 6949.8 | 2082.7 | 0.0 | 2896.1 | 10540.5 | 0.0 | 0 | 5103600 |
| empty | 2 | 2 | warmup | 11512.0 | 15563.6 | 15286.1 | 2524.6 | 289.1 | 106.6 | 2 | 41424100 |
| empty | 2 | 2 | 1 | 11876.7 | 15812.5 | 15501.6 | 2662.7 | 276.2 | 127.0 | 2 | 41424100 |
| empty | 2 | 2 | 2 | 11282.5 | 15218.7 | 14885.1 | 2513.9 | 243.5 | 164.4 | 2 | 41424100 |
| empty | 2 | 2 | 3 | 10309.1 | 14572.5 | 14304.6 | 1976.4 | 177.7 | 73.0 | 2 | 41424100 |
| empty | 1 | 2 | warmup | 18384.0 | 14973.1 | 14677.5 | 2343.7 | 228.0 | 61.2 | 1 | 41424100 |
| empty | 1 | 2 | 1 | 18787.7 | 15245.2 | 14963.5 | 2482.7 | 322.6 | 93.1 | 1 | 41424100 |
| empty | 1 | 2 | 2 | 19025.0 | 15374.7 | 15126.0 | 2446.6 | 259.1 | 87.4 | 1 | 41424100 |
| empty | 1 | 2 | 3 | 18630.4 | 15337.4 | 15043.4 | 2147.3 | 183.8 | 39.7 | 1 | 41424100 |
| empty | main | 2 | warmup | 23133.5 | 18619.2 | 0.0 | 3986.3 | 78670.5 | 0.0 | 0 | 56019600 |
| empty | main | 2 | 1 | 23202.8 | 19158.7 | 0.0 | 2023.6 | 79464.1 | 0.0 | 0 | 56019600 |
| empty | main | 2 | 2 | 24039.8 | 19495.3 | 0.0 | 2812.0 | 82942.8 | 0.0 | 0 | 56019600 |
| empty | main | 2 | 3 | 24201.5 | 19887.2 | 0.0 | 2440.8 | 82879.3 | 0.0 | 0 | 56019600 |
