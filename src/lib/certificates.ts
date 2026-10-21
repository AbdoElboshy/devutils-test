export type CertificateDetails = {
  kind: "certificate" | "csr";
  subject: string;
  issuer?: string;
  serialNumber?: string;
  notBefore?: string;
  notAfter?: string;
  expirationStatus?: string;
  daysRemaining?: number;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  subjectAlternativeNames: string[];
  extensions: { oid: string; critical: boolean }[];
  fingerprintSha256: string;
  signatureVerified?: boolean;
};

type AsnNode = {
  tag: number;
  tagClass: number;
  constructed: boolean;
  start: number;
  valueStart: number;
  end: number;
  children: AsnNode[];
};

const OIDS: Record<string, string> = {
  "2.5.4.3": "CN", "2.5.4.6": "C", "2.5.4.7": "L", "2.5.4.8": "ST", "2.5.4.10": "O", "2.5.4.11": "OU", "1.2.840.113549.1.9.1": "emailAddress",
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.113549.1.1.5": "SHA-1 with RSA", "1.2.840.113549.1.1.11": "SHA-256 with RSA", "1.2.840.113549.1.1.12": "SHA-384 with RSA", "1.2.840.113549.1.1.13": "SHA-512 with RSA",
  "1.2.840.10045.2.1": "EC", "1.2.840.10045.4.3.2": "ECDSA with SHA-256", "1.2.840.10045.4.3.3": "ECDSA with SHA-384", "1.2.840.10045.4.3.4": "ECDSA with SHA-512",
  "1.3.101.112": "Ed25519", "1.3.101.113": "Ed448", "2.5.29.17": "Subject Alternative Name",
};

function pemDer(pem: string): Uint8Array {
  const match = pem.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/);
  if (!match) throw new Error("No complete PEM block found.");
  let binary = "";
  try { binary = atob(match[2].replace(/\s+/g, "")); } catch { throw new Error("PEM body is not valid Base64."); }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseNode(bytes: Uint8Array, offset: number, boundary = bytes.length): AsnNode {
  if (offset + 2 > boundary) throw new Error("Truncated ASN.1 element.");
  const start = offset;
  const identifier = bytes[offset++];
  const tagClass = identifier >> 6;
  const constructed = Boolean(identifier & 0x20);
  let tag = identifier & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let octet = 0;
    do { if (offset >= boundary) throw new Error("Truncated ASN.1 tag."); octet = bytes[offset++]; tag = (tag << 7) | (octet & 0x7f); } while (octet & 0x80);
  }
  let length = bytes[offset++];
  if (length & 0x80) {
    const octets = length & 0x7f;
    if (!octets || octets > 4 || offset + octets > boundary) throw new Error("Unsupported ASN.1 length.");
    length = 0;
    for (let i = 0; i < octets; i++) length = length * 256 + bytes[offset++];
  }
  const valueStart = offset;
  const end = valueStart + length;
  if (end > boundary) throw new Error("ASN.1 element length exceeds input.");
  const children: AsnNode[] = [];
  if (constructed) {
    while (offset < end) { const child = parseNode(bytes, offset, end); children.push(child); offset = child.end; }
  }
  return { tag, tagClass, constructed, start, valueStart, end, children };
}

function bytesOf(bytes: Uint8Array, node: AsnNode): Uint8Array { return bytes.slice(node.valueStart, node.end); }
function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(""); }

function oid(bytes: Uint8Array, node: AsnNode): string {
  const value = bytesOf(bytes, node);
  if (!value.length) return "";
  const parts = [Math.min(2, Math.floor(value[0] / 40)), value[0] % 40];
  let current = 0;
  for (let i = 1; i < value.length; i++) { current = current * 128 + (value[i] & 0x7f); if (!(value[i] & 0x80)) { parts.push(current); current = 0; } }
  return parts.join(".");
}

function textValue(bytes: Uint8Array, node: AsnNode): string {
  const value = bytesOf(bytes, node);
  if (node.tag === 30) {
    let output = "";
    for (let i = 0; i + 1 < value.length; i += 2) output += String.fromCharCode(value[i] * 256 + value[i + 1]);
    return output;
  }
  return new TextDecoder(node.tag === 22 || node.tag === 19 ? "ascii" : "utf-8").decode(value);
}

function nameValue(bytes: Uint8Array, node: AsnNode): string {
  const values: string[] = [];
  node.children.forEach((set) => set.children.forEach((sequence) => {
    const type = sequence.children[0], value = sequence.children[1];
    if (type?.tag === 6 && value) { const id = oid(bytes, type); values.push(`${OIDS[id] ?? id}=${textValue(bytes, value)}`); }
  }));
  return values.join(", ");
}

function timeValue(bytes: Uint8Array, node: AsnNode): Date {
  const text = textValue(bytes, node);
  if (node.tag === 23) {
    const match = text.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!match) throw new Error(`Unsupported UTCTime: ${text}`);
    const year = Number(match[1]);
    return new Date(Date.UTC(year >= 50 ? 1900 + year : 2000 + year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)));
  }
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/);
  if (!match) throw new Error(`Unsupported GeneralizedTime: ${text}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])));
}

function algorithm(bytes: Uint8Array, node: AsnNode | undefined): string {
  const idNode = node?.children.find((child) => child.tag === 6);
  if (!idNode) return "unknown";
  const id = oid(bytes, idNode);
  return OIDS[id] ?? id;
}

function parseExtensions(bytes: Uint8Array, wrapper: AsnNode | undefined): { list: { oid: string; critical: boolean }[]; names: string[] } {
  const list: { oid: string; critical: boolean }[] = [];
  const names: string[] = [];
  const sequence = wrapper?.children[0];
  if (!sequence) return { list, names };
  sequence.children.forEach((extension) => {
    const idNode = extension.children.find((child) => child.tag === 6);
    const value = extension.children.find((child) => child.tag === 4);
    if (!idNode) return;
    const id = oid(bytes, idNode);
    const criticalNode = extension.children.find((child) => child.tag === 1);
    list.push({ oid: OIDS[id] ? `${OIDS[id]} (${id})` : id, critical: Boolean(criticalNode && bytes[criticalNode.valueStart]) });
    if (id === "2.5.29.17" && value) {
      try {
        const innerBytes = bytesOf(bytes, value);
        const sanSequence = parseNode(innerBytes, 0);
        sanSequence.children.forEach((item) => {
          const valueBytes = bytesOf(innerBytes, item);
          if (item.tagClass !== 2) return;
          if (item.tag === 2) names.push(`DNS:${new TextDecoder().decode(valueBytes)}`);
          else if (item.tag === 1) names.push(`email:${new TextDecoder().decode(valueBytes)}`);
          else if (item.tag === 6) names.push(`URI:${new TextDecoder().decode(valueBytes)}`);
          else if (item.tag === 7) names.push(`IP:${valueBytes.length === 4 ? [...valueBytes].join(".") : hex(valueBytes)}`);
        });
      } catch { /* malformed extension remains listed by OID */ }
    }
  });
  return { list, names };
}

async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

export async function inspectCertificateDocument(pem: string): Promise<CertificateDetails> {
  const bytes = pemDer(pem);
  const root = parseNode(bytes, 0);
  if (root.tag !== 16 || root.end !== bytes.length || root.children.length < 3) throw new Error("Input is not a complete DER certificate/request sequence.");
  const fp = await fingerprint(bytes);
  const isCsr = /-----BEGIN (?:NEW )?CERTIFICATE REQUEST-----/.test(pem);

  if (isCsr) {
    const info = root.children[0];
    const subject = info.children[1];
    const spki = info.children[2];
    let extensionWrapper: AsnNode | undefined;
    const walk = (node: AsnNode) => {
      node.children.forEach((child, index) => {
        if (child.tag === 6 && oid(bytes, child) === "1.2.840.113549.1.9.14") extensionWrapper = node.children[index + 1]?.children[0];
        walk(child);
      });
    };
    info.children.slice(3).forEach(walk);
    const extensions = parseExtensions(bytes, extensionWrapper);
    return {
      kind: "csr",
      subject: subject ? nameValue(bytes, subject) : "unknown",
      signatureAlgorithm: algorithm(bytes, root.children[1]),
      publicKeyAlgorithm: algorithm(bytes, spki?.children[0]),
      subjectAlternativeNames: extensions.names,
      extensions: extensions.list,
      fingerprintSha256: fp,
    };
  }

  if (!/-----BEGIN CERTIFICATE-----/.test(pem)) throw new Error("This PEM block is not an X.509 certificate or PKCS#10 CSR.");
  const tbs = root.children[0];
  let index = tbs.children[0]?.tagClass === 2 && tbs.children[0]?.tag === 0 ? 1 : 0;
  const serial = tbs.children[index++];
  index++;
  const issuer = tbs.children[index++];
  const validity = tbs.children[index++];
  const subject = tbs.children[index++];
  const spki = tbs.children[index++];
  const extensionsWrapper = tbs.children.find((node) => node.tagClass === 2 && node.tag === 3);
  if (!validity?.children[0] || !validity.children[1]) throw new Error("Certificate validity period is missing.");
  const notBefore = timeValue(bytes, validity.children[0]);
  const notAfter = timeValue(bytes, validity.children[1]);
  const remaining = Math.ceil((notAfter.getTime() - Date.now()) / 86400000);
  const status = Date.now() < notBefore.getTime() ? "Not valid yet" : remaining < 0 ? `Expired ${Math.abs(remaining)} day(s) ago` : remaining <= 30 ? `Expires soon (${remaining} day(s))` : `Valid for ${remaining} more day(s)`;
  const extensions = parseExtensions(bytes, extensionsWrapper);
  return {
    kind: "certificate",
    subject: nameValue(bytes, subject),
    issuer: nameValue(bytes, issuer),
    serialNumber: serial ? hex(bytesOf(bytes, serial)) : undefined,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    expirationStatus: status,
    daysRemaining: remaining,
    signatureAlgorithm: algorithm(bytes, root.children[1]),
    publicKeyAlgorithm: algorithm(bytes, spki?.children[0]),
    subjectAlternativeNames: extensions.names,
    extensions: extensions.list,
    fingerprintSha256: fp,
  };
}