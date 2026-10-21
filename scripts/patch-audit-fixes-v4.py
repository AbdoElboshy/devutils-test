#!/usr/bin/env python3
"""v4 - repairs the v3 certificate block in scripts/verify.ts.

v3 embedded the real openssl-generated PEM into verify.ts but emitted the
array lines WITHOUT quotes, producing TypeScript parse errors. The certificate
bytes themselves are intact in the file, so v4 simply extracts those lines and
re-emits the block with properly quoted string literals.

Idempotent: skips if the PEM lines are already quoted. Run from repo root.
"""
import pathlib
import re

START = "// --- G2: real openssl-generated certificate fixture (v3) ---"
END = "// --- G2: regex explain ---"
V4_MARKER = "// --- G2: real openssl-generated certificate fixture (v4) ---"

p = pathlib.Path("scripts/verify.ts")
s = p.read_text()
changed = False

if V4_MARKER in s or ('"-----BEGIN CERTIFICATE-----",' in s):
    print("v4: PEM already quoted - nothing to do")
else:
    assert START in s, "v3 block marker not found - inspect verify.ts"
    assert END in s, "next-block marker not found - inspect verify.ts"
    start = s.index(START)
    end = s.index(END)
    block = s[start:end]

    # Extract the raw PEM lines v3 wrote (unquoted): markers + base64 rows.
    lines = []
    for raw in block.split("\n"):
        t = raw.strip().rstrip(",")
        if t.startswith("-----BEGIN CERTIFICATE-----") or t.startswith("-----END CERTIFICATE-----"):
            lines.append(t)
        elif re.fullmatch(r"[A-Za-z0-9+/]{16,}={0,2}", t):
            lines.append(t)
    assert len(lines) >= 3, "could not extract PEM lines from the v3 block"
    assert lines[0] == "-----BEGIN CERTIFICATE-----", "first PEM line mismatch"
    assert lines[-1] == "-----END CERTIFICATE-----", "last PEM line mismatch"
    print("v4: extracted %d PEM lines from the v3 block" % len(lines))

    pem_lines = "".join('  "%s",\n' % line for line in lines)
    new_block = (
        V4_MARKER + "\n"
        "// Generated with: openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 -subj /CN=DevUtils Test\n"
        "{\n"
        "  const PEM = [\n"
        + pem_lines +
        "  ].join(\"\\n\");\n"
        "  throws(\"pem missing block rejected\", () => inspectPem(\"not a pem\"));\n"
        "  eq(\"pemFormat rewraps 64 cols\", pemFormat(\"-----BEGIN TEST-----\\nYQ==\\n-----END TEST-----\").split(\"\\n\").length, 3);\n"
        "  const basic = inspectPem(PEM);\n"
        "  eq(\"cert fixture DER size\", basic.derBytes > 400, true);\n"
        "  const details = await inspectCertificateDocument(PEM);\n"
        "  eq(\"cert subject parsed\", details.subject.includes(\"DevUtils Test\"), true);\n"
        "  eq(\"cert issuer equals subject (self-signed)\", details.issuer, details.subject);\n"
        "  eq(\"cert signature algorithm\", details.signatureAlgorithm, \"SHA-256 with RSA\");\n"
        "  eq(\"cert public key algorithm\", details.publicKeyAlgorithm, \"RSA\");\n"
        "  eq(\"cert notAfter in future\", (details.notAfter ? new Date(details.notAfter).getTime() : 0) > Date.now(), true);\n"
        "  eq(\"cert fingerprint format\", /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(details.fingerprintSha256), true);\n"
        "  throws(\"truncated pem rejected\", () => inspectCertificateDocument(PEM.slice(0, PEM.length - 20)));\n"
        "  throws(\"mislabeled pem rejected\", () => inspectCertificateDocument(PEM.replace(\"CERTIFICATE\", \"PUBLIC KEY\")));\n"
        "}\n\n"
    )
    s = s[:start] + new_block + s[end:]
    changed = True
    print("v4: certificate block re-emitted with quoted PEM lines")

if changed:
    p.write_text(s)
    print("verify.ts updated (v4)")
else:
    print("verify.ts already repaired - nothing to do")
print("done")
