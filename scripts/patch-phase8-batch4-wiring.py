#!/usr/bin/env python3
"""Phase 8 Batch 4 (v2): wire orphaned account sections + quota awareness.

v2 fix vs v1: v1 used summary.workflowRuns as the "used" count for the
saved_workflows limit - wrong metric (runs executed != saved count). v2's
quotaStatus takes explicit counts (savedWorkflows from the page state,
apiRequests/workflowRuns from the usage summary) and only reports metrics
it has real data for.

Audit (master 8dadfc7): account.tsx fully implements api-keys, usage,
billing, and security sections in its render tree but they are absent from
the nav `sections` array. Icons (KeyRound, Gauge, Shield, AlertTriangle)
are already imported.

Changes:
1. src/pages/account.tsx - add 4 nav entries after the presets entry.
2. src/lib/quota.ts (NEW, pure) - quotaStatus({savedWorkflows, workflowRuns,
   apiRequests}, planId) -> QuotaStatus[] (kind: ok | near(>=80%) | over).
3. src/pages/workflows.tsx - quota badge under the header (signed-in only),
   driven by saved.length + platform.usage.summary() + plan limits.
4. scripts/verify.ts - +9 p8b4 tests.

Anchors (all verified against master 8dadfc7):
- account.tsx: '  { id: "presets", label: "Presets", icon: Bookmark },'
- workflows.tsx: 'import { recordRun, listRuns, clearRuns, type WorkflowRunLog } from "../lib/workflow-history";'
- workflows.tsx: '  const [runs, setRuns] = useState<WorkflowRunLog[]>([]);'
- workflows.tsx: '  useEffect(() => { setRuns(listRuns(selected.id)); }, [selected.id]);'
- workflows.tsx: '        <PrivacyBadge local />'
- verify.ts: 'import { recordRun, listRuns, clearRuns, clearAllRuns } from "../src/lib/workflow-history";'
- verify.ts: '  eq("p8b3: clearAll empties history", listRuns("wf-other").length, 0);\n}'

Idempotency: account.tsx aborts if 'id: "api-keys"' present;
workflows.tsx aborts if "QuotaBadge" present; verify.ts aborts on "p8b4:".
"""
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent


def one(s, old, new, n=1):
    c = s.count(old)
    assert c == n, "anchor found {}x (expected {}): {!r}".format(c, n, old[:70])
    return s.replace(old, new, n)


# ---------------- 1. account.tsx nav entries ----------------
p = root / "src/pages/account.tsx"
s = p.read_text(encoding="utf-8")
if 'id: "api-keys"' in s:
    print("ABORT: account.tsx already has api-keys nav entry")
    sys.exit(1)
assert '  { id: "presets", label: "Presets", icon: Bookmark },' in s, "nav anchor missing"

s = one(
    s,
    '  { id: "presets", label: "Presets", icon: Bookmark },',
    '''  { id: "presets", label: "Presets", icon: Bookmark },
  { id: "api-keys", label: "API keys", icon: KeyRound },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "billing", label: "Billing", icon: Shield },
  { id: "security", label: "Security", icon: AlertTriangle },''',
    1,
)
p.write_text(s, encoding="utf-8")
print("account.tsx: api-keys/usage/billing/security added to nav")

# ---------------- 2. src/lib/quota.ts (new, pure) ----------------
p = root / "src/lib/quota.ts"
if p.exists():
    print("ABORT: quota.ts already exists")
    sys.exit(1)

QUOTA = '''// Quota awareness - pure formatting of counts vs plan limits. No IO.
import { PLANS, capabilities, type PlanId } from "../platform/features";

export type QuotaKind = "ok" | "near" | "over";

export type QuotaStatus = { metric: string; used: number; limit: number | null; kind: QuotaKind };

export type QuotaCounts = {
  savedWorkflows: number;
  workflowRuns: number;
  apiRequests: number;
};

const NEAR_THRESHOLD = 0.8;

function classify(used: number, limit: number | null): QuotaKind {
  if (limit === null) return "ok";
  if (used >= limit) return "over";
  if (limit > 0 && used / limit >= NEAR_THRESHOLD) return "near";
  return "ok";
}

/** Derive quota statuses from explicit counts and the effective plan. */
export function quotaStatus(counts: QuotaCounts, planId: PlanId | null): QuotaStatus[] {
  const plan = PLANS[planId ?? capabilities.getPlan(null)];
  const entries: { metric: string; used: number; limit: number | null }[] = [
    { metric: "workflows saved", used: counts.savedWorkflows, limit: plan.limits.saved_workflows },
    { metric: "workflow runs", used: counts.workflowRuns, limit: null },
    { metric: "API requests", used: counts.apiRequests, limit: plan.limits.api_requests_per_month },
  ];
  return entries.map((entry) => ({ ...entry, kind: classify(entry.used, entry.limit) }));
}

export function quotaLabel(entry: QuotaStatus): string {
  if (entry.limit === null) return `${entry.metric}: ${entry.used} (no cap)`;
  return `${entry.metric}: ${entry.used}/${entry.limit}`;
}
'''
p.write_text(QUOTA, encoding="utf-8")
print("quota.ts: pure quota formatting lib written (v2: explicit counts)")

# ---------------- 3. workflows.tsx quota badge ----------------
p = root / "src/pages/workflows.tsx"
s = p.read_text(encoding="utf-8")
if "QuotaBadge" in s:
    print("ABORT: workflows.tsx already has QuotaBadge")
    sys.exit(1)
assert 'import { recordRun, listRuns, clearRuns, type WorkflowRunLog } from "../lib/workflow-history";' in s, "history import anchor missing"

s = one(
    s,
    'import { recordRun, listRuns, clearRuns, type WorkflowRunLog } from "../lib/workflow-history";',
    'import { recordRun, listRuns, clearRuns, type WorkflowRunLog } from "../lib/workflow-history";\nimport { quotaStatus, quotaLabel, type QuotaStatus } from "../lib/quota";',
    1,
)
s = one(
    s,
    '  const [runs, setRuns] = useState<WorkflowRunLog[]>([]);',
    '  const [runs, setRuns] = useState<WorkflowRunLog[]>([]);\n  const [quota, setQuota] = useState<QuotaStatus[]>([]);',
    1,
)
s = one(
    s,
    '  useEffect(() => { setRuns(listRuns(selected.id)); }, [selected.id]);',
    '  useEffect(() => { setRuns(listRuns(selected.id)); }, [selected.id]);\n  useEffect(() => {\n    if (!auth.user || !platform.usage) return;\n    void platform.usage.summary(auth.user.id)\n      .then((summary) => setQuota(quotaStatus({ savedWorkflows: saved.length, workflowRuns: summary.workflowRuns, apiRequests: summary.apiRequests }, auth.user?.planId ?? null)))\n      .catch(() => setQuota([]));\n  }, [auth.user?.id, saved.length]);',
    1,
)
s = one(
    s,
    '        <PrivacyBadge local />',
    '''        <PrivacyBadge local />
        {quota.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quota.map((entry) => (
              <span key={entry.metric} className={cn("rounded-full border px-2 py-0.5 text-[10.5px] font-medium", entry.kind === "over" ? "border-red-300 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" : entry.kind === "near" ? "border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400" : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400")}>{quotaLabel(entry)}</span>
            ))}
          </div>
        )}''',
    1,
)
p.write_text(s, encoding="utf-8")
print("workflows.tsx: quota badge wired (saved count + usage summary)")

# ---------------- 4. verify.ts (+9 tests) ----------------
p = root / "scripts/verify.ts"
s = p.read_text(encoding="utf-8")
if "p8b4:" in s:
    print("ABORT: verify.ts already patched")
    sys.exit(1)

s = one(
    s,
    'import { recordRun, listRuns, clearRuns, clearAllRuns } from "../src/lib/workflow-history";',
    'import { recordRun, listRuns, clearRuns, clearAllRuns } from "../src/lib/workflow-history";\nimport { quotaStatus, quotaLabel } from "../src/lib/quota";',
    1,
)

TESTS = r'''
// --- P8 B4: quota awareness formatting ---
{
  const counts = { savedWorkflows: 0, workflowRuns: 0, apiRequests: 0 };
  const anon = quotaStatus(counts, "anonymous");
  eq("p8b4: anonymous saved workflows limit is 12", anon.find((e) => e.metric === "workflows saved")!.limit, 12);
  eq("p8b4: anonymous api requests limit is 0 (api disabled)", anon.find((e) => e.metric === "API requests")!.limit, 0);
  eq("p8b4: workflow runs have no cap", anon.find((e) => e.metric === "workflow runs")!.limit, null);
  const free = quotaStatus({ ...counts, savedWorkflows: 10 }, "free");
  eq("p8b4: free saved workflows limit is 25", free.find((e) => e.metric === "workflows saved")!.limit, 25);
  eq("p8b4: 10/25 is ok", free.find((e) => e.metric === "workflows saved")!.kind, "ok");
  const near = quotaStatus({ ...counts, savedWorkflows: 21 }, "free");
  eq("p8b4: 21/25 crosses near threshold", near.find((e) => e.metric === "workflows saved")!.kind, "near");
  const over = quotaStatus({ ...counts, savedWorkflows: 25 }, "free");
  eq("p8b4: 25/25 is over", over.find((e) => e.metric === "workflows saved")!.kind, "over");
  const pro = quotaStatus({ ...counts, savedWorkflows: 900 }, "pro");
  eq("p8b4: pro saved workflows unlimited", pro.find((e) => e.metric === "workflows saved")!.limit, null);
  eq("p8b4: uncapped label formatting", quotaLabel({ metric: "workflow runs", used: 900, limit: null, kind: "ok" }).includes("no cap"), true);
}
'''
s = one(
    s,
    '  eq("p8b3: clearAll empties history", listRuns("wf-other").length, 0);\n}',
    '  eq("p8b3: clearAll empties history", listRuns("wf-other").length, 0);\n}\n' + TESTS,
    1,
)
p.write_text(s, encoding="utf-8")
print("verify.ts: +9 quota regression tests")
print("PATCH 4 OK — expect 311 passed, 0 failed (302 + 9)")
