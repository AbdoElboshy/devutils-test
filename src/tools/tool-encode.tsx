import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { CODECS } from "../lib/engine";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Field, TextInput, Select, Btn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar,
} from "../components/ui";

/* ================= ENCODE / DECODE ================= */

export function EncodeTool() {
  const tool = TOOL_MAP.encode;
  const [codec, setCodec] = useState("base64");
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("Hello, DevUtils!");

  const res = useMemo(() => {
    const c = CODECS.find((x) => x.id === codec)!;
    try {
      if (!input) return { ok: true as const, out: "" };
      return { ok: true as const, out: mode === "encode" ? c.encode(input) : c.decode(input) };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [input, codec, mode]);

  const swap = () => {
    if (res.ok && res.out) { setInput(res.out); setMode(mode === "encode" ? "decode" : "encode"); }
    else setMode(mode === "encode" ? "decode" : "encode");
  };

  return (
    <ToolScaffold tool={tool} next={[{ label: "Decode a JWT part", to: "/jwt" }, { label: "Hash the output", to: "/hash" }, { label: "Clean text first", to: "/text" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Format"><Select value={codec} onChange={(e) => setCodec(e.target.value)} className="w-52 font-mono text-[13px]">
            {CODECS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select></Field>
          <Field label="Operation">
            <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700" role="group" aria-label="Operation">
              {(["encode", "decode"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={`rounded-md px-4 py-1.5 text-[13px] font-semibold capitalize transition ${mode === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}>{m}</button>
              ))}
            </div>
          </Field>
          <Btn variant="ghost" onClick={swap} title="Swap input/output and flip operation">⇅ Swap</Btn>
        </div>
        <div className="mt-3">
          <Split
            left={<CodeArea label={`Input · ${mode === "encode" ? "plain" : CODECS.find((x) => x.id === codec)?.name}`} value={input} onChange={setInput} rows={10} accept="*/*" onFile={(t) => setInput(t)} />}
            right={
              !res.ok ? <ErrorCallout title={`Cannot ${mode}`} message={res.err}
                hint={mode === "decode" ? "Check the format: Base64 needs length % 4 == 0, Hex needs even 0–9a–f pairs, URL needs valid %XX escapes." : "Try a shorter input or a different codec."} />
                : <OutputBox value={res.out} label={`Output · ${mode === "encode" ? CODECS.find((x) => x.id === codec)?.name : "plain"}`} filename={`output.${codec === "hex" ? "hex.txt" : "txt"}`} rows={10} />
            }
          />
        </div>
        <ActionBar>
          <Btn variant="ghost" onClick={() => setInput("")}>Clear</Btn>
          <span className="text-[12px] text-zinc-500">
            {codec === "base64" && (mode === "encode" ? "RFC 4648, UTF-8 safe, padded." : "Accepts padded & unpadded input; whitespace ignored.")}
            {codec === "base64url" && "URL-safe alphabet (- _), no padding — JWT segments use this."}
            {codec === "morse" && "A–Z 0–9 + space only; words separated by /."}
          </span>
        </ActionBar>
        <div className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["SGVsbG8=", "Base64 for “Hello”"], ["Hello%2C%20World", "URL-encoded"], ["48656c6c6f", "Hex for “Hello”"],
            ["Uryyb, QriHgvfy!", "ROT13"], ["&#72;&#101;&#108;&#108;&#111;", "HTML entities"], ["01001000 01100101", "Binary bytes"],
          ].map(([ex, label]) => (
            <button key={ex} type="button" onClick={() => { setInput(ex); setMode("decode"); setCodec(ex.startsWith("SG") ? "base64" : ex.includes("%") ? "url" : /^[0-9a-f ]+$/i.test(ex) && ex.length < 20 ? "hex" : ex.includes("&#") ? "html" : ex.includes("01") ? "binary" : "rot13"); }}
              className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-left transition hover:border-emerald-500 dark:border-zinc-700">
              <code className="block truncate font-mono text-[12px]">{ex}</code>
              <span className="text-[11.5px] text-zinc-500">{label} — try decoding</span>
            </button>
          ))}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= QR ================= */

function vcardEscape(s: string) { return s.replace(/([;,\\])/g, "\\$1"); }

export function QrTool() {
  const tool = TOOL_MAP.qr;
  const [tab, setTab] = useState("url");
  const [url, setUrl] = useState("https://devutils.app/json");
  const [text, setText] = useState("Hello from DevUtils");
  const [ssid, setSsid] = useState("HomeWiFi");
  const [pw, setPw] = useState("");
  const [enc, setEnc] = useState("WPA");
  const [name, setName] = useState("Maya Chen");
  const [phone, setPhone] = useState("+1 555 0100");
  const [email, setEmail] = useState("maya@example.com");
  const [to, setTo] = useState("+1 555 0100");
  const [body, setBody] = useState("Hello!");
  const [size, setSize] = useState(220);
  const [dataUrl, setDataUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const payload = useMemo(() => {
    switch (tab) {
      case "url": return url.trim();
      case "text": return text;
      case "wifi": return `WIFI:T:${enc};S:${vcardEscape(ssid)};P:${vcardEscape(pw)};;`;
      case "vcard": return `BEGIN:VCARD\nVERSION:3.0\nFN:${vcardEscape(name)}\nTEL:${vcardEscape(phone)}\nEMAIL:${vcardEscape(email)}\nEND:VCARD`;
      case "email": return `mailto:${email}?subject=${encodeURIComponent("Hello")}&body=${encodeURIComponent(body)}`;
      case "sms": return `SMSTO:${to}:${body}`;
      default: return text;
    }
  }, [tab, url, text, ssid, pw, enc, name, phone, email, to, body]);

  useEffect(() => {
    setErr(null);
    if (!payload) { setDataUrl(""); return; }
    if (payload.length > 2000) { setErr("Payload too long for a scannable QR (max ~2000 chars). Shorten it or use a short URL."); setDataUrl(""); return; }
    QRCode.toDataURL(payload, { width: 440, margin: 2, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch((e: unknown) => setErr((e as Error).message ?? "QR generation failed."));
  }, [payload]);

  const tabs = [{ id: "url", label: "URL" }, { id: "text", label: "Text" }, { id: "wifi", label: "Wi-Fi" }, { id: "vcard", label: "vCard" }, { id: "email", label: "Email" }, { id: "sms", label: "SMS" }];

  return (
    <ToolScaffold tool={tool} next={[{ label: "Encode payload first", to: "/encode" }]}>
      <Panel className="p-4">
        <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${tab === t.id ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}>{t.label}</button>
          ))}
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            {tab === "url" && <Field label="URL"><TextInput value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" /></Field>}
            {tab === "text" && <Field label="Text"><textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" /></Field>}
            {tab === "wifi" && (<>
              <Field label="SSID"><TextInput value={ssid} onChange={(e) => setSsid(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Password"><TextInput value={pw} onChange={(e) => setPw(e.target.value)} type="password" /></Field>
                <Field label="Security"><Select value={enc} onChange={(e) => setEnc(e.target.value)}><option>WPA</option><option>WEP</option><option>nopass</option></Select></Field>
              </div>
            </>)}
            {tab === "vcard" && (<>
              <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
                <Field label="Email"><TextInput value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              </div>
            </>)}
            {tab === "email" && (<>
              <Field label="To"><TextInput value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Body"><TextInput value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            </>)}
            {tab === "sms" && (<>
              <Field label="Number"><TextInput value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Field label="Message"><TextInput value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            </>)}
            <Field label={`Display size: ${size}px`}><input type="range" min={140} max={380} value={size} onChange={(e) => setSize(+e.target.value)} className="w-full accent-emerald-600" /></Field>
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Payload ({payload.length} chars)</p>
              <code className="block break-all rounded-lg bg-zinc-100 p-2.5 font-mono text-[12px] dark:bg-zinc-900">{payload || "(empty)"}</code>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              {err ? <ErrorCallout title="Cannot generate" message={err} />
                : dataUrl ? <img src={dataUrl} alt="Generated QR code" width={size} height={size} style={{ width: size, height: size }} className="rounded-lg" />
                  : <div className="flex h-40 w-40 items-center justify-center text-[13px] text-zinc-400">…</div>}
            </div>
            {dataUrl && <a href={dataUrl} download="devutils-qr.png" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white dark:bg-emerald-600">Download PNG</a>}
            <p className="mt-2 text-center text-[11.5px] text-zinc-500">Rendered locally with error-correction M.<br />Test-scan before printing.</p>
          </div>
        </div>
      </Panel>
    </ToolScaffold>
  );
}
