#!/usr/bin/env python3
"""Phase 4 patch v2 — admin sub-section loading states + audit retry.
Idempotent; aborts loudly (exit 1) if any anchor is missing.
Expected: tsc silent, verify 223/0, build green, server 79/79.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN_PATH = ROOT / "src" / "pages" / "admin.tsx"

ANALYTICS_ANCHOR = (
    '      {error && <ErrorCallout title="Analytics unavailable" message={error} '
    'hint="The dashboard never renders fabricated numbers when a query fails." />}\n'
    "      {data && ("
)
ANALYTICS_NEW = ANALYTICS_ANCHOR.replace(
    "      {data && (",
    '      {!data && !error && <Panel className="p-8 text-center text-sm text-zinc-500">Loading analytics…</Panel>}\n'
    "      {data && (",
    1,
)
HEALTH_ANCHOR = (
    '      {error && <ErrorCallout title="Health check failed" message={error} />}\n'
    "      {data && ("
)
HEALTH_NEW = HEALTH_ANCHOR.replace(
    "      {data && (",
    '      {!data && !error && <Panel className="p-8 text-center text-sm text-zinc-500">Running health checks…</Panel>}\n'
    "      {data && (",
    1,
)
AUDIT_OLD = '''function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetchAdminAudit(80).then(setRows).catch((c: unknown) => setError(c instanceof Error ? c.message : "Audit unavailable.")); }, []);'''
AUDIT_NEW = '''function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    setLoading(true);
    fetchAdminAudit(80)
      .then(setRows)
      .catch((c: unknown) => setError(c instanceof Error ? c.message : "Audit unavailable."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);'''
AUDIT_ERROR_OLD = (
    '      {error && <div className="mt-3"><ErrorCallout title="Audit unavailable" message={error} /></div>}\n'
)
AUDIT_ERROR_NEW = (
    '      {error && <div className="mt-3"><ErrorCallout title="Audit unavailable" message={error} /></div>}\n'
    '      {error && <div className="mt-3"><Btn onClick={load}>Retry</Btn></div>}\n'
    '      {loading && !error && <p className="mt-3 text-[13px] text-zinc-500">Loading audit events…</p>}\n'
)
def die(msg: str) -> None:
    print(f"ABORT: {msg}")
    sys.exit(1)

def main() -> None:
    src = ADMIN_PATH.read_text(encoding="utf-8")
    changed = False
    if "Loading analytics…" in src:
        print("1: analytics loading state already present (idempotent)")
    else:
        if src.count(ANALYTICS_ANCHOR) != 1:
            die("analytics anchor not found (or found more than once)")
        src = src.replace(ANALYTICS_ANCHOR, ANALYTICS_NEW, 1)
        changed = True
        print("1: analytics loading panel added")
    if "Running health checks…" in src:
        print("2: health loading state already present (idempotent)")
    else:
        if src.count(HEALTH_ANCHOR) != 1:
            die("health anchor not found (or found more than once)")
        src = src.replace(HEALTH_ANCHOR, HEALTH_NEW, 1)
        changed = True
        print("2: health loading panel added")
    if "Loading audit events…" in src:
        print("3: audit loading + retry already present (idempotent)")
    else:
        if src.count(AUDIT_OLD) != 1:
            die("AuditLog header anchor not found (or found more than once)")
        if src.count(AUDIT_ERROR_OLD) != 1:
            die("AuditLog error-callout anchor not found (or found more than once)")
        for needed in ("useCallback", "Panel", "Btn"):
            if needed not in src:
                die(f"expected import/symbol missing in admin.tsx: {needed}")
        src = src.replace(AUDIT_OLD, AUDIT_NEW, 1)
        src = src.replace(AUDIT_ERROR_OLD, AUDIT_ERROR_NEW, 1)
        changed = True
        print("3: AuditLog converted to stable load() + loading indicator + retry")
    if changed:
        ADMIN_PATH.write_text(src, encoding="utf-8")
        print("patch complete: expect tsc silent + verify 223/0 + build green")
    else:
        print("nothing to do (already fully patched)")

if __name__ == "__main__":
    main()
