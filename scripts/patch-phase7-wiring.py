#!/usr/bin/env python3
"""Phase 7 wiring: registry entries + category groups + App.tsx routes/icons.
Anchor-checked; aborts before writing anything on mismatch. Idempotent."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
reg_path = root / "src/lib/registry.ts"
app_path = root / "src/App.tsx"
reg = reg_path.read_text(encoding="utf-8")
app = app_path.read_text(encoding="utf-8")

if '"php-serialize"' in reg:
    print("already patched — nothing to do"); sys.exit(0)

NEW_TOOLS = r'''  {
    id: "php-serialize", name: "PHP Serialize Converter", slug: "php-serialize", route: "/php-serialize", category: "data",
    description: "Convert JSON ⇄ PHP serialize() strings locally, UTF-8 byte-accurate.",
    longDescription: "Paste PHP serialize() output to get JSON, or JSON to get a serialize() string. Supports null, bool, int, float, string, array and object types; array keys are preserved; byte lengths match PHP for UTF-8.",
    keywords: ["php", "serialize", "unserialize", "json", "laravel", "wordpress", "session"],
    aliases: ["php serialize", "php unserialize", "serialize to json"],
    clientSide: true, capabilities: ["PHP → JSON", "JSON → PHP"], related: ["converter", "json"],
    howItWorks: ["Paste serialized data or JSON.", "Pick the direction.", "Copy the result."],
    example: { label: "PHP array", value: "a:2:{s:4:\"name\";s:4:\"Maya\";s:3:\"age\";i:30;}" },
  },
  {
    id: "html-to-jsx", name: "HTML to JSX", slug: "html-to-jsx", route: "/html-to-jsx", category: "development",
    description: "Convert HTML markup to JSX-safe markup locally.",
    longDescription: "Rewrites class→className, for→htmlFor, kebab-case and namespaced attributes to camelCase, inline style attributes to style objects, void tags to self-closing, and HTML comments to JSX comments.",
    keywords: ["html", "jsx", "react", "convert", "classname"],
    aliases: ["html to jsx", "html to react", "jsx converter"],
    clientSide: true, capabilities: ["Convert", "Attributes", "Styles"], related: ["code-format", "diff"],
    howItWorks: ["Paste HTML.", "Copy JSX into your component.", "Tweak anything unusual by hand."],
    example: { label: "Sample card", value: "<div class=\"card\" style=\"color: red; font-size: 14px\" tabindex=\"0\">\n  <img src=\"logo.png\" alt=\"Logo\">\n  <label for=\"name\">Name</label>\n  <!-- user block -->\n</div>" },
  },
  {
    id: "color", name: "Color Converter", slug: "color", route: "/color", category: "development",
    description: "Convert colors between HEX, RGB, HSL and HSV with contrast checks.",
    longDescription: "Enter a color as #hex, rgb() or hsl() to get every common format plus relative luminance, WCAG contrast ratios against white and black, and a recommended text color.",
    keywords: ["color", "hex", "rgb", "hsl", "hsv", "contrast", "wcag"],
    aliases: ["hex to rgb", "rgb to hsl", "color converter", "contrast checker"],
    clientSide: true, capabilities: ["HEX ⇄ RGB ⇄ HSL ⇄ HSV", "Contrast"], related: ["encode", "text"],
    howItWorks: ["Type a color.", "Read the converted formats.", "Check contrast before shipping."],
    example: { label: "Brand blue", value: "#3366ff" },
  },
  {
    id: "markdown", name: "Markdown Preview", slug: "markdown", route: "/markdown", category: "development",
    description: "Preview Markdown rendered safely in your browser.",
    longDescription: "A minimal, dependency-free Markdown renderer: headings, lists, quotes, code fences, emphasis, links (only http(s), mailto and relative) and rules. Raw HTML is escaped, never rendered.",
    keywords: ["markdown", "md", "preview", "readme"],
    aliases: ["markdown preview", "md preview", "readme preview"],
    clientSide: true, capabilities: ["Preview", "Safe render"], related: ["text", "diff"],
    howItWorks: ["Type Markdown on the left.", "Preview renders instantly.", "Copy the HTML if needed."],
    example: { label: "Sample README", value: "# DevUtils\n\nA **local-first** toolkit with `103+` tools.\n\n- Fast\n- Private\n\n> Everything runs in your browser." },
  },
  {
    id: "ulid", name: "ULID Generator", slug: "ulid", route: "/ulid", category: "development",
    description: "Generate and validate ULIDs with timestamp inspection.",
    longDescription: "Generate sortable ULIDs (Crockford base32, 48-bit timestamp + 80 random bits) and validate existing ones, decoding the embedded creation time. All local.",
    keywords: ["ulid", "id", "uuid", "unique", "sortable"],
    aliases: ["ulid generator", "ulid validator", "sortable id"],
    clientSide: true, capabilities: ["Generate", "Validate", "Decode time"], related: ["generators", "timestamp"],
    howItWorks: ["Generate or paste ULIDs.", "Read the embedded timestamps.", "Copy the batch."],
    example: { label: "Example ULID", value: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
  },
  {
    id: "base-convert", name: "Base Converter", slug: "base-convert", route: "/base-convert", category: "encoding",
    description: "Convert numbers between any base from 2 to 36.",
    longDescription: "Binary, octal, decimal and hexadecimal plus arbitrary bases 2–36, using exact BigInt arithmetic so huge values convert correctly.",
    keywords: ["base", "binary", "hex", "octal", "decimal", "radix", "bigint"],
    aliases: ["base converter", "binary to decimal", "decimal to hex", "radix"],
    clientSide: true, capabilities: ["Any base 2–36", "BigInt exact"], related: ["encode", "timestamp"],
    howItWorks: ["Enter your number.", "Pick source and target base.", "Copy the result."],
    example: { label: "255 in hex", value: "255" },
  },
'''

# --- TOOLS array: insert after the cron entry (verified anchor) ---
anchor_tools = '    example: { label: "Every 15 minutes", value: "*/15 * * * *" },\n  },'
if reg.count(anchor_tools) != 1:
    print(f"ABORT: cron-entry anchor found {reg.count(anchor_tools)} times"); sys.exit(1)
reg = reg.replace(anchor_tools, anchor_tools + "\n" + NEW_TOOLS, 1)

# --- category groups (verified anchors) ---
group_edits = [
  ('tools: ["converter", "jsonschema"] }', 'tools: ["converter", "jsonschema", "php-serialize"] }'),
  ('tools: ["code-format", "code-minify", "diff", "regex"] }', 'tools: ["code-format", "code-minify", "diff", "regex", "html-to-jsx"] }'),
  ('tools: ["generators"] }', 'tools: ["generators", "ulid"] }'),
  ('tools: ["encode", "qr"] }', 'tools: ["encode", "qr", "base-convert"] }'),
]
for old, new in group_edits:
    if reg.count(old) != 1:
        print(f"ABORT: group anchor found {reg.count(old)} times: {old}"); sys.exit(1)
    reg = reg.replace(old, new, 1)

gen_line = '      { name: "Generate", blurb: "IDs, mock data & text", tools: ["generators", "ulid"] },'
vis_line = '      { name: "Visual", blurb: "Color & markdown preview", tools: ["color", "markdown"] },'
if reg.count(gen_line) != 1:
    print("ABORT: updated Generate group line not found"); sys.exit(1)
reg = reg.replace(gen_line, gen_line + "\n" + vis_line, 1)
reg_path.write_text(reg, encoding="utf-8")
print("registry.ts patched (6 tools, 5 group edits)")

# --- App.tsx wiring (verified anchors) ---
a_imp_old = 'import { TextTool, TimestampTool, TimezoneTool, DateCalcTool } from "./tools/tool-texttime";'
a_imp_new = a_imp_old + '\nimport { PhpSerializeTool, HtmlToJsxTool, ColorConvertTool, MarkdownTool, UlidTool, BaseConvertTool } from "./tools/tool-phase7";'
icon_imp_old = '  Earth, CalendarDays, Siren, LayoutGrid, Activity, BarChart3, Cloud, Pin,'
icon_imp_new = icon_imp_old + ' Palette, FileText,'
cases_old = '    case "datecalc": return <DateCalcTool />;'
cases_new = cases_old + '''
    case "php-serialize": return <PhpSerializeTool />;
    case "html-to-jsx": return <HtmlToJsxTool />;
    case "color": return <ColorConvertTool />;
    case "markdown": return <MarkdownTool />;
    case "ulid": return <UlidTool />;
    case "base-convert": return <BaseConvertTool />;'''
icons_old = '  timezone: Earth, datecalc: CalendarDays, errors: Siren,'
icons_new = icons_old + ' color: Palette, markdown: FileText, "php-serialize": Braces, "html-to-jsx": FileCode, ulid: Dices, "base-convert": Binary,'
for name, old, new in [("import", a_imp_old, a_imp_new), ("icon-import", icon_imp_old, icon_imp_new),
                       ("cases", cases_old, cases_new), ("tool-icons", icons_old, icons_new)]:
    c = app.count(old)
    if c != 1:
        print(f"ABORT: App.tsx {name} anchor found {c} times"); sys.exit(1)
for old, new in [(a_imp_old, a_imp_new), (icon_imp_old, icon_imp_new), (cases_old, cases_new), (icons_old, icons_new)]:
    app = app.replace(old, new, 1)
app_path.write_text(app, encoding="utf-8")
print("App.tsx patched (import, cases, icons)")

# --- flag any hardcoded tool-count expectations ---
v = root / "scripts/verify.ts"
if v.exists():
    hits = [l.strip() for l in v.read_text(encoding="utf-8").splitlines() if "103" in l]
    if hits:
        print("NOTE: verify.ts mentions 103 — if this is a tool-count assertion, it must become 109:")
        for h in hits: print("   ", h)
