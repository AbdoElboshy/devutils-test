#!/usr/bin/env python3
"""v5 - fixes the 3 remaining test failures in scripts/verify.ts. Idempotent.

Failures repaired (all were test bugs, not engine bugs):
 1. "truncated pem rejected" / "mislabeled pem rejected" - inspectCertificateDocument
    is async; the sync `throws()` helper cannot see a rejected promise. Replaced
    with explicit rejection checks (.then(no, yes) pattern).
 2. "json->xml root element" - jsonToXml emits an XML declaration before the
    root element (verified in engine source). Assert the declaration plus the
    <root> element instead of startsWith("<root>").

Run from the repo root, after v4.
"""
import pathlib

p = pathlib.Path("scripts/verify.ts")
s = p.read_text()
changed = False

# --- 1. async rejection checks for the certificate error paths ---------------
old_trunc = '  throws("truncated pem rejected", () => inspectCertificateDocument(PEM.slice(0, PEM.length - 20)));\n'
new_trunc = '  eq("truncated pem rejected", await inspectCertificateDocument(PEM.slice(0, PEM.length - 20)).then(() => false, () => true), true);\n'
if old_trunc in s:
    s = s.replace(old_trunc, new_trunc)
    changed = True
    print("v5: truncated-pem test converted to async rejection check")

old_label = '  throws("mislabeled pem rejected", () => inspectCertificateDocument(PEM.replace("CERTIFICATE", "PUBLIC KEY")));\n'
new_label = '  eq("mislabeled pem rejected", await inspectCertificateDocument(PEM.replace("CERTIFICATE", "PUBLIC KEY")).then(() => false, () => true), true);\n'
if old_label in s:
    s = s.replace(old_label, new_label)
    changed = True
    print("v5: mislabeled-pem test converted to async rejection check")

# --- 2. jsonToXml emits an XML declaration before the root element ------------
old_root = '  eq("json->xml root element", xml.startsWith("<root>"), true);\n'
new_root = (
    '  eq("json->xml starts with declaration", xml.startsWith("<?xml"), true);\n'
    '  eq("json->xml root element present", xml.includes("<root>"), true);\n'
)
if old_root in s:
    s = s.replace(old_root, new_root)
    changed = True
    print("v5: json->xml root assertion corrected (XML declaration precedes root)")

if changed:
    p.write_text(s)
    print("verify.ts updated (v5)")
else:
    print("verify.ts already at v5 - nothing to do")
print("done")
