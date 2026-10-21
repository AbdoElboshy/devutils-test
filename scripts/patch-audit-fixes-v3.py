#!/usr/bin/env python3
"""v3 - replace the @peculiar/x509 fixture with a real, static, openssl-generated
certificate embedded in scripts/verify.ts. Run after v2, from the repo root.

Why: under tsx, importing @peculiar/x509 pulls its CommonJS build, which loads
tsyringe and crashes with a reflect-metadata polyfill error before any test runs.

The v3 fixture is more real, not less: this script generates a genuine
self-signed RSA-2048 / SHA-256 certificate via the system openssl binary and
embeds the actual PEM text into verify.ts as a committed fixture.
inspectPem / inspectCertificateDocument then parse the real DER bytes.

Idempotent. Requires openssl.
"""
import pathlib
import subprocess

V3_MARKER = "real openssl-generated certificate fixture (v3)"
X509_IMPORT_LINE = 'import * as x509 from "@peculiar/x509";\n'
OLD_BLOCK_START = "// --- G2: PEM inspection + real certificate fixture (global WebCrypto + @peculiar/x509) ---"
NEXT_BLOCK = "// --- G2: regex explain ---"

p = pathlib.Path("scripts/verify.ts")
s = p.read_text()
changed = False

if V3_MARKER in s:
    print("v3: fixture already present - skipping")
else:
    # 1. Generate a REAL self-signed certificate with the system openssl.
    proc = subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "3650",
         "-keyout", "/tmp/devutils-test-key.pem", "-subj", "/CN=DevUtils Test"],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, "openssl failed: " + proc.stderr.strip()[:300]
    pem = proc.stdout.strip()
    assert pem.startswith("-----BEGIN CERTIFICATE-----"), "unexpected openssl output"
    assert pem.endswith("-----END CERTIFICATE-----"), "unexpected openssl output"
    print("v3: generated real certificate fixture (%d chars, 10-year validity)" % len(pem))

    # 2. Replace the v2 certificate test block with the static-fixture block.
    assert OLD_BLOCK_START in s, "v2 cert block marker not found - inspect verify.ts"
    assert s.count(X509_IMPORT_LINE) == 1, "x509 import line not found exactly once"
    start = s.index(OLD_BLOCK_START)
    end = s.index(NEXT_BLOCK)

    cert_body = "\n".join("  " + line for line in pem.split("\n"))
    block = (
        "// --- G2: " + V3_MARKER + " ---\n"
        "// Generated with: openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 -subj /CN=DevUtils Test\n"
        "{\n"
        "  const PEM = [\n" + cert_body + ",\n"
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
    s = s[:start] + block + s[end:]
    changed = True
    print("v3: cert test block replaced (static real fixture)")

    # 3. Drop the x509 import (no longer referenced).
    s = s.replace(X509_IMPORT_LINE, "")
    assert "@peculiar/x509" not in s, "x509 still referenced somewhere - inspect manually"
    changed = True
    print("v3: x509 import removed from verify.ts")

if changed:
    p.write_text(s)
    print("verify.ts updated (v3)")
else:
    print("verify.ts already at v3 - nothing to do")
print("done")
