import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(scriptDirectory, "../../../..");
const insightsRoot = path.join(repositoryRoot, "insights");

const statusByDirectory = new Map([
  ["observations", "observation"],
  ["verified", "verified"],
  ["policies", "policy"],
  ["decisions", "decision"],
  ["retired", "retired"],
]);
const validPriorities = new Set(["high", "normal", "low"]);
const validConfidences = new Set(["low", "medium", "high"]);
const validDecisions = new Set([
  "adopted",
  "rejected",
  "deferred",
  "accepted-with-constraints",
  "confirmed",
]);
const requiredFields = [
  "id",
  "status",
  "scope",
  "confidence",
  "last_verified",
  "evidence",
  "source_docs",
  "superseded_by",
];
const requiredHeadings = [
  "## 適用条件",
  "## 判断",
  "## 避けること",
  "## 根拠",
  "## 再確認条件",
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return readMarkdownFiles(target);
    return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
  });
}

function toInsightsRelative(file) {
  return path.relative(insightsRoot, file).split(path.sep).join("/");
}

function parseFrontMatter(raw, file) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    fail(`missing front matter: ${toInsightsRelative(file)}`);
    return { text: "", fields: new Map(), sourceDocs: [] };
  }

  const text = match[1];
  const fields = new Map();
  for (const line of text.split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (field) fields.set(field[1], (field[2] ?? "").trim());
  }

  const lines = text.split(/\r?\n/);
  const sourceDocs = [];
  const sourceIndex = lines.findIndex((line) => /^source_docs:\s*$/.test(line));
  if (sourceIndex >= 0) {
    for (let index = sourceIndex + 1; index < lines.length; index += 1) {
      const item = lines[index].match(/^\s+-\s+(.+?)\s*$/);
      if (!item) break;
      sourceDocs.push(item[1].replace(/^['"]|['"]$/g, ""));
    }
  }

  return { text, fields, sourceDocs };
}

if (!fs.existsSync(insightsRoot)) {
  console.error(`Insights directory not found: ${insightsRoot}`);
  process.exit(1);
}

const allMarkdown = readMarkdownFiles(insightsRoot);
const cards = [];
for (const [directory, expectedStatus] of statusByDirectory) {
  const directoryPath = path.join(insightsRoot, directory);
  for (const file of readMarkdownFiles(directoryPath)) {
    cards.push({ file, directory, expectedStatus });
  }
}

const ids = new Map();
const cardByRelative = new Map();

for (const card of cards) {
  const relative = toInsightsRelative(card.file);
  const raw = fs.readFileSync(card.file, "utf8");
  const { fields, sourceDocs } = parseFrontMatter(raw, card.file);
  cardByRelative.set(relative, { ...card, fields });

  for (const field of requiredFields) {
    if (!fields.has(field)) fail(`missing ${field}: ${relative}`);
  }

  const id = fields.get("id");
  if (id) {
    if (ids.has(id)) fail(`duplicate id ${id}: ${ids.get(id)} and ${relative}`);
    ids.set(id, relative);
  }

  const status = fields.get("status");
  if (status !== card.expectedStatus) {
    fail(`status mismatch ${relative}: expected ${card.expectedStatus}, found ${status ?? "missing"}`);
  }

  const confidence = fields.get("confidence");
  if (confidence && !validConfidences.has(confidence)) {
    fail(`invalid confidence ${confidence}: ${relative}`);
  }

  const priority = fields.get("priority");
  if (priority && !validPriorities.has(priority)) {
    fail(`invalid priority ${priority}: ${relative}`);
  }

  if (card.expectedStatus === "decision") {
    for (const field of ["decision_owner", "decision", "decided_on"]) {
      if (!fields.has(field) || !fields.get(field)) fail(`missing ${field}: ${relative}`);
    }
    const decision = fields.get("decision");
    if (decision && !validDecisions.has(decision)) {
      fail(`invalid decision ${decision}: ${relative}`);
    }
  }

  for (const heading of requiredHeadings) {
    if (!raw.includes(heading)) fail(`missing heading "${heading}": ${relative}`);
  }

  for (const source of sourceDocs) {
    if (/^(?:https?:|mailto:)/i.test(source)) continue;
    const resolved = path.resolve(path.dirname(card.file), source);
    if (!fs.existsSync(resolved)) fail(`broken source_docs link ${relative} -> ${source}`);
  }
}

const markdownLinkPattern = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g;
for (const file of allMarkdown) {
  const raw = fs.readFileSync(file, "utf8");
  for (const match of raw.matchAll(markdownLinkPattern)) {
    const target = match[1];
    if (/^(?:https?:|mailto:)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      fail(`broken markdown link ${toInsightsRelative(file)} -> ${target}`);
    }
  }
}

const indexes = new Map([
  ["index.md", path.join(insightsRoot, "index.md")],
  ["low-priority-index.md", path.join(insightsRoot, "low-priority-index.md")],
  ["decision-index.md", path.join(insightsRoot, "decision-index.md")],
]);
const indexEntries = new Map();
const cardLinkPattern = /\]\(\.\/((?:observations|verified|policies|decisions|retired)\/[^)#]+\.md)(?:#[^)]+)?\)/g;

for (const [indexName, indexPath] of indexes) {
  if (!fs.existsSync(indexPath)) {
    fail(`missing index: ${indexName}`);
    continue;
  }
  const raw = fs.readFileSync(indexPath, "utf8");
  for (const match of raw.matchAll(cardLinkPattern)) {
    const relative = match[1];
    if (!cardByRelative.has(relative)) fail(`index references unknown card: ${indexName} -> ${relative}`);
    const locations = indexEntries.get(relative) ?? [];
    locations.push(indexName);
    indexEntries.set(relative, locations);
  }
}

for (const [relative, card] of cardByRelative) {
  const expectedIndex = card.expectedStatus === "decision"
    ? "decision-index.md"
    : card.fields.get("priority") === "low"
      ? "low-priority-index.md"
      : "index.md";
  const locations = indexEntries.get(relative) ?? [];
  if (locations.length === 0) {
    fail(`unindexed card: ${relative}`);
  } else if (locations.length > 1) {
    fail(`card indexed multiple times: ${relative} -> ${locations.join(", ")}`);
  } else if (locations[0] !== expectedIndex) {
    fail(`card in wrong index: ${relative} -> ${locations[0]}, expected ${expectedIndex}`);
  }
}

if (errors.length > 0) {
  console.error(`Insights validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const decisionCount = cards.filter((card) => card.expectedStatus === "decision").length;
const lowPriorityCount = cards.filter((card) => cardByRelative.get(toInsightsRelative(card.file))?.fields.get("priority") === "low").length;
console.log(`Insights validation passed: cards=${cards.length}, decisions=${decisionCount}, lowPriority=${lowPriorityCount}`);
