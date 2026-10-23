// DevUtils core engine — all client-side business logic. No eval, no network.
import { sha3_256, sha3_512 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/* ================= JSON ================= */

export type JsonError = { message: string; line: number; column: number; pos: number; hint: string };

export function parseJsonError(input: string, err: unknown): JsonError {
  const msg = err instanceof Error ? err.message : String(err);
  let pos = -1;
  const m1 = msg.match(/position (\d+)/i);
  const m2 = msg.match(/column (\d+)/i);
  const m3 = msg.match(/line (\d+)/i);
  if (m1) pos = parseInt(m1[1], 10);
  // Chrome: "Unexpected token } in JSON at position 42"
  if (pos < 0) {
    const m = msg.match(/at position (\d+)/);
    if (m) pos = parseInt(m[1], 10);
  }
  if (pos < 0 && m2) pos = parseInt(m2[1], 10);
  let line = 1, column = 1;
  if (pos >= 0) {
    const upto = input.slice(0, pos);
    line = (upto.match(/\n/g) || []).length + 1;
    column = pos - (upto.lastIndexOf("\n") + 1) + 1;
  } else if (m3) {
    line = parseInt(m3[1], 10);
  }
  let hint = "Check for a missing comma, quote, or bracket near this location.";
  if (/Unexpected token/.test(msg)) hint = "An unexpected character was found — often a trailing comma or missing quote. Look just before the reported position.";
  if (/Unexpected end/.test(msg)) hint = "The JSON ends abruptly — a closing bracket, brace or quote is missing.";
  if (/Expected property name/.test(msg)) hint = "Object keys must be double-quoted strings, e.g. {\"key\": 1}.";
  return { message: msg, line, column, pos, hint };
}

export function formatJson(input: string, indent = 2): string {
  return JSON.stringify(JSON.parse(input), null, indent);
}
export function minifyJson(input: string): string {
  return JSON.stringify(JSON.parse(input));
}
export function sortJson(input: string): string {
  const v = JSON.parse(input);
  return JSON.stringify(sortDeep(v), null, 2);
}
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    Object.keys(v as Record<string, unknown>).sort().forEach((k) => { out[k] = sortDeep((v as Record<string, unknown>)[k]); });
    return out;
  }
  return v;
}
export function flattenJson(input: string, sep = "."): Record<string, unknown> {
  const v = JSON.parse(input);
  const out: Record<string, unknown> = {};
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      if (node.length === 0) out[path] = [];
      node.forEach((el, i) => walk(el, path ? `${path}${sep}${i}` : `${i}`));
    } else if (node && typeof node === "object") {
      const keys = Object.keys(node as object);
      if (keys.length === 0 && path) out[path] = {};
      keys.forEach((k) => walk((node as Record<string, unknown>)[k], path ? `${path}${sep}${k}` : k));
    } else out[path] = node;
  };
  walk(v, "");
  if ("" in out && Object.keys(out).length === 1) return { value: out[""] };
  return out;
}
export function unflattenJson(flat: Record<string, unknown>, sep = "."): unknown {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(sep);
    let cur: Record<string, unknown> = root;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = value;
      else {
        if (typeof cur[p] !== "object" || cur[p] === null) {
          cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        }
        cur = cur[p] as Record<string, unknown>;
      }
    });
  }
  // convert numeric-key objects to arrays
  const fix = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(fix);
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      const ks = Object.keys(o);
      if (ks.length && ks.every((k) => /^\d+$/.test(k))) {
        const arr: unknown[] = [];
        ks.map(Number).sort((a, b) => a - b).forEach((k) => { arr[k] = fix(o[String(k)]); });
        return arr;
      }
      ks.forEach((k) => { o[k] = fix(o[k]); });
    }
    return n;
  };
  return fix(root);
}
export function extractKeyPaths(input: string): string[] {
  const v = JSON.parse(input);
  const paths = new Set<string>();
  const walk = (n: unknown, p: string) => {
    if (Array.isArray(n)) n.forEach((el, i) => walk(el, `${p}[${i}]`));
    else if (n && typeof n === "object") Object.entries(n as Record<string, unknown>).forEach(([k, val]) => {
      const np = p ? `${p}.${k}` : k; paths.add(np); walk(val, np);
    });
  };
  walk(v, "$");
  return [...paths];
}
/** Minimal JSONPath: supports $, ., [n], [*], .*, ['key'] */
export function queryJsonPath(input: string, path: string): unknown {
  const root = JSON.parse(input);
  let p = path.trim();
  if (!p.startsWith("$")) throw new Error("JSONPath must start with $ (e.g. $.store.book[0].title)");
  p = p.slice(1);
  const tokens: (string | number | "*")[] = [];
  // simpler manual tokenizer
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === ".") {
      if (p[i + 1] === "*") { tokens.push("*"); i += 2; continue; }
      i++;
      let name = "";
      while (i < p.length && /[\w$]/.test(p[i])) name += p[i++];
      if (!name) throw new Error(`Invalid path near "${p.slice(Math.max(0, i - 4), i + 4)}"`);
      tokens.push(name);
    } else if (c === "[") {
      const j = p.indexOf("]", i);
      if (j < 0) throw new Error("Unclosed [ in JSONPath");
      const inner = p.slice(i + 1, j).trim();
      if (inner === "*") tokens.push("*");
      else if (/^-?\d+$/.test(inner)) tokens.push(parseInt(inner, 10));
      else if ((inner.startsWith("'") && inner.endsWith("'")) || (inner.startsWith('"') && inner.endsWith('"'))) tokens.push(inner.slice(1, -1));
      else throw new Error(`Unsupported bracket expression [${inner}]. Supported: [0], [*], ['key']`);
      i = j + 1;
    } else if (/\s/.test(c)) i++;
    else throw new Error(`Unexpected character "${c}" in JSONPath. Use dot and bracket notation.`);
  }
  let current: unknown[] = [root];
  for (const t of tokens) {
    const next: unknown[] = [];
    for (const node of current) {
      if (t === "*") {
        if (Array.isArray(node)) next.push(...node);
        else if (node && typeof node === "object") next.push(...Object.values(node as Record<string, unknown>));
      } else if (typeof t === "number") {
        if (Array.isArray(node)) {
          const idx = t < 0 ? node.length + t : t;
          if (idx >= 0 && idx < node.length) next.push(node[idx]);
        }
      } else {
        if (node && typeof node === "object" && t in (node as Record<string, unknown>)) next.push((node as Record<string, unknown>)[t]);
      }
    }
    current = next;
  }
  return current.length === 1 ? current[0] : current;
}

function pointerTokens(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error('JSON Pointer must be empty (root) or start with "/", e.g. /users/0/name.');
  return pointer.slice(1).split("/").map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function pointerValue(root: unknown, pointer: string): unknown {
  let current = root;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(token)) throw new Error(`Pointer segment "${token}" is not a valid array index.`);
      const index = Number(token);
      if (index < 0 || index >= current.length) throw new Error(`Array index ${index} is out of bounds.`);
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(token in (current as Record<string, unknown>))) throw new Error(`Property "${token}" does not exist.`);
      current = (current as Record<string, unknown>)[token];
    } else throw new Error(`Cannot traverse "${token}" because its parent is not an object or array.`);
  }
  return current;
}

export function queryJsonPointer(input: string, pointer: string): unknown {
  return pointerValue(JSON.parse(input), pointer.trim());
}

function pointerParent(root: unknown, pointer: string): { parent: unknown; key: string } {
  const tokens = pointerTokens(pointer);
  if (!tokens.length) throw new Error("This operation cannot target the document root.");
  const key = tokens[tokens.length - 1];
  const parentPointer = tokens.slice(0, -1).map((token) => `/${token.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
  return { parent: pointerValue(root, parentPointer), key };
}

function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export type JsonPatchOperation = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
};

export function applyJsonPatch(input: string, patchInput: string): string {
  let document = cloneJson(JSON.parse(input));
  const patch = JSON.parse(patchInput) as JsonPatchOperation[];
  if (!Array.isArray(patch)) throw new Error("JSON Patch must be an array of operation objects.");

  const add = (path: string, value: unknown) => {
    if (path === "") { document = cloneJson(value); return; }
    const { parent, key } = pointerParent(document, path);
    if (Array.isArray(parent)) {
      if (key === "-") parent.push(cloneJson(value));
      else {
        if (!/^\d+$/.test(key) || Number(key) > parent.length) throw new Error(`Invalid array add index "${key}".`);
        parent.splice(Number(key), 0, cloneJson(value));
      }
    } else if (parent && typeof parent === "object") (parent as Record<string, unknown>)[key] = cloneJson(value);
    else throw new Error(`Cannot add at ${path}: parent is not a container.`);
  };
  const remove = (path: string): unknown => {
    if (path === "") { const old = document; document = null; return old; }
    const { parent, key } = pointerParent(document, path);
    if (Array.isArray(parent)) {
      if (!/^\d+$/.test(key) || Number(key) >= parent.length) throw new Error(`Invalid array remove index "${key}".`);
      return parent.splice(Number(key), 1)[0];
    }
    if (parent && typeof parent === "object" && key in (parent as Record<string, unknown>)) {
      const old = (parent as Record<string, unknown>)[key];
      delete (parent as Record<string, unknown>)[key];
      return old;
    }
    throw new Error(`Cannot remove ${path}: target does not exist.`);
  };

  patch.forEach((operation, index) => {
    if (!operation || typeof operation !== "object" || !operation.op || typeof operation.path !== "string") throw new Error(`Patch operation ${index + 1} needs op and path.`);
    try {
      if (operation.op === "add") add(operation.path, operation.value);
      else if (operation.op === "remove") remove(operation.path);
      else if (operation.op === "replace") { pointerValue(document, operation.path); remove(operation.path); add(operation.path, operation.value); }
      else if (operation.op === "copy") { if (typeof operation.from !== "string") throw new Error("copy needs from"); add(operation.path, pointerValue(document, operation.from)); }
      else if (operation.op === "move") { if (typeof operation.from !== "string") throw new Error("move needs from"); const value = remove(operation.from); add(operation.path, value); }
      else if (operation.op === "test") {
        const actual = pointerValue(document, operation.path);
        if (JSON.stringify(actual) !== JSON.stringify(operation.value)) throw new Error(`test failed at ${operation.path}`);
      } else throw new Error(`Unsupported op "${String(operation.op)}".`);
    } catch (error) { throw new Error(`Patch operation ${index + 1} (${operation.op} ${operation.path}) failed: ${(error as Error).message}`); }
  });
  return JSON.stringify(document, null, 2);
}

function mergePatchValue(target: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return cloneJson(patch);
  const output: Record<string, unknown> = target && typeof target === "object" && !Array.isArray(target) ? cloneJson(target as Record<string, unknown>) : {};
  Object.entries(patch as Record<string, unknown>).forEach(([key, value]) => {
    if (value === null) delete output[key];
    else output[key] = mergePatchValue(output[key], value);
  });
  return output;
}

export function applyJsonMergePatch(input: string, patchInput: string): string {
  return JSON.stringify(mergePatchValue(JSON.parse(input), JSON.parse(patchInput)), null, 2);
}

function tsType(v: unknown, seen: number): string {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "unknown[]";
    const t = new Set(v.map((el) => tsType(el, seen)));
    return t.size === 1 ? `${[...t][0]}[]` : "unknown[]";
  }
  if (typeof v === "object") return seen > 2 ? "Record<string, unknown>" : "object";
  return typeof v === "string" ? "string" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "unknown";
}
function toPascal(s: string) { return s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "") || "Root"; }

export function jsonToTypeScript(input: string, rootName = "Root"): string {
  const v = JSON.parse(input);
  const blocks: string[] = [];
  const build = (node: unknown, name: string, depth: number): string => {
    if (Array.isArray(node)) {
      if (!node.length) return "unknown[]";
      const first = node[0];
      if (first && typeof first === "object" && !Array.isArray(first)) return `${build(first, name, depth)}[]`;
      return `${tsType(first, depth)}[]`;
    }
    if (node && typeof node === "object") {
      const iface = toPascal(name);
      const lines = Object.entries(node as Record<string, unknown>).map(([k, val]) => {
        const safe = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
        let t: string;
        if (Array.isArray(val) && val.length && val[0] && typeof val[0] === "object" && !Array.isArray(val[0])) t = `${build(val[0], `${name}${toPascal(k)}`, depth + 1)}[]`;
        else if (val && typeof val === "object" && !Array.isArray(val)) t = build(val, `${name}${toPascal(k)}`, depth + 1);
        else t = tsType(val, depth);
        const opt = val === null ? "?" : "";
        return `  ${safe}${opt}: ${t};`;
      });
      blocks.push(`export interface ${iface} {\n${lines.join("\n")}\n}`);
      return iface;
    }
    return tsType(node, depth);
  };
  const root = build(v, rootName, 0);
  if (typeof v !== "object" || v === null) return `export type ${toPascal(rootName)} = ${root};`;
  return blocks.reverse().join("\n\n");
}
export function jsonToPython(input: string, rootName = "Root"): string {
  const v = JSON.parse(input);
  const pyVal = (x: unknown): string => {
    if (x === null) return "None";
    if (Array.isArray(x)) return `[${x.map(pyVal).join(", ")}]`;
    if (typeof x === "object") return `{${Object.entries(x as Record<string, unknown>).map(([k, val]) => `${JSON.stringify(k)}: ${pyVal(val)}`).join(", ")}}`;
    return JSON.stringify(x) ?? String(x);
  };
  return `data = ${pyVal(v)}\n\n# Typed access (Python 3.11+):\n# from typing import TypedDict\n# class ${toPascal(rootName)}(TypedDict): ...`;
}
export function jsonToGo(input: string, rootName = "Root"): string {
  const v = JSON.parse(input);
  const goType = (x: unknown): string => {
    if (x === null) return "interface{}";
    if (Array.isArray(x)) return x.length ? `[]${goType(x[0])}` : "[]interface{}";
    if (typeof x === "object") return "struct{}";
    return typeof x === "string" ? "string" : typeof x === "number" ? (Number.isInteger(x) ? "int" : "float64") : typeof x === "boolean" ? "bool" : "interface{}";
  };
  const blocks: string[] = [];
  const build = (node: unknown, name: string): string => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const lines = Object.entries(node as Record<string, unknown>).map(([k, val]) => {
        const field = toPascal(k);
        let t: string;
        if (val && typeof val === "object" && !Array.isArray(val)) t = build(val, name + field);
        else if (Array.isArray(val) && val.length && val[0] && typeof val[0] === "object" && !Array.isArray(val[0])) t = `[]${build(val[0], name + field)}`;
        else t = goType(val);
        return `\t${field} ${t} \`json:"${k}"\``;
      });
      blocks.push(`type ${toPascal(name)} struct {\n${lines.join("\n")}\n}`);
      return toPascal(name);
    }
    return goType(node);
  };
  const r = build(v, rootName);
  return `package main\n\n${blocks.reverse().join("\n\n")}\n\n// Root type: ${r}`;
}
function oopClass(input: string, rootName: string, lang: "java" | "csharp"): string {
  const v = JSON.parse(input);
  const jt = (x: unknown): string => {
    if (x === null) return lang === "java" ? "Object" : "object?";
    if (Array.isArray(x)) { const inner = x.length ? jt(x[0]) : (lang === "java" ? "Object" : "object"); return lang === "java" ? `List<${inner}>` : `List<${inner}>`; }
    if (typeof x === "object") return "object";
    return typeof x === "string" ? "String" : typeof x === "number" ? (Number.isInteger(x) ? "int" : "double") : "boolean";
  };
  const cs = (x: unknown): string => {
    if (x === null) return "object?";
    if (Array.isArray(x)) return `List<${x.length ? cs(x[0]) : "object"}>`;
    if (typeof x === "object") return "object";
    return typeof x === "string" ? "string" : typeof x === "number" ? (Number.isInteger(x) ? "int" : "double") : "bool";
  };
  const pick = lang === "java" ? jt : cs;
  if (!v || typeof v !== "object" || Array.isArray(v)) return lang === "java" ? `// Root value type: ${jt(v)}\n// Wrap arrays in a class for Jackson/Gson.` : `// Root value type: ${cs(v)}`;
  const lines = Object.entries(v as Record<string, unknown>).map(([k, val]) => {
    if (lang === "java") return `    private ${pick(val)} ${k};  // + getter/setter`;
    return `    public ${pick(val)} ${toPascal(k)} { get; set; }`;
  });
  return lang === "java"
    ? `public class ${toPascal(rootName)} {\n${lines.join("\n")}\n}`
    : `public class ${toPascal(rootName)}\n{\n${lines.join("\n")}\n}`;
}
export const jsonToJava = (i: string, r = "Root") => oopClass(i, r, "java");
export const jsonToCSharp = (i: string, r = "Root") => oopClass(i, r, "csharp");
export function jsonToJavaScript(input: string): string {
  const v = JSON.parse(input);
  return `const data = ${JSON.stringify(v, null, 2)};\n\nexport default data;`;
}

export function jsonToSchema(input: string): string {
  const v = JSON.parse(input);
  const schemaOf = (x: unknown): Record<string, unknown> => {
    if (x === null) return { type: "null" };
    if (Array.isArray(x)) return x.length ? { type: "array", items: schemaOf(x[0]) } : { type: "array" };
    if (typeof x === "object") {
      const props: Record<string, unknown> = {};
      Object.entries(x as Record<string, unknown>).forEach(([k, val]) => { props[k] = schemaOf(val); });
      return { type: "object", properties: props, required: Object.keys(props) };
    }
    if (typeof x === "string") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(x)) return { type: "string", format: "date-time" };
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) return { type: "string", format: "email" };
      if (/^https?:\/\//.test(x)) return { type: "string", format: "uri" };
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)) return { type: "string", format: "uuid" };
      return { type: "string" };
    }
    return { type: typeof x === "number" ? (Number.isInteger(x) ? "integer" : "number") : "boolean" };
  };
  return JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", ...schemaOf(v) }, null, 2);
}

export function validateAgainstSchema(instance: unknown, schema: Record<string, unknown>, path = "$"): string[] {
  const errors: string[] = [];
  const t = schema.type as string | undefined;
  const check = (val: unknown, sch: Record<string, unknown>, p: string) => {
    const st = sch.type as string | undefined;
    if (!st) return;
    const actual = val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
    const normActual = actual === "number" && sch.type === "integer" ? (Number.isInteger(val) ? "integer" : "number") : actual;
    if (st !== normActual && !(st === "number" && actual === "number")) { errors.push(`${p}: expected ${st}, got ${actual}`); return; }
    if (st === "object") {
      const props = (sch.properties as Record<string, Record<string, unknown>>) || {};
      const req = (sch.required as string[]) || [];
      req.forEach((k) => { if (!(val as Record<string, unknown>) || !((val as Record<string, unknown>)[k] !== undefined)) errors.push(`${p}.${k}: required property missing`); });
      Object.entries(props).forEach(([k, sub]) => { if ((val as Record<string, unknown>)?.[k] !== undefined) check((val as Record<string, unknown>)[k], sub, `${p}.${k}`); });
    }
    if (st === "array" && sch.items) (val as unknown[]).forEach((el, i) => check(el, sch.items as Record<string, unknown>, `${p}[${i}]`));
    if (sch.enum && !(sch.enum as unknown[]).includes(val)) errors.push(`${p}: value not in enum`);
  };
  check(instance, schema, path);
  void t;
  return errors;
}

/* ================= YAML (subset, round-trip safe) ================= */

export function yamlStringify(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value === "" || /[:#\[\]{},&*!|>'"%@`]|^\s|\s$|\n/.test(value) || /^(true|false|null|yes|no|\d)/i.test(value)) return JSON.stringify(value);
    return value;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((el) => {
      if (el && typeof el === "object") return `${pad}-\n${yamlStringify(el, indent + 1).split("\n").map((l) => `${"  ".repeat(indent + 1)}${l}`).join("\n")}`.replace(`${"  ".repeat(indent + 1)}`, `${pad}  `);
      return `${pad}- ${yamlStringify(el, 0)}`;
    }).join("\n");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return entries.map(([k, val]) => {
    const key = /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
    if (val && typeof val === "object") {
      if (Array.isArray(val) && !val.length) return `${pad}${key}: []`;
      const nested = yamlStringify(val, indent + 1);
      if (Array.isArray(val)) return `${pad}${key}:\n${nested}`;
      if (!Object.keys(val as object).length) return `${pad}${key}: {}`;
      return `${pad}${key}:\n${nested}`;
    }
    return `${pad}${key}: ${yamlStringify(val, 0)}`;
  }).join("\n");
}

export function yamlParse(src: string): unknown {
  const lines = src.split("\n").map((l) => l.replace(/\r$/, ""));
  let i = 0;
  const parseScalar = (s: string): unknown => {
    const t = s.trim();
    if (t === "" || t === "~" || t === "null" || t === "Null" || t === "NULL") return null;
    if (t === "true" || t === "True" || t === "TRUE") return true;
    if (t === "false" || t === "False" || t === "FALSE") return false;
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) { try { return JSON.parse(t.startsWith("'") ? `"${t.slice(1, -1).replace(/"/g, '\\"')}"` : t); } catch { return t.slice(1, -1); } }
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
    if (t === "[]" ) return [];
    if (t === "{}") return {};
    if (t.startsWith("[") && t.endsWith("]")) { try { return JSON.parse(t); } catch { /* fallthrough */ } }
    return t;
  };
  const indentOf = (l: string) => l.length - l.trimStart().length;
  function parseBlock(minIndent: number): unknown {
    // skip blanks/comments
    while (i < lines.length && (lines[i].trim() === "" || lines[i].trimStart().startsWith("#"))) i++;
    if (i >= lines.length) return null;
    const ind = indentOf(lines[i]);
    if (ind < minIndent) return null;
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("- ") || trimmed === "-") {
      const arr: unknown[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === "" || l.trimStart().startsWith("#")) { i++; continue; }
        if (indentOf(l) !== ind || !l.trimStart().startsWith("-")) break;
        const rest = l.trimStart().slice(1).trimStart();
        i++;
        if (rest === "") {
          arr.push(parseBlock(ind + 1) ?? null);
        } else if (/^[^:[\]{}]+:\s*(.*)$/.test(rest) && !rest.startsWith('"') && !rest.startsWith("'") && !rest.startsWith("[") && !rest.startsWith("{")) {
          // inline map start: "- key: value"
          const subLines = [(" ".repeat(ind + 2)) + rest];
          let j = i;
          while (j < lines.length && (lines[j].trim() === "" || indentOf(lines[j]) > ind)) { subLines.push(lines[j]); j++; }
          const saved = lines.slice(); const savedI = i;
          // temporarily parse sublines
          const outerLines = lines; const outerI = i;
          void outerLines; void outerI;
          const backup = lines.splice(0, lines.length, ...subLines);
          i = 0;
          const obj = parseBlock(ind + 2);
          backup.splice(0, backup.length);
          lines.splice(0, lines.length, ...saved);
          i = j;
          void savedI;
          arr.push(obj);
        } else arr.push(parseScalar(rest));
      }
      return arr;
    }
    // mapping
    const obj: Record<string, unknown> = {};
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "" || l.trimStart().startsWith("#")) { i++; continue; }
      const ind2 = indentOf(l);
      if (ind2 < ind) break;
      if (ind2 > ind) { i++; continue; }
      const m = l.trimStart().match(/^([^:#\[\]{},]+?):\s*(.*)$/);
      if (!m) {
        // maybe a scalar doc
        if (Object.keys(obj).length === 0) return parseScalar(l.trim());
        break;
      }
      let key = m[1].trim();
      if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
      const rest = m[2].trim();
      i++;
      if (rest === "" || rest === "|" || rest === ">") {
        // block scalar or nested
        let j = i;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j < lines.length && indentOf(lines[j]) > ind) {
          if (rest === "|" || rest === ">") {
            const buf: string[] = [];
            while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > ind)) { buf.push(lines[i].trim()); i++; }
            obj[key] = rest === "|" ? buf.join("\n") : buf.join(" ");
          } else obj[key] = parseBlock(ind + 1) ?? null;
        } else obj[key] = null;
      } else obj[key] = parseScalar(rest.split(" #")[0]);
    }
    return obj;
  }
  const out = parseBlock(0);
  return out ?? null;
}

export const jsonToYaml = (input: string) => yamlStringify(JSON.parse(input));
export const yamlToJson = (input: string, indent = 2) => JSON.stringify(yamlParse(input), null, indent);

/* ================= CSV ================= */

export function csvParse(src: string, delimiter = ","): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], inQ = false;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (inQ) {
      if (c === '"') { if (src[k + 1] === '"') { cur += '"'; k++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delimiter) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  row.push(cur); rows.push(row);
  const clean = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim());
  return clean.slice(1).map((r) => { const o: Record<string, string> = {}; head.forEach((h, idx) => { o[h || `col${idx + 1}`] = (r[idx] ?? "").trim(); }); return o; });
}
export function csvStringify(rows: Record<string, unknown>[], delimiter = ","): string {
  if (!rows.length) return "";
  const head = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n\r,]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(delimiter), ...rows.map((r) => head.map((h) => esc(r[h])).join(delimiter))].join("\n");
}
export function jsonToCsv(input: string): string {
  const v = JSON.parse(input);
  const rows = Array.isArray(v) ? v : [v];
  if (!rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) throw new Error("JSON → CSV needs an array of objects (or a single object). Nested objects are stringified.");
  const flat = rows.map((r) => { const o: Record<string, unknown> = {}; Object.entries(r as Record<string, unknown>).forEach(([k, val]) => { o[k] = val && typeof val === "object" ? JSON.stringify(val) : val; }); return o; });
  return csvStringify(flat);
}
export const csvToJson = (input: string, indent = 2) => JSON.stringify(csvParse(input).map((r) => { const o: Record<string, unknown> = {}; Object.entries(r).forEach(([k, val]) => { o[k] = coerceCsv(val); }); return o; }), null, indent);
function coerceCsv(s: string): unknown {
  if (s === "") return "";
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?(\d+\.\d*)([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
  return s;
}

/* ================= XML ================= */

function escXml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export function jsonToXml(input: string, root = "root"): string {
  const v = JSON.parse(input);
  const build = (node: unknown, tag: string, depth: number): string => {
    const pad = "  ".repeat(depth);
    if (node === null || node === undefined) return `${pad}<${tag}/>`;
    if (Array.isArray(node)) return node.map((el) => build(el, tag, depth)).join("\n");
    if (typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      if (!entries.length) return `${pad}<${tag}/>`;
      const inner = entries.map(([k, val]) => {
        const safe = /^[A-Za-z_][\w.-]*$/.test(k) ? k : "field";
        if (Array.isArray(val)) return val.map((el) => build(el, safe, depth + 1)).join("\n");
        return build(val, safe, depth + 1);
      }).join("\n");
      return `${pad}<${tag}>\n${inner}\n${pad}</${tag}>`;
    }
    return `${pad}<${tag}>${escXml(String(node))}</${tag}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${build(v, /^[A-Za-z_][\w.-]*$/.test(root) ? root : "root", 0)}`;
}
export function xmlToJson(input: string, indent = 2): string {
  const doc = new DOMParser().parseFromString(input, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("Invalid XML: " + (err.textContent || "").slice(0, 200));
  const conv = (el: Element): unknown => {
    const children = [...el.children];
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim();
    if (!children.length) return text === "" ? null : coerceXml(text);
    const o: Record<string, unknown> = {};
    children.forEach((c) => {
      const val = conv(c);
      if (c.tagName in o) { if (!Array.isArray(o[c.tagName])) o[c.tagName] = [o[c.tagName]]; (o[c.tagName] as unknown[]).push(val); }
      else o[c.tagName] = val;
    });
    if (text) o["#text"] = coerceXml(text);
    return o;
  };
  const root = doc.documentElement;
  return JSON.stringify({ [root.tagName]: conv(root) }, null, indent);
}
function coerceXml(s: string): unknown {
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?(\d+\.\d*)([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  return s;
}
export function formatXml(input: string): string {
  // lightweight pretty printer (token-based, safe)
  const tokens = input.replace(/>\s+</g, "><").replace(/(<\?[^?]*\?>)/g, "$1\n").split(/(<[^>]+>)/g).filter((t) => t.trim() !== "");
  let depth = 0; const out: string[] = [];
  for (const tok of tokens) {
    if (/^<\?.*\?>$/.test(tok)) { out.push(tok); continue; }
    if (/^<!--/.test(tok)) { out.push("  ".repeat(depth) + tok); continue; }
    if (/^<\/[^>]+>$/.test(tok)) { depth = Math.max(0, depth - 1); out.push("  ".repeat(depth) + tok); }
    else if (/^<[^>]+\/>$/.test(tok)) out.push("  ".repeat(depth) + tok);
    else if (/^<[^/!?][^>]*>$/.test(tok)) { out.push("  ".repeat(depth) + tok); depth++; }
    else out.push("  ".repeat(depth) + tok.trim());
  }
  return out.join("\n");
}

/* ================= TOML (subset) ================= */

export function jsonToToml(input: string): string {
  const v = JSON.parse(input);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("JSON → TOML needs a top-level object.");
  const lines: string[] = [];
  const tomlVal = (x: unknown): string => {
    if (typeof x === "string") return JSON.stringify(x);
    if (typeof x === "number" || typeof x === "boolean") return String(x);
    if (x === null) throw new Error("TOML has no null — remove null values first.");
    if (Array.isArray(x)) return `[ ${x.map(tomlVal).join(", ")} ]`;
    throw new Error("Nested object must be a [section]");
  };
  const entries = Object.entries(v as Record<string, unknown>);
  // Scalars/arrays first, sections last — otherwise keys after [section] would bind to it.
  entries.filter(([, val]) => !(val && typeof val === "object" && !Array.isArray(val)))
    .forEach(([k, val]) => lines.push(`${k} = ${tomlVal(val)}`));
  entries.filter(([, val]) => val && typeof val === "object" && !Array.isArray(val))
    .forEach(([k, val]) => {
      lines.push(`\n[${k}]`);
      Object.entries(val as Record<string, unknown>).forEach(([k2, v2]) => {
        if (v2 && typeof v2 === "object") throw new Error(`Deep nesting under [${k}.${k2}] is not supported in this TOML subset.`);
        lines.push(`${k2} = ${tomlVal(v2)}`);
      });
    });
  return lines.join("\n").trim() + "\n";
}
export function tomlToJson(input: string, indent = 2): string {
  const out: Record<string, unknown> = {};
  let section = out;
  const parseVal = (s: string): unknown => {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) { try { return JSON.parse(t.startsWith("'") ? `"${t.slice(1, -1)}"` : t); } catch { return t.slice(1, -1); } }
    if (t === "true") return true; if (t === "false") return false;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?[\d.]+([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
    if (t.startsWith("[") && t.endsWith("]")) { try { return JSON.parse(t); } catch { throw new Error(`Cannot parse array: ${t}`); } }
    throw new Error(`Cannot parse TOML value: ${t}`);
  };
  input.split("\n").forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { const name = sec[1].trim(); if (!out[name] || typeof out[name] !== "object") out[name] = {}; section = out[name] as Record<string, unknown>; return; }
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!m) throw new Error(`Invalid TOML at line ${idx + 1}: ${line}`);
    section[m[1]] = parseVal(m[2].split(" #")[0]);
  });
  return JSON.stringify(out, null, indent);
}

/* ================= ENCODING ================= */

const te = new TextEncoder(); const td = new TextDecoder();
export function b64encode(s: string): string {
  const bytes = te.encode(s); let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
export function b64decode(s: string): string {
  const clean = s.trim().replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error("Invalid Base64: length must be a multiple of 4 with valid alphabet A–Z a–z 0–9 + / and up to two = pads.");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return td.decode(bytes);
}
export function b64urlEncode(s: string): string { return b64encode(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function b64urlDecode(s: string): string {
  let t = s.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t)) throw new Error("Invalid Base64URL: bad characters.");
  while (t.length % 4) t += "=";
  return b64decode(t);
}
export function htmlEncode(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
export function htmlDecode(s: string): string {
  const el = document.createElement("textarea"); el.innerHTML = s; return el.value;
}
export function xmlEncode(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export function xmlDecode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
export function hexEncode(s: string): string { return [...te.encode(s)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export function hexDecode(s: string): string {
  const t = s.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]*$/.test(t) || t.length % 2) throw new Error("Invalid Hex: expected pairs of 0–9 a–f (e.g. 68656c6c6f).");
  const bytes = new Uint8Array(t.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  return td.decode(bytes);
}
export function binEncode(s: string): string { return [...te.encode(s)].map((b) => b.toString(2).padStart(8, "0")).join(" "); }
export function binDecode(s: string): string {
  const t = s.trim().replace(/0b/g, "").split(/[\s,;]+/).filter(Boolean);
  if (!t.length) throw new Error("Invalid Binary: expected 8-bit groups like 01101000.");
  const bytes = t.map((g) => { if (!/^[01]{1,8}$/.test(g)) throw new Error(`Invalid binary group "${g}" — use only 0 and 1.`); return parseInt(g, 2); });
  return td.decode(new Uint8Array(bytes));
}
export function octEncode(s: string): string { return [...te.encode(s)].map((b) => b.toString(8).padStart(3, "0")).join(" "); }
export function octDecode(s: string): string {
  const t = s.trim().split(/[\s,;\\]+/).filter(Boolean).map((g) => g.replace(/^0/, ""));
  const bytes = t.map((g) => { const v = g.startsWith("o") ? g.slice(1) : g; if (!/^[0-7]{1,3}$/.test(v)) throw new Error(`Invalid octal group "${g}".`); return parseInt(v, 8); });
  return td.decode(new Uint8Array(bytes));
}
export function decEncode(s: string): string { return [...te.encode(s)].join(" "); }
export function decDecode(s: string): string {
  const t = s.trim().split(/[\s,;]+/).filter(Boolean);
  const bytes = t.map((g) => { if (!/^\d{1,3}$/.test(g) || +g > 255) throw new Error(`Invalid decimal byte "${g}" (0–255).`); return +g; });
  return td.decode(new Uint8Array(bytes));
}
export function asciiEncode(s: string): string {
  return [...s].map((char) => {
    const value = char.codePointAt(0)!;
    if (value > 127) throw new Error(`"${char}" is not ASCII. Use UTF-8 bytes or Unicode escapes instead.`);
    return String(value);
  }).join(" ");
}
export function asciiDecode(s: string): string {
  return s.trim().split(/[\s,;]+/).filter(Boolean).map((group) => {
    if (!/^\d{1,3}$/.test(group) || Number(group) > 127) throw new Error(`Invalid ASCII code "${group}" (expected 0–127).`);
    return String.fromCharCode(Number(group));
  }).join("");
}
export function utf8BytesEncode(s: string): string { return [...te.encode(s)].map((byte) => byte.toString(16).padStart(2, "0")).join(" "); }
export function utf8BytesDecode(s: string): string {
  const groups = s.trim().split(/[\s,;]+/).filter(Boolean);
  const bytes = groups.map((group) => {
    const value = group.replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{2}$/.test(value)) throw new Error(`Invalid UTF-8 byte "${group}". Use two hex digits per byte.`);
    return parseInt(value, 16);
  });
  return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
}
export function unicodeEscape(s: string): string { return [...s].map((c) => { const cp = c.codePointAt(0)!; return cp > 127 ? `\\u{${cp.toString(16)}}` : c; }).join(""); }
export function unicodeUnescape(s: string): string {
  try {
    return s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
  } catch { throw new Error("Invalid unicode escape sequence."); }
}
export function rot13(s: string): string { return s.replace(/[a-zA-Z]/g, (c) => String.fromCharCode((c <= "Z" ? 65 : 97) + ((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26))); }
export function rot47(s: string): string { return [...s].map((c) => { const n = c.charCodeAt(0); return n >= 33 && n <= 126 ? String.fromCharCode(33 + ((n - 33 + 47) % 94)) : c; }).join(""); }
const MORSE: Record<string, string> = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", " ": "/" };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
export function morseEncode(s: string): string { return [...s.toLowerCase()].map((c) => MORSE[c] ?? (c === " " ? "/" : "")).filter((x) => x !== "").join(" "); }
export function morseDecode(s: string): string {
  return s.trim().split(/\s+/).map((g) => { if (g === "/") return " "; const c = MORSE_REV[g]; if (!c) throw new Error(`Invalid morse group "${g}".`); return c; }).join("");
}
export const CODECS: { id: string; name: string; encode: (s: string) => string; decode: (s: string) => string }[] = [
  { id: "base64", name: "Base64", encode: b64encode, decode: b64decode },
  { id: "base64url", name: "Base64URL", encode: b64urlEncode, decode: b64urlDecode },
  { id: "url", name: "URL Component", encode: (s) => encodeURIComponent(s), decode: (s) => { try { return decodeURIComponent(s); } catch { throw new Error("Invalid percent-encoding."); } } },
  { id: "html", name: "HTML Entities", encode: htmlEncode, decode: htmlDecode },
  { id: "xml", name: "XML Escaping", encode: xmlEncode, decode: xmlDecode },
  { id: "utf8", name: "UTF-8 bytes", encode: utf8BytesEncode, decode: utf8BytesDecode },
  { id: "ascii", name: "ASCII decimal", encode: asciiEncode, decode: asciiDecode },
  { id: "hex", name: "Hex", encode: hexEncode, decode: hexDecode },
  { id: "binary", name: "Binary", encode: binEncode, decode: binDecode },
  { id: "octal", name: "Octal", encode: octEncode, decode: octDecode },
  { id: "decimal", name: "Decimal bytes", encode: decEncode, decode: decDecode },
  { id: "unicode", name: "Unicode escapes", encode: unicodeEscape, decode: unicodeUnescape },
  { id: "rot13", name: "ROT13", encode: rot13, decode: rot13 },
  { id: "rot47", name: "ROT47", encode: rot47, decode: rot47 },
  { id: "morse", name: "Morse", encode: morseEncode, decode: morseDecode },
  { id: "upperhex", name: "Hex (0x, upper)", encode: (s) => "0x" + hexEncode(s).toUpperCase(), decode: hexDecode },
  { id: "datauri", name: "Data URI (text/plain)", encode: (s) => `data:text/plain;charset=utf-8;base64,${b64encode(s)}`, decode: (s) => { const m = s.match(/^data:[^,]*;base64,(.*)$/s); if (!m) throw new Error("Expected a data:…;base64, URI."); return b64decode(m[1]); } },
  { id: "quoted", name: "Quoted-printable-ish", encode: (s) => [...te.encode(s)].map((b) => (b >= 33 && b <= 126 && b !== 61 ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, "0")}`)).join(""), decode: (s) => { const bytes: number[] = []; for (let i = 0; i < s.length; i++) { if (s[i] === "=") { const h = s.slice(i + 1, i + 3); if (!/^[0-9A-Fa-f]{2}$/.test(h)) throw new Error("Invalid quoted-printable sequence."); bytes.push(parseInt(h, 16)); i += 2; } else bytes.push(s.charCodeAt(i)); } return td.decode(new Uint8Array(bytes)); } },
];

/* ================= HASH ================= */

function rotr(x: number, n: number) { return (x >>> n) | (x << (32 - n)); }
// MD5 (RFC1321, compact)
export function md5hex(ascii: string): string {
  const bytes = te.encode(ascii);
  const origLen = bytes.length;
  const withOne = origLen + 1;
  const padLen = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes); buf[origLen] = 0x80;
  const bitLen = origLen * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLen >>> 0, true);
  dv.setUint32(total - 4, Math.floor(bitLen / 2 ** 32), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const M = new Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let k = 0; k < 64; k++) {
      let F: number, g: number;
      if (k < 16) { F = (B & C) | (~B & D); g = k; }
      else if (k < 32) { F = (D & B) | (~D & C); g = (5 * k + 1) % 16; }
      else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * k) % 16; }
      F = (F + A + K[k] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + (((F << S[k]) | (F >>> (32 - S[k]))) >>> 0)) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true); out.setUint32(4, b0, true); out.setUint32(8, c0, true); out.setUint32(12, d0, true);
  return [...new Uint8Array(out.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function sha1hex(msg: string): string {
  const bytes = te.encode(msg);
  const ml = bytes.length * 8;
  const withOne = bytes.length + 1;
  const padLen = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes); buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 4, ml >>> 0, false);
  dv.setUint32(total - 8, Math.floor(ml / 2 ** 32), false);
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) { const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = ((v << 1) | (v >>> 31)) >>> 0; }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = ((((a << 5) | (a >>> 27)) >>> 0) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}
// SHA-3 via @noble/hashes (audited, zero-dependency). Hand-rolled Keccak was
// removed: crypto primitives must be standard implementations, not clever ones.
export function sha3hex(msg: string, bits: 256 | 384 | 512 = 256): string {
  const bytes = te.encode(msg);
  if (bits === 512) return bytesToHex(sha3_512(bytes));
  return bytesToHex(sha3_256(bytes));
}

async function subtleHex(algo: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest(algo, te.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export type HashAlgo = "MD5" | "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512" | "SHA3-256" | "SHA3-512" | "HMAC-SHA256" | "HMAC-SHA512";
export async function hashText(algo: HashAlgo, text: string, hmacKey = ""): Promise<string> {
  if (algo === "MD5") return md5hex(text);
  if (algo === "SHA-1") {
    try { return await subtleHex("SHA-1", text); } catch { return sha1hex(text); }
  }
  if (algo === "SHA-256" || algo === "SHA-384" || algo === "SHA-512") {
    try { return await subtleHex(algo, text); } catch { /* fallthrough */ }
  }
  if (algo === "SHA3-256") return sha3hex(text, 256);
  if (algo === "SHA3-512") return sha3hex(text, 512);
  if (algo.startsWith("HMAC")) {
    if (!hmacKey) throw new Error("HMAC needs a secret key.");
    const inner = algo.endsWith("512") ? "SHA-512" : "SHA-256";
    try {
      const key = await crypto.subtle.importKey("raw", te.encode(hmacKey), { name: "HMAC", hash: inner }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, te.encode(text));
      return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { throw new Error("HMAC requires a secure context (https/localhost)."); }
  }
  // pure-JS SHA-256 fallback if subtle unavailable (compact)
  return sha256js(text);
}
// compact pure JS SHA-256 (FIPS180-4)
function sha256js(msg: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = te.encode(msg);
  const bitLen = bytes.length * 8;
  const padded = [...bytes, 0x80];
  while (padded.length % 64 !== 56) padded.push(0);
  const hi = Math.floor(bitLen / 2 ** 32), lo = bitLen >>> 0;
  padded.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  const w = new Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = ((padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) | (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3]) >>> 0;
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) >>> 0);
  }
  return H.map((h) => h.toString(16).padStart(8, "0")).join("");
}

/* ================= JWT ================= */

export type JwtDecoded = { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string; raw: { h: string; p: string; s: string }; expired: boolean; expiresIn: string | null; issuedAt: string | null; alg: string };
export function decodeJwt(token: string): JwtDecoded {
  const t = token.trim();
  const parts = t.split(".");
  if (parts.length !== 3) throw new Error(`Malformed JWT: expected 3 dot-separated segments, found ${parts.length}. A JWT looks like header.payload.signature.`);
  const [h, p, s] = parts;
  let header: Record<string, unknown>, payload: Record<string, unknown>;
  try { header = JSON.parse(b64urlDecode(h)); } catch { throw new Error("Malformed JWT header: not valid Base64URL JSON. Check for truncated or URL-mangled input."); }
  try { payload = JSON.parse(b64urlDecode(p)); } catch { throw new Error("Malformed JWT payload: not valid Base64URL JSON."); }
  if (!s) throw new Error("Malformed JWT: missing signature segment (alg none tokens still carry a trailing dot).");
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const iat = typeof payload.iat === "number" ? payload.iat : null;
  const expired = exp !== null && exp < now;
  const expiresIn = exp === null ? null : relTime((exp - now) * 1000);
  return { header, payload, signature: s, raw: { h, p, s }, expired, expiresIn, issuedAt: iat ? new Date(iat * 1000).toISOString() : null, alg: String(header.alg ?? "unknown") };
}
export function relTime(ms: number): string {
  const past = ms < 0; const s = Math.abs(Math.floor(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return past ? `${s}s ago` : `in ${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return past ? `${m}m ago` : `in ${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return past ? `${h}h ago` : `in ${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return past ? `${d}d ago` : `in ${d}d`;
  const mo = Math.floor(d / 30); if (mo < 12) return past ? `${mo}mo ago` : `in ${mo}mo`;
  return past ? `${Math.floor(mo / 12)}y ago` : `in ${Math.floor(mo / 12)}y`;
}

/* ================= CRON ================= */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DOWS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: "Every minute", expr: "* * * * *" },
  { label: "Every 5 minutes", expr: "*/5 * * * *" },
  { label: "Every 15 minutes", expr: "*/15 * * * *" },
  { label: "Every 30 minutes", expr: "*/30 * * * *" },
  { label: "Hourly", expr: "0 * * * *" },
  { label: "Daily at midnight", expr: "0 0 * * *" },
  { label: "Daily at 3:00 AM", expr: "0 3 * * *" },
  { label: "Weekly (Mon 9AM)", expr: "0 9 * * 1" },
  { label: "Monthly (1st, midnight)", expr: "0 0 1 * *" },
  { label: "Weekdays at 9AM", expr: "0 9 * * 1-5" },
  { label: "Yearly (Jan 1)", expr: "0 0 1 1 *" },
];
export { CRON_PRESETS };

function parseCronField(field: string, min: number, max: number, names?: Record<string, number>): Set<number> {
  let f = field.trim().toLowerCase();
  if (names) Object.entries(names).forEach(([k, v]) => { f = f.replace(new RegExp(`\\b${k}\\b`, "g"), String(v)); });
  const out = new Set<number>();
  if (f === "*" || f === "?") { for (let v = min; v <= max; v++) out.add(v); return out; }
  for (const part of f.split(",")) {
    const stepSplit = part.split("/");
    const range = stepSplit[0];
    const step = stepSplit[1] ? parseInt(stepSplit[1], 10) : 1;
    if (!Number.isFinite(step) || step < 1) throw new Error(`Invalid step in "${part}".`);
    let lo = min, hi = max;
    if (range === "*" || range === "") { /* keep */ }
    else if (range.includes("-")) { const [a, b] = range.split("-").map(Number); if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`Invalid range "${range}".`); lo = a; hi = b; }
    else { const v = Number(range); if (!Number.isFinite(v)) throw new Error(`Invalid value "${range}".`); lo = hi = v; }
    if (lo < min || hi > max || lo > hi) throw new Error(`Value out of range (${min}–${max}): "${part}".`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}
export type CronParsed = { minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>; expr: string };
export function parseCron(expr: string): CronParsed {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) throw new Error(`Invalid cron: expected 5 fields (minute hour day month weekday), got ${parts.length}. Example: "*/15 * * * *".`);
  const fields = parts.length === 6 ? parts.slice(1) : parts; // tolerate seconds prefix by dropping it
  const [mi, h, dom, mon, dow] = fields;
  return {
    minute: parseCronField(mi, 0, 59),
    hour: parseCronField(h, 0, 23),
    dom: parseCronField(dom, 1, 31),
    month: parseCronField(mon, 1, 12, MONTHS),
    dow: parseCronField(dow, 0, 7, DOWS),
    expr: fields.join(" "),
  };
}
function fieldDesc(set: Set<number>, min: number, max: number, unit: string, names?: string[]): string {
  const arr = [...set].sort((a, b) => a - b);
  if (arr.length === max - min + 1) return `every ${unit}`;
  if (arr.length === 1) return `${unit} ${names ? names[arr[0]] ?? arr[0] : arr[0]}`;
  // step pattern?
  const step = arr[1] - arr[0];
  if (step > 0 && arr.every((v, idx) => v === arr[0] + idx * step) && arr[0] === min) return `every ${step} ${unit}s`;
  if (arr.length <= 6) return `${unit}s ${arr.map((v) => (names ? names[v] ?? v : v)).join(", ")}`;
  return `${arr.length} ${unit}s`;
}
export function describeCron(expr: string): string {
  const c = parseCron(expr);
  const min = fieldDesc(c.minute, 0, 59, "minute");
  const hr = fieldDesc(c.hour, 0, 23, "hour");
  const dom = fieldDesc(c.dom, 1, 31, "day of month");
  const mon = fieldDesc(c.month, 1, 12, "month", ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  const dow = fieldDesc(c.dow.size === 8 ? new Set([...c.dow].filter((x) => x !== 7)) : c.dow, 0, 6, "", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const domStar = c.dom.size === 31, dowStar = c.dow.size >= 7;
  let when = `Runs ${min}`;
  if (c.hour.size !== 24) when += ` past hour ${[...c.hour].sort((a, b) => a - b).join(", ")}`;
  if (!domStar && !dowStar) when += `, on day-of-month ${[...c.dom].sort((a, b) => a - b).join(", ")} and on ${[...c.dow].sort((a, b) => a - b).map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d % 7]).join(", ")}`;
  else if (!domStar) when += `, on day-of-month ${[...c.dom].sort((a, b) => a - b).join(", ")}`;
  else if (!dowStar) when += `, only on ${[...c.dow].sort((a, b) => a - b).map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d % 7]).join(", ")}`;
  if (c.month.size !== 12) when += `, in ${[...c.month].sort((a, b) => a - b).map((m) => ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]).join(", ")}`;
  when += ".";
  void hr; void dom; void mon; void dow;
  return when.charAt(0).toUpperCase() + when.slice(1);
}
export function nextCronRuns(expr: string, count = 5, from = new Date()): Date[] {
  const c = parseCron(expr);
  const dow = new Set([...c.dow].map((d) => (d === 7 ? 0 : d)));
  const out: Date[] = [];
  const t = new Date(from.getTime() + 60000);
  t.setSeconds(0, 0);
  let guard = 0;
  while (out.length < count && guard < 525600 * 2) {
    guard++;
    const mi = t.getMinutes(), h = t.getHours(), dom = t.getDate(), mon = t.getMonth() + 1, dw = t.getDay();
    const domStar = c.dom.size === 31, dowStar = dow.size === 7;
    const dayMatch = domStar && dowStar ? true : domStar ? dow.has(dw) : dowStar ? c.dom.has(dom) : c.dom.has(dom) || dow.has(dw);
    if (c.minute.has(mi) && c.hour.has(h) && c.month.has(mon) && dayMatch) out.push(new Date(t));
    t.setMinutes(t.getMinutes() + 1);
  }
  if (!out.length) throw new Error("No runs in the next 2 years — the schedule may be impossible (e.g. Feb 30).");
  return out;
}
export function humanToCron(text: string): string | null {
  const q = text.toLowerCase().trim();
  let m = q.match(/every (\d+) (minute|hour|day|second)s?/);
  if (m) { const n = +m[1]; if (m[2] === "minute") return n === 1 ? "* * * * *" : `*/${n} * * * *`; if (m[2] === "hour") return n === 1 ? "0 * * * *" : `0 */${n} * * *`; if (m[2] === "day") return `0 0 */${n} * *`; }
  if (/hourly/.test(q)) return "0 * * * *";
  if (/daily|every day|midnight/.test(q)) { const t = q.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/); if (t) { let h = +t[1]; const mi = +(t[2] ?? 0); if (t[3] === "pm" && h < 12) h += 12; if (t[3] === "am" && h === 12) h = 0; return `${mi} ${h} * * *`; } return "0 0 * * *"; }
  if (/weekly/.test(q)) return "0 9 * * 1";
  if (/monthly/.test(q)) return "0 0 1 * *";
  if (/yearly|annually/.test(q)) return "0 0 1 1 *";
  if (/week ?days|weekday|mon-?fri|monday to friday/.test(q)) { const t = q.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/); const h = t ? +t[1] + (t[3] === "pm" && +t[1] < 12 ? 12 : 0) : 9; return `0 ${h} * * 1-5`; }
  if (/weekend/.test(q)) return "0 9 * * 6,0";
  m = q.match(/(?:at )?(\d{1,2}):(\d{2})(?:\s*(am|pm))?/);
  if (m && /daily|every/.test(q)) { let h = +m[1]; if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0; return `${+m[2]} ${h} * * *`; }
  return null;
}

/* ================= NETWORK: IP/SUBNET ================= */

export function ipToInt(ip: string): number {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) throw new Error(`Invalid IPv4 "${ip}": expected 4 octets (e.g. 192.168.1.1).`);
  let n = 0;
  parts.forEach((p, idx) => {
    if (!/^\d+$/.test(p)) throw new Error(`Invalid IPv4 "${ip}": octet ${idx + 1} ("${p}") is not a number.`);
    const v = +p;
    if (v < 0 || v > 255) throw new Error(`Invalid IPv4 "${ip}": octet ${idx + 1} must be 0–255.`);
    n = n * 256 + v;
  });
  return n >>> 0;
}
export function intToIp(n: number): string { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); }
export function maskFromPrefix(prefix: number): number {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`Invalid prefix /${prefix}: must be 0–32.`);
  return prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
}
export type SubnetInfo = { cidr: string; ip: string; prefix: number; mask: string; wildcard: string; network: string; broadcast: string; first: string; last: string; hosts: number; total: number; binary: string; classful: string; private: boolean };
export function calcSubnet(cidr: string): SubnetInfo {
  const t = cidr.trim();
  const m = t.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\s*\/\s*(\d{1,2})|\s+(\d{1,3}(?:\.\d{1,3}){3}))?$/);
  if (!m) throw new Error(`Invalid CIDR "${cidr}". Use 192.168.1.0/24 or 10.0.0.0 255.0.0.0.`);
  const ip = m[1];
  let prefix: number;
  if (m[2] !== undefined) prefix = parseInt(m[2], 10);
  else if (m[3]) { const maskInt = ipToInt(m[3]); prefix = Math.round(Math.log2(0x100000000 / ((~maskInt >>> 0) + 1))); if (maskFromPrefix(prefix) !== maskInt) throw new Error(`Non-contiguous netmask "${m[3]}".`); }
  else prefix = 32;
  if (prefix < 0 || prefix > 32) throw new Error(`Invalid prefix /${prefix}.`);
  const ipInt = ipToInt(ip);
  const mask = maskFromPrefix(prefix);
  const network = (ipInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostBits = 32 - prefix;
  const total = 2 ** hostBits;
  const usable = prefix >= 31 ? (prefix === 31 ? 2 : 1) : total - 2;
  const first = prefix === 32 ? network : prefix === 31 ? network : (network + 1) >>> 0;
  const last = prefix === 32 ? network : prefix === 31 ? broadcast : (broadcast - 1) >>> 0;
  const toBin = (n: number) => n.toString(2).padStart(32, "0").replace(/(.{8})/g, "$1 ").trim();
  const firstOctet = (ipInt >>> 24) & 255;
  const classful = firstOctet < 128 ? "A" : firstOctet < 192 ? "B" : firstOctet < 224 ? "C" : firstOctet < 240 ? "D (multicast)" : "E (reserved)";
  return {
    cidr: `${intToIp(network)}/${prefix}`, ip, prefix,
    mask: intToIp(mask), wildcard: intToIp((~mask) >>> 0),
    network: intToIp(network), broadcast: intToIp(broadcast),
    first: intToIp(first), last: intToIp(last),
    hosts: usable, total, binary: toBin(ipInt),
    classful, private: isPrivateIp(ip),
  };
}
export function isPrivateIp(ip: string): boolean {
  try {
    const n = ipToInt(ip);
    return ((n >>> 24) === 10) || ((n >>> 20) === 0xac1) || ((n >>> 16) === 0xc0a8);
  } catch { return false; }
}
export function splitSubnet(cidr: string, newPrefix: number): string[] {
  const info = calcSubnet(cidr);
  if (newPrefix <= info.prefix) throw new Error(`New prefix /${newPrefix} must be larger than /${info.prefix} to split.`);
  if (newPrefix > 32) throw new Error("Prefix cannot exceed /32.");
  const count = 2 ** (newPrefix - info.prefix);
  if (count > 1024) throw new Error(`Splitting /${info.prefix} → /${newPrefix} yields ${count} subnets (max shown: 1024). Pick a smaller prefix.`);
  const base = ipToInt(info.network);
  const size = 2 ** (32 - newPrefix);
  return Array.from({ length: count }, (_, i) => `${intToIp((base + i * size) >>> 0)}/${newPrefix}`);
}
export function calcSupernet(cidrs: string[]): SubnetInfo {
  const values = cidrs.map((cidr) => cidr.trim()).filter(Boolean).map(calcSubnet);
  if (!values.length) throw new Error("Enter at least one IPv4 CIDR.");
  const first = Math.min(...values.map((value) => ipToInt(value.network)));
  const last = Math.max(...values.map((value) => ipToInt(value.broadcast)));
  const differing = (first ^ last) >>> 0;
  const prefix = differing === 0 ? 32 : Math.clz32(differing);
  return calcSubnet(`${intToIp((first & maskFromPrefix(prefix)) >>> 0)}/${prefix}`);
}
export function ipToBinary(ip: string): string { return (ipToInt(ip) >>> 0).toString(2).padStart(32, "0").replace(/(.{8})/g, "$1 ").trim(); }
export function expandIpv6(ip: string): string {
  const t = ip.trim().toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(t)) throw new Error(`Invalid IPv6 "${ip}".`);
  if (t.includes(".")) throw new Error("IPv4-mapped IPv6 (…:192.168.0.1) expansion isn't supported — paste the pure hex form.");
  const halves = t.split("::");
  if (halves.length > 2) throw new Error(`Invalid IPv6 "${ip}": "::" may appear only once.`);
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) throw new Error(`Invalid IPv6 "${ip}": expected 8 groups.`);
  const missing = 8 - head.length - tail.length;
  if (missing < 0) throw new Error(`Invalid IPv6 "${ip}": too many groups.`);
  const full = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
  full.forEach((g) => { if (!/^[0-9a-f]{1,4}$/.test(g)) throw new Error(`Invalid IPv6 group "${g}".`); });
  return full.map((g) => g.padStart(4, "0")).join(":");
}
export function compressIpv6(ip: string): string {
  const full = expandIpv6(ip).split(":");
  const short = full.map((g) => g.replace(/^0+/, "") || "0");
  // longest zero run
  let best = [-1, 0], cur = [-1, 0];
  short.forEach((g, idx) => {
    if (g === "0") { if (cur[0] < 0) cur = [idx, 1]; else cur[1]++; if (cur[1] > best[1]) best = [...cur]; }
    else cur = [-1, 0];
  });
  if (best[1] < 2) return short.join(":");
  return [...short.slice(0, best[0]), "", ...short.slice(best[0] + best[1])].join(":").replace(/^:/, "::").replace(/:$/, ":").replace(/:::/, "::");
}
export function classifyIp(ip: string): string {
  const t = ip.trim();
  if (/^127\./.test(t) || t === "::1") return "Loopback";
  if (t === "0.0.0.0") return "Unspecified (this host)";
  if (t === "255.255.255.255") return "Limited broadcast";
  if (/^169\.254\./.test(t) || t.toLowerCase().startsWith("fe80:")) return "Link-local";
  if (/^224\./.test(t) || /^ff/i.test(t)) return "Multicast";
  if (/^192\.88\.99\./.test(t)) return "Reserved (6to4 relay)";
  try { if (isPrivateIp(t)) return "Private (RFC 1918)"; } catch { /* ignore */ }
  try { ipToInt(t); return "Public (globally routable)"; } catch { /* ignore */ }
  try { expandIpv6(t); if (/^(fc|fd)/i.test(expandIpv6(t))) return "Unique local (private IPv6)"; return "Public IPv6"; } catch { /* ignore */ }
  throw new Error(`"${ip}" is not a valid IPv4 or IPv6 address.`);
}

/* ================= CHMOD ================= */

export function numToSymbolic(num: string | number): string {
  const s = String(num).trim();
  if (!/^[0-7]{3,4}$/.test(s)) throw new Error(`Invalid mode "${num}": use 3–4 octal digits (e.g. 755, 0644).`);
  const digits = s.slice(-3).split("").map(Number);
  const map = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  let out = digits.map((d) => map[d]).join("");
  const special = s.length === 4 ? parseInt(s[0], 10) : 0;
  if (special & 4) out = out.slice(0, 2) + (out[2] === "x" ? "s" : "S") + out.slice(3);
  if (special & 2) out = out.slice(0, 5) + (out[5] === "x" ? "s" : "S") + out.slice(6);
  if (special & 1) out = out.slice(0, 8) + (out[8] === "x" ? "t" : "T") + out.slice(9);
  return out;
}
export function symbolicToNum(sym: string): string {
  let s = sym.trim();
  if (/^[0-7]{3,4}$/.test(s)) return s;
  s = s.replace(/^[bcdlps-]/, "");
  if (!/^([r-][w-][xXsStT-]){3}$/.test(s)) throw new Error(`Invalid symbolic mode "${sym}". Use e.g. rwxr-xr-x or u=rwx,go=rx notation is not supported — use the toggles.`);
  const val = (tri: string) => (tri[0] === "r" ? 4 : 0) + (tri[1] === "w" ? 2 : 0) + ("xXsS".includes(tri[2]) && tri[2].toLowerCase() === "x" ? 1 : 0);
  return [0, 3, 6].map((k) => val(s.slice(k, k + 3))).join("");
}
export function explainChmod(num: string): { owner: string; group: string; other: string; summary: string } {
  const sym = numToSymbolic(num);
  const label = (tri: string, who: string) => {
    const bits: string[] = [];
    bits.push(tri[0] === "r" ? "read" : "no read");
    bits.push(tri[1] === "w" ? "write" : "no write");
    bits.push(tri[2] === "x" ? "execute" : tri[2] === "-" ? "no execute" : `special (${tri[2]})`);
    return `${who}: ${tri} — ${bits.join(", ")}`;
  };
  const n = String(num).slice(-3);
  const common: Record<string, string> = { "777": "Everyone can do everything. Almost never appropriate.", "755": "Standard for executables & directories: you control, others read+execute.", "700": "Private: only you can access. Good for ~/.ssh.", "644": "Standard for files: you edit, others read.", "600": "Private file: only you read/write. Good for keys.", "640": "You edit, group reads, others locked out.", "750": "You control, group reads+executes, others locked out." };
  return { owner: label(sym.slice(0, 3), "Owner"), group: label(sym.slice(3, 6), "Group"), other: label(sym.slice(6, 9), "Other"), summary: common[n] ?? "Custom mode — verify each class above." };
}
export function umaskResult(umask: string): { file: string; dir: string } {
  if (!/^[0-7]{3,4}$/.test(umask.trim())) throw new Error(`Invalid umask "${umask}": 3–4 octal digits (e.g. 022).`);
  const u = parseInt(umask.trim().slice(-3), 8);
  const file = (0o666 & ~u & 0o777).toString(8).padStart(3, "0");
  const dir = (0o777 & ~u & 0o777).toString(8).padStart(3, "0");
  return { file, dir };
}

/* ================= TEXT ================= */

export function toTitle(s: string) { return s.toLowerCase().replace(/(^|[\s\-_\/\(\[{'"])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()); }
export function toSentence(s: string) { return s.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase()); }
const wordsOf = (s: string) => s.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
export const CASES: { id: string; name: string; fn: (s: string) => string }[] = [
  { id: "upper", name: "UPPERCASE", fn: (s) => s.toUpperCase() },
  { id: "lower", name: "lowercase", fn: (s) => s.toLowerCase() },
  { id: "title", name: "Title Case", fn: toTitle },
  { id: "sentence", name: "Sentence case", fn: toSentence },
  { id: "camel", name: "camelCase", fn: (s) => { const w = wordsOf(s.toLowerCase()); return w.map((x, i) => (i === 0 ? x : x[0].toUpperCase() + x.slice(1))).join(""); } },
  { id: "pascal", name: "PascalCase", fn: (s) => wordsOf(s.toLowerCase()).map((x) => x[0].toUpperCase() + x.slice(1)).join("") },
  { id: "snake", name: "snake_case", fn: (s) => wordsOf(s).join("_").toLowerCase() },
  { id: "kebab", name: "kebab-case", fn: (s) => wordsOf(s).join("-").toLowerCase() },
  { id: "constant", name: "CONSTANT_CASE", fn: (s) => wordsOf(s).join("_").toUpperCase() },
  { id: "slug", name: "slug", fn: (s) => wordsOf(s).join("-").toLowerCase().replace(/[^a-z0-9-]/g, "") },
];
export const CLEANERS: { id: string; name: string; fn: (s: string) => string }[] = [
  { id: "trim", name: "Trim each line", fn: (s) => s.split("\n").map((l) => l.trim()).join("\n") },
  { id: "noempty", name: "Remove empty lines", fn: (s) => s.split("\n").filter((l) => l.trim() !== "").join("\n") },
  { id: "dedup", name: "Remove duplicate lines", fn: (s) => [...new Set(s.split("\n"))].join("\n") },
  { id: "spaces", name: "Collapse spaces", fn: (s) => s.replace(/[ \t]+/g, " ") },
  { id: "normws", name: "Normalize whitespace", fn: (s) => s.replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter((l) => l !== "").join("\n") },
  { id: "special", name: "Remove special chars", fn: (s) => s.replace(/[^A-Za-z0-9\s@._-]/g, "") },
  { id: "sort", name: "Sort lines A→Z", fn: (s) => s.split("\n").sort((a, b) => a.localeCompare(b)).join("\n") },
  { id: "sortrev", name: "Sort lines Z→A", fn: (s) => s.split("\n").sort((a, b) => b.localeCompare(a)).join("\n") },
  { id: "reverse", name: "Reverse lines", fn: (s) => s.split("\n").reverse().join("\n") },
  { id: "shuffle", name: "Shuffle lines", fn: (s) => {
    const lines = s.split("\n");
    const random = new Uint32Array(Math.max(1, lines.length));
    crypto.getRandomValues(random);
    for (let i = lines.length - 1; i > 0; i--) { const j = random[i] % (i + 1); [lines[i], lines[j]] = [lines[j], lines[i]]; }
    return lines.join("\n");
  } },
  { id: "number", name: "Number lines", fn: (s) => s.split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n") },
];
export const EXTRACTORS: { id: string; name: string; re: RegExp }[] = [
  { id: "emails", name: "Emails", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { id: "urls", name: "URLs", re: /https?:\/\/[^\s"'<>]+/g },
  { id: "ips", name: "IPv4", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { id: "domains", name: "Domains", re: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi },
  { id: "numbers", name: "Numbers", re: /-?\d+(?:\.\d+)?/g },
  { id: "hashtags", name: "Hashtags", re: /#[A-Za-z0-9_]+/g },
  { id: "mentions", name: "Mentions", re: /@[A-Za-z0-9_]+/g },
  { id: "uuids", name: "UUIDs", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { id: "hexcolors", name: "Hex colors", re: /#[0-9a-f]{3,8}\b/gi },
];
export function textStats(s: string) {
  const chars = s.length;
  const noSpaces = s.replace(/\s/g, "").length;
  const words = (s.trim().match(/\S+/g) || []).length;
  const sentences = (s.match(/[^.!?]+[.!?]+/g) || []).filter((x) => x.trim()).length || (s.trim() ? 1 : 0);
  const lines = s === "" ? 0 : s.split("\n").length;
  const paragraphs = s.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const reading = Math.max(1, Math.ceil(words / 200));
  const bytes = te.encode(s).length;
  return { chars, noSpaces, words, sentences: s.trim() ? sentences : 0, lines, paragraphs, reading, bytes };
}

/* ================= DIFF (Myers, line-based) ================= */

export type DiffOp = { type: "same" | "add" | "del"; text: string };
export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split("\n"), B = b.split("\n");
  // common prefix/suffix trim
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const aMid = A.slice(pre, A.length - suf), bMid = B.slice(pre, B.length - suf);
  const mid = myers(aMid, bMid);
  const out: DiffOp[] = [];
  A.slice(0, pre).forEach((t) => out.push({ type: "same", text: t }));
  out.push(...mid);
  A.slice(A.length - suf).forEach((t) => out.push({ type: "same", text: t }));
  return out;
}
function myers(a: string[], b: string[]): DiffOp[] {
  const N = a.length, M = b.length;
  if (!N && !M) return [];
  if (!N) return b.map((t) => ({ type: "add" as const, text: t }));
  if (!M) return a.map((t) => ({ type: "del" as const, text: t }));
  if (N * M > 4_000_000) {
    // fallback: hashed LCS-lite for huge inputs — mark all changed
    return [...a.map((t) => ({ type: "del" as const, text: t })), ...b.map((t) => ({ type: "add" as const, text: t }))];
  }
  const max = N + M;
  const v = new Map<number, number>();
  const trace: Map<number, number>[] = [];
  v.set(1, 0);
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    const cur = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) x = v.get(k + 1) ?? 0;
      else x = (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      cur.set(k, x);
      if (x >= N && y >= M) { trace.push(cur); found = true; break; }
    }
    if (!found) { trace.push(cur); for (const [k, x] of cur) v.set(k, x); }
  }
  // backtrack
  const ops: DiffOp[] = [];
  let x = N, y = M;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && (prev.get(k - 1) ?? -1) < (prev.get(k + 1) ?? -1));
    const kPrev = down ? k + 1 : k - 1;
    const xPrev = prev.get(kPrev) ?? 0;
    const yPrev = xPrev - kPrev;
    while (x > xPrev && y > yPrev) { ops.push({ type: "same", text: a[x - 1] }); x--; y--; }
    if (down) { ops.push({ type: "add", text: b[yPrev] }); y = yPrev; }
    else { ops.push({ type: "del", text: a[xPrev] }); x = xPrev; }
  }
  while (x > 0 && y > 0) { ops.push({ type: "same", text: a[x - 1] }); x--; y--; }
  return ops.reverse();
}
export function wordDiff(a: string, b: string): { t: "same" | "add" | "del"; text: string }[] {
  const at = a.split(/(\s+)/), bt = b.split(/(\s+)/);
  const ops = myers(at, bt);
  return ops.map((o) => ({ t: o.type, text: o.text }));
}

/* ================= REGEX ================= */

export function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function buildRegex(pattern: string, flags: string): RegExp {
  if (/[^gimsuy]/.test(flags)) throw new Error(`Invalid flag in "${flags}". Allowed: g i m s u y.`);
  try { return new RegExp(pattern, flags); } catch (e) { throw new Error(`Invalid regex: ${(e as Error).message}`); }
}
export type RegexHit = { match: string; index: number; groups: (string | undefined)[]; named: Record<string, string> };
export function testRegex(pattern: string, flags: string, text: string, maxHits = 200): { hits: RegexHit[]; truncated: boolean } {
  const re = buildRegex(pattern, flags.includes("g") ? flags : flags + "g");
  const hits: RegexHit[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  let guard = 0;
  while ((m = re.exec(text)) !== null && guard < maxHits + 1) {
    guard++;
    if (guard > maxHits) return { hits, truncated: true };
    hits.push({ match: m[0], index: m.index, groups: m.slice(1), named: { ...(m.groups ?? {}) } });
    if (m[0] === "") re.lastIndex++;
    if (!re.global) break;
  }
  return { hits, truncated: false };
}
export const REGEX_LIBRARY: { name: string; pattern: string; desc: string }[] = [
  { name: "Email", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", desc: "Practical (not RFC-complete) email matcher." },
  { name: "URL", pattern: "https?://[^\\s\"'<>]+", desc: "http/https URLs." },
  { name: "IPv4", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", desc: "Dotted quads (validate ranges separately)." },
  { name: "Date ISO", pattern: "\\b\\d{4}-\\d{2}-\\d{2}\\b", desc: "YYYY-MM-DD." },
  { name: "UUID", pattern: "\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b", desc: "Canonical UUID." },
  { name: "Hex color", pattern: "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b", desc: "CSS hex colors." },
  { name: "Slug", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", desc: "URL slug validator." },
  { name: "Semver", pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$", desc: "Semantic version." },
  { name: "JWT shape", pattern: "^eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$", desc: "Three-segment token shape (does not verify)." },
  { name: "Phone (loose)", pattern: "\\+?[\\d][\\d\\s().-]{6,}\\d", desc: "Loose international phone finder." },
];
export function explainRegex(pattern: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) {
      const n = pattern[i + 1];
      const map: Record<string, string> = { d: "any digit (0–9)", D: "any non-digit", w: "word char [A-Za-z0-9_]", W: "non-word char", s: "whitespace", S: "non-whitespace", b: "word boundary (zero-width)", B: "non-word-boundary", n: "newline", t: "tab" };
      out.push(`\\${n} — ${map[n] ?? `escaped literal "${n}"`}`);
      i += 2; continue;
    }
    if (c === "[") { const j = pattern.indexOf("]", i); if (j > 0) { out.push(`${pattern.slice(i, j + 1)} — character class (match one of these)`); i = j + 1; continue; } }
    if (c === "(") {
      if (pattern.startsWith("(?<", i)) { const j = pattern.indexOf(">", i); out.push(`(?<name>…) — named capture group "${pattern.slice(i + 3, j)}"`); i = j + 1; continue; }
      if (pattern.startsWith("?:", i + 1)) { out.push("(?:…) — non-capturing group"); i += 3; continue; }
      out.push("(…) — capture group"); i++; continue;
    }
    if ("*+?{".includes(c)) {
      let q = c;
      if (c === "{") { const j = pattern.indexOf("}", i); q = j > 0 ? pattern.slice(i, j + 1) : c; i = j > 0 ? j + 1 : i + 1; out.push(`${q} — exact-count quantifier`); continue; }
      if (pattern[i + 1] === "?") { out.push(`${c}? — lazy (match as few as possible)`); i += 2; continue; }
      out.push(c === "*" ? "* — 0 or more" : c === "+" ? "+ — 1 or more" : "? — optional (0 or 1)"); i++; continue;
    }
    if (c === "^") { out.push("^ — start of string/line (with m flag: line)"); i++; continue; }
    if (c === "$") { out.push("$ — end of string/line"); i++; continue; }
    if (c === "|") { out.push("| — alternation (or)"); i++; continue; }
    if (c === ".") { out.push(". — any char except newline (with s flag: any char)"); i++; continue; }
    out.push(`"${c}" — literal`); i++;
  }
  return out.slice(0, 40);
}

/* ================= SQL ================= */

const SQL_KEYWORDS = ["SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "INNER JOIN", "OUTER JOIN", "CROSS JOIN", "ON", "USING", "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "PRIMARY KEY", "FOREIGN KEY", "REFERENCES", "NOT NULL", "DEFAULT", "UNIQUE", "CHECK", "INDEX", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "ILIKE", "IS NULL", "IS NOT NULL", "AS", "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END", "CAST"];
export function formatSql(input: string): string {
  if (!input.trim()) throw new Error("Paste some SQL first.");
  // protect string literals
  const literals: string[] = [];
  let sql = input.replace(/'(?:[^']|'')*'/g, (m) => { literals.push(m); return `__LIT${literals.length - 1}__`; });
  sql = sql.replace(/\s+/g, " ").trim();
  const majors = ["SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "UNION", "UNION ALL", "INTERSECT", "EXCEPT", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "INNER JOIN", "OUTER JOIN", "CROSS JOIN", "JOIN", "ON", "WHEN", "ELSE", "END"];
  majors.sort((a, b) => b.length - a.length);
  majors.forEach((k) => { sql = sql.replace(new RegExp(`\\b${k.replace(/ /g, "\\s+")}\\b`, "gi"), `\n${k}`); });
  sql = sql.replace(/,/g, ",\n  ");
  const lines = sql.split("\n").map((l) => l.trim()).filter(Boolean);
  let depth = 0;
  const out = lines.map((l) => {
    if (/^(END|ELSE|WHEN)\b/i.test(l)) depth = Math.max(0, depth - 1);
    const major = /^(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|INNER JOIN|OUTER JOIN|CROSS JOIN|ON|CASE|WHEN|ELSE)\b/i.test(l);
    const line = major ? l : "  ".repeat(Math.min(depth + 1, 4)) + l;
    if (/\bCASE\b/i.test(l)) depth++;
    return line;
  });
  let res = out.join("\n").replace(/\n\s*\n/g, "\n");
  SQL_KEYWORDS.slice().sort((a, b) => b.length - a.length).forEach((k) => { res = res.replace(new RegExp(`\\b${k.replace(/ /g, "\\s+")}\\b`, "gi"), k); });
  res = res.replace(/__LIT(\d+)__/g, (_, n: string) => literals[+n]);
  return res + (res.trim().endsWith(";") ? "" : ";");
}
export function minifySql(input: string): string {
  const literals: string[] = [];
  let sql = input.replace(/'(?:[^']|'')*'/g, (m) => { literals.push(m); return `__LIT${literals.length - 1}__`; });
  sql = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  sql = sql.replace(/\s+/g, " ").replace(/\s*([(),;=<>!+\-*/])\s*/g, "$1").trim();
  return sql.replace(/__LIT(\d+)__/g, (_, n: string) => literals[+n]);
}

/* ===== SQL SAMPLE DATA (phase7) — pure generator, never executes SQL ===== */

function hashSeedStr(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function seededRng(seed: string): () => number {
  let a = hashSeedStr(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SampleCol = { name: string; kind: string; nullable: boolean; primary: boolean };

function parseTableName(ddl: string): string {
  const m = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)/i.exec(ddl);
  if (!m) throw new Error("Could not find 'CREATE TABLE <name> (...)' — paste a full CREATE TABLE statement.");
  return m[1].replace(/["`\[\]]/g, "");
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0, quote = "", cur = "";
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseTableColumns(ddl: string): SampleCol[] {
  const open = ddl.indexOf("(");
  if (open < 0) throw new Error("CREATE TABLE has no '(...)' — expected column definitions.");
  let depth = 0, quote = "", end = -1;
  for (let i = open; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error("Unbalanced parentheses in CREATE TABLE.");
  const cols: SampleCol[] = [];
  for (const raw of splitTopLevel(ddl.slice(open + 1, end))) {
    const part = raw.trim();
    if (!part) continue;
    if (/^(primary\s+key|foreign\s+key|unique\b|check\b|constraint\b|key\b|index\b|exclude\b|period\b|like\b)/i.test(part)) continue;
    const nm = /^\s*(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_$][\w$]*))\s+([\s\S]+)$/.exec(part);
    if (!nm) continue;
    const name = nm[1] || nm[2] || nm[3] || nm[4] || "";
    const def = (nm[5] || "").toLowerCase();
    cols.push({ name, kind: sampleColKind(def), nullable: !/\bnot\s+null\b/.test(def), primary: /\bprimary\s+key\b/.test(def) });
  }
  return cols;
}

function sampleColKind(def: string): string {
  if (/\buuid\b/.test(def)) return "uuid";
  if (/\bjsonb?\b/.test(def)) return "json";
  if (/\btimestamptz\b|\btimestamp\b|\bdatetime\b/.test(def)) return "ts";
  if (/\bboolean\b|\bbool\b|\bbit\b/.test(def)) return "bool";
  if (/\bdate\b/.test(def)) return "date";
  if (/\binteger\b|\bbigint\b|\bsmallint\b|\btinyint\b|\bserial\b|\bidentity\b|\bint\b/.test(def)) return "int";
  if (/\bnumeric\b|\bdecimal\b|\bmoney\b|\bfloat\b|\bdouble\b|\breal\b/.test(def)) return "real";
  return "text";
}

const SAMPLE_FIRST = ["maya", "liam", "noah", "emma", "olivia", "aiden", "sofia", "kai"];
const SAMPLE_LAST = ["chen", "patel", "reyes", "kova", "adler", "nolan", "ibrahim", "ross"];
const SAMPLE_CITY = ["london", "cairo", "berlin", "tokyo", "perth", "delhi", "oslo", "lagos"];

function sampleHex(rng: () => number, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += "0123456789abcdef"[Math.floor(rng() * 16)];
  return out;
}

function sampleIsoDay(i: number): string {
  return new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10);
}

function sampleTextFor(name: string, i: number, rng: () => number): string {
  const n = name.toLowerCase();
  if (/email/.test(n)) return SAMPLE_FIRST[i % 8] + (i + 1) + "@example.com";
  if (/first_?name/.test(n)) return SAMPLE_FIRST[i % 8];
  if (/last_?name|surname/.test(n)) return SAMPLE_LAST[i % 8];
  if (/(^|_)name$/.test(n) && !/user|file|host|table/.test(n)) return SAMPLE_FIRST[i % 8] + " " + SAMPLE_LAST[i % 8];
  if (/user(name)?|handle|login|account/.test(n)) return SAMPLE_FIRST[i % 8] + (i + 1);
  if (/phone|mobile|(^|_)tel$/.test(n)) return "+1555" + String(1000000 + i * 137).slice(1);
  if (/city/.test(n)) return SAMPLE_CITY[i % 8];
  if (/country/.test(n)) return ["egypt", "india", "germany", "japan", "brazil", "kenya", "norway", "spain"][i % 8];
  if (/state|province/.test(n)) return ["north", "south", "east", "west", "central"][i % 5];
  if (/zip|postal/.test(n)) return String(10000 + i * 97);
  if (/url|website|link|domain/.test(n)) return "https://example.com/page/" + (i + 1);
  if (/token|hash|secret|api_?key|slug/.test(n)) return sampleHex(rng, 32);
  if (/status/.test(n)) return ["active", "pending", "archived"][i % 3];
  if (/title|label/.test(n)) return "Sample " + (i + 1);
  if (/desc|notes|comment|bio|body|message/.test(n)) return "Sample " + SAMPLE_FIRST[i % 8] + " record " + (i + 1);
  return n.replace(/^is_?/, "").replace(/_at$|_id$/g, "") + "_" + (i + 1);
}

function sampleValueFor(c: SampleCol, i: number, rng: () => number, dialect: string): string {
  if (c.nullable && !c.primary && rng() < 0.1) return "NULL";
  const q = (v: string) => "'" + v.split("'").join("''") + "'";
  switch (c.kind) {
    case "int": return String(i + 1);
    case "real": return (Math.round(rng() * 1000000) / 100).toFixed(2);
    case "bool": return dialect === "SQL Server" ? (rng() < 0.5 ? "1" : "0") : (rng() < 0.5 ? "true" : "false");
    case "date": return q(sampleIsoDay(i));
    case "ts": return q(sampleIsoDay(i) + " " + String(Math.floor(rng() * 24)).padStart(2, "0") + ":15:30");
    case "json": return q('{"id": ' + (i + 1) + ', "active": true}');
    case "uuid": return q(sampleHex(rng, 8) + "-" + sampleHex(rng, 4) + "-4" + sampleHex(rng, 3) + "-8" + sampleHex(rng, 3) + "-" + sampleHex(rng, 12));
    default: return q(sampleTextFor(c.name, i, rng));
  }
}

function sampleQuoteIdent(name: string, dialect: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  if (dialect === "MySQL") return "`" + name + "`";
  if (dialect === "SQL Server") return "[" + name + "]";
  return '"' + name + '"';
}

export function genSqlSampleData(ddl: string, dialect: string, rowCount: number, seed: string): string {
  if (!ddl.trim()) throw new Error("Paste a CREATE TABLE statement first.");
  const cols = parseTableColumns(ddl);
  if (!cols.length) throw new Error("No columns found — expected column definitions inside CREATE TABLE ( ... ).");
  const rc = Math.floor(Number(rowCount));
  const n = Math.max(1, Math.min(Number.isFinite(rc) ? rc : 10, 500));
  const rng = seededRng(seed.trim() || "devutils");
  const table = parseTableName(ddl);
  const rows: string[] = [];
  for (let i = 0; i < n; i++) {
    rows.push("  (" + cols.map((c) => sampleValueFor(c, i, rng, dialect)).join(", ") + ")");
  }
  return "INSERT INTO " + sampleQuoteIdent(table, dialect) + " (" + cols.map((c) => sampleQuoteIdent(c.name, dialect)).join(", ") + ") VALUES\n" + rows.join(",\n") + ";";
}

/* ================= CODE FORMAT / MINIFY ================= */

export function formatCode(lang: string, input: string): string {
  if (!input.trim()) throw new Error("Paste some code first.");
  if (lang === "json") return formatJson(input);
  if (lang === "sql") return formatSql(input);
  if (lang === "xml") return formatXml(input);
  if (lang === "yaml") return yamlStringify(yamlParse(input));
  if (lang === "html") {
    return input.replace(/>\s+</g, ">\n<").split("\n").map((l) => l.trim()).filter(Boolean).map((l, idx, arr) => {
      void idx; void arr; return l;
    }).join("\n");
  }
  if (lang === "css") {
    return input.replace(/\s*{\s*/g, " {\n  ").replace(/\s*}\s*/g, "\n}\n").replace(/\s*;\s*/g, ";\n  ").replace(/\n\s*\n/g, "\n").trim() + "\n";
  }
  if (lang === "javascript" || lang === "typescript") {
    // conservative: normalize indent by braces, spacing around operators
    const lines = input.split("\n");
    let depth = 0;
    return lines.map((raw) => {
      const l = raw.trim();
      if (/^[}\])]/.test(l)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + l.replace(/\s+/g, " ");
      if (/[{([]\s*$/.test(l)) depth++;
      return out;
    }).join("\n");
  }
  if (lang === "markdown") return input.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  if (lang === "graphql") return input.replace(/\s*{\s*/g, " {\n  ").replace(/\s*}\s*/g, "\n}").replace(/,\s*/g, ",\n  ").trim();
  return input.trim();
}
export function minifyCode(lang: string, input: string): { output: string; before: number; after: number } {
  const before = te.encode(input).length;
  let output = input;
  if (lang === "json") output = minifyJson(input);
  else if (lang === "css") output = input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>+~])\s*/g, "$1").replace(/;}/g, "}").trim();
  else if (lang === "html") output = input.replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
  else if (lang === "javascript") output = input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1").replace(/\s+/g, " ").replace(/\s*([{}();,=+\-*/<>!&|:?])\s*/g, "$1").trim();
  else output = input.replace(/\s+/g, " ").trim();
  return { output, before, after: te.encode(output).length };
}

/* ================= DATETIME ================= */

export function parseTimestamp(input: string): { ms: number; unit: string; iso: string; utc: string; local: string; rfc: string; js: string; date: Date } {
  const t = input.trim().replace(/,/g, "");
  if (!t) throw new Error("Enter a Unix timestamp or a date string.");
  let ms: number, unit: string;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = parseFloat(t);
    const digits = t.replace(/[-.]/g, "").length;
    if (digits <= 10) { ms = n * 1000; unit = "seconds"; }
    else if (digits <= 13) { ms = n; unit = "milliseconds"; }
    else if (digits <= 16) { ms = n / 1000; unit = "microseconds"; }
    else { ms = n / 1e6; unit = "nanoseconds"; }
  } else {
    const d = new Date(t);
    if (isNaN(d.getTime())) throw new Error(`Cannot parse "${input}" as a timestamp or date. Try 1717785600 or 2024-06-07T12:00:00Z.`);
    ms = d.getTime(); unit = "parsed date";
  }
  const date = new Date(ms);
  if (isNaN(date.getTime())) throw new Error("Timestamp out of range.");
  return { ms, unit, iso: date.toISOString(), utc: date.toUTCString(), local: date.toString(), rfc: date.toISOString(), js: `new Date(${Math.floor(ms)})`, date };
}
export const COMMON_ZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Moscow", "Africa/Cairo", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "Pacific/Auckland", "America/Toronto", "Europe/Paris"];
export function formatInZone(date: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "medium", timeStyle: "long", hourCycle: "h23" }).format(date);
  } catch { throw new Error(`Unknown timezone "${zone}". Use an IANA name like Europe/Berlin.`); }
}
export function dateDiff(a: string, b: string) {
  const d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) throw new Error("Both dates must be valid (YYYY-MM-DD or ISO).");
  const ms = Math.abs(d2.getTime() - d1.getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const weeks = Math.floor(days / 7);
  return { ms, days, hours, mins, weeks, human: `${days}d ${hours}h ${mins}m` };
}
export function addToDate(base: string, amount: number, unit: string): Date {
  const d = base ? new Date(base) : new Date();
  if (isNaN(d.getTime())) throw new Error("Invalid base date.");
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error("Amount must be a number.");
  const out = new Date(d);
  if (unit === "days") out.setDate(out.getDate() + n);
  else if (unit === "hours") out.setHours(out.getHours() + n);
  else if (unit === "minutes") out.setMinutes(out.getMinutes() + n);
  else if (unit === "months") out.setMonth(out.getMonth() + n);
  else if (unit === "years") out.setFullYear(out.getFullYear() + n);
  return out;
}
export function businessDays(a: string, b: string): number {
  const d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) throw new Error("Both dates must be valid.");
  const [s, e] = d1 <= d2 ? [d1, d2] : [d2, d1];
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) { const dw = cur.getDay(); if (dw !== 0 && dw !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}
export function calcAge(birth: string): string {
  const b = new Date(birth), now = new Date();
  if (isNaN(b.getTime())) throw new Error("Invalid birth date.");
  let y = now.getFullYear() - b.getFullYear(), m = now.getMonth() - b.getMonth(), d = now.getDate() - b.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return `${y} years, ${m} months, ${d} days`;
}
export function isoWeekNumber(value: string | Date): { year: number; week: number } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date for ISO week calculation.");
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return { year: utc.getUTCFullYear(), week: Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7) };
}

/* ================= SECRETS / RANDOM ================= */

export function secureBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
export function genPassword(len = 20, opts = { upper: true, lower: true, digits: true, symbols: true }): string {
  let pool = "";
  if (opts.lower) pool += "abcdefghijkmnopqrstuvwxyz";
  if (opts.upper) pool += "ABCDEFGHJKLMNPQRSTUVWXYZ";
  if (opts.digits) pool += "23456789";
  if (opts.symbols) pool += "!@#$%^&*-_=+?";
  if (!pool) throw new Error("Enable at least one character set.");
  const bytes = secureBytes(len);
  return [...bytes].map((b) => pool[b % pool.length]).join("");
}
const WORDS = "acorn bacon cable delta eager flame grape honey ivory jungle karma lemon mango noble ocean piano quiet river solar tiger ultra vivid whale xenon yearn zebra amber brave cider dover eagle foster giant harbor inlet joker knife lunar mimic nerve orbit pilot quarry ridge stone trust unity vapor visit water youth".split(" ");
export function genPassphrase(n = 4, sep = "-"): string {
  const bytes = secureBytes(n);
  return [...bytes].map((b) => WORDS[b % WORDS.length]).join(sep);
}
export function genHex(n = 32): string { return [...secureBytes(n)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export function genToken(n = 32): string {
  const bytes = secureBytes(n);
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function genUuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = secureBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function passwordStrength(pw: string): { score: number; label: string; crack: string; entropy: number } {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32;
  const entropy = pw.length * Math.log2(Math.max(pool, 2));
  const score = entropy < 40 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : entropy < 100 ? 4 : 5;
  const label = ["Very weak", "Weak", "Fair", "Strong", "Very strong", "Excellent"][score] ?? "Weak";
  const guesses = 2 ** entropy / 2;
  const crack = guesses < 1e6 ? "instantly" : guesses < 1e9 ? "minutes" : guesses < 1e12 ? "hours" : guesses < 1e15 ? "months" : guesses < 1e18 ? "centuries" : "heat-death of universe";
  return { score, label, crack, entropy: Math.round(entropy) };
}
export function lorem(paras = 3): string {
  const base = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";
  return Array.from({ length: paras }, () => base).join("\n\n");
}
export function mockJson(count = 5): string {
  const first = ["Ava", "Liam", "Maya", "Noah", "Zoe", "Eli", "Ivy", "Kai"];
  const last = ["Chen", "Garcia", "Kim", "Patel", "Novak", "Rossi", "Haddad", "Berg"];
  const rows = Array.from({ length: Math.min(count, 100) }, (_, i) => ({
    id: genUuid().slice(0, 8),
    name: `${first[i % first.length]} ${last[(i * 3) % last.length]}`,
    email: `${first[i % first.length].toLowerCase()}.${last[(i * 3) % last.length].toLowerCase()}@example.com`,
    age: 18 + (secureBytes(1)[0] % 50),
    active: secureBytes(1)[0] % 2 === 0,
    createdAt: new Date(Date.now() - secureBytes(4)[0] * 100000).toISOString(),
  }));
  return JSON.stringify(rows, null, 2);
}

/* ================= misc ================= */

export function downloadFile(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); return true;
    } catch { return false; }
  }
}
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v.toFixed(1)} ${units[u]}`;
}
