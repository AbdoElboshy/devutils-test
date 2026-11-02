#!/usr/bin/env python3
"""Phase 8 Batch 2, part B of 2: rewrite src/pages/workflows.tsx.

Requires part A first (workflow-io.ts, workflow-versions.ts, verify tests).

Preserves every existing behavior of the current page (verified against
master 2ed2015): template library, favorites, save-to-local with plan limit,
run with per-step timings, usage consume, sample inputs, related tools,
privacy badge. Adds:
  - New workflow / Duplicate / Export / Import
  - Edit mode: per-step label, operation select, config JSON, move up/down,
    remove, add step (max 20 enforced by validation)
  - Pre-run and pre-save static validation (validateSteps)
  - Version history: snapshot on replace, list, one-click rollback (max 5)

Idempotent: aborts if "startNew" already present. Sanity-checks that the
current file is the known version before rewriting.
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent

p = root / "src/pages/workflows.tsx"
s = p.read_text(encoding="utf-8")
if "startNew" in s:
    print("ABORT: workflows.tsx already upgraded")
    sys.exit(1)
assert "export function WorkflowsPage" in s, "unexpected workflows.tsx"
assert "Chain deterministic DevUtils operations." in s, "unexpected workflows.tsx"

NEW_PAGE = '''import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookmarkPlus, Check, Copy, Download, Pencil, Play, Plus, Star, Trash2, Upload, Workflow as WorkflowIcon, X } from "lucide-react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../data/workflows";
import { displayWorkflowValue, executeWorkflow, type WorkflowRun } from "../platform/workflows";
import { capabilities, platform, operations, type SavedWorkflow } from "../platform";
import { useAuth } from "../platform/auth-context";
import { TOOL_MAP } from "../lib/registry";
import { validateSteps, serializeWorkflowExport, parseWorkflowExport, MAX_WORKFLOW_STEPS } from "../lib/workflow-io";
import { snapshotVersion, listVersions, clearVersions, type WorkflowVersionRecord } from "../lib/workflow-versions";
import { downloadFile } from "../lib/engine";
import { Btn, CodeArea, CopyBtn, ErrorCallout, Panel, PrivacyBadge, TextInput } from "../components/ui";
import { cn } from "../utils/cn";

type DraftStep = { id: string; operationId: string; label: string; configText: string };

export function WorkflowsPage({ onNav }: { onNav: (route: string) => void }) {
  const auth = useAuth();
  const [saved, setSaved] = useState<SavedWorkflow[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(WORKFLOW_TEMPLATES[0].id);
  const [input, setInput] = useState(WORKFLOW_TEMPLATES[0].sampleInput);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftStep[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [versions, setVersions] = useState<WorkflowVersionRecord[]>([]);

  const knownOperationIds = useMemo(() => operations.list().map((op) => op.id), []);
  const selected = useMemo<SavedWorkflow>(() => {
    return WORKFLOW_TEMPLATES.find((item) => item.id === selectedId)
      ?? saved.find((item) => item.id === selectedId)
      ?? WORKFLOW_TEMPLATES[0];
  }, [saved, selectedId]);
  const selectedTemplate = WORKFLOW_TEMPLATES.find((item) => item.id === selected.id);

  useEffect(() => platform.workflows.subscribe(setSaved), []);
  useEffect(() => platform.favorites.subscribe((items) => setFavoriteIds(items.filter((item) => item.kind === "workflow").map((item) => item.targetId))), []);
  useEffect(() => { setVersions(listVersions(selected.id)); }, [selected.id, saved]);

  const choose = (workflow: SavedWorkflow, template?: WorkflowTemplate) => {
    setSelectedId(workflow.id);
    setInput(template?.sampleInput ?? WORKFLOW_TEMPLATES.find((item) => item.id === workflow.id)?.sampleInput ?? input);
    setRun(null);
    setError("");
    setEditing(false);
  };

  const startNew = () => {
    setEditing(true);
    setRun(null);
    setError("");
    setDraftName("My workflow");
    setDraftDescription("");
    setDraft([{ id: "s1", operationId: "json.validate", label: "Validate JSON", configText: "" }]);
  };

  const startEdit = () => {
    setEditing(true);
    setRun(null);
    setError("");
    setDraftName(selected.name);
    setDraftDescription(selected.description);
    setDraft(selected.steps.map((step) => ({ id: step.id, operationId: step.operationId, label: step.label, configText: step.config ? JSON.stringify(step.config) : "" })));
  };

  const saveDraft = async () => {
    let steps: SavedWorkflow["steps"] = [];
    try {
      steps = draft.map((step) => {
        const configText = step.configText.trim();
        const config = configText ? JSON.parse(configText) as Record<string, boolean | number | string> : undefined;
        return { id: step.id, operationId: step.operationId, label: step.label.trim(), ...(config ? { config } : {}) };
      });
    } catch { setError("Step config must be valid JSON with string, number or boolean values."); return; }
    const issues = validateSteps(steps, knownOperationIds);
    if (issues.length) { setError(issues.slice(0, 3).map((issue) => `Step ${issue.index + 1}: ${issue.message}`).join(" ")); return; }
    if (!draftName.trim()) { setError("Workflow needs a name."); return; }
    const existing = saved.find((item) => item.id === selected.id);
    const isTemplate = Boolean(selectedTemplate);
    const id = existing && !isTemplate ? existing.id : `wf-${Date.now()}`;
    if (isTemplate || !existing) {
      const limit = capabilities.getLimit(null, "saved_workflows");
      if (limit !== null && saved.length >= limit) { setError(`Local workflow limit reached (${limit}). Delete one first.`); return; }
    }
    if (existing) snapshotVersion(existing);
    const now = new Date().toISOString();
    await platform.workflows.save({ id, name: draftName.trim().slice(0, 100), description: draftDescription.trim().slice(0, 500), steps, source: "custom", createdAt: existing?.createdAt ?? now, updatedAt: now, version: 1 });
    setSelectedId(id);
    setEditing(false);
    setError("");
  };

  const duplicate = async () => {
    const limit = capabilities.getLimit(null, "saved_workflows");
    if (limit !== null && saved.length >= limit) { setError(`Local workflow limit reached (${limit}). Delete one first.`); return; }
    const now = new Date().toISOString();
    const id = `wf-${Date.now()}`;
    await platform.workflows.save({ ...selected, id, name: `${selected.name} copy`.slice(0, 100), source: "custom", createdAt: now, updatedAt: now, version: 1 });
    setSelectedId(id);
    setError("");
  };

  const saveLocally = async () => {
    const limit = capabilities.getLimit(null, "saved_workflows");
    if (limit !== null && saved.length >= limit && !saved.some((item) => item.id === selected.id)) {
      setError(`Local workflow limit reached (${limit}). Delete one before saving another.`);
      return;
    }
    const existing = saved.find((item) => item.id === selected.id);
    if (existing) snapshotVersion(existing);
    const now = new Date().toISOString();
    await platform.workflows.save({ ...selected, source: selected.source, createdAt: selected.createdAt || now, updatedAt: now, version: 1 });
  };

  const exportWorkflow = () => {
    downloadFile(`devutils-workflow-${selected.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.json`, JSON.stringify(serializeWorkflowExport(selected), null, 2), "application/json");
  };

  const importWorkflow = (file: File) => {
    file.text().then((raw) => {
      try {
        const imported = parseWorkflowExport(raw);
        const limit = capabilities.getLimit(null, "saved_workflows");
        if (limit !== null && saved.length >= limit) { setError(`Local workflow limit reached (${limit}). Delete one first.`); return; }
        void platform.workflows.save(imported).then(() => { setSelectedId(imported.id); setEditing(false); setError(""); });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the workflow file."); }
    });
  };

  const rollback = async (record: WorkflowVersionRecord) => {
    const current = saved.find((item) => item.id === record.workflowId);
    if (current) snapshotVersion(current);
    await platform.workflows.save({ ...record.workflow, updatedAt: new Date().toISOString() });
    setVersions(listVersions(record.workflowId));
  };

  const execute = async () => {
    const issues = validateSteps(selected.steps, knownOperationIds);
    if (issues.length) { setError(issues.slice(0, 3).map((issue) => `Step ${issue.index + 1}: ${issue.message}`).join(" ")); return; }
    setRunning(true);
    setError("");
    setRun(null);
    try {
      setRun(await executeWorkflow(selected, input));
      if (auth.user && platform.usage) void platform.usage.consume(auth.user.id, "workflow_runs", 1, selected.id).catch(() => undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workflow failed."); }
    finally { setRunning(false); }
  };

  const output = run ? displayWorkflowValue(run.output) : "";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <WorkflowIcon size={21} className="text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Workflows</h1>
          </div>
          <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-zinc-500">
            Chain deterministic DevUtils operations. Workflows and configuration are saved locally; inputs and results are never persisted.
          </p>
        </div>
        <PrivacyBadge local />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Panel className="p-3">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">Workflow library</p>
            <div className="mt-2 space-y-1">
              {WORKFLOW_TEMPLATES.map((workflow) => (
                <WorkflowChoice key={workflow.id} workflow={workflow} active={selected.id === workflow.id} favorite={favoriteIds.includes(workflow.id)}
                  onChoose={() => choose(workflow, workflow)} onFavorite={() => { void platform.favorites.toggle("workflow", workflow.id); }} />
              ))}
            </div>
          </Panel>
          <Panel className="p-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Saved locally</p>
              <span className="font-mono text-[10px] text-zinc-400">{saved.length}/{capabilities.getLimit(null, "saved_workflows") ?? "∞"}</span>
            </div>
            <div className="mt-2 space-y-1">
              {saved.map((workflow) => (
                <div key={workflow.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => choose(workflow)} className={cn("min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold", selected.id === workflow.id ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}>{workflow.name}</button>
                  <button type="button" onClick={() => { void platform.workflows.remove(workflow.id); }} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950" aria-label={`Delete ${workflow.name}`}><Trash2 size={13} /></button>
                </div>
              ))}
              {!saved.length && <p className="px-2 py-3 text-[12px] leading-relaxed text-zinc-500">Save a library workflow or build your own on the right.</p>}
            </div>
          </Panel>
          {!selectedTemplate && versions.length > 0 && (
            <Panel className="p-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Version history</p>
                <button type="button" className="text-[10px] text-zinc-400 hover:text-red-500" onClick={() => { clearVersions(selected.id); setVersions([]); }}>Clear</button>
              </div>
              <div className="mt-2 space-y-1">
                {versions.map((record) => (
                  <div key={record.version} className="flex items-center gap-1">
                    <span className="flex-1 px-2 text-[11.5px] text-zinc-500">v{record.version} · {record.workflow.name}</span>
                    <button type="button" onClick={() => { void rollback(record); }} className="rounded-md px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40">Restore</button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </aside>

        <Panel className="p-4 sm:p-5">
          {editing ? (
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Name</p><TextInput value={draftName} onChange={(e) => setDraftName(e.target.value)} /></div>
                <div><p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Description</p><TextInput value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} /></div>
              </div>
              <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-zinc-400">Steps ({draft.length}/{MAX_WORKFLOW_STEPS})</p>
              <div className="mt-2 space-y-2">
                {draft.map((step, index) => (
                  <div key={step.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-400">{index + 1}</span>
                      <TextInput value={step.label} onChange={(e) => setDraft(draft.map((s2) => s2.id === step.id ? { ...s2, label: e.target.value } : s2))} placeholder="Step label" className="min-w-32 flex-1 py-1.5 text-[12.5px]" />
                      <select value={step.operationId} onChange={(e) => setDraft(draft.map((s2) => s2.id === step.id ? { ...s2, operationId: e.target.value } : s2))} className="min-w-40 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-[12.5px] dark:border-zinc-700 dark:bg-zinc-900">
                        {operations.list().map((op) => <option key={op.id} value={op.id}>{op.title}</option>)}
                      </select>
                      <button type="button" disabled={index === 0} onClick={() => { const next = draft.slice(); const [moved] = next.splice(index, 1); next.splice(index - 1, 0, moved); setDraft(next); }} className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" aria-label="Move up"><ArrowUp size={13} /></button>
                      <button type="button" disabled={index === draft.length - 1} onClick={() => { const next = draft.slice(); const [moved] = next.splice(index, 1); next.splice(index + 1, 0, moved); setDraft(next); }} className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" aria-label="Move down"><ArrowDown size={13} /></button>
                      <button type="button" onClick={() => setDraft(draft.filter((s2) => s2.id !== step.id))} className="rounded-md p-1.5 text-zinc-400 hover:text-red-500" aria-label="Remove step"><X size={13} /></button>
                    </div>
                    <textarea value={step.configText} onChange={(e) => setDraft(draft.map((s2) => s2.id === step.id ? { ...s2, configText: e.target.value } : s2))} rows={2} placeholder='Optional config JSON, e.g. {"indent": 4}' className="mt-2 w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-[11.5px] dark:border-zinc-700 dark:bg-zinc-900" />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn disabled={draft.length >= MAX_WORKFLOW_STEPS} onClick={() => setDraft([...draft, { id: `s-${Date.now()}`, operationId: "json.format", label: "", configText: "" }])}><Plus size={14} /> Add step</Btn>
                <Btn variant="primary" onClick={saveDraft}><Check size={14} /> Save workflow</Btn>
                <Btn variant="ghost" onClick={() => { setEditing(false); setError(""); }}>Cancel</Btn>
              </div>
              {error && <div className="mt-3"><ErrorCallout title="Cannot save workflow" message={error} /></div>}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold">{selected.name}</p>
                  <p className="mt-0.5 text-[13px] text-zinc-500">{selected.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={startNew}><Plus size={14} /> New</Btn>
                  <Btn onClick={duplicate}><Copy size={14} /> Duplicate</Btn>
                  <Btn onClick={startEdit}><Pencil size={14} /> Edit</Btn>
                  <Btn onClick={exportWorkflow}><Download size={14} /> Export</Btn>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" title="Import a workflow JSON file">
                    <Upload size={14} /> Import
                    <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) importWorkflow(file); e.target.value = ""; }} />
                  </label>
                  <Btn onClick={saveLocally}><BookmarkPlus size={14} /> {saved.some((item) => item.id === selected.id) ? "Saved" : "Save locally"}</Btn>
                  <Btn variant="primary" onClick={execute} disabled={running || !input.trim()}><Play size={14} /> {running ? "Running…" : "Run workflow"}</Btn>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Workflow steps">
                {selected.steps.map((step, index) => (
                  <div key={step.id} className="contents">
                    <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                      <span className="mr-1 font-mono text-zinc-400">{index + 1}</span> {step.label}
                    </span>
                    {index < selected.steps.length - 1 && <ArrowDown size={14} className="rotate-[-90deg] text-zinc-300" />}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <CodeArea label="Workflow input" value={input} onChange={setInput} rows={12} placeholder="Paste the starting input…" />
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Final output</p>
                    {output && <CopyBtn text={output} />}
                  </div>
                  {error ? <ErrorCallout title="Workflow stopped" message={error} hint="Fix the input or the highlighted step and run again." /> : (
                    <pre className="editor min-h-[240px] max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-300 bg-zinc-50 p-3.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100">{output || "Run the workflow to see its final output."}</pre>
                  )}
                </div>
              </div>

              {run && (
                <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">Run details</p>
                  <div className="mt-2 space-y-2">
                    {run.steps.map((result) => (
                      <details key={result.step.id} className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold">
                          <Check size={14} className="text-emerald-500" /> {result.step.label}
                          <span className="ml-auto font-mono text-[10px] font-normal text-zinc-400">{result.durationMs.toFixed(1)}ms</span>
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-100 p-2.5 font-mono text-[11.5px] dark:bg-zinc-900">{displayWorkflowValue(result.output)}</pre>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <span className="mr-1 text-[12px] text-zinc-500">Related tools:</span>
                  {selectedTemplate.relatedToolIds.map((id) => TOOL_MAP[id]).filter(Boolean).map((tool) => (
                    <button key={tool.id} type="button" onClick={() => onNav(tool.route)} className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11.5px] font-medium hover:border-emerald-500 dark:border-zinc-700">{tool.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function WorkflowChoice({ workflow, active, favorite, onChoose, onFavorite }: { workflow: WorkflowTemplate; active: boolean; favorite: boolean; onChoose: () => void; onFavorite: () => void }) {
  return (
    <div className={cn("flex items-start gap-1 rounded-lg", active && "bg-emerald-50 dark:bg-emerald-950/40")}>
      <button type="button" onClick={onChoose} className="min-w-0 flex-1 px-2.5 py-2 text-left">
        <span className={cn("block text-[12.5px] font-semibold", active && "text-emerald-800 dark:text-emerald-300")}>{workflow.name}</span>
        <span className="mt-0.5 block line-clamp-2 text-[11.5px] text-zinc-500">{workflow.steps.length} steps · {workflow.category}</span>
      </button>
      <button type="button" onClick={onFavorite} className={cn("mt-1.5 rounded-md p-1.5", favorite ? "text-amber-400" : "text-zinc-300 hover:text-zinc-500")} aria-label={`Favorite ${workflow.name}`}><Star size={13} fill={favorite ? "currentColor" : "none"} /></button>
    </div>
  );
}
'''

p.write_text(NEW_PAGE, encoding="utf-8")
print("workflows.tsx: page rewritten with editor, duplication, import/export, versioning")
print("PATCH B OK — run gates: expect 293 passed, 0 failed (276 + 17)")
