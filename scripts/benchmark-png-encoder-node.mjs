import { deflateSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { cpus, availableParallelism, release, tmpdir } from "node:os";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import assert from "node:assert/strict";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worker = process.argv[2] === "memory";
const outputDirectory = worker
  ? process.argv[5]
  : mkdtempSync(join(tmpdir(), "mmd-png-bench-"));
const bundlePath = worker
  ? process.argv[4]
  : join(outputDirectory, "encoder.mjs");
if (!worker) {
  await build({
    entryPoints: [join(repoRoot, "src/output/png-encoder.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundlePath,
  });
}
const { createNoneFilteredScanlines, createPngChunk, encodeRgba8ToPng } =
  await import(pathToFileURL(bundlePath).href);
const W = 1920,
  H = 1080,
  N = 5;
const median = (a) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const hash = (a) => createHash("sha256").update(a).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function image(kind, w = W, h = H) {
  const a = new Uint8Array(w * h * 4);
  let seed = 0x12345678;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (kind === "noise" || kind === "parity") {
        for (let c = 0; c < 4; c++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          a[i + c] = seed >>> 24;
        }
        if (kind === "parity") a[i + 3] = [0, 1, 128, 255][(i / 4) % 4];
      } else if (kind === "gradient") {
        a[i] = Math.round((x * 255) / (w - 1));
        a[i + 1] = Math.round((y * 255) / (h - 1));
        a[i + 2] = Math.round((x / (w - 1) + y / (h - 1)) * 127.5);
        a[i + 3] = 255;
      } else {
        const nx = x / w,
          ny = y / h;
        let color = [235, 240, 248, 255];
        if (nx > 0.08 && nx < 0.38 && ny > 0.12 && ny < 0.8)
          color = [30, 65, 120, 255];
        if ((nx - 0.65) ** 2 + (ny - 0.45) ** 2 < 0.12 ** 2)
          color = [245, 140, 45, 255];
        if (nx > 0.48 && nx < 0.9 && ny > 0.75 && ny < 0.86)
          color = [90, 180, 120, 255];
        a.set(color, i);
      }
    }
  return a;
}
function filter(a, w, h, t) {
  if (t === 0) return createNoneFilteredScanlines(a, w, h);
  const s = w * 4,
    out = new Uint8Array((s + 1) * h);
  for (let y = 0; y < h; y++) {
    out[y * (s + 1)] = t;
    for (let x = 0; x < s; x++) {
      const i = y * s + x,
        l = x >= 4 ? a[i - 4] : 0,
        u = y ? a[i - s] : 0,
        ul = y && x >= 4 ? a[i - s - 4] : 0;
      let p;
      if (t === 1) p = l;
      else if (t === 2) p = u;
      else if (t === 3) p = Math.floor((l + u) / 2);
      else {
        const v = l + u - ul,
          pa = Math.abs(v - l),
          pb = Math.abs(v - u),
          pc = Math.abs(v - ul);
        p = pa <= pb && pa <= pc ? l : pb <= pc ? u : ul;
      }
      out[y * (s + 1) + 1 + x] = (a[i] - p) & 255;
    }
  }
  return out;
}
async function compress(a) {
  const cs = new CompressionStream("deflate"),
    p = new Response(cs.readable).arrayBuffer(),
    w = cs.writable.getWriter();
  await w.write(a);
  await w.close();
  return new Uint8Array(await p);
}
function png(z, w = W, h = H) {
  const hdr = new Uint8Array(13),
    v = new DataView(hdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  hdr[8] = 8;
  hdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk("IHDR", hdr),
    createPngChunk("IDAT", z),
    createPngChunk("IEND", new Uint8Array()),
  ]);
}
async function memoryWorker(mode) {
  const w = 7680,
    h = 4320,
    a = image("flat", w, h);
  global.gc();
  const baseline = process.memoryUsage();
  let peakRss = baseline.rss,
    peakAB = baseline.arrayBuffers;
  function sample() {
    const m = process.memoryUsage();
    peakRss = Math.max(peakRss, m.rss);
    peakAB = Math.max(peakAB, m.arrayBuffers);
  }
  const timer = setInterval(sample, 1),
    start = performance.now();
  const cs = new CompressionStream("deflate"),
    p = new Response(cs.readable).arrayBuffer(),
    wr = cs.writable.getWriter();
  if (mode === "full") {
    const f = createNoneFilteredScanlines(a, w, h);
    sample();
    await wr.write(f);
  } else
    for (let y = 0; y < h; y += 64) {
      const rows = Math.min(64, h - y),
        f = createNoneFilteredScanlines(
          a.subarray(y * w * 4, (y + rows) * w * 4),
          w,
          rows,
        );
      sample();
      await wr.write(f);
    }
  await wr.close();
  const z = new Uint8Array(await p);
  const ms = performance.now() - start;
  sample();
  clearInterval(timer);
  writeFileSync(join(outputDirectory, mode + ".zlib"), z);
  console.log(
    JSON.stringify({
      mode,
      ms,
      baselineRss: baseline.rss,
      baselineAB: baseline.arrayBuffers,
      peakRss,
      peakAB,
      bytes: z.length,
      hash: hash(z),
      resourceMaxRss: process.resourceUsage().maxRSS * 1024,
    }),
  );
}
async function delayTrial(a, mode) {
  let last = performance.now(),
    max = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    max = Math.max(max, now - last - 1);
    last = now;
  }, 1);
  await sleep(15);
  max = 0;
  last = performance.now();
  const start = performance.now();
  if (mode === "sync")
    png(deflateSync(createNoneFilteredScanlines(a, W, H), { level: 6 }));
  else await encodeRgba8ToPng(a, W, H);
  const ms = performance.now() - start;
  await sleep(5);
  clearInterval(timer);
  return { ms, delay: Math.max(0, max) };
}
if (worker) await memoryWorker(process.argv[3]);
else {
  const results = {
    machine: {
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      availableParallelism: availableParallelism(),
      os: release(),
      node: process.version,
      zlib: process.versions.zlib,
      date: new Date().toISOString(),
    },
    parity: [],
    filters: [],
    levels: [],
    memory: [],
    delay: [],
  };
  const a = image("parity");
  writeFileSync(join(outputDirectory, "check-parity.rgba"), a);
  for (let r = 0; r < N; r++) {
    const start = performance.now(),
      p = await encodeRgba8ToPng(a, W, H);
    results.parity.push({ ms: performance.now() - start, bytes: p.byteLength });
    writeFileSync(
      join(outputDirectory, `check-parity--${r}.png`),
      new Uint8Array(p.pngBuffer),
    );
  }
  const kinds = ["flat", "gradient", "noise"];
  // Explicit unmeasured warm-up of all filter implementations and compression APIs.
  for (let t = 0; t < 5; t++) filter(image("flat", 64, 64), 64, 64, t);
  await compress(a);
  deflateSync(a, { level: 6 });
  for (const kind of kinds) {
    const rgba = image(kind);
    writeFileSync(join(outputDirectory, `check-${kind}.rgba`), rgba);
    for (let t = 0; t < 5; t++)
      for (let r = 0; r < N; r++) {
        const start = performance.now(),
          f = filter(rgba, W, H, t),
          filterMs = performance.now() - start;
        const d = performance.now(),
          z = await compress(f),
          deflateMs = performance.now() - d;
        results.filters.push({
          kind,
          t,
          r,
          filterMs,
          deflateMs,
          zlibBytes: z.length,
          pngBytes: z.length + 57,
        });
        if (r === 0)
          writeFileSync(
            join(outputDirectory, `check-${kind}--filter${t}.png`),
            png(z),
          );
      }
    const f = createNoneFilteredScanlines(rgba, W, H);
    for (let r = 0; r < N; r++) {
      let start = performance.now();
      const cs = await compress(f);
      results.levels.push({
        kind,
        r,
        mode: "CS",
        ms: performance.now() - start,
        bytes: cs.length,
      });
      for (const level of [1, 3, 6, 9]) {
        start = performance.now();
        const z = deflateSync(f, { level });
        results.levels.push({
          kind,
          r,
          mode: String(level),
          ms: performance.now() - start,
          bytes: z.length,
          equalCS: Buffer.from(cs).equals(z),
        });
      }
    }
  }
  for (let r = 0; r < N; r++)
    for (const mode of ["full", "batch64"]) {
      const p = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          fileURLToPath(import.meta.url),
          "memory",
          mode,
          bundlePath,
          outputDirectory,
        ],
        { encoding: "utf8" },
      );
      if (p.error) throw p.error;
      if (p.status !== 0) throw Error(p.stderr);
      results.memory.push({ ...JSON.parse(p.stdout), r });
      if (mode === "batch64")
        assert.deepEqual(
          readFileSync(join(outputDirectory, "full.zlib")),
          readFileSync(join(outputDirectory, "batch64.zlib")),
        );
    }
  for (const kind of kinds)
    for (let r = 0; r < N; r++)
      for (const mode of ["sync", "CS"])
        results.delay.push({
          kind,
          r,
          mode,
          ...(await delayTrial(image(kind), mode)),
        });

  const probe = spawnSync(
    "python3",
    ["-c", "import PIL; print(PIL.__version__)"],
    { encoding: "utf8" },
  );
  let parity;
  if (
    probe.error?.code === "ENOENT" ||
    (probe.status !== 0 && /No module named ['"]PIL['"]/.test(probe.stderr))
  ) {
    parity =
      "SKIP: independent parity decoder unavailable (python3/Pillow not installed).";
  } else {
    if (probe.error) throw probe.error;
    if (probe.status !== 0) throw Error(probe.stderr);
    const check = spawnSync(
      "python3",
      [
        "-c",
        `
from pathlib import Path
from PIL import Image
import sys
root=Path(sys.argv[1])
count=0
for p in sorted(root.glob('check-*.png')):
    expected=(root/(p.stem.split('--')[0]+'.rgba')).read_bytes()
    with Image.open(p) as im:
        im.verify()
    with Image.open(p) as im:
        assert im.size == (1920,1080), p
        assert im.convert('RGBA').tobytes() == expected, p
    count+=1
assert count == 20, count
print(f'PASS: {count} independently decoded PNGs, pixel-identical RGBA and valid CRCs.')
`,
        outputDirectory,
      ],
      { encoding: "utf8" },
    );
    if (check.error) throw check.error;
    if (check.status !== 0) throw Error(check.stderr);
    parity = check.stdout.trim() + " Pillow " + probe.stdout.trim() + ".";
  }
  printReport(results, parity);
  rmSync(outputDirectory, { recursive: true, force: true });
}

function printReport(results, parity) {
  const m = (rows, key) => median(rows.map((row) => row[key])).toFixed(2);
  const memory = (rows, key) =>
    (median(rows.map((row) => row[key])) / 1048576).toFixed(2);
  const table = (headers, rows) =>
    console.log(
      "\n| " +
        headers.join(" | ") +
        " |\n|" +
        headers.map(() => "---").join("|") +
        "|\n" +
        rows.map((row) => "| " + row.join(" | ") + " |").join("\n"),
    );
  console.log("# PNG encoder Node benchmark");
  console.log("\n" + JSON.stringify(results.machine));
  console.log(
    "\n5 runs per case; medians; milliseconds, bytes, MiB. Node/zlib, NOT Electron/Blink.",
  );
  console.log(parity);
  table(
    ["Parity input", "Encode ms", "PNG bytes"],
    [
      [
        "Random RGB; alpha 0/1/128/255",
        m(results.parity, "ms"),
        results.parity[0].bytes,
      ],
    ],
  );
  console.log("\n## Fixed filters (1920x1080)");
  table(
    ["Image", "Filter", "Filter ms", "Deflate ms", "PNG bytes"],
    ["flat", "gradient", "noise"].flatMap((kind) =>
      [0, 1, 2, 3, 4].map((t) => {
        const rows = results.filters.filter(
          (row) => row.kind === kind && row.t === t,
        );
        assert.equal(new Set(rows.map((row) => row.pngBytes)).size, 1);
        return [
          kind,
          ["None", "Sub", "Up", "Average", "Paeth"][t],
          m(rows, "filterMs"),
          m(rows, "deflateMs"),
          rows[0].pngBytes,
        ];
      }),
    ),
  );
  console.log("\n## None-filtered level sweep");
  table(
    ["Image", "Compressor", "ms", "Zlib bytes", "Exact CS equality (5/5)"],
    ["flat", "gradient", "noise"].flatMap((kind) =>
      ["CS", "1", "3", "6", "9"].map((mode) => {
        const rows = results.levels.filter(
          (row) => row.kind === kind && row.mode === mode,
        );
        return [
          kind,
          mode === "CS" ? "CompressionStream" : "deflateSync " + mode,
          m(rows, "ms"),
          rows[0].bytes,
          mode === "CS"
            ? "reference"
            : rows.every((row) => row.equalCS)
              ? "yes"
              : "no",
        ];
      }),
    ),
  );
  console.log("\n## 7680x4320 full buffer vs 64-row batches");
  table(
    [
      "Mode",
      "Wall ms",
      "Baseline RSS MiB",
      "Peak RSS MiB",
      "Baseline arrayBuffers MiB",
      "Peak arrayBuffers MiB",
      "OS lifetime max RSS MiB",
      "Zlib bytes",
    ],
    ["full", "batch64"].map((mode) => {
      const rows = results.memory.filter((row) => row.mode === mode);
      return [
        mode,
        m(rows, "ms"),
        ...[
          "baselineRss",
          "peakRss",
          "baselineAB",
          "peakAB",
          "resourceMaxRss",
        ].map((key) => memory(rows, key)),
        rows[0].bytes,
      ];
    }),
  );
  assert.equal(new Set(results.memory.map((row) => row.hash)).size, 1);
  console.log(
    "\nPASS: direct byte equality for all 5 full/batch pairs; all 10 SHA-256: " +
      results.memory[0].hash,
  );
  console.log("\n## Full-frame event-loop delay (1ms interval drift)");
  table(
    ["Image", "Encoder", "Encode ms", "Max delay ms"],
    ["flat", "gradient", "noise"].flatMap((kind) =>
      ["sync", "CS"].map((mode) => {
        const rows = results.delay.filter(
          (row) => row.kind === kind && row.mode === mode,
        );
        return [
          kind,
          mode === "sync" ? "deflateSync 6" : "CompressionStream",
          m(rows, "ms"),
          m(rows, "delay"),
        ];
      }),
    ),
  );
  console.log(
    "\nMemory: 1ms samples plus allocation/completion boundaries; baseline retains input; peaks include uncollected batches. Fresh child per memory trial. Event delay: median of per-trial maxima, includes filter/CRC/assembly. Timings exclude input generation. Main comparisons share one process; fixed case order; one warm-up per filter/API. PNG bytes include 57-byte framing. Node CompressionStream uses node:zlib, not Blink. Synthetic images only; original fixture inventory had no >=512px photo/render. Temporary files removed after success.",
  );
}
