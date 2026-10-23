import { useEffect, useState } from "react";
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
