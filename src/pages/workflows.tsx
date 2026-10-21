import { useEffect, useMemo, useState } from "react";
import { ArrowDown, BookmarkPlus, Check, Play, Star, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../data/workflows";
import { displayWorkflowValue, executeWorkflow, type WorkflowRun } from "../platform/workflows";
import { capabilities, platform, type SavedWorkflow } from "../platform";
import { useAuth } from "../platform/auth-context";
import { TOOL_MAP } from "../lib/registry";
import { Btn, CodeArea, CopyBtn, ErrorCallout, Panel, PrivacyBadge } from "../components/ui";
import { cn } from "../utils/cn";

export function WorkflowsPage({ onNav }: { onNav: (route: string) => void }) {
  const auth = useAuth();
  const [saved, setSaved] = useState<SavedWorkflow[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(WORKFLOW_TEMPLATES[0].id);
  const selected = useMemo<SavedWorkflow>(() => {
    return WORKFLOW_TEMPLATES.find((item) => item.id === selectedId)
      ?? saved.find((item) => item.id === selectedId)
      ?? WORKFLOW_TEMPLATES[0];
  }, [saved, selectedId]);
  const selectedTemplate = WORKFLOW_TEMPLATES.find((item) => item.id === selected.id);
  const [input, setInput] = useState(selectedTemplate?.sampleInput ?? "");
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => platform.workflows.subscribe(setSaved), []);
  useEffect(() => platform.favorites.subscribe((items) => setFavoriteIds(items.filter((item) => item.kind === "workflow").map((item) => item.targetId))), []);

  const choose = (workflow: SavedWorkflow, template?: WorkflowTemplate) => {
    setSelectedId(workflow.id);
    setInput(template?.sampleInput ?? WORKFLOW_TEMPLATES.find((item) => item.id === workflow.id)?.sampleInput ?? "");
    setRun(null);
    setError("");
  };

  const execute = async () => {
    setRunning(true);
    setError("");
    setRun(null);
    try {
      setRun(await executeWorkflow(selected, input));
      if (auth.user && platform.usage) void platform.usage.consume(auth.user.id, "workflow_runs", 1, selected.id).catch(() => undefined);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Workflow failed."); }
    finally { setRunning(false); }
  };

  const save = async () => {
    const limit = capabilities.getLimit(null, "saved_workflows");
    if (limit !== null && saved.length >= limit && !saved.some((item) => item.id === selected.id)) {
      setError(`Local workflow limit reached (${limit}). Delete one before saving another.`);
      return;
    }
    const now = new Date().toISOString();
    await platform.workflows.save({ ...selected, source: selected.source, createdAt: selected.createdAt || now, updatedAt: now, version: 1 });
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
              {!saved.length && <p className="px-2 py-3 text-[12px] leading-relaxed text-zinc-500">Save a library workflow to keep its operation sequence on this device.</p>}
            </div>
          </Panel>
        </aside>

        <Panel className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold">{selected.name}</p>
              <p className="mt-0.5 text-[13px] text-zinc-500">{selected.description}</p>
            </div>
            <div className="flex gap-2">
              <Btn onClick={save}><BookmarkPlus size={14} /> {saved.some((item) => item.id === selected.id) ? "Saved" : "Save locally"}</Btn>
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
              {error ? <ErrorCallout title="Workflow stopped" message={error} hint="Completed steps are shown below. Fix the input and run again." /> : (
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