#!/usr/bin/env python3
"""Phase 8 Batch 1 v2 — fixes v1 failures, full-spec presets UI.

v1 status on the target machine: step 1 only (presets.tsx rewritten with the
inline parsePresetExport). v2 handles that state and fixes v1's bugs:
- tool-dev.tsx lucide import anchor had wrong indentation (real line is a
  top-level import, no leading spaces).
- verify.ts already imports `capabilities` from platform/features; v1 would
  have duplicated it (TS error). v2 only adds `localPresets` + a new pure
  module import.
- SqlTool Panel anchor is NOT unique (ConverterTool has the same opening);
  v2 anchors on the unique ToolScaffold `next=[... "/diff" }]}>` line.
- parsePresetExport moved to pure src/lib/preset-io.ts so verify.ts never
  imports the React component tree.
- SqlTool preset config excludes raw inputs (sdInput DDL, insRows data) —
  configuration only, per the SavedPreset contract.
- test cleanup id fixed (p8-json-quick), CSS typo fixed (zinc-900).

Anchors verified against master dc011b0 real text:
- tool-dev.tsx: 'import { Play, Plus, RefreshCw } from "lucide-react";' (x1)
- tool-dev.tsx: '<Panel className="p-4">\\n        <Tabs tabs={JSON_TABS} active={tab} onChange={(next) => {' (x1, JSON_TABS unique)
- tool-data.tsx: '  formatSql, minifySql, genSqlSampleData, yamlParse, csvParse, diffLines, parseJsonError,\\n} from "../lib/engine";' (x1)
- tool-data.tsx: 'to: "/diff" }]}>\\n      <Panel className="p-4">\\n        <div className="flex flex-wrap items-end gap-2">' (x1)
- verify.ts: 'import { localPinnedTools, localCollections } from "../src/platform/local-repositories";' (x1)
- verify.ts: '(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();' (x1)
- verify.ts already has: 'import { capabilities, isFeatureEnabled } from "../src/platform/features";'

Idempotency: presets.tsx + preset-io.ts are written unconditionally (both
known-good full contents); tool pages and verify.ts abort if already patched.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# ---------------- 0. src/lib/preset-io.ts (pure module, new) ----------------
p = root / "src/lib/preset-io.ts"
PRESET_IO = '''// Preset import/export parsing — pure module so it is unit-testable in Node
// without importing the React component tree.
export type PresetConfig = Record<string, boolean | number | string>;

/** Export shape for one preset. toolId always travels with the config. */
export type PresetExport = {
  toolId: string;
  name: string;
  config: PresetConfig;
};

export function parsePresetExport(raw: string, toolId: string): PresetExport {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Preset file must be a JSON object.");
  const fileToolId = String(value.toolId ?? "");
  if (fileToolId && fileToolId !== toolId) throw new Error(`This preset belongs to the "${fileToolId}" tool.`);
  const name = String(value.name ?? "").trim().slice(0, 100);
  if (!name) throw new Error("Preset file has no name.");
  const rawConfig = value.config;
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) throw new Error("Preset file has no config object.");
  const config: PresetConfig = {};
  for (const [key, entry] of Object.entries(rawConfig as Record<string, unknown>)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") config[key] = entry;
  }
  if (!Object.keys(config).length) throw new Error("Preset config is empty or has no supported value types.");
  return { toolId, name, config };
}
'''
p.write_text(PRESET_IO, encoding="utf-8")
print("preset-io.ts: pure import/export parser written")

# ---------------- 1. src/components/presets.tsx (full rewrite, handles v1 state) ----------------
p = root / "src/components/presets.tsx"
NEW_PRESETS = '''import { useEffect, useState } from "react";
import { BookmarkPlus, Copy, Download, Trash2, Upload, Pencil } from "lucide-react";
import { platform, capabilities, type SavedPreset } from "../platform";
import { downloadFile } from "../lib/engine";
import { parsePresetExport, type PresetConfig, type PresetExport } from "../lib/preset-io";
import { Btn, Select, TextInput } from "./ui";

export function PresetControl({
  toolId,
  config,
  onApply,
}: {
  toolId: string;
  config: PresetConfig;
  onApply: (config: PresetConfig) => void;
}) {
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const planLimit = capabilities.getLimit(null, "saved_presets");

  useEffect(() => platform.presets.subscribe((items) => setPresets(items.filter((item) => item.toolId === toolId))), [toolId]);

  const overLimit = planLimit !== null && presets.length >= planLimit;

  const save = (presetName: string, presetId?: string): SavedPreset | null => {
    const trimmed = presetName.trim();
    if (!trimmed) { setError("Enter a preset name first."); return null; }
    if (presetId === undefined && overLimit) { setError(`Local preset limit reached (${planLimit}). Delete or import fewer before saving another.`); return null; }
    setError("");
    const now = new Date().toISOString();
    const id = presetId ?? (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${toolId}-${Date.now()}`);
    const savedPreset = {
      id,
      toolId,
      name: trimmed.slice(0, 100),
      config,
      createdAt: now,
      updatedAt: now,
      version: 1 as const,
    };
    void platform.presets.save(savedPreset).then((preset) => { setSelected(preset.id); setName(""); });
    return savedPreset;
  };

  const apply = (id: string) => {
    setSelected(id);
    const preset = presets.find((item) => item.id === id);
    if (preset) onApply(preset.config);
  };

  const rename = (preset: SavedPreset) => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Enter a new name first."); return; }
    setError("");
    void platform.presets.save({ ...preset, name: trimmed.slice(0, 100), updatedAt: new Date().toISOString() });
    setName("");
  };

  const duplicate = (preset: SavedPreset) => {
    if (overLimit) { setError(`Local preset limit reached (${planLimit}). Delete one before duplicating.`); return; }
    setError("");
    const now = new Date().toISOString();
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${toolId}-${Date.now()}`;
    void platform.presets.save({ id, toolId, name: `${preset.name} copy`.slice(0, 100), config: preset.config, createdAt: now, updatedAt: now, version: 1 });
  };

  const exportPreset = (preset: SavedPreset) => {
    downloadFile(`devutils-preset-${toolId}-${preset.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.json`, JSON.stringify({ toolId, name: preset.name, config: preset.config } satisfies PresetExport, null, 2), "application/json");
  };

  const importPreset = (file: File) => {
    file.text().then((raw) => {
      try {
        const parsed = parsePresetExport(raw, toolId);
        if (overLimit) { setError(`Local preset limit reached (${planLimit}). Delete one before importing.`); return; }
        setError("");
        const now = new Date().toISOString();
        const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${toolId}-${Date.now()}`;
        void platform.presets.save({ id, toolId, name: parsed.name, config: parsed.config, createdAt: now, updatedAt: now, version: 1 });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the preset file."); }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">My presets</span>
      <span className="font-mono text-[10px] text-zinc-400">{presets.length}/{planLimit ?? "∞"}</span>
      <Select value={selected} onChange={(event) => apply(event.target.value)} className="min-w-36 flex-1 py-1.5 text-[12.5px]">
        <option value="">Choose a local preset…</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </Select>
      <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Preset name" className="w-36 py-1.5 text-[12.5px]" />
      <Btn onClick={() => save(name)} className="py-1.5"><BookmarkPlus size={14} /> Save</Btn>
      {selected && (
        <>
          <Btn variant="ghost" className="px-2 py-1.5" title={`Rename "${presets.find((x) => x.id === selected)?.name ?? ""}" to the name typed above`} onClick={() => { const preset = presets.find((x) => x.id === selected); if (preset) rename(preset); }}><Pencil size={14} /></Btn>
          <Btn variant="ghost" className="px-2 py-1.5" title="Duplicate the selected preset" onClick={() => { const preset = presets.find((x) => x.id === selected); if (preset) duplicate(preset); }}><Copy size={14} /></Btn>
          <Btn variant="ghost" className="px-2 py-1.5" title="Export the selected preset as a JSON file" onClick={() => { const preset = presets.find((x) => x.id === selected); if (preset) exportPreset(preset); }}><Download size={14} /></Btn>
          <Btn variant="ghost" className="px-2 py-1.5" title="Delete the selected preset" onClick={() => { void platform.presets.remove(selected); setSelected(""); }}><Trash2 size={14} /></Btn>
        </>
      )}
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800" title="Import a preset JSON file">
        <Upload size={14} /> Import
        <input type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importPreset(file); event.target.value = ""; }} />
      </label>
      {error && <span className="w-full px-1 text-[11px] text-red-500">{error}</span>}
      <span className="w-full px-1 text-[11px] text-zinc-400">Configuration only. Tool input and sensitive values are never saved.</span>
    </div>
  );
}
'''
p.write_text(NEW_PRESETS, encoding="utf-8")
print("presets.tsx: PresetControl rewritten to full spec (parsePresetExport now from lib)")

# ---------------- 2. src/tools/tool-dev.tsx (JsonTool mount) ----------------
p = root / "src/tools/tool-dev.tsx"
s = p.read_text(encoding="utf-8")
if "PresetControl" in s:
    print("ABORT: tool-dev.tsx already patched")
    sys.exit(1)

s = one(
    s,
    'import { Play, Plus, RefreshCw } from "lucide-react";',
    'import { Play, Plus, RefreshCw } from "lucide-react";\nimport { PresetControl } from "../components/presets";',
    1,
)

JSON_MOUNT = '''      <Panel className="p-4">
        <PresetControl
          toolId="json"
          config={{ tab, path, conv, indent }}
          onApply={(preset) => {
            setTab(String(preset.tab ?? tab));
            setPath(String(preset.path ?? path));
            setConv(String(preset.conv ?? conv));
            setIndent(String(preset.indent ?? indent));
          }}
        />
        <Tabs tabs={JSON_TABS} active={tab} onChange={(next) => {'''
s = one(
    s,
    '      <Panel className="p-4">\n        <Tabs tabs={JSON_TABS} active={tab} onChange={(next) => {',
    JSON_MOUNT,
    1,
)
p.write_text(s, encoding="utf-8")
print("tool-dev.tsx: PresetControl mounted on JsonTool")

# ---------------- 3. src/tools/tool-data.tsx (SqlTool mount) ----------------
p = root / "src/tools/tool-data.tsx"
s = p.read_text(encoding="utf-8")
if "PresetControl" in s:
    print("ABORT: tool-data.tsx already patched")
    sys.exit(1)

s = one(
    s,
    '  formatSql, minifySql, genSqlSampleData, yamlParse, csvParse, diffLines, parseJsonError,\n} from "../lib/engine";',
    '  formatSql, minifySql, genSqlSampleData, yamlParse, csvParse, diffLines, parseJsonError,\n} from "../lib/engine";\nimport { PresetControl } from "../components/presets";',
    1,
)

SQL_MOUNT = '''to: "/diff" }]}>\n      <Panel className="p-4">\n        <PresetControl\n          toolId="sql"\n          config={{ tab, dialect, tName, cols, insTable, insCols, selTable, selCols, selWhere, selLimit, connDb, connHost, connPort, connDbName, connUser, sdRows, sdSeed }}\n          onApply={(preset) => {\n            setTab(String(preset.tab ?? tab));\n            setDialect((preset.dialect ?? dialect) as Dialect);\n            setTName(String(preset.tName ?? tName));\n            setCols(String(preset.cols ?? cols));\n            setInsTable(String(preset.insTable ?? insTable));\n            setInsCols(String(preset.insCols ?? insCols));\n            setSelTable(String(preset.selTable ?? selTable));\n            setSelCols(String(preset.selCols ?? selCols));\n            setSelWhere(String(preset.selWhere ?? selWhere));\n            setSelLimit(String(preset.selLimit ?? selLimit));\n            setConnDb((preset.connDb ?? connDb) as Dialect);\n            setConnHost(String(preset.connHost ?? connHost));\n            setConnPort(String(preset.connPort ?? connPort));\n            setConnDbName(String(preset.connDbName ?? connDbName));\n            setConnUser(String(preset.connUser ?? connUser));\n            setSdRows(String(preset.sdRows ?? sdRows));\n            setSdSeed(String(preset.sdSeed ?? sdSeed));\n          }}\n        />\n        <div className="flex flex-wrap items-end gap-2">'''
s = one(
    s,
    'to: "/diff" }]}>\n      <Panel className="p-4">\n        <div className="flex flex-wrap items-end gap-2">',
    SQL_MOUNT,
    1,
)
p.write_text(s, encoding="utf-8")
print("tool-data.tsx: PresetControl mounted on SqlTool (config-only keys)")

# ---------------- 4. scripts/verify.ts (10 tests) ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "p8b1:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { localPinnedTools, localCollections } from "../src/platform/local-repositories";',
    'import { localPinnedTools, localCollections, localPresets } from "../src/platform/local-repositories";\nimport { parsePresetExport } from "../src/lib/preset-io";',
    1,
)

TESTS = r'''// --- P8 B1: presets — full-spec UI helpers + repo behavior ---
{
  eq("p8b1: anonymous preset limit is 30", capabilities.getLimit(null, "saved_presets"), 30);
  const before = (await localPresets.list()).length;
  const now = new Date().toISOString();
  const mk = (toolId: string, name: string, extra: Record<string, boolean | number | string> = {}) => ({ id: `p8-${toolId}-${name}`, toolId, name, config: { dialect: "PostgreSQL", ...extra }, createdAt: now, updatedAt: now, version: 1 as const });
  await localPresets.save(mk("sql", "prod"));
  await localPresets.save(mk("sql", "prod copy", { seed: "abc" }));
  await localPresets.save(mk("json", "quick"));
  eq("p8b1: list per tool filters", (await localPresets.list("sql")).length, 2);
  eq("p8b1: save persists name and config", (await localPresets.list("sql")).find((x) => x.name === "prod")!.config.dialect, "PostgreSQL");
  await localPresets.save({ ...mk("sql", "renamed"), id: "p8-sql-prod", name: "renamed", updatedAt: now });
  eq("p8b1: rename keeps same id", (await localPresets.list("sql")).some((x) => x.id === "p8-sql-prod" && x.name === "renamed"), true);
  const sensitive = mk("cron", "leaky", { token: "s3cr3t", expression: "*/15 * * * *" });
  await localPresets.save(sensitive);
  const storedLeaky = (await localPresets.list("cron")).find((x) => x.id === sensitive.id);
  eq("p8b1: sanitization strips sensitive keys", "token" in (storedLeaky?.config ?? {}), false);
  let parseThrew = false;
  try { parsePresetExport('{"toolId":"json","name":"x","config":{"a":1}}', "sql"); } catch { parseThrew = true; }
  eq("p8b1: import rejects wrong toolId", parseThrew, true);
  let malformedThrew = false;
  try { parsePresetExport("{not json", "sql"); } catch { malformedThrew = true; }
  eq("p8b1: import rejects malformed JSON", malformedThrew, true);
  const good = parsePresetExport('{"toolId":"sql","name":"shared","config":{"dialect":"MySQL"}}', "sql");
  eq("p8b1: import parse keeps safe config", good.config.dialect, "MySQL");
  await localPresets.remove("p8-sql-prod copy");
  eq("p8b1: delete removes only the target", (await localPresets.list("sql")).some((x) => x.id === "p8-sql-prod copy"), false);
  for (const id of ["p8-sql-prod", "p8-sql-prod copy", "p8-json-quick", "p8-cron-leaky"]) await localPresets.remove(id);
  eq("p8b1: cleanup restores count", (await localPresets.list()).length, before);
}

'''
anchor = '(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();'
s = one(s, anchor, anchor + "\n\n" + TESTS, 1)
p.write_text(s, encoding="utf-8")
print("verify.ts: +10 preset regression tests")
print("PATCH OK — expect 276 passed, 0 failed (266 + 10)")
