import { useEffect, useState } from "react";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { platform, type SavedPreset } from "../platform";
import { Btn, Select, TextInput } from "./ui";

export function PresetControl({
  toolId,
  config,
  onApply,
}: {
  toolId: string;
  config: Record<string, boolean | number | string>;
  onApply: (config: Record<string, boolean | number | string>) => void;
}) {
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");

  useEffect(() => platform.presets.subscribe((items) => setPresets(items.filter((item) => item.toolId === toolId))), [toolId]);

  const save = () => {
    const now = new Date().toISOString();
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${toolId}-${Date.now()}`;
    void platform.presets.save({
      id,
      toolId,
      name: name.trim() || `Preset ${presets.length + 1}`,
      config,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }).then((preset) => { setSelected(preset.id); setName(""); });
  };

  const apply = (id: string) => {
    setSelected(id);
    const preset = presets.find((item) => item.id === id);
    if (preset) onApply(preset.config);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">My presets</span>
      <Select value={selected} onChange={(event) => apply(event.target.value)} className="min-w-36 flex-1 py-1.5 text-[12.5px]">
        <option value="">Choose a local preset…</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </Select>
      <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Preset name" className="w-36 py-1.5 text-[12.5px]" />
      <Btn onClick={save} className="py-1.5"><BookmarkPlus size={14} /> Save</Btn>
      {selected && <Btn variant="ghost" className="px-2 py-1.5" title="Delete selected preset" onClick={() => { void platform.presets.remove(selected); setSelected(""); }}><Trash2 size={14} /></Btn>}
      <span className="w-full px-1 text-[11px] text-zinc-400">Configuration only. Tool input and sensitive values are never saved.</span>
    </div>
  );
}