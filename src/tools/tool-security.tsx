import { useEffect, useMemo, useState } from "react";
import { decodeJwt, hashText, genPassword, genPassphrase, genToken, genUuid, genHex, passwordStrength, type HashAlgo } from "../lib/engine";
import { cspBuild, robotsBuild, securityTxt, inspectPem, pemFormat } from "../lib/blueprints";
import { inspectCertificateDocument, type CertificateDetails } from "../lib/certificates";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Check, Btn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat, inputCls,
} from "../components/ui";
import { cn } from "../utils/cn";

/* ================= JWT ================= */

const SAMPLE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik1heWEgQ2hlbiIsImlhdCI6MTcxNzc4NTYwMCwiZXhwIjoyMDAwMDAwMDAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

export function JwtTool() {
  const tool = TOOL_MAP.jwt;
  const [token, setToken] = useState("");
  const res = useMemo(() => {
    if (!token.trim()) return null;
    try { return { ok: true as const, v: decodeJwt(token) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [token]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Check expiry timestamp", to: "/timestamp" }, { label: "Base64-decode manually", to: "/encode" }, { label: "Send with cURL", to: "/curl" }]}
      onExample={() => setToken(SAMPLE_JWT)}>
      <Panel className="p-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-bold">Decoding ≠ verifying.</span> This tool parses the token locally so you can inspect it. It does <em>not</em> check the signature — always verify server-side with the right key & algorithm.
        </div>
        <div className="mt-3">
          <Field label="JWT" hint="Paste header.payload.signature — stays in this tab, never uploaded">
            <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={4} spellCheck={false}
              placeholder="eyJhbGciOi…"
              className={cn(inputCls, "break-all font-mono text-[12.5px] leading-relaxed")} />
          </Field>
          {!token && <div className="mt-2"><Btn variant="secondary" onClick={() => setToken(SAMPLE_JWT)}>Load sample token</Btn></div>}
        </div>
        {res && !res.ok && <div className="mt-3"><ErrorCallout title="Malformed JWT" message={res.err} hint="A JWT has exactly 3 Base64URL segments. Watch for truncation, extra whitespace, or pasting only the payload." /></div>}
        {res?.ok && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-bold", res.v.expired ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                {res.v.payload.exp === undefined ? "no exp claim" : res.v.expired ? `expired ${res.v.expiresIn}` : `expires ${res.v.expiresIn}`}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-[12px] dark:bg-zinc-800">alg: {res.v.alg}</span>
              {["none"].includes(res.v.alg.toLowerCase()) && <span className="rounded-full bg-red-100 px-2.5 py-1 text-[12px] font-bold text-red-700">⚠ alg=none — reject unless you explicitly expect it</span>}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Header</p>
                <OutputBox value={JSON.stringify(res.v.header, null, 2)} label="" rows={6} filename="jwt-header.json" />
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Payload · {Object.keys(res.v.payload).length} claims</p>
                <OutputBox value={JSON.stringify(res.v.payload, null, 2)} label="" rows={6} filename="jwt-payload.json" />
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-[12.5px]">
                <thead><tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"><th className="px-3 py-2">Claim</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Meaning</th></tr></thead>
                <tbody className="font-mono">
                  {Object.entries(res.v.payload).map(([k, v]) => (
                    <tr key={k} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                      <td className="px-3 py-1.5 font-bold text-emerald-700 dark:text-emerald-300">{k}</td>
                      <td className="break-all px-3 py-1.5">{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                      <td className="px-3 py-1.5 font-sans text-[12px] text-zinc-500">{({ exp: "expiry (unix s)", iat: "issued at", nbf: "not before", iss: "issuer", sub: "subject", aud: "audience", jti: "token id" } as Record<string, string>)[k] ?? "custom claim"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Authorization header</p>
              <OutputBox value={`Authorization: Bearer ${token.trim()}`} label="" rows={2} filename="auth-header.txt" />
            </div>
          </div>
        )}
      </Panel>
    </ToolScaffold>
  );
}

/* ================= HASH ================= */

const ALGOS: HashAlgo[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-512", "HMAC-SHA256", "HMAC-SHA512"];

export function HashTool() {
  const tool = TOOL_MAP.hash;
  const [input, setInput] = useState("hello devutils");
  const [key, setKey] = useState("");
  const [algos, setAlgos] = useState<HashAlgo[]>(["SHA-256", "SHA-512", "MD5"]);
  const [outs, setOuts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    let live = true;
    setErr(null);
    if (!input && !fileName) { setOuts({}); return; }
    (async () => {
      try {
        const o: Record<string, string> = {};
        for (const a of algos) o[a] = await hashText(a, input, key);
        if (live) setOuts(o);
      } catch (e) { if (live) setErr((e as Error).message); }
    })();
    return () => { live = false; };
  }, [input, key, algos, fileName]);

  const toggle = (a: HashAlgo) => setAlgos((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  return (
    <ToolScaffold tool={tool} next={[{ label: "Generate a secret first", to: "/secrets" }, { label: "Encode digest as hex", to: "/encode" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap gap-1.5">
          {ALGOS.map((a) => (
            <button key={a} type="button" onClick={() => toggle(a)} aria-pressed={algos.includes(a)}
              className={cn("rounded-lg border px-2.5 py-1.5 font-mono text-[12px] transition", algos.includes(a) ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400")}>{a}</button>
          ))}
        </div>
        <div className="mt-3">
          <Split
            left={
              <div className="space-y-3">
                <CodeArea label="Input" value={input} onChange={(v) => { setInput(v); setFileName(""); }} rows={6} accept="*/*"
                  onFile={(t, name) => { setInput(t); setFileName(name); }} />
                {(algos.some((a) => a.startsWith("HMAC"))) && (
                  <Field label="HMAC key" hint="Required for HMAC — handled locally"><TextInput value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="secret key…" /></Field>
                )}
                {fileName && <p className="font-mono text-[12px] text-zinc-500">Hashing file: {fileName} (text read locally)</p>}
              </div>
            }
            right={
              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Digests</p>
                {err && <ErrorCallout title="Hash failed" message={err} />}
                <div className="space-y-2">
                  {algos.map((a) => (
                    <div key={a} className="rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-800">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11.5px] font-bold text-zinc-500">{a}</span>
                        <Btn variant="ghost" className="px-2 py-0.5 text-[11.5px]" onClick={() => { if (outs[a]) navigator.clipboard.writeText(outs[a]).catch(() => {}); }}>copy</Btn>
                      </div>
                      <p className="mt-1 break-all font-mono text-[12px] text-zinc-800 dark:text-zinc-200">{outs[a] ?? "…"}</p>
                    </div>
                  ))}
                  {!algos.length && <p className="text-sm text-zinc-500">Select at least one algorithm.</p>}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">MD5/SHA-1 are shown for checksums & legacy interop — <span className="font-semibold">never for passwords</span>. Use argon2/bcrypt/scrypt server-side.</p>
              </div>
            }
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= SECRETS ================= */

export function SecretsTool() {
  const tool = TOOL_MAP.secrets;
  const [tab, setTab] = useState("password");
  const [len, setLen] = useState(20);
  const [opts, setOpts] = useState({ upper: true, lower: true, digits: true, symbols: true });
  const [words, setWords] = useState(5);
  const [n, setN] = useState(0);
  const [out, setOut] = useState("");

  const regen = () => {
    setN((x) => x + 1);
    if (tab === "password") setOut(genPassword(len, opts));
    else if (tab === "passphrase") setOut(genPassphrase(words));
    else if (tab === "api") setOut(`sk-live-${genToken(24)}`);
    else if (tab === "hex") setOut(genHex(32));
    else if (tab === "uuid") setOut(genUuid());
    else setOut(genToken(32));
  };
  useEffect(() => { regen(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const s = passwordStrength(out);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Hash it (verify later)", to: "/hash" }, { label: "Store in .env", to: "/env" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "password", label: "Password" }, { id: "passphrase", label: "Passphrase" }, { id: "api", label: "API key" }, { id: "hex", label: "Hex secret" }, { id: "uuid", label: "UUID" }, { id: "token", label: "Token" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          <Split
            left={
              <div className="space-y-3">
                {tab === "password" && (<>
                  <Field label={`Length: ${len}`}><input type="range" min={8} max={64} value={len} onChange={(e) => setLen(+e.target.value)} className="w-full accent-emerald-600" /></Field>
                  <div className="flex flex-wrap gap-2">
                    <Check label="A–Z" checked={opts.upper} onChange={(v) => setOpts({ ...opts, upper: v })} />
                    <Check label="a–z" checked={opts.lower} onChange={(v) => setOpts({ ...opts, lower: v })} />
                    <Check label="0–9" checked={opts.digits} onChange={(v) => setOpts({ ...opts, digits: v })} />
                    <Check label="Symbols" checked={opts.symbols} onChange={(v) => setOpts({ ...opts, symbols: v })} />
                  </div>
                </>)}
                {tab === "passphrase" && <Field label="Words"><Select value={String(words)} onChange={(e) => setWords(+e.target.value)} className="w-28">{[3, 4, 5, 6, 8].map((v) => <option key={v} value={v}>{v}</option>)}</Select></Field>}
                <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                  <div className={cn("transition-all", s.score <= 1 ? "bg-red-500" : s.score === 2 ? "bg-amber-500" : s.score === 3 ? "bg-lime-500" : "bg-emerald-500")} style={{ width: `${(s.score / 5) * 100}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Strength" value={s.label} mono={false} /><Stat label="Entropy" value={`${s.entropy} bits`} /><Stat label="Crack time" value={s.crack} mono={false} />
                </div>
                <Btn variant="primary" onClick={regen}>Regenerate</Btn>
                <p className="text-[12px] text-zinc-500">Uses <code className="font-mono">crypto.getRandomValues</code>. Generated {n > 0 ? `${n} time(s)` : ""} — never stored, never sent.</p>
              </div>
            }
            right={<OutputBox value={out} label="Secret — copy it now" filename="secret.txt" rows={6} />}
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= WEB SECURITY ================= */

export function WebsecTool() {
  const tool = TOOL_MAP.websec;
  const [tab, setTab] = useState("csp");
  const [csp, setCsp] = useState({ defaultSrc: "'self'", script: "'self'", style: "'self' 'unsafe-inline'", img: "'self' data: https:", connect: "'self'", frame: "'none'", extra: "base-uri 'self'; form-action 'self'" });
  const [cors, setCors] = useState({ origin: "https://app.example.com", methods: "GET, POST, PUT, DELETE", headers: "Content-Type, Authorization", creds: true });
  const [robots, setRobots] = useState({ allow: "/\n/public/", disallow: "/admin/\n/private/\n*.json", sitemap: "https://example.com/sitemap.xml" });
  const [contact, setContact] = useState("mailto:security@example.com");

  const cspOut = cspBuild(csp);
  const corsOut = `# CORS — server response headers\nAccess-Control-Allow-Origin: ${cors.origin}\nAccess-Control-Allow-Methods: ${cors.methods}\nAccess-Control-Allow-Headers: ${cors.headers}\n${cors.creds ? "Access-Control-Allow-Credentials: true\n" : ""}# Preflight cache: 600s\nAccess-Control-Max-Age: 600`;
  const headersOut = `# Recommended security headers (nginx / express / CDN)\nStrict-Transport-Security: max-age=63072000; includeSubDomains; preload\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nX-Frame-Options: DENY\nContent-Security-Policy: ${cspOut}\nPermissions-Policy: camera=(), microphone=(), geolocation=()`;

  return (
    <ToolScaffold tool={tool} next={[{ label: "Test the endpoint", to: "/curl" }, { label: "Check TLS cert", to: "/certificates" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "csp", label: "CSP" }, { id: "cors", label: "CORS" }, { id: "headers", label: "Headers" }, { id: "robots", label: "robots.txt" }, { id: "sectxt", label: "security.txt" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === "csp" && (
            <Split left={<div className="space-y-2.5">
              {[["defaultSrc", "default-src"], ["script", "script-src"], ["style", "style-src"], ["img", "img-src"], ["connect", "connect-src"], ["frame", "frame-ancestors"]].map(([k, label]) => (
                <Field key={k} label={label}><TextInput value={(csp as Record<string, string>)[k]} onChange={(e) => setCsp({ ...csp, [k]: e.target.value })} className="font-mono text-[13px]" /></Field>
              ))}
              <Field label="Extra directives"><TextInput value={csp.extra} onChange={(e) => setCsp({ ...csp, extra: e.target.value })} className="font-mono text-[13px]" /></Field>
            </div>} right={<OutputBox value={cspOut} label="Content-Security-Policy" filename="csp.txt" rows={8} />} />
          )}
          {tab === "cors" && (
            <Split left={<div className="space-y-2.5">
              <Field label="Allowed origin (exact, no *)"><TextInput value={cors.origin} onChange={(e) => setCors({ ...cors, origin: e.target.value })} className="font-mono text-[13px]" /></Field>
              <Field label="Methods"><TextInput value={cors.methods} onChange={(e) => setCors({ ...cors, methods: e.target.value })} className="font-mono text-[13px]" /></Field>
              <Field label="Allowed headers"><TextInput value={cors.headers} onChange={(e) => setCors({ ...cors, headers: e.target.value })} className="font-mono text-[13px]" /></Field>
              <Check label="Allow credentials" checked={cors.creds} onChange={(v) => setCors({ ...cors, creds: v })} />
              {cors.origin === "*" && cors.creds && <ErrorCallout title="Invalid combo" message="Access-Control-Allow-Origin: * cannot be used with credentials." hint="Echo the exact requesting origin instead." />}
            </div>} right={<OutputBox value={corsOut} label="CORS headers" filename="cors.txt" rows={8} />} />
          )}
          {tab === "headers" && <OutputBox value={headersOut} label="Security headers" filename="headers.txt" rows={10} />}
          {tab === "robots" && (
            <Split left={<div className="space-y-2.5">
              <Field label="Allow (one per line)"><textarea value={robots.allow} onChange={(e) => setRobots({ ...robots, allow: e.target.value })} rows={3} className={cn(inputCls, "font-mono text-[13px]")} /></Field>
              <Field label="Disallow (one per line)"><textarea value={robots.disallow} onChange={(e) => setRobots({ ...robots, disallow: e.target.value })} rows={3} className={cn(inputCls, "font-mono text-[13px]")} /></Field>
              <Field label="Sitemap"><TextInput value={robots.sitemap} onChange={(e) => setRobots({ ...robots, sitemap: e.target.value })} className="font-mono text-[13px]" /></Field>
            </div>} right={<OutputBox value={robotsBuild(robots)} label="robots.txt" filename="robots.txt" rows={8} />} />
          )}
          {tab === "sectxt" && (
            <Split left={<Field label="Contact"><TextInput value={contact} onChange={(e) => setContact(e.target.value)} className="font-mono text-[13px]" /></Field>}
              right={<OutputBox value={securityTxt({ contact, expires: "", policy: "" })} label=".well-known/security.txt" filename="security.txt" rows={6} />} />
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= CERTS ================= */

export function CertTool() {
  const tool = TOOL_MAP.cert;
  const [pem, setPem] = useState("");
  const [fp, setFp] = useState<string>("");
  const [details, setDetails] = useState<CertificateDetails | null>(null);
  const [detailError, setDetailError] = useState("");
  const res = useMemo(() => {
    if (!pem.trim()) return null;
    try { return { ok: true as const, v: inspectPem(pem) }; }
    catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [pem]);

  useEffect(() => {
    setFp("");
    setDetails(null);
    setDetailError("");
    if (!res?.ok) return;
    const m = pem.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/);
    if (!m) return;
    const b64 = m[2].replace(/\s+/g, "");
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      crypto.subtle.digest("SHA-256", bytes as BufferSource).then((d) => {
        setFp([...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":"));
      }).catch(() => {});
    } catch { /* noop */ }
    if (/-----BEGIN (?:NEW )?CERTIFICATE(?: REQUEST)?-----/.test(pem)) {
      inspectCertificateDocument(pem).then(setDetails).catch((cause: unknown) => setDetailError(cause instanceof Error ? cause.message : "X.509 decoding failed."));
    }
  }, [res, pem]);

  const formatted = useMemo(() => {
    if (!pem.trim()) return "";
    try { return pemFormat(pem); } catch { return ""; }
  }, [pem]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Fingerprint → compare hashes", to: "/hash" }, { label: "Harden serving config", to: "/security-headers" }]}>
      <Panel className="p-4">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[13px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Local PEM inspection only — this parses structure & fingerprints. It does <span className="font-semibold">not</span> validate the TLS chain, hostname or revocation.
        </div>
        <div className="mt-3">
          <Split
            left={
              <div>
                <Field label="PEM block" hint="Certificate, CSR or key — parsed in memory, never uploaded">
                  <textarea value={pem} onChange={(e) => setPem(e.target.value)} rows={10} spellCheck={false}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;MIIB…&#10;-----END CERTIFICATE-----"
                    className={cn(inputCls, "font-mono text-[12px] leading-relaxed")} />
                </Field>
                <ActionBar><Btn variant="secondary" onClick={() => setPem("")}>Clear</Btn></ActionBar>
              </div>
            }
            right={
              !res ? <OutputBox value="" placeholder="Paste a PEM block to inspect it" />
                : !res.ok ? <ErrorCallout title="Cannot parse PEM" message={res.err} hint="Include the full -----BEGIN/END----- lines with intact Base64." />
                  : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Stat label="Type" value={res.v.type} mono={false} /><Stat label="DER size" value={`${res.v.derBytes.toLocaleString()} bytes`} />
                      </div>
                      <Stat label="Note" value={res.v.note} mono={false} />
                      {(details?.fingerprintSha256 || fp) && <Stat label="SHA-256 fingerprint" value={details?.fingerprintSha256 ?? fp} />}
                      {details && <>
                        <Stat label="Subject" value={details.subject} mono={false} />
                        {details.issuer && <Stat label="Issuer" value={details.issuer} mono={false} />}
                        <div className="grid grid-cols-2 gap-2">
                          {details.notBefore && <Stat label="Not before" value={details.notBefore} />}
                          {details.notAfter && <Stat label="Not after" value={details.notAfter} />}
                          <Stat label="Public key" value={details.publicKeyAlgorithm} />
                          <Stat label="Signature" value={details.signatureAlgorithm} />
                        </div>
                        {details.expirationStatus && <Stat label="Expiration" value={details.expirationStatus} mono={false} />}
                        {details.subjectAlternativeNames.length > 0 && <Stat label="Subject Alternative Names" value={details.subjectAlternativeNames.join(" · ")} />}
                        {details.signatureVerified !== undefined && <Stat label="CSR self-signature" value={details.signatureVerified ? "Verified" : "Invalid"} mono={false} />}
                      </>}
                      {detailError && <ErrorCallout title="X.509 field decoding failed" message={detailError} hint="The PEM structure and SHA-256 fingerprint above are still available." />}
                      {formatted && <OutputBox value={formatted} label="Reformatted (64-col)" filename="cert.pem" rows={6} />}
                    </div>
                  )
            }
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}
