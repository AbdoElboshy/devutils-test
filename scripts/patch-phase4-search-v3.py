#!/usr/bin/env python3
"""Phase 4 patch v3 — search no-result suggestions (fuzzy did-you-mean).

1. search.ts: append suggestFallback(query, limit) — pure token-overlap +
   subsequence scoring over tool names/categories; reason "fuzzy suggestion".
2. chrome.tsx: when searchDiscovery(q) returns 0 hits, fall back to
   suggestFallback(q, 5) inside the existing hits useMemo — keyboard nav,
   Enter, tracking, and the reason badge all work unchanged.
3. App.tsx: NotFound gains optional onNav + 3 category quick-links (no dead
   ends). onNav is OPTIONAL because ToolView's degenerate default case has
   no navigation callback in scope; the quick-links simply do not render
   there. All three call sites stay valid.
4. verify.ts: 3 new assertions ("P4: search no-result suggestions") -> 226/0.

Idempotent; aborts loudly (exit 1) if any anchor is missing.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEARCH_PATH = ROOT / "src" / "lib" / "search.ts"
CHROME_PATH = ROOT / "src" / "components" / "chrome.tsx"
APP_PATH = ROOT / "src" / "App.tsx"
VERIFY_PATH = ROOT / "scripts" / "verify.ts"

SEARCH_APPEND = '''
export function suggestFallback(query: string, suggestLimit = 5): DiscoveryHit[] {
  const q = query.trim();
  if (!q) return [];
  const tokens = q.toLowerCase().split(/[\\s\\W]+/).filter((t) => t.length > 1);
  const score = (title: string) => {
    const lower = title.toLowerCase();
    let s = 0;
    tokens.forEach((token) => {
      if (lower.includes(token)) s += 10;
      let i = 0;
      for (const ch of lower) {
        if (ch === token[i]) i += 1;
        if (i === token.length) break;
      }
      if (i === token.length) s += 3;
    });
    return s;
  };
  const toolHits = searchTools("", 500).map(({ tool }) => ({
    id: tool.id, kind: "tool" as const, title: tool.name, description: tool.description,
    route: tool.route, score: score(tool.name), reason: "fuzzy suggestion",
  })).filter((h) => h.score > 0);
  const catHits = CATEGORIES.map((category) => ({
    id: `category:${category.id}`, kind: "category" as const, title: category.name,
    description: category.description, route: `/categories/${category.slug}`,
    score: score(category.name), reason: "fuzzy suggestion",
  })).filter((h) => h.score > 0);
  return [...toolHits, ...catHits].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, suggestLimit);
}
'''

CHROME_IMPORT_OLD = 'import { searchDiscovery, toolDiscoveryHit, type DiscoveryHit } from "../lib/search";'
CHROME_IMPORT_NEW = 'import { searchDiscovery, suggestFallback, toolDiscoveryHit, type DiscoveryHit } from "../lib/search";'

CHROME_HITS_OLD = "    return searchDiscovery(q, 12);\n  }, [q, recents, favs]);"
CHROME_HITS_NEW = (
    "    const exact = searchDiscovery(q, 12);\n"
    "    return exact.length ? exact : suggestFallback(q, 5);\n"
    "  }, [q, recents, favs]);"
)

CHROME_TRACK_OLD = "    if (!open || !q.trim() || hits.length) return;"
CHROME_TRACK_NEW = "    if (!open || !q.trim() || (hits.length > 0 && hits.some((h) => h.reason !== \"fuzzy suggestion\"))) return;"

APP_CASE_OLD = 'case "not-found": return <NotFound onSearch={onSearch} />;'
APP_CASE_NEW = 'case "not-found": return <NotFound onSearch={onSearch} onNav={onNav} />;'

APP_DEFAULT_OLD = 'default: return <NotFound onSearch={onSearch} />;'
APP_DEFAULT_NEW = 'default: return <NotFound onSearch={onSearch} onNav={onNav} />;'

# ToolView's degenerate default (line ~292): noop onSearch, no onNav in scope.
# Fixed AFTER the required-prop change lands, so it is a separate anchor.
APP_TOOLVIEW_DEFAULT_OLD = 'default: return <NotFound onSearch={() => {}} />;'
APP_TOOLVIEW_DEFAULT_NEW = 'default: return <NotFound onSearch={() => {}} />;'

APP_SIG_OLD = "function NotFound({ onSearch }: { onSearch: () => void }) {"
APP_SIG_NEW = "function NotFound({ onSearch, onNav }: { onSearch: () => void; onNav?: (p: string) => void }) {"

APP_CTA_OLD = (
    "        <Search size={15} /> Search DevUtils\n"
    "      </button>\n"
    "    </div>"
)
APP_CTA_NEW = (
    "        <Search size={15} /> Search DevUtils\n"
    "      </button>\n"
    "      {onNav && (\n"
    "        <>\n"
    "          <p className=\"mt-6 text-[12px] font-bold uppercase tracking-wide text-zinc-400\">Browse categories</p>\n"
    "          <div className=\"mt-2 flex flex-wrap justify-center gap-1.5\">\n"
    "            {CATEGORIES.slice(0, 3).map((c) => <Chip key={c.id} label={c.name} onClick={() => onNav(`/categories/${c.slug}`)} />)}\n"
    "          </div>\n"
    "        </>\n"
    "      )}\n"
    "    </div>"
)

VERIFY_IMPORT_OLD = 'import { searchDiscovery } from "../src/lib/search";'
VERIFY_IMPORT_NEW = 'import { searchDiscovery, suggestFallback } from "../src/lib/search";'

VERIFY_BLOCK = """
// --- P4: search no-result suggestions ---
{
  eq("suggest: typo query returns suggestions", suggestFallback("jso").length > 0, true);
  eq("suggest: json typo still suggests json tools", suggestFallback("jsn").some((h) => h.title.toLowerCase().includes("json")), true);
  eq("suggest: pure gibberish returns none", suggestFallback("zzzzqqq").length, 0);
}
"""


def die(msg):
    print(f"ABORT: {msg}")
    sys.exit(1)


def replace_once(text, old, new, what):
    n = text.count(old)
    if n != 1:
        die(f"{what}: anchor found {n} times (expected 1)")
    return text.replace(old, new, 1)


def main():
    s = SEARCH_PATH.read_text(encoding="utf-8")
    if "suggestFallback" in s:
        print("1: search.ts already patched (idempotent)")
    else:
        for needed in ("searchTools", "CATEGORIES", "DiscoveryHit"):
            if needed not in s:
                die(f"search.ts missing symbol: {needed}")
        s = s.rstrip() + "\n" + SEARCH_APPEND
        SEARCH_PATH.write_text(s, encoding="utf-8")
        print("1: search.ts suggestFallback appended")

    c = CHROME_PATH.read_text(encoding="utf-8")
    if "suggestFallback" in c:
        print("2: chrome.tsx already patched (idempotent)")
    else:
        c = replace_once(c, CHROME_IMPORT_OLD, CHROME_IMPORT_NEW, "chrome import")
        c = replace_once(c, CHROME_HITS_OLD, CHROME_HITS_NEW, "chrome hits memo")
        c = replace_once(c, CHROME_TRACK_OLD, CHROME_TRACK_NEW, "chrome failure tracking")
        CHROME_PATH.write_text(c, encoding="utf-8")
        print("2: chrome.tsx palette falls back to suggestions on zero hits")

    a = APP_PATH.read_text(encoding="utf-8")
    if "Browse categories" in a:
        print("3: App.tsx already patched (idempotent)")
    else:
        a = replace_once(a, APP_CASE_OLD, APP_CASE_NEW, "RouteView not-found case")
        a = replace_once(a, APP_DEFAULT_OLD, APP_DEFAULT_NEW, "RouteView default case")
        a = replace_once(a, APP_SIG_OLD, APP_SIG_NEW, "NotFound signature")
        a = replace_once(a, APP_CTA_OLD, APP_CTA_NEW, "NotFound CTA block")
        for needed in ("CATEGORIES", "Chip"):
            if needed not in a:
                die(f"App.tsx missing symbol: {needed}")
        APP_PATH.write_text(a, encoding="utf-8")
        print("3: App.tsx NotFound optional onNav + category quick-links added")

    v = VERIFY_PATH.read_text(encoding="utf-8")
    if "P4: search no-result suggestions" in v:
        print("4: verify.ts already patched (idempotent)")
    else:
        v = replace_once(v, VERIFY_IMPORT_OLD, VERIFY_IMPORT_NEW, "verify search import")
        tally = "console.log(`\\n${pass} passed, ${fail} failed`);"
        if v.count(tally) != 1:
            die("verify.ts tally anchor not found (or found more than once)")
        v = v.replace(tally, VERIFY_BLOCK + "\n" + tally, 1)
        VERIFY_PATH.write_text(v, encoding="utf-8")
        print("4: verify.ts suggestions block added (3 new assertions)")

    print("patch complete: expect tsc silent + verify 226/0 + build green")


if __name__ == "__main__":
    main()
