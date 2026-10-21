import { useMemo, useState } from "react";
import {
  calcSubnet, splitSubnet, calcSupernet, ipToBinary, ipToInt, intToIp, expandIpv6, compressIpv6, classifyIp,
  hexEncode,
} from "../lib/engine";
import {
  parseCurl, buildCurl, curlToPython, curlToJs, curlToGo, curlToPhp,
  HTTP_STATUSES, parseHeaders, parseUrl, PORTS, type HttpReq,
} from "../lib/blueprints";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Btn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat,
} from "../components/ui";

/* ================= SUBNET ================= */

export function SubnetTool() {
  const tool = TOOL_MAP.subnet;
  const [cidr, setCidr] = useState("192.168.1.0/24");
  const [newPrefix, setNewPrefix] = useState("26");
  const res = useMemo(() => {
    try { return { ok: true as const, v: calcSubnet(cidr) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [cidr]);
  const split = useMemo(() => {
    if (!res.ok) return null;
    try { return { ok: true as const, nets: splitSubnet(res.v.cidr, parseInt(newPrefix) || res.v.prefix) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [res, newPrefix]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Classify an IP", to: "/ip" }, { label: "Look up DNS", to: "/dns" }, { label: "Map ports", to: "/ports" }]}
      onExample={() => setCidr("192.168.1.0/24")}>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Panel className="p-4">
          <Field label="CIDR or IP + mask" hint="e.g. 192.168.1.0/24, 10.0.0.0/8, 172.16.5.4/16">
            <TextInput value={cidr} onChange={(e) => setCidr(e.target.value)} className="font-mono text-[15px]" spellCheck={false} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["10.0.0.0/8", "172.16.0.0/12", "192.168.1.0/24", "192.168.0.0/16", "0.0.0.0/0"].map((c) => (
              <button key={c} type="button" onClick={() => setCidr(c)} className="rounded-lg border border-zinc-200 px-2 py-1 font-mono text-[12px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">{c}</button>
            ))}
          </div>
          {!res.ok && <div className="mt-3"><ErrorCallout title="Invalid CIDR" message={res.err} hint="Format: A.B.C.D/P where each octet is 0–255 and P is 0–32." /></div>}
          {res.ok && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="bg-zinc-900 px-4 py-3 font-mono text-[15px] font-bold text-lime-300 dark:bg-zinc-800">{res.v.cidr}</div>
              <dl className="divide-y divide-zinc-100 text-[13px] dark:divide-zinc-800">
                {[["Network", res.v.network], ["Broadcast", res.v.broadcast], ["First usable", res.v.first], ["Last usable", res.v.last], ["Subnet mask", res.v.mask], ["Wildcard", res.v.wildcard], ["Usable hosts", res.v.hosts.toLocaleString()], ["Total addresses", res.v.total.toLocaleString()], ["Class", res.v.classful], ["Range type", res.v.private ? "Private (RFC 1918)" : "Public"]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-2">
                    <dt className="text-zinc-500">{k}</dt><dd className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Binary</p>
                <p className="mt-0.5 break-all font-mono text-[11.5px] text-zinc-600 dark:text-zinc-400">{res.v.binary}</p>
              </div>
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-[13px] font-bold">Subnet splitter</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <Field label="New prefix"><Select value={newPrefix} onChange={(e) => setNewPrefix(e.target.value)} className="w-24 font-mono">
                {Array.from({ length: 9 }, (_, i) => (res.ok ? res.v.prefix : 24) + i).filter((p) => p <= 30).map((p) => <option key={p} value={p}>/{p}</option>)}
              </Select></Field>
              <span className="pb-2 text-[12.5px] text-zinc-500">Split {res.ok ? res.v.cidr : "…"} into /{newPrefix} blocks</span>
            </div>
            <div className="mt-2">
              {!split ? <p className="text-sm text-zinc-500">Fix the CIDR first.</p>
                : !split.ok ? <ErrorCallout title="Cannot split" message={split.err} />
                  : <div className="max-h-56 overflow-auto rounded-xl border border-zinc-200 font-mono text-[12.5px] dark:border-zinc-800">
                    {split.nets.map((n, i) => <div key={n} className="flex justify-between border-b border-zinc-100 px-3 py-1.5 last:border-0 dark:border-zinc-800/60"><span>{n}</span><span className="text-zinc-400">#{i + 1}</span></div>)}
                  </div>}
            </div>
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-bold">IP range → usable list</p>
            <RangeList />
          </Panel>
          <SupernetCalculator />
        </div>
      </div>
    </ToolScaffold>
  );
}

function SupernetCalculator() {
  const [cidrs, setCidrs] = useState("192.168.0.0/24\n192.168.1.0/24");
  const result = useMemo(() => {
    try { return { ok: true as const, value: calcSupernet(cidrs.split(/\r?\n|,/)) }; }
    catch (cause) { return { ok: false as const, error: cause instanceof Error ? cause.message : "Cannot calculate supernet." }; }
  }, [cidrs]);
  return (
    <Panel className="p-4">
      <p className="text-[13px] font-bold">Supernet calculator</p>
      <Field label="CIDRs (one per line)" className="mt-2"><textarea value={cidrs} onChange={(event) => setCidrs(event.target.value)} rows={3} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[12.5px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
      <div className="mt-2">{result.ok ? <Stat label="Smallest covering supernet" value={`${result.value.cidr} · ${result.value.total.toLocaleString()} addresses`} /> : <ErrorCallout title="Cannot aggregate" message={result.error} />}</div>
    </Panel>
  );
}

function RangeList() {
  const [base, setBase] = useState("192.168.1.0");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const out = useMemo(() => {
    try {
      const m = base.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/);
      if (!m) throw new Error('Base must look like 192.168.1.0 (first three octets + ".0").');
      const f = parseInt(from) || 0, t = parseInt(to) || 0;
      if (f < 0 || t > 255 || f > t) throw new Error("Range must satisfy 0 ≤ from ≤ to ≤ 255.");
      if (t - f > 512) throw new Error("Range too large (max 512 shown). Use the splitter for whole subnets.");
      return { ok: true as const, text: Array.from({ length: t - f + 1 }, (_, i) => `${m[1]}.${f + i}`).join("\n") };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [base, from, to]);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Base /24"><TextInput value={base} onChange={(e) => setBase(e.target.value)} className="font-mono text-[13px]" /></Field>
        <Field label="From"><TextInput value={from} onChange={(e) => setFrom(e.target.value)} className="font-mono text-[13px]" /></Field>
        <Field label="To"><TextInput value={to} onChange={(e) => setTo(e.target.value)} className="font-mono text-[13px]" /></Field>
      </div>
      <div className="mt-2">{out.ok ? <OutputBox value={out.text} label="" rows={6} filename="range.txt" /> : <ErrorCallout title="Bad range" message={out.err} />}</div>
    </div>
  );
}

/* ================= IP ================= */

export function IpTool() {
  const tool = TOOL_MAP.ip;
  const [ip, setIp] = useState("192.168.1.25");
  const [v6, setV6] = useState("2001:db8::1");
  const res = useMemo(() => {
    try {
      const n = ipToInt(ip);
      return {
        ok: true as const, int: n, hex: `0x${n.toString(16).padStart(8, "0")}`, bin: ipToBinary(ip),
        cls: classifyIp(ip), octets: ip.split(".").join(" · "),
      };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [ip]);
  const v6res = useMemo(() => {
    try { return { ok: true as const, full: expandIpv6(v6), short: compressIpv6(v6) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [v6]);
  const [dec, setDec] = useState("3232235777");
  const decIp = useMemo(() => { const n = parseInt(dec); return Number.isFinite(n) && n >= 0 && n <= 4294967295 ? intToIp(n) : null; }, [dec]);
  return (
    <ToolScaffold tool={tool} next={[{ label: "Full subnet math", to: "/subnet" }, { label: "Reverse DNS", to: "/dns" }]}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <p className="text-[13px] font-bold">IPv4 inspector</p>
          <Field label="IPv4 address" className="mt-2"><TextInput value={ip} onChange={(e) => setIp(e.target.value)} className="font-mono text-[15px]" /></Field>
          {!res.ok ? <div className="mt-2"><ErrorCallout title="Invalid IPv4" message={res.err} /></div> : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Decimal (uint32)" value={String(res.int)} /><Stat label="Hex" value={res.hex} />
              <div className="col-span-2"><Stat label="Binary" value={res.bin} /></div>
              <Stat label="Classification" value={res.cls} mono={false} /><Stat label="Octets" value={res.octets} />
            </div>
          )}
          <Field label="Decimal → IP" className="mt-3"><TextInput value={dec} onChange={(e) => setDec(e.target.value)} className="font-mono" /></Field>
          {decIp && <p className="mt-1 font-mono text-[13px] text-emerald-700 dark:text-emerald-300">{dec} → {decIp}</p>}
        </Panel>
        <Panel className="p-4">
          <p className="text-[13px] font-bold">IPv6 compress / expand</p>
          <Field label="IPv6 address" className="mt-2"><TextInput value={v6} onChange={(e) => setV6(e.target.value)} className="font-mono text-[15px]" /></Field>
          {!v6res.ok ? <div className="mt-2"><ErrorCallout title="Invalid IPv6" message={v6res.err} hint='Full form has 8 hex groups; "::" may appear once.' /></div> : (
            <div className="mt-3 space-y-2">
              <Stat label="Expanded" value={v6res.full} /><Stat label="Compressed" value={v6res.short} />
            </div>
          )}
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">Quick reference</p>
            <ul className="mt-1.5 space-y-1 font-mono text-[12px] text-zinc-600 dark:text-zinc-400">
              <li>127.0.0.1 — loopback · ::1 — v6 loopback</li>
              <li>10/8 · 172.16/12 · 192.168/16 — private</li>
              <li>169.254/16 — link-local · 224/4 — multicast</li>
            </ul>
          </div>
        </Panel>
      </div>
    </ToolScaffold>
  );
}

/* ================= DNS ================= */

type DnsAnswer = { name: string; type: number; TTL: number; data: string };
export function DnsTool() {
  const tool = TOOL_MAP.dns;
  const [domain, setDomain] = useState("example.com");
  const [type, setType] = useState("A");
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<DnsAnswer[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [spfInclude, setSpfInclude] = useState("_spf.google.com");
  const [dmarcEmail, setDmarcEmail] = useState("dmarc@example.com");

  const lookup = async () => {
    const d = domain.trim().replace(/^https?:\/\//, "").split("/")[0];
    const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(d);
    if (type === "PTR" && !ipv4) {
      setErr("PTR lookup currently accepts an IPv4 address, e.g. 8.8.8.8.");
      setAnswers(null);
      return;
    }
    if (type !== "PTR" && !/^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.[A-Za-z]{2,}$/.test(d)) {
      setErr(`"${domain}" doesn't look like a bare domain. Use example.com (no scheme, no path).`);
      setAnswers(null);
      return;
    }
    const queryName = type === "PTR" ? `${d.split(".").reverse().join(".")}.in-addr.arpa` : d;
    setLoading(true); setErr(null);
    try {
      const endpoints = [
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(queryName)}&type=${type}`,
        `https://dns.google/resolve?name=${encodeURIComponent(queryName)}&type=${type}`,
      ];
      let lastErr = "";
      for (const url of endpoints) {
        try {
          const r = await fetch(url, { headers: { accept: "application/dns-json" } });
          if (!r.ok) { lastErr = `Resolver responded ${r.status}.`; continue; }
          const j = await r.json();
          if (j.Status !== 0) { lastErr = `DNS status ${j.Status} (NXDOMAIN if 3 — domain doesn't exist).`; continue; }
          setAnswers((j.Answer ?? []) as DnsAnswer[]);
          setErr(null);
          setLoading(false);
          return;
        } catch (e) { lastErr = (e as Error).message; }
      }
      setErr(`All resolvers failed. ${lastErr} Check your connection and try again.`);
      setAnswers(null);
    } finally { setLoading(false); }
  };

  return (
    <ToolScaffold tool={tool} next={[{ label: "Check the IP", to: "/ip" }, { label: "Build SPF safely", to: "/dns" }]}>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Domain" className="min-w-[200px] flex-1"><TextInput value={domain} onChange={(e) => setDomain(e.target.value)} className="font-mono" placeholder="example.com" onKeyDown={(e) => { if (e.key === "Enter") lookup(); }} /></Field>
            <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)} className="w-32 font-mono">
              {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR", "SOA", "SRV", "CAA"].map((t) => <option key={t}>{t}</option>)}
            </Select></Field>
            <Btn variant="primary" onClick={lookup}>{loading ? "Querying…" : "Lookup"}</Btn>
          </div>
          <p className="mt-2 text-[12px] text-zinc-500">Live DNS-over-HTTPS via Cloudflare & Google — this tool needs network. Nothing you type is stored.</p>
          <div className="mt-3">
            {err && <ErrorCallout title="Lookup failed" message={err} />}
            {answers && !answers.length && <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-[13px] text-zinc-500 dark:border-zinc-700">No {type} records — the domain exists but publishes none of this type.</p>}
            {!!answers?.length && (
              <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                {answers.map((a, i) => (
                  <div key={i} className="border-b border-zinc-100 px-3.5 py-2.5 font-mono text-[12.5px] last:border-0 dark:border-zinc-800/60">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{a.name}</span>
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 text-[11px] dark:bg-zinc-800">{type} · TTL {a.TTL}s</span>
                    <p className="mt-1 break-all text-zinc-600 dark:text-zinc-300">{a.data}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-[13px] font-bold">SPF builder</p>
            <Field label="Include (ESP)" className="mt-2"><TextInput value={spfInclude} onChange={(e) => setSpfInclude(e.target.value)} className="font-mono text-[13px]" /></Field>
            <OutputBox value={`v=spf1 include:${spfInclude || "_spf.example.com"} ~all`} label="" rows={2} filename="spf.txt" />
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-bold">DMARC builder</p>
            <Field label="Aggregate reports to" className="mt-2"><TextInput value={dmarcEmail} onChange={(e) => setDmarcEmail(e.target.value)} className="font-mono text-[13px]" /></Field>
            <OutputBox value={`v=DMARC1; p=quarantine; rua=mailto:${dmarcEmail || "dmarc@example.com"}; fo=1; adkim=s; aspf=s`} label="" rows={3} filename="dmarc.txt" />
            <p className="mt-2 text-[12px] text-zinc-500">Publish at <code className="font-mono">_dmarc.yourdomain</code> as TXT. Start with <code className="font-mono">p=none</code> to monitor first.</p>
          </Panel>
        </div>
      </div>
    </ToolScaffold>
  );
}

/* ================= HTTP ================= */

export function HttpTool() {
  const tool = TOOL_MAP.http;
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState("content-type: application/json\ncache-control: no-cache\nx-request-id: abc-123");
  const [url, setUrl] = useState("https://user:pass@example.com:8443/api/v1/items?page=2&tag=a&tag=b#results");

  const statuses = HTTP_STATUSES.filter((s) => !q.trim() || String(s.code).includes(q.trim()) || s.name.toLowerCase().includes(q.toLowerCase()) || s.cause.toLowerCase().includes(q.toLowerCase()));
  const headers = useMemo(() => { try { return { ok: true as const, v: parseHeaders(raw) }; } catch (e) { return { ok: false as const, err: (e as Error).message }; } }, [raw]);
  const parsed = useMemo(() => { try { return { ok: true as const, v: parseUrl(url) }; } catch (e) { return { ok: false as const, err: (e as Error).message }; } }, [url]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Build the request", to: "/curl" }, { label: "Explain the error", to: "/errors" }]}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <p className="text-[13px] font-bold">Status code reference</p>
          <Field label="Search 200, 404, timeout…" className="mt-2"><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="404" className="font-mono" /></Field>
          <div className="mt-2 max-h-[380px] space-y-2 overflow-auto pr-1">
            {statuses.map((s) => (
              <div key={s.code} className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                <p className="text-[13px]"><code className={`mr-2 rounded px-1.5 py-0.5 font-mono font-bold ${s.cls === "2xx" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : s.cls === "4xx" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>{s.code}</code>
                  <span className="font-semibold">{s.name}</span></p>
                <p className="mt-1 text-[12.5px] text-zinc-600 dark:text-zinc-400">{s.cause} <span className="text-zinc-400">Fix: {s.fix}</span></p>
              </div>
            ))}
            {!statuses.length && <p className="text-sm text-zinc-500">No status matches.</p>}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-[13px] font-bold">Header parser</p>
            <CodeArea label="Raw headers" value={raw} onChange={setRaw} rows={4} />
            <div className="mt-2">
              {!headers.ok ? <ErrorCallout title="Bad headers" message={headers.err} />
                : (
                  <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {headers.v.map((h, i) => <div key={i} className="flex gap-3 border-b border-zinc-100 px-3 py-1.5 font-mono text-[12px] last:border-0 dark:border-zinc-800/60"><span className="w-36 shrink-0 font-bold text-zinc-500">{h.k.toLowerCase()}</span><span className="break-all">{h.v}</span></div>)}
                  </div>
                )}
            </div>
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-bold">URL inspector</p>
            <Field label="URL" className="mt-2"><TextInput value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono text-[13px]" /></Field>
            {!parsed.ok ? <div className="mt-2"><ErrorCallout title="Invalid URL" message={parsed.err} /></div> : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(parsed.v).map(([k, v]) => <Stat key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />)}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ToolScaffold>
  );
}

/* ================= CURL ================= */

export function CurlTool() {
  const tool = TOOL_MAP.curl;
  const [tab, setTab] = useState("parse");
  const [raw, setRaw] = useState('curl -X POST https://api.example.com/users \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer TOKEN" \\\n  --data-raw \'{"name":"maya"}\'');
  const [req, setReq] = useState<HttpReq>({ method: "POST", url: "https://api.example.com/users", headers: [{ k: "Content-Type", v: "application/json" }], auth: "TOKEN", body: '{"name":"maya"}', contentType: "application/json" });
  const [lang, setLang] = useState("python");

  const parsed = useMemo(() => { try { return { ok: true as const, v: parseCurl(raw) }; } catch (e) { return { ok: false as const, err: (e as Error).message }; } }, [raw]);
  const active: HttpReq | null = tab === "parse" ? (parsed.ok ? parsed.v : null) : req;
  const converted = useMemo(() => {
    if (!active) return "";
    if (lang === "python") return curlToPython(active);
    if (lang === "js") return curlToJs(active);
    if (lang === "go") return curlToGo(active);
    return curlToPhp(active);
  }, [active, lang]);

  const editH = (i: number, k: string, v: string) => setReq({ ...req, headers: req.headers.map((h, j) => (j === i ? { k, v } : h)) });

  return (
    <ToolScaffold tool={tool} next={[{ label: "Inspect the JWT", to: "/jwt" }, { label: "Check status codes", to: "/http" }, { label: "Encode the body", to: "/encode" }]}
      onExample={() => { setTab("parse"); }}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "parse", label: "Parse & convert" }, { id: "build", label: "Build request" }]} active={tab} onChange={setTab} />
        {tab === "parse" ? (
          <div className="mt-3">
            <CodeArea label="Paste cURL" value={raw} onChange={setRaw} rows={6} placeholder="curl -H … https://…" />
            {!parsed.ok ? <div className="mt-3"><ErrorCallout title="Cannot parse cURL" message={parsed.err} hint="Multiline commands with backslash continuations are supported." /></div> : (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-900 px-2 py-1 font-mono text-[12px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">{parsed.v.method}</span>
                  <code className="break-all font-mono text-[12.5px] text-zinc-700 dark:text-zinc-300">{parsed.v.url}</code>
                  <span className="ml-auto flex gap-1">
                    {(["python", "js", "go", "php"] as const).map((l) => (
                      <button key={l} type="button" onClick={() => setLang(l)}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-[12px] ${lang === l ? "border-emerald-500 text-emerald-600" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"}`}>
                        {l === "python" ? "Python" : l === "js" ? "JavaScript" : l === "go" ? "Go" : "PHP"}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="mt-2"><OutputBox value={converted} label={`→ ${lang === "python" ? "Python requests" : lang === "js" ? "fetch" : lang === "go" ? "net/http" : "PHP cURL"}`} filename={`req.${lang === "js" ? "js" : lang === "python" ? "py" : lang}`} rows={14} /></div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <Split
              left={
                <div className="space-y-3">
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <Field label="Method"><Select value={req.method} onChange={(e) => setReq({ ...req, method: e.target.value })} className="font-mono">{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
                    <Field label="URL"><TextInput value={req.url} onChange={(e) => setReq({ ...req, url: e.target.value })} className="font-mono" /></Field>
                  </div>
                  <Field label="Bearer token (optional)"><TextInput value={req.auth} onChange={(e) => setReq({ ...req, auth: e.target.value })} className="font-mono" placeholder="paste JWT…" /></Field>
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Headers</p>
                    {req.headers.map((h, i) => (
                      <div key={i} className="flex gap-1.5">
                        <TextInput value={h.k} onChange={(e) => editH(i, e.target.value, h.v)} placeholder="X-Header" className="font-mono text-[12.5px]" />
                        <TextInput value={h.v} onChange={(e) => editH(i, h.k, e.target.value)} placeholder="value" className="font-mono text-[12.5px]" />
                      </div>
                    ))}
                    <Btn variant="ghost" className="text-xs" onClick={() => setReq({ ...req, headers: [...req.headers, { k: "", v: "" }] })}>+ header</Btn>
                  </div>
                  <Field label="Body"><textarea value={req.body} onChange={(e) => setReq({ ...req, body: e.target.value })} rows={4} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
                </div>
              }
              right={<OutputBox value={buildCurl(req)} label="cURL" filename="req.sh" rows={14} />}
            />
          </div>
        )}
      </Panel>
    </ToolScaffold>
  );
}

/* ================= PORTS ================= */

export function PortsTool() {
  const tool = TOOL_MAP.ports;
  const [q, setQ] = useState("");
  const [rangeStart, setRangeStart] = useState("8000");
  const [rangeEnd, setRangeEnd] = useState("8010");
  const list = PORTS.filter((p) => !q.trim() || String(p.port).includes(q.trim()) || p.service.toLowerCase().includes(q.toLowerCase()) || p.desc.toLowerCase().includes(q.toLowerCase()));
  const range = useMemo(() => {
    const start = Number(rangeStart), end = Number(rangeEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || start > end) return { ok: false as const, error: "Use 1 ≤ start ≤ end ≤ 65535." };
    if (end - start > 1000) return { ok: false as const, error: "Range display is limited to 1,001 ports." };
    const known = PORTS.filter((port) => port.port >= start && port.port <= end);
    return { ok: true as const, value: `${start}-${end} (${end - start + 1} ports)\nDocker publish range: -p ${start}-${end}:${start}-${end}\nKnown services in range:\n${known.length ? known.map((port) => `${port.port}/${port.proto.toLowerCase()} ${port.service}`).join("\n") : "(none in local reference)"}` };
  }, [rangeStart, rangeEnd]);
  void hexEncode;
  return (
    <ToolScaffold tool={tool} next={[{ label: "Check the subnet", to: "/subnet" }, { label: "Map in Compose", to: "/docker" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search port or service" className="min-w-[220px] flex-1"><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="443 · postgres · redis…" className="font-mono" /></Field>
          <span className="pb-2 font-mono text-[12px] text-zinc-400">{list.length} ports</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="max-h-[480px] overflow-auto">
            {list.map((p) => (
              <div key={p.port + p.service} className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-3.5 py-2.5 last:border-0 dark:border-zinc-800/60">
                <code className="w-16 font-mono text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{p.port}</code>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{p.proto}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{p.service}</p>
                  <p className="text-[12px] text-zinc-500">{p.desc}</p>
                </div>
                <code className="hidden font-mono text-[11.5px] text-zinc-400 sm:block">-p {p.port}:{p.port}</code>
              </div>
            ))}
            {!list.length && <p className="p-4 text-center text-sm text-zinc-500">No ports match “{q}”.</p>}
          </div>
        </div>
        <ActionBar>
          <span className="text-[12px] text-zinc-500">Well-known reference — always verify against your service docs before opening firewall rules.</span>
        </ActionBar>
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="text-[13px] font-bold">Port range helper</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[120px_120px_1fr]">
            <Field label="Start"><TextInput value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="font-mono" /></Field>
            <Field label="End"><TextInput value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="font-mono" /></Field>
            {range.ok ? <OutputBox value={range.value} label="Range" rows={4} filename="port-range.txt" /> : <ErrorCallout title="Invalid range" message={range.error} />}
          </div>
        </div>
      </Panel>
    </ToolScaffold>
  );
}
