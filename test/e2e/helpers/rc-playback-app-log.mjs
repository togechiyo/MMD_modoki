import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, parse, relative, resolve, sep } from "node:path";

// Inspect only the periodic records written for this Electron main process.
// electron-log writes inspected objects, so extract named fields without evaluating the log.
function playingSummaries({ path, sessionId }, started) {
  const { dir, name, ext } = parse(path);
  const found = new Map();
  for (const file of [resolve(dir, `${name}.old${ext}`), path]) {
    let contents;
    try { contents = readFileSync(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const record of contents.split(/(?=^\[\d{4}-\d\d-\d\d )/m)) {
      const header = record.match(/^\[([^\]]+)\]\s+\[info\]\s+\(performance\)\s+frame performance sample \{/);
      if (!header || !record.trimEnd().endsWith("\n}") || !record.includes(`sessionId: '${sessionId}'`)
        || !/\bisPlaying: true\b/.test(record) || !/\bkind: 'summary'/.test(record)) continue;
      const time = new Date(header[1].replace(" ", "T")).getTime();
      if (time >= started) found.set(time, { record, file: basename(file), timestamp: header[1], time });
    }
  }
  return [...found.values()].sort((a, b) => a.time - b.time);
}

function readSection(record, key) {
  const fields = record.match(new RegExp(`\\b${key}:\\s*\\{([^{}]*)\\}`))?.[1];
  expect(fields, `persisted sections.${key}`).toBeDefined();
  const number = name => {
    const match = fields.match(new RegExp(`\\b${name}:\\s*(null|[\\d.]+)`));
    expect(match, `${key}.${name}`).toBeTruthy();
    return match[1] === "null" ? null : Number(match[1]);
  };
  return { samples: number("samples"), avgMs: number("avgMs"), maxMs: number("maxMs") };
}

export async function measurePlaybackAppLog(page, tempDir, expectedFlags) {
  const info = await page.evaluate(() => window.electronAPI.getLogFileInfo());
  expect(info.sessionId).toBeTruthy();
  const logLocation = relative(tempDir, info.path);
  expect(isAbsolute(logLocation) || logLocation === ".." || logLocation.startsWith(`..${sep}`),
    "E2E logs belong to the test profile").toBe(false);
  const started = Date.now(), frame = page.locator("#current-frame"), startFrame = Number(await frame.inputValue());
  // Two real 10-second windows at 30 MMD frames/second. Do not repeatedly read
  // large log files or install benchmark hooks during the measurement.
  await expect.poll(async () => Number(await frame.inputValue()), { timeout: 60000, intervals: [1000] })
    .toBeGreaterThan(startFrame + 600);
  let summaries;
  await expect.poll(() => {
    summaries = playingSummaries(info, started);
    return summaries.length;
  }, { timeout: 30000, intervals: [1000] }).toBeGreaterThanOrEqual(2);
  const [previous, current] = summaries.slice(-2);
  const { record } = current;
  const intervalMs = Number(record.match(/\bintervalMs:\s*(\d+)/)?.[1]);
  expect(intervalMs).toBe(10000);
  // The first summary can include fixture setup. The next window is all playback.
  const flags = record.match(/\brcLighting:\s*\{([^{}]*)\}/)?.[1];
  const rcLighting = Object.fromEntries(Object.keys(expectedFlags).map(key => {
    const value = flags?.match(new RegExp(`\\b${key}:\\s*(true|false)\\b`));
    expect(value, key).toBeTruthy();
    return [key, value[1] === "true"];
  }));
  expect(rcLighting).toEqual(expectedFlags);
  expect(record).toMatch(/\bshadowEnabled:\s*true\b/);
  const parent = "activeMeshesEvaluation", other = "activeMeshesEvaluationOther";
  const skyKey = "rcSkyOcclusion", giKey = "rcDiffuseGi";
  const keys = [parent, other, ...[skyKey, giKey].flatMap(key => ["Prepare", "Source", "FieldSubmit"].map(part => key + part))];
  const sections = Object.fromEntries([...keys, "frameTotal", "postEffectBackend"].map(key => [key, readSection(record, key)]));
  expect(sections[parent].samples).toBeGreaterThan(0);
  for (const key of keys) {
    expect(sections[key].samples, key).toBe(sections[parent].samples);
    expect(sections[key].avgMs, key).toBeGreaterThanOrEqual(0);
    expect(sections[key].maxMs, key).toBeGreaterThanOrEqual(sections[key].avgMs);
  }
  const avg = key => sections[key].avgMs;
  // Each mean is rounded to three decimals by the ordinary logger.
  expect(Math.abs(avg(parent) - avg(other) - avg(skyKey + "Prepare") - avg(giKey + "Prepare"))).toBeLessThanOrEqual(0.0021);
  for (const [key, enabled] of [[skyKey, rcLighting.skyEnabled], [giKey, rcLighting.giEnabled]]) {
    const source = avg(key + "Source"), submit = avg(key + "FieldSubmit");
    expect(source + submit).toBeLessThanOrEqual(avg(key + "Prepare") + 0.0021);
    if (enabled && rcLighting.masterEnabled) { expect(source).toBeGreaterThan(0); expect(submit).toBeGreaterThan(0); }
    else { expect(sections[key + "Source"].maxMs).toBe(0); expect(sections[key + "FieldSubmit"].maxMs).toBe(0); }
  }
  const fps = Number(record.match(/\bfps:\s*(\d+)/)?.[1]);
  expect(fps).toBeGreaterThan(0);
  return { sessionId: info.sessionId, file: current.file, previousSample: previous.timestamp, sample: current.timestamp,
    intervalMs, fps, isPlaying: true, rcLighting, sections };
}
