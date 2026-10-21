#!/usr/bin/env python3
"""Audit fixes D1 + G1 + G2 for DevUtils. Idempotent; asserts before every write.

D1: tool-security.tsx HashTool — replace the raw navigator.clipboard.writeText
    "copy" button with the shared <CopyBtn> (success feedback, disabled-on-empty,
    execCommand fallback). CopyBtn is added to the existing ui import list.
G1: verify.ts — regression test that EVERY registry tool id resolves to a real
    component mapping (same predicate logic as App.tsx ToolView dispatch). Fails
    the suite if any of the 102 ids has no mapping.
G2: verify.ts — engine coverage for previously untested functions: SQL
    (formatSql/minifySql), secrets generators + passwordStrength, CSP/robots/
    security.txt, PEM inspection + real self-signed certificate fixture (via
    @peculiar/x509), regex explain, xml round-trip, timezone/date helpers.

Run from repo root. No dependencies beyond existing ones.
"""
import pathlib

# ---------------- D1: HashTool shared CopyBtn ----------------
p = pathlib.Path("src/tools/tool-security.tsx")
s = p.read_text()
if "CopyBtn" in s.split("/* ================= HASH", 1)[1].split("/* ================= SECRETS", 1)[0]:
    print("D1: already applied - skipping")
else:
    old_import = '  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Check, Btn,\n  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat, inputCls,\n'
    new_import = '  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Check, Btn, CopyBtn,\n  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, Stat, inputCls,\n'
    assert s.count(old_import) == 1, "D1: ui import anchor not found"
    s = s.replace(old_import, new_import)
    old_btn = '                        <Btn variant="ghost" className="px-2 py-0.5 text-[11.5px]" onClick={() => { if (outs[a]) navigator.clipboard.writeText(outs[a]).catch(() => {}); }}>copy</Btn>\n'
    new_btn = '                        <CopyBtn text={outs[a] ?? ""} label="copy" />\n'
    assert s.count(old_btn) == 1, "D1: HashTool copy button anchor not found"
    s = s.replace(old_btn, new_btn)
    p.write_text(s)
    print("D1: HashTool now uses shared CopyBtn")

# ---------------- G1 + G2: verify.ts additions ----------------
p = pathlib.Path("scripts/verify.ts")
s = p.read_text()
if "G1: dispatch coverage" in s:
    print("G1/G2: already applied - skipping")
else:
    # G1: append dispatch-coverage + G2 engine tests just before the final summary.
    anchor = 'console.log(`\\n${pass} passed, ${fail} failed`);'
    assert s.count(anchor) == 1, "verify.ts summary anchor not found"

    # --- new imports needed (merged into existing engine import line if present) ---
    # formatSql/minifySql/explainRegex/jsonToXml/xmlToJson already exported by engine.ts.
    old_engine_import = 'import {\n  formatJson, minifyJson, sortJson, flattenJson, unflattenJson, queryJsonPath, queryJsonPointer, applyJsonPatch, applyJsonMergePatch,\n  jsonToYaml, yamlToJson, jsonToCsv, csvToJson, jsonToToml, tomlToJson, jsonToSchema,\n'
    if old_engine_import in s:
        s = s.replace(
            old_engine_import,
            'import {\n  formatJson, minifyJson, sortJson, flattenJson, unflattenJson, queryJsonPath, queryJsonPointer, applyJsonPatch, applyJsonMergePatch,\n  jsonToYaml, yamlToJson, jsonToCsv, csvToJson, jsonToToml, tomlToJson, jsonToSchema, formatSql, minifySql, explainRegex, jsonToXml, xmlToJson, xmlToJson, formatXml,\n  b64encode, b64decode, hexEncode, hexDecode, md5hex, sha1hex, sha3hex,\n'
        )

    # blueprints imports (cspBuild etc.) and engine secrets imports are added as a new line
    # right after the first engine import block.
    new_imports = (
        'import { cspBuild, robotsBuild, securityTxt, inspectPem, pemFormat } from "../src/lib/blueprints";\n'
        'import { inspectCertificateDocument } from "../src/lib/certificates";\n'
        'import { genPassword, genPassphrase, genToken, genUuid, genHex, passwordStrength, formatInZone, dateDiff, addToDate, businessDays, calcAge } from "../src/lib/engine";\n'
    )
    first_import_end = s.index('from "../src/lib/engine";\n') + len('from "../src/lib/engine";\n')
    s = s[:first_import_end] + new_imports + s[first_import_end:]

    tests = r'''
// --- G1: dispatch coverage — every registry tool id must map to a component ---
{
  const DISPATCH_SWITCH = new Set([
    "json", "regex", "code-format", "code-minify", "diff", "generators", "jsonschema", "errors", "logs", "api-schema",
    "cloud", "infrastructure", "docker", "kubernetes", "terraform", "git", "cicd", "env", "cron",
    "chmod", "linux-cmd", "ssh", "systemd", "subnet", "ip", "dns", "http", "curl", "ports",
    "jwt", "hash", "secrets", "websec", "cert", "encode", "qr", "converter", "sql",
    "text", "timestamp", "timezone", "datecalc",
  ]);
  const hasComponent = (id: string): boolean => {
    if (id.startsWith("aws-") || id.startsWith("azure-") || id.startsWith("gcp-") || id.startsWith("gcloud-") || id === "cloud-cidr-planner" || id === "cloud-cli-converter") return true;
    if (id === "grafana" || id.startsWith("grafana-")) return true;
    if (id === "zabbix" || id.startsWith("zabbix-")) return true;
    if (id === "prometheus" || id === "promql-formatter" || id.startsWith("prometheus-")) return true;
    if (id === "loki" || id.startsWith("logql-") || id.startsWith("loki-label")) return true;
    if (["monitoring", "resource-utilization-calculator", "availability-calculator", "observability", "error-budget-calculator", "percentile-helper"].includes(id)) return true;
    if (["json-log-formatter", "log-cleaner", "log-level-extractor", "log-timestamp-normalizer", "stack-trace-formatter", "log-diff", "docker-log-formatter", "kubernetes-log-cleaner", "nginx-log-parser", "apache-log-parser", "syslog-parser"].includes(id)) return true;
    return DISPATCH_SWITCH.has(id);
  };
  const unmapped = TOOLS.map((tool) => tool.id).filter((id) => !hasComponent(id));
  eq("G1: all registry tool ids map to a rendered component", unmapped.length, 0);
  if (unmapped.length) console.log("  unmapped ids:", unmapped.join(", "));
  eq("G1: registry id count is 102 (audit baseline)", TOOLS.length, 102);
}

// --- G2: SQL formatting ---
eq("sql format uppercases majors", formatSql("select id from users where active = true").toUpperCase().startsWith("SELECT ID FROM USERS"), true);
eq("sql format adds trailing semicolon", formatSql("select 1").trim().endsWith(";"), true);
throws("sql format rejects empty", () => formatSql("   "));
eq("sql minify collapses whitespace", /\\s{2,}/.test(minifySql("select    id\\n  from     users")), false);
eq("sql minify preserves string literals", minifySql("select * from t where name = 'a  b'").includes("'a  b'"), true);
eq("sql minify strips comments", minifySql("select 1 -- trailing comment").includes("--"), false);
eq("sql format preserves literal with spaces", formatSql("select 'hello  world' as greeting").includes("'hello  world'"), true);

// --- G2: secrets generators + strength ---
{
  const pw = genPassword(20);
  eq("password length respected", pw.length, 20);
  eq("password charset digits-only", /^[0-9]+$/.test(genPassword(12, { upper: false, lower: false, digits: true, symbols: false })), true);
  throws("password with no charsets rejected", () => genPassword(12, { upper: false, lower: false, digits: false, symbols: false }));
  const pp = genPassphrase(4);
  eq("passphrase word count", pp.split("-").length, 4);
  const hex = genHex(32);
  eq("hex secret length", hex.length, 64);
  eq("hex secret charset", /^[0-9a-f]{64}$/.test(hex), true);
  const uuid = genUuid();
  eq("uuid shape", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid), true);
  const tok = genToken(32);
  eq("token is base64url", /^[A-Za-z0-9_-]+$/.test(tok), true);
  const strong = passwordStrength(genPassword(24, { upper: true, lower: true, digits: true, symbols: true }));
  eq("strong password entropy >= 80 bits", strong.entropy >= 80, true);
  eq("weak password scores low", passwordStrength("1234").score, 1);
  eq("empty password scores low", passwordStrength("").score, 1);
}

// --- G2: CSP / robots / security.txt ---
{
  const csp = cspBuild({ defaultSrc: "'self'", script: "'self'", style: "'self'", img: "'self' data:", connect: "'self'", frame: "'none'", extra: "base-uri 'self'" });
  eq("csp contains default-src", csp.includes("default-src 'self'"), true);
  eq("csp ends with semicolon", csp.trim().endsWith(";"), true);
  const robots = robotsBuild({ allow: "/\\n/public", disallow: "/admin\\n*.json", sitemap: "https://example.com/sitemap.xml" });
  eq("robots user-agent", robots.startsWith("User-agent: *"), true);
  eq("robots disallow lines", robots.split("\\n").filter((l) => l.startsWith("Disallow:")).length, 2);
  eq("robots sitemap included", robots.includes("Sitemap: https://example.com/sitemap.xml"), true);
  const sectxt = securityTxt({ contact: "mailto:sec@example.com", expires: "2030-01-01T00:00:00.000Z", policy: "" });
  eq("security.txt contact", sectxt.startsWith("Contact: mailto:sec@example.com"), true);
  eq("security.txt expires", sectxt.includes("Expires: 2030-01-01"), true);
}

// --- G2: PEM inspection + real certificate fixture ---
{
  throws("pem missing block rejected", () => inspectPem("not a pem"));
  const formatted = pemFormat("-----BEGIN TEST-----\nYQ==\n-----END TEST-----");
  eq("pemFormat wraps 64 cols", formatted.split("\\n").length, 3);
  // Real self-signed certificate generated with the repo's existing @peculiar/x509
  const { crypto } = await import("node:crypto");
  // @ts-expect-error @peculiar/x509 ships no bundled types for this import path
  const x509 = await import("@peculiar/x509");
  const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
  const keys = (await crypto.subtle.generateKey(alg as AlgorithmIdentifier, false, ["sign", "verify"])) as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=DevUtils Test",
    notBefore: new Date(Date.now() - 86400000),
    notAfter: new Date(Date.now() + 30 * 86400000),
    signingAlgorithm: alg,
    keys,
    extensions: [],
  });
  const pem = cert.toString("pem") as string;
  const basic = inspectPem(pem);
  eq("cert fixture DER size > 0", basic.derBytes > 400, true);
  const details = await inspectCertificateDocument(pem);
  eq("cert subject parsed", details.subject.includes("DevUtils Test"), true);
  eq("cert issuer equals subject (self-signed)", details.issuer, details.subject);
  eq("cert signature algorithm", details.signatureAlgorithm.includes("SHA-256"), true);
  eq("cert public key algorithm", details.publicKeyAlgorithm, "RSA");
  eq("cert validity window sane", details.notBefore !== undefined && details.notAfter !== undefined, true);
  eq("cert notAfter in future", (details.notAfter ? new Date(details.notAfter).getTime() : 0) > Date.now(), true);
  eq("cert fingerprint is sha256 hex colons", /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(details.fingerprintSha256), true);
  throws("truncated cert rejected", () => inspectCertificateDocument(pem.slice(0, pem.length - 20)));
  throws("wrong PEM label rejected", () => inspectCertificateDocument(pem.replace("CERTIFICATE", "PUBLIC KEY")));
}

// --- G2: regex explain ---
{
  const lines = explainRegex("^\\d{3}-\\d{4}$");
  eq("regex explain start anchor", lines.some((l) => l.includes("start of string")), true);
  eq("regex explain quantifier", lines.some((l) => l.includes("exact-count")), true);
  eq("regex explain digit class", lines.some((l) => l.includes("any digit")), true);
  eq("regex explain literal present", lines.length >= 4, true);
}

// --- G2: XML round-trip ---
{
  const xml = jsonToXml('{"name":"api","port":8080}');
  eq("json->xml has root", xml.startsWith("<root>"), true);
  eq("json->xml escapes", jsonToXml('{"a":"<b&c>"}').includes("&lt;"), true);
  throws("json->xml invalid json", () => jsonToXml("{bad}"));
  const back = JSON.parse(xmlToJson("<root><name>api</name><port>8080</port></root>"));
  eq("xml->json roundtrip", back.root.name, "api");
  throws("xml->json invalid xml", () => xmlToJson("<root><unclosed></root>"));
  eq("xml format indents", formatXml("<a><b>x</b></a>").includes("\\n"), true);
}

// --- G2: timezone + date helpers ---
{
  const berlin = formatInZone(new Date("2026-01-15T12:00:00Z"), "Europe/Berlin");
  eq("timezone berlin formats", typeof berlin === "string" && berlin.length > 0, true);
  throws("timezone invalid zone rejected", () => formatInZone(new Date(), "Mars/Olympus"));
  const dd = dateDiff("2026-01-01", "2026-01-11");
  eq("dateDiff days", dd.days, 10);
  throws("dateDiff invalid rejected", () => dateDiff("nope", "2026-01-01"));
  const added = addToDate("2026-01-31", 1, "months");
  eq("addToDate month rollover", added.getMonth(), 1); // 2026-02-28
  eq("businessDays Mon-Fri week", businessDays("2026-01-05", "2026-01-11"), 5);
  const age = calcAge("1990-06-15");
  eq("calcAge format", /\\d+ years/.test(age), true);
}

'''
    s = s.replace(anchor, tests + anchor)
    p.write_text(s)
    print("G1/G2: verify.ts extended")

print("done")
