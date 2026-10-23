/* Phase 7 — pure tool functions: PHP serialization, HTML->JSX, colors,
   safe Markdown rendering, ULID, and number-base conversion. All client-side. */

/* ================= PHP serialize ================= */

export function phpSerialize(value: unknown): string {
  const enc = new TextEncoder();
  const str = (s: string) => `s:${enc.encode(s).length}:"${s}";`;
  if (value === null || value === undefined) return "N;";
  if (typeof value === "boolean") return `b:${value ? 1 : 0};`;
  if (typeof value === "number")
    return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
  if (typeof value === "string") return str(value);
  if (Array.isArray(value))
    return `a:${value.length}:{${value.map((v, i) => `i:${i};${phpSerialize(v)}`).join("")}}`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `a:${entries.length}:{${entries.map(([k, v]) => `${str(k)}${phpSerialize(v)}`).join("")}}`;
  }
  throw new Error(`Unsupported PHP value type: ${typeof value}`);
}

export function phpUnserialize(text: string): unknown {
  const bytes = new TextEncoder().encode(text);
  const dec = new TextDecoder();
  let pos = 0;
  const expect = (ch: number, what: string) => {
    if (pos >= bytes.length || bytes[pos] !== ch) throw new Error(`Malformed PHP data near offset ${pos} (expected ${what})`);
    pos++;
  };
  const readUntil = (ch: number, what: string): string => {
    const start = pos;
    while (pos < bytes.length && bytes[pos] !== ch) pos++;
    if (pos >= bytes.length) throw new Error(`Truncated PHP data (missing ${what})`);
    const out = dec.decode(bytes.slice(start, pos));
    pos++;
    return out;
  };
  const readLen = (what: string): number => {
    const raw = readUntil(0x3a, what);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${what} length "${raw}"`);
    return n;
  };
  function parseValue(): unknown {
    if (pos >= bytes.length) throw new Error("Truncated PHP data");
    const type = String.fromCharCode(bytes[pos]);
    pos++;
    if (type === "N") { expect(0x3b, "';' after N"); return null; }
    expect(0x3a, "':' after type");
    if (type === "b") { const raw = readUntil(0x3b, "';'"); return raw === "1"; }
    if (type === "i" || type === "d") {
      const raw = readUntil(0x3b, "';'");
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Invalid number "${raw}"`);
      return n;
    }
    if (type === "s") {
      const len = readLen("string");
      expect(0x22, "opening quote");
      const s = dec.decode(bytes.slice(pos, pos + len));
      pos += len;
      expect(0x22, "closing quote");
      expect(0x3b, "';' after string");
      return s;
    }
    if (type === "a" || type === "O") {
      let name: string | null = null;
      let count: number;
      if (type === "O") {
        const len = readLen("class name");
        expect(0x22, "opening quote of class name");
        name = dec.decode(bytes.slice(pos, pos + len));
        pos += len;
        expect(0x22, "closing quote of class name");
        expect(0x3a, "':' after class name");
      }
      count = readLen(type === "O" ? "property" : "array entry");
      expect(0x7b, "'{'");
      const obj: Record<string, unknown> = type === "O" ? { __php_class__: name } : {};
      let sequential = type === "a";
      for (let i = 0; i < count; i++) {
        const key = parseValue();
        const val = parseValue();
        const ks = String(key);
        if (type === "a" && ks !== String(i)) sequential = false;
        obj[ks] = val;
      }
      expect(0x7d, "'}'");
      if (type === "a") {
        if (count === 0) return [];
        if (sequential) return Object.values(obj);
      }
      return obj;
    }
    throw new Error(`Unsupported PHP type "${type}" at offset ${pos - 1}`);
  }
  const v = parseValue();
  if (pos !== bytes.length) throw new Error(`Trailing data after offset ${pos}`);
  return v;
}

/* ================= HTML -> JSX ================= */

const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const ATTR_MAP: Record<string, string> = {
  class: "className", for: "htmlFor", tabindex: "tabIndex", readonly: "readOnly",
  maxlength: "maxLength", minlength: "minLength", colspan: "colSpan", rowspan: "rowSpan",
  autocomplete: "autoComplete", autofocus: "autoFocus", autoplay: "autoPlay",
  contenteditable: "contentEditable", crossorigin: "crossOrigin", datetime: "dateTime",
  enctype: "encType", formaction: "formAction", novalidate: "noValidate",
  playsinline: "playsInline", spellcheck: "spellCheck", srcdoc: "srcDoc", srcset: "srcSet",
  usemap: "useMap", accesskey: "accessKey", inputmode: "inputMode",
};

function mapAttr(name: string): string {
  const lower = name.toLowerCase();
  if (ATTR_MAP[lower]) return ATTR_MAP[lower];
  if (lower.startsWith("data-") || lower.startsWith("aria-")) return lower;
  if (!/[-:]/.test(name)) return name;
  return name.split(/[-:]/).map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join("");
}

function jsxStyle(css: string): string {
  const props = css.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const idx = p.indexOf(":");
    if (idx < 0) return null;
    const key = p.slice(0, idx).trim().toLowerCase()
      .split("-").map((seg, i) => (i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1))).join("");
    return `${key}: ${JSON.stringify(p.slice(idx + 1).trim())}`;
  }).filter(Boolean);
  return `{{ ${props.join(", ")} }}`;
}

function transformTag(tag: string): string {
  if (tag.startsWith("</")) return tag;
  const m = /^<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)\/?>$/.exec(tag);
  if (!m) return tag;
  const name = m[1];
  const attrText = m[2] ?? "";
  const attrs: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let am: RegExpExecArray | null;
  while ((am = re.exec(attrText))) {
    const raw = am[1];
    const val = am[2] ?? am[3] ?? am[4] ?? null;
    const key = mapAttr(raw);
    if (val === null) { attrs.push(key); continue; }
    if (raw.toLowerCase() === "style") { attrs.push(`style=${jsxStyle(val)}`); continue; }
    if (val.includes('"')) attrs.push(`${key}={${JSON.stringify(val)}}`);
    else attrs.push(`${key}="${val}"`);
  }
  const selfClose = tag.endsWith("/>") || VOID_TAGS.has(name.toLowerCase());
  return `<${name}${attrs.length ? " " + attrs.join(" ") : ""}${selfClose ? " />" : ">"}`;
}

export function htmlToJsx(html: string): string {
  let out = html.replace(/<!DOCTYPE[^>]*>/gi, "");
  out = out.replace(/<!--([\s\S]*?)-->/g, (_m, c: string) => `{/*${String(c).trim()}*/}`);
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, transformTag);
  return out.trim();
}

/* ================= colors ================= */

export type RGB = { r: number; g: number; b: number };
const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function hslToRgb(h: number, s: number, l: number): RGB {
  const ss = s / 100, ll = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
  return { r: clamp255(f(0) * 255), g: clamp255(f(8) * 255), b: clamp255(f(4) * 255) };
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (max === gg) h = ((bb - rr) / d + 2) * 60;
    else h = ((rr - gg) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d + (g < b ? 6 : 0)) * 60);
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(max ? (d / max) * 100 : 0), v: Math.round(max ? (max / 255) * 100 : 0) };
}

export function parseColor(input: string): RGB {
  const s = input.trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^#?([0-9a-f]{3})$/.exec(s))) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  if ((m = /^#?([0-9a-f]{6})$/.exec(s)))
    return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  if ((m = /^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/.exec(s)))
    return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]) };
  if ((m = /^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/.exec(s)))
    return hslToRgb(+m[1], +m[2], +m[3]);
  throw new Error("Unrecognized color. Use #hex, #hex6, rgb(...) or hsl(...).");
}

export function relLuminance({ r, g, b }: RGB): number {
  const ch = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export type ColorReport = {
  hex: string; rgb: string; hsl: string; hsv: string;
  luminance: number; contrastWhite: number; contrastBlack: number; textOn: "white" | "black";
};

export function colorFormats(input: string): ColorReport {
  const rgb = parseColor(input);
  const hex = "#" + [rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("");
  const hsl = rgbToHsl(rgb);
  const hsv = rgbToHsv(rgb);
  const lum = relLuminance(rgb);
  const cw = (1.0 + 0.05) / (lum + 0.05);
  const cb = (lum + 0.05) / (0.0 + 0.05);
  return {
    hex, rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    hsv: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
    luminance: lum, contrastWhite: cw, contrastBlack: cb,
    textOn: cw >= cb ? "white" : "black",
  };
}

/* ================= markdown (safe, no raw HTML) ================= */

export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function inline(raw: string): string {
    let s = esc(raw);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, url: string) =>
      /^(https?:\/\/|mailto:|\/|#)/i.test(url)
        ? `<a href="${url}" rel="noopener noreferrer nofollow">${t}</a>`
        : t);
    return s;
  }
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];
  let code: string[] = [];
  let inCode = false;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join("<br />")}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.type}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inline).join("<br />")}</blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

for (const raw of md.split(/\r?\n/)) {
    if (inCode) {
      if (/^```/.test(raw.trim())) { out.push(`<pre><code>${code.join("\n")}</code></pre>`); code = []; inCode = false; }
      else code.push(esc(raw));
      continue;
    }
    const t = raw.trim();
    if (/^```/.test(t)) { flushAll(); inCode = true; continue; }
    if (!t) { flushAll(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { flushAll(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { flushAll(); out.push("<hr />"); continue; }
    const ul = /^[-*+]\s+(.*)$/.exec(t);
    if (ul) { flushPara(); flushQuote(); if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; } list.items.push(ul[1]); continue; }
    const ol = /^\d+\.\s+(.*)$/.exec(t);
    if (ol) { flushPara(); flushQuote(); if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; } list.items.push(ol[1]); continue; }
    if (t.startsWith(">")) { flushPara(); flushList(); quote.push(t.replace(/^>\s?/, "")); continue; }
    para.push(t);
  }
  flushAll();
  if (inCode && code.length) out.push(`<pre><code>${code.join("\n")}</code></pre>`);
  return out.join("\n");
}

/* ================= ULID ================= */

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function genUlid(now: number = Date.now()): string {
  let t = now, ts = "";
  for (let i = 0; i < 10; i++) { ts = ULID_ALPHABET[t % 32] + ts; t = Math.floor(t / 32); }
  return ts + Array.from(randomBytes(16), (b) => ULID_ALPHABET[b % 32]).join("");
}

export function validateUlid(input: string): { ok: boolean; reason?: string; timestamp?: number } {
  const s = input.trim().toUpperCase();
  if (!ULID_RE.test(s))
    return { ok: false, reason: "A ULID is exactly 26 chars from Crockford base32 (0-9 A-H J K M N P-T V-Z — no I, L, O, U)." };
  let ts = 0;
  for (let i = 0; i < 10; i++) ts = ts * 32 + ULID_ALPHABET.indexOf(s[i]);
  if (ts > 281474976710655) return { ok: false, reason: "Timestamp overflows the 48-bit ULID range." };
  return { ok: true, timestamp: ts };
}

/* ================= number bases ================= */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function convertBase(input: string, from: number, to: number): string {
  if (!Number.isInteger(from) || from < 2 || from > 36) throw new Error("Source base must be an integer from 2 to 36.");
  if (!Number.isInteger(to) || to < 2 || to > 36) throw new Error("Target base must be an integer from 2 to 36.");
  const clean = input.trim().toLowerCase().replace(/[\s_]/g, "");
  if (clean.startsWith("-")) throw new Error("Negative numbers are not supported.");
  if (!clean) throw new Error("Enter a number first.");
  if (!/^[0-9a-z]+$/.test(clean)) throw new Error("Only alphanumeric digits are allowed.");
  let n = 0n;
  for (const ch of clean) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= from) throw new Error(`Digit "${ch}" is not valid in base ${from}.`);
    n = n * BigInt(from) + BigInt(d);
  }
  if (n === 0n) return "0";
  let out = "";
  const bTo = BigInt(to);
  while (n > 0n) { out = DIGITS[Number(n % bTo)] + out; n /= bTo; }
  return out;
}
