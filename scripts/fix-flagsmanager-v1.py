#!/usr/bin/env python3
from pathlib import Path
import sys

p = Path("src/pages/admin.tsx")
s = p.read_text(encoding="utf-8")

if "function FlagsManager(" in s:
    print("FlagsManager already present - nothing to do")
    sys.exit(0)

assert "section === \"flags\" ? <FlagsManager registry={registry} />" in s, "render-chain anchor missing"

FLAGS_COMPONENT = '''
/* ------------------------------ Flags & history (Phase 6 WS C/D) ------------------------------ */

function FlagsManager({ registry }: { registry: AdminRegistry }) {
  const [flags, setFlags] = useState<AdminFlag[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toolId, setToolId] = useState("");
  const [history, setHistory] = useState<ToolVersion[] | null>(null);

const loadFlags = useCallback(async () => {
    setError("");
    try { setFlags(await fetchAdminFlags()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Flags unavailable."); }
  }, []);
  useEffect(() => { void loadFlags(); }, [loadFlags]);

const loadHistory = useCallback(async () => {
    if (!toolId) { setHistory(null); return; }
    try { setHistory(await fetchToolHistory(toolId)); } catch (cause) { setError(cause instanceof Error ? cause.message : "History unavailable."); }
  }, [toolId]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

async function toggle(flag: AdminFlag) {
    setError("");
    try {
      await setFeatureFlag(flag.key, !flag.enabled);
      setNotice(`${flag.key} ${!flag.enabled ? "enabled" : "disabled"}.`);
      window.setTimeout(() => setNotice(""), 4000);
      await loadFlags();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Flag update failed."); }
  }

async function restore(versionId: number) {
    setError("");
    try {
      await restoreToolVersion(toolId, versionId);
      setNotice(`Version #${versionId} restored.`);
      window.setTimeout(() => setNotice(""), 4000);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); }
  }

return (
    <div className="space-y-4">
      {error && <ErrorCallout title="Request failed" message={error} hint="Server-side authorization and validation are authoritative." />}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}

<Panel className="overflow-hidden">
        <div className="max-h-[40vh] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Feature flag</th>
                <th scope="col" className="px-3 py-2 font-bold">Default</th>
                <th scope="col" className="px-3 py-2 font-bold">Effective</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {(flags ?? []).map((flag) => (
                <tr key={flag.key} className="border-t border-zinc-100 dark:border-zinc-800/70">
                  <td className="px-3 py-2.5 font-mono text-[12px]">{flag.key}{flag.overridden && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">override</span>}</td>
                  <td className="px-3 py-2.5 text-[12px] text-zinc-500">{String(flag.defaultEnabled)}</td>
                  <td className="px-3 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", flag.enabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")}>{String(flag.enabled)}</span></td>
                  <td className="px-3 py-2.5 text-right"><Btn onClick={() => { void toggle(flag); }}>{flag.enabled ? "Disable" : "Enable"}</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

<Panel className="space-y-3">
        <Field label="Tool version history" hint="Every saved override change is recorded. Restoring re-applies a recorded patch, re-validates the published routes, and audits tool_version_restored.">
          <Select value={toolId} onChange={(e) => setToolId(e.target.value)}>
            <option value="">Select a tool…</option>
            {registry.tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
          </Select>
        </Field>
        {history && (
          <div className="max-h-[30vh] overflow-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
              <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-3 py-2 font-bold">Version</th>
                  <th scope="col" className="px-3 py-2 font-bold">Change</th>
                  <th scope="col" className="px-3 py-2 font-bold">Saved at</th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <tr key={v.id} className="border-t border-zinc-100 dark:border-zinc-800/70">
                    <td className="px-3 py-2.5 font-mono text-[12px]">#{v.id}</td>
                    <td className="px-3 py-2.5 text-[12px]">{v.change_kind}</td>
                    <td className="px-3 py-2.5 text-[12px] text-zinc-500">{new Date(v.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right"><Btn onClick={() => { void restore(v.id); }}>Restore</Btn></td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">No recorded changes for this tool yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
'''

s = s.rstrip("\n") + "\n" + FLAGS_COMPONENT
p.write_text(s, encoding="utf-8")
print("FlagsManager appended")
