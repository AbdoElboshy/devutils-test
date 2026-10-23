// Preset import/export parsing — pure module so it is unit-testable in Node
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
