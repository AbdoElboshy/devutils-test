import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Moon, Sun, Monitor, Menu, X, CornerDownLeft, Star, Clock, ChevronRight, Terminal, UserRound, LogOut, ShieldCheck } from "lucide-react";
import { CATEGORIES, TOOLS } from "../lib/registry";
import { searchDiscovery, toolDiscoveryHit, type DiscoveryHit } from "../lib/search";
import { useFavorites, usePreferenceStorage, useRecents } from "./ui";
import { cn } from "../utils/cn";
import { isFeatureEnabled } from "../platform/features";
import { track } from "../lib/analytics";
import { useAuth } from "../platform/auth-context";

export function Logo({ onNav }: { onNav: (p: string) => void }) {
  return (
    <button type="button" onClick={() => onNav("/")} className="flex items-center gap-2.5" aria-label="DevUtils home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 font-mono text-[13px] font-bold text-lime-400 dark:bg-lime-400 dark:text-zinc-950">
        &gt;_
      </span>
      <span className="text-[15px] font-extrabold tracking-tight text-zinc-900 dark:text-white">
        DEV<span className="text-emerald-600 dark:text-lime-400">UTILS</span>
      </span>
    </button>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = usePreferenceStorage<"light" | "dark" | "system">("du:theme", "system");
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  return (
    <button type="button" onClick={() => setTheme(next)} title={`Theme: ${theme} (click for ${next})`}
      className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
      {theme === "light" ? <Sun size={17} /> : theme === "dark" ? <Moon size={17} /> : <Monitor size={17} />}
    </button>
  );
}

export function Header({ route, onNav, onOpenSearch }: { route: string; onNav: (p: string) => void; onOpenSearch: () => void }) {
  const [menu, setMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const auth = useAuth();
  // Convenience only: the gateway re-checks admin role on every privileged call.
  useEffect(() => {
    let active = true;
    if (!auth.user) { setIsAdmin(false); return; }
    import("../platform/admin-api").then(({ fetchAdminMe }) => fetchAdminMe())
      .then(() => { if (active) setIsAdmin(true); })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [auth.user]);
  const links = [
    { label: "Tools", path: "/tools" },
    { label: "Categories", path: "/categories" },
    { label: "DevOps", path: "/categories/devops" },
    ...(isFeatureEnabled("workflows") ? [{ label: "Workflows", path: "/workflows" }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Logo onNav={onNav} />
        <nav className="ml-5 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {links.map((l) => (
            <button key={l.path} type="button" onClick={() => onNav(l.path)}
              className={cn("rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition",
                route === l.path || route.startsWith(l.path + "/")
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")}>
              {l.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={onOpenSearch}
            className="hidden items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[13px] text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700 xl:flex dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200">
            <Search size={14} />
            <span className="w-36 text-left">Search tools…</span>
            <kbd className="kbd">⌘K</kbd>
          </button>
          <button type="button" onClick={onOpenSearch} aria-label="Search"
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 xl:hidden dark:text-zinc-400 dark:hover:bg-zinc-800">
            <Search size={18} />
          </button>
          <ThemeToggle />
          {!auth.loading && (auth.user ? (
            <div className="relative hidden sm:block">
              <button type="button" onClick={() => setAccountMenu(!accountMenu)} aria-expanded={accountMenu} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-lime-300 dark:bg-zinc-100 dark:text-zinc-900" title="Account menu">{(auth.user.displayName || auth.user.email || "U").slice(0, 2).toUpperCase()}</button>
              {accountMenu && <div className="absolute right-0 top-10 w-52 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
                <div className="border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800"><p className="truncate text-[12.5px] font-semibold">{auth.user.displayName || "DevUtils user"}</p><p className="truncate text-[10.5px] text-zinc-400">{auth.user.email}</p></div>
                {[["Dashboard", "/account"], ["Profile", "/account/profile"], ["Favorites", "/account/favorites"], ...(isAdmin ? [["Admin", "/admin"]] as [string, string][] : []), ["Settings", "/account/settings"]].map(([label, path]) => <button key={path} type="button" onClick={() => { onNav(path); setAccountMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-zinc-100 dark:hover:bg-zinc-800">{label === "Admin" && <ShieldCheck size={13} className="text-emerald-600" />}{label}</button>)}
                <button type="button" onClick={() => { void auth.signOut().then(() => onNav("/")); setAccountMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><LogOut size={13} /> Sign out</button>
              </div>}
            </div>
          ) : <button type="button" onClick={() => onNav("/login")} className="hidden rounded-lg border border-zinc-300 px-3 py-1.5 text-[12.5px] font-semibold sm:block dark:border-zinc-700">Sign in</button>)}
          <button type="button" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800">
            {menu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {menu && (
        <nav className="border-t border-zinc-200 px-4 py-2 lg:hidden dark:border-zinc-800" aria-label="Mobile">
          {links.map((l) => (
            <button key={l.path} type="button" onClick={() => { onNav(l.path); setMenu(false); }}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-[14px] font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              {l.label}
            </button>
          ))}
          <button type="button" onClick={() => { onNav(auth.user ? "/account" : "/login"); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"><UserRound size={15} />{auth.user ? "Account" : "Sign in"}</button>
        </nav>
      )}
    </header>
  );
}

export function Footer({ onNav }: { onNav: (p: string) => void }) {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 font-mono text-[11px] font-bold text-lime-400 dark:bg-lime-400 dark:text-zinc-950">&gt;_</span>
            <span className="text-sm font-extrabold tracking-tight">DEVUTILS</span>
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Tiny technical problems. Solved instantly. Most tools run entirely in your browser — no account, no tracking of your input.
          </p>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11.5px] text-zinc-400">
            <Terminal size={12} /> local-first · keyboard-friendly · <span className="text-emerald-600 dark:text-emerald-400">{TOOLS.length} tools</span>
          </p>
        </div>
        {[
          { h: "Popular", items: [["JSON Toolkit", "/json"], ["JWT Decoder", "/jwt"], ["Cron Generator", "/cron"], ["Subnet Calculator", "/subnet"], ["chmod Calculator", "/chmod"]] },
          { h: "DevOps", items: [["All DevOps tools", "/categories/devops"], ["PromQL Builder", "/tools/promql-builder"], ["Grafana tools", "/tools/grafana-dashboard-json-formatter"], ["Zabbix tools", "/tools/zabbix-trigger-expression-builder"], ["LogQL Builder", "/tools/logql-builder"]] },
          { h: "Product", items: [["All tools", "/tools"], ["Categories", "/categories"], ["Workflows", "/workflows"], ["Error Explorer", "/errors"], ["About & Privacy", "/about"]] },
        ].map((col) => (
          <div key={col.h}>
            <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">{col.h}</p>
            <ul className="mt-2.5 space-y-1.5">
              {col.items.map(([label, path]) => (
                <li key={path + label}>
                  <button type="button" onClick={() => onNav(path)} className="text-[13px] text-zinc-600 hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400">{label}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-4 text-[12px] text-zinc-400 sm:px-6">
          <span>DevUtils — built for developers who want answers, not accounts.</span>
          <span className="ml-auto font-mono">all processing local unless labeled</span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- command palette ---------- */

export function CommandPalette({ open, onClose, onNav }: { open: boolean; onClose: () => void; onNav: (p: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { favs } = useFavorites();
  const { recents } = useRecents();

  useEffect(() => {
    if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open ]);

  const hits = useMemo(() => {
    if (!q.trim()) {
      const recentTools = recents.map((id) => toolDiscoveryHit(id, "recent")).filter((item): item is DiscoveryHit => Boolean(item)).slice(0, 4);
      const favTools = favs.map((id) => toolDiscoveryHit(id, "favorite")).filter((item): item is DiscoveryHit => Boolean(item)).slice(0, 4);
      const seen = new Set<string>();
      const out: DiscoveryHit[] = [];
      recentTools.forEach((hit) => { if (!seen.has(hit.id)) { seen.add(hit.id); out.push(hit); } });
      favTools.forEach((hit) => { if (!seen.has(hit.id)) { seen.add(hit.id); out.push(hit); } });
      if (!out.length) return searchDiscovery("", 8);
      return out;
    }
    return searchDiscovery(q, 12);
  }, [q, recents, favs]);

  useEffect(() => { setSel(0); }, [q ]);
  useEffect(() => {
    if (!open || !q.trim() || hits.length) return;
    const timer = window.setTimeout(() => track({ name: "search_used", outcome: "failure" }), 1200);
    return () => window.clearTimeout(timer);
  }, [open, q, hits.length]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && hits[sel]) { track({ name: "search_used", toolId: hits[sel].kind === "tool" ? hits[sel].id : undefined, outcome: "success" }); onNav(hits[sel].route); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hits, sel, onClose, onNav]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search DevUtils">
      <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="pop-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Search size={16} className="shrink-0 text-zinc-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Try: 755 · port 443 · OOMKilled · curl to python · JSON workflow…"
            className="w-full bg-transparent py-3.5 text-[14.5px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            aria-label="Search tools, workflows, categories and errors" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={hits[sel] ? `hit-${hits[sel].id}` : undefined} />
          <kbd className="kbd hidden sm:block">esc</kbd>
        </div>
        <div id="palette-list" role="listbox" className="max-h-[46vh] overflow-auto p-1.5">
          {!q.trim() && (
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
              {hits.some((h) => h.reason) ? "Recent & favorites" : "Popular tools"}
            </p>
          )}
          {hits.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No tool matches “{q}”</p>
              <p className="mt-1 text-[13px] text-zinc-500">Try “json”, “cron”, “chmod”, “subnet” or “jwt”.</p>
            </div>
          )}
          {hits.map((h, i) => (
            <button key={h.id} id={`hit-${h.id}`} role="option" aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => { track({ name: "search_used", toolId: h.kind === "tool" ? h.id : undefined, outcome: "success" }); onNav(h.route); onClose(); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === sel ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 font-mono text-[11px] font-bold text-lime-400 dark:bg-zinc-800 dark:text-lime-300">
                {h.kind === "workflow" ? "WF" : h.kind === "error" ? "ER" : h.kind === "category" ? "CT" : h.title.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100">
                  {h.title}
                  {h.reason === "recent" && <Clock size={12} className="text-zinc-400" />}
                  {h.reason === "favorite" && <Star size={12} className="text-amber-400" />}
                  {h.reason && !["recent", "favorite"].includes(h.reason) && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{h.reason}</span>}
                </span>
                <span className="block truncate text-[12px] text-zinc-500 dark:text-zinc-400">{h.description}</span>
              </span>
              {i === sel && <CornerDownLeft size={14} className="shrink-0 text-zinc-400" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-zinc-200 px-4 py-2.5 text-[11.5px] text-zinc-400 dark:border-zinc-800">
          <span className="flex items-center gap-1"><kbd className="kbd">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> open</span>
          <span className="ml-auto hidden items-center gap-1 sm:flex">categories: {CATEGORIES.length} · tools: {TOOLS.length} <ChevronRight size={12} /></span>
        </div>
      </div>
    </div>
  );
}
