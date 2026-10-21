export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  tagline: string;
  groups: { name: string; blurb: string; tools: string[] }[];
};

export type Tool = {
  id: string;
  name: string;
  slug: string;
  route: string;
  category: string;
  description: string;
  longDescription: string;
  keywords: string[];
  aliases: string[];
  featured?: boolean;
  clientSide: boolean;
  capabilities: string[];
  related: string[];
  tags?: string[];
  howItWorks: string[];
  example?: { label: string; value: string };
  faq?: { q: string; a: string }[];
};

export const CATEGORIES: Category[] = [
  {
    id: "development",
    name: "Development",
    slug: "development",
    description: "Format, validate, transform, compare, and generate common developer data and code.",
    tagline: "JSON, Regex, code, diff & generators.",
    groups: [
      { name: "Structured data", blurb: "JSON power tools", tools: ["json", "jsonschema"] },
      { name: "API schemas", blurb: "OpenAPI & GraphQL", tools: ["api-schema"] },
      { name: "Code", blurb: "Format, minify & compare", tools: ["code-format", "code-minify", "diff", "regex"] },
      { name: "Debugging", blurb: "Deterministic error explanations", tools: ["errors"] },
      { name: "Generate", blurb: "IDs, mock data & text", tools: ["generators"] },
    ],
  },
  {
    id: "devops",
    name: "DevOps",
    slug: "devops",
    description: "Build Docker, Kubernetes, Terraform, Git, CI/CD, and infrastructure configurations faster.",
    tagline: "Docker · K8s · Terraform · Git · CI/CD · Cron · Env",
    groups: [
      { name: "Containers", blurb: "Docker & Compose", tools: ["docker"] },
      { name: "Orchestration", blurb: "Deployments to policies", tools: ["kubernetes"] },
      { name: "Infrastructure", blurb: "Terraform & cloud config", tools: ["terraform", "env", "cron"] },
      { name: "Delivery", blurb: "Git & pipelines", tools: ["git", "cicd", "curl"] },
      { name: "Monitoring", blurb: "Thresholds, availability & SLOs", tools: ["monitoring", "resource-utilization-calculator", "availability-calculator", "observability", "error-budget-calculator", "percentile-helper"] },
      { name: "Grafana", blurb: "Dashboard JSON, panels & PromQL", tools: ["grafana-dashboard-json-formatter", "grafana-dashboard-json-validator", "grafana-panel-json-generator", "grafana-promql-helper", "grafana-variable-generator", "grafana-threshold-helper", "grafana"] },
      { name: "Zabbix", blurb: "Items, triggers, macros & templates", tools: ["zabbix-item-key-helper", "zabbix-trigger-expression-builder", "zabbix-macro-generator", "zabbix-item-generator", "zabbix-trigger-generator", "zabbix-discovery-helper", "zabbix-api-request-builder", "zabbix"] },
      { name: "Prometheus", blurb: "PromQL, rules & configuration", tools: ["prometheus", "promql-formatter", "prometheus-alert-rule-generator", "prometheus-recording-rule-generator", "prometheus-config-helper", "prometheus-label-selector-builder"] },
      { name: "Loki", blurb: "LogQL queries & selectors", tools: ["loki", "logql-formatter", "loki-label-selector-builder"] },
      { name: "Logging", blurb: "Format, clean, parse & compare logs", tools: ["logs", "json-log-formatter", "log-cleaner", "log-level-extractor", "log-timestamp-normalizer", "stack-trace-formatter", "log-diff", "docker-log-formatter", "kubernetes-log-cleaner", "nginx-log-parser", "apache-log-parser", "syslog-parser"] },
      { name: "Cloud", blurb: "Safe cloud & naming helpers", tools: ["cloud", "infrastructure"] },
    ],
  },
  {
    id: "linux",
    name: "Linux",
    slug: "linux",
    description: "Permissions, shell commands, SSH, systemd, and Linux administration utilities.",
    tagline: "chmod · grep · SSH · systemd",
    groups: [
      { name: "Permissions", blurb: "Ownership & modes", tools: ["chmod"] },
      { name: "Commands", blurb: "Build safe one-liners", tools: ["linux-cmd", "ssh", "systemd"] },
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    slug: "cloud",
    description: "Parse, generate and validate AWS, Azure, GCP and multi-cloud configuration locally.",
    tagline: "AWS · Azure · GCP · naming · policies · CLI",
    groups: [
      { name: "AWS", blurb: "ARNs, IAM, CLI, networking & deployment", tools: ["aws-arn-parser", "aws-arn-builder", "aws-cli-builder", "aws-iam-policy-generator", "aws-security-group-rule-builder", "aws-ec2-user-data-generator", "aws-s3-policy-generator", "aws-s3-url-helper", "aws-ecr-command-generator", "aws-lambda-event-examples"] },
      { name: "Azure", blurb: "Resource IDs, CLI, naming & Bicep", tools: ["azure-resource-id-parser", "azure-cli-builder", "azure-resource-naming-generator", "azure-bicep-helper"] },
      { name: "GCP", blurb: "Resource names, gcloud & IAM", tools: ["gcp-resource-name-helper", "gcloud-cli-builder", "gcp-iam-policy-helper", "gcp-resource-parser"] },
      { name: "Multi-cloud", blurb: "Portable planning helpers", tools: ["infrastructure", "cloud-cidr-planner", "cloud-cli-converter", "cloud"] },
    ],
  },
  {
    id: "networking",
    name: "Networking",
    slug: "networking",
    description: "IP, subnet, DNS, HTTP, URL, and network calculation tools.",
    tagline: "Subnet · IP · DNS · HTTP · ports",
    groups: [
      { name: "Addressing", blurb: "CIDR math, done right", tools: ["subnet", "ip"] },
      { name: "Services", blurb: "DNS, HTTP & ports", tools: ["dns", "http", "curl", "ports"] },
    ],
  },
  {
    id: "security",
    name: "Security",
    slug: "security",
    description: "Inspect, transform, generate, and understand common security-related developer data.",
    tagline: "JWT · hashes · secrets · headers · certs",
    groups: [
      { name: "Tokens & hashes", blurb: "Decode & digest locally", tools: ["jwt", "hash", "secrets"] },
      { name: "Hardening", blurb: "Headers & certificates", tools: ["websec", "cert"] },
    ],
  },
  {
    id: "encoding",
    name: "Encoding",
    slug: "encoding",
    description: "Encode and decode common formats quickly and locally.",
    tagline: "Base64 · URL · Hex · QR",
    groups: [
      { name: "Codecs", blurb: "15+ formats, instant", tools: ["encode", "qr"] },
    ],
  },
  {
    id: "data",
    name: "Data",
    slug: "data",
    description: "Convert, format, validate, query, and transform structured data.",
    tagline: "JSON ⇄ YAML ⇄ XML ⇄ CSV ⇄ TOML",
    groups: [
      { name: "Interchange", blurb: "Convert & validate", tools: ["converter", "jsonschema"] },
      { name: "Query", blurb: "SQL helpers", tools: ["sql", "diff"] },
    ],
  },
  {
    id: "text",
    name: "Text",
    slug: "text",
    description: "Clean, transform, extract, compare, and analyze plain text.",
    tagline: "Case · clean · extract · analyze",
    groups: [
      { name: "Toolkit", blurb: "Everything plain-text", tools: ["text", "diff"] },
    ],
  },
  {
    id: "datetime",
    name: "Date & Time",
    slug: "date-time",
    description: "Timestamps, timezones, date calculations, and developer time formats.",
    tagline: "Epoch · timezones · date math",
    groups: [
      { name: "Time", blurb: "Epoch, zones & math", tools: ["timestamp", "timezone", "datecalc"] },
    ],
  },
];

function devopsTool(id: string, name: string, description: string, keywords: string[], related: string[], capabilities: string[]): Tool {
  return {
    id,
    name,
    slug: id,
    route: `/tools/${id}`,
    category: "devops",
    description,
    longDescription: `${description} Runs locally in your browser and produces copyable, downloadable output without connecting to external monitoring systems.`,
    keywords,
    aliases: [name.toLowerCase(), ...keywords.slice(0, 4)],
    clientSide: true,
    capabilities,
    related,
    howItWorks: ["Enter or paste the relevant configuration.", "Adjust the operation-specific options.", "Review, copy or download the generated result."],
  };
}

function cloudTool(id: string, name: string, description: string, keywords: string[], related: string[], capabilities: string[]): Tool {
  return { ...devopsTool(id, name, description, keywords, related, capabilities), category: "cloud" };
}

const DEVOPS_STANDALONE_TOOLS: Tool[] = [
  devopsTool("grafana-dashboard-json-formatter", "Grafana Dashboard JSON Formatter", "Format, minify and validate Grafana dashboard JSON.", ["grafana", "dashboard", "json", "formatter", "minify"], ["grafana-dashboard-json-validator", "grafana-panel-json-generator", "json"], ["Format", "Minify", "Validate"]),
  devopsTool("grafana-dashboard-json-validator", "Grafana Dashboard JSON Validator", "Validate practical Grafana dashboard JSON structure with actionable paths.", ["grafana", "dashboard", "json", "validator", "schema"], ["grafana-dashboard-json-formatter", "grafana", "jsonschema"], ["Validate", "Errors"]),
  devopsTool("grafana-panel-json-generator", "Grafana Panel JSON Generator", "Generate Time series, Stat, Gauge, Table, Bar chart and Logs panel JSON.", ["grafana", "panel", "json", "timeseries", "stat", "gauge", "table", "logs"], ["grafana-promql-helper", "grafana-threshold-helper", "grafana"], ["Panels", "Thresholds", "Queries"]),
  devopsTool("grafana-promql-helper", "Grafana PromQL Helper", "Construct common PromQL queries for Grafana panels.", ["grafana", "prometheus", "promql", "rate", "histogram_quantile", "group by"], ["prometheus", "promql-formatter", "grafana-panel-json-generator", "loki"], ["PromQL", "Grouping", "Labels"]),
  devopsTool("grafana-variable-generator", "Grafana Variable Generator", "Generate Grafana query-variable configuration for job, instance, namespace, pod and container.", ["grafana", "variable", "template", "job", "instance", "namespace", "pod"], ["grafana", "grafana-promql-helper", "prometheus-label-selector-builder"], ["Variables", "Datasource", "JSON"]),
  devopsTool("grafana-threshold-helper", "Grafana Threshold Helper", "Generate absolute or percentage Grafana threshold step configuration.", ["grafana", "threshold", "warning", "critical", "gauge", "stat"], ["monitoring", "grafana-panel-json-generator", "prometheus-alert-rule-generator"], ["Thresholds", "Colors", "JSON"]),
  devopsTool("zabbix-item-key-helper", "Zabbix Item Key Helper", "Construct common Zabbix agent, filesystem, process, network and service item keys.", ["zabbix", "item key", "agent", "vfs", "proc", "net tcp"], ["zabbix-item-generator", "zabbix-trigger-expression-builder", "zabbix"], ["Item keys", "Parameters", "Examples"]),
  devopsTool("zabbix-trigger-expression-builder", "Zabbix Trigger Expression Builder", "Convert common CPU, memory, disk, host and service conditions into Zabbix expressions.", ["zabbix", "trigger", "expression", "cpu", "memory", "disk", "nodata"], ["zabbix-trigger-generator", "zabbix-item-key-helper", "monitoring"], ["Expressions", "Duration", "Thresholds"]),
  devopsTool("zabbix-macro-generator", "Zabbix Macro Generator", "Normalize user macros and generate reusable Zabbix macro structures.", ["zabbix", "macro", "user macro", "threshold"], ["zabbix-trigger-expression-builder", "zabbix", "zabbix-item-generator"], ["Macros", "Normalize", "Examples"]),
  devopsTool("zabbix-item-generator", "Zabbix Item Generator", "Generate Zabbix item JSON from key, type, interval, units, history, trends and tags.", ["zabbix", "item", "key", "interval", "history", "trends", "tags"], ["zabbix-item-key-helper", "zabbix-trigger-generator", "zabbix"], ["Items", "Tags", "JSON"]),
  devopsTool("zabbix-trigger-generator", "Zabbix Trigger Generator", "Generate Zabbix trigger JSON with severity, recovery expression and tags.", ["zabbix", "trigger", "severity", "recovery", "expression"], ["zabbix-trigger-expression-builder", "zabbix-item-generator", "monitoring"], ["Triggers", "Recovery", "Tags"]),
  devopsTool("zabbix-discovery-helper", "Zabbix Discovery Rule Helper", "Generate discovery rules with item and trigger prototypes.", ["zabbix", "discovery", "lld", "item prototype", "trigger prototype"], ["zabbix-item-generator", "zabbix-trigger-generator", "zabbix"], ["Discovery", "Prototypes", "JSON"]),
  devopsTool("zabbix-api-request-builder", "Zabbix API Request Builder", "Generate cURL, Python and JavaScript JSON-RPC requests without connecting to a server.", ["zabbix", "api", "json rpc", "curl", "python", "javascript", "problem.get"], ["curl", "zabbix", "json"], ["cURL", "Python", "JavaScript"]),
  devopsTool("promql-formatter", "PromQL Formatter", "Normalize PromQL spacing and validate balanced expressions.", ["prometheus", "promql", "formatter", "query"], ["prometheus", "grafana-promql-helper", "prometheus-alert-rule-generator"], ["Format", "Validate"]),
  devopsTool("prometheus-alert-rule-generator", "Prometheus Alert Rule Generator", "Generate Prometheus alert rule YAML with duration, severity and annotations.", ["prometheus", "alert", "rules", "yaml", "severity", "for"], ["prometheus", "prometheus-recording-rule-generator", "monitoring"], ["Alerts", "YAML", "Labels"]),
  devopsTool("prometheus-recording-rule-generator", "Prometheus Recording Rule Generator", "Generate reusable Prometheus recording rule YAML.", ["prometheus", "recording rule", "promql", "yaml"], ["prometheus", "prometheus-alert-rule-generator", "grafana-promql-helper"], ["Recording rules", "YAML"]),
  devopsTool("prometheus-config-helper", "Prometheus Config Helper", "Generate static scrape configuration sections for Prometheus.", ["prometheus", "config", "scrape", "targets", "job"], ["prometheus", "docker", "kubernetes"], ["Scrape config", "Targets", "YAML"]),
  devopsTool("prometheus-label-selector-builder", "Prometheus Label Selector Builder", "Build exact, negative and regex Prometheus label selectors.", ["prometheus", "label selector", "matcher", "regex", "promql"], ["prometheus", "grafana-promql-helper", "loki-label-selector-builder"], ["Selectors", "Matchers"]),
  devopsTool("logql-formatter", "LogQL Formatter", "Normalize LogQL spacing and validate strings, selectors and ranges.", ["loki", "logql", "formatter", "logs"], ["loki", "loki-label-selector-builder", "logs"], ["Format", "Validate"]),
  devopsTool("loki-label-selector-builder", "Loki Label Selector Builder", "Build Loki stream selectors with exact, negative and regex matchers.", ["loki", "logql", "label selector", "namespace", "job"], ["loki", "logql-formatter", "prometheus-label-selector-builder"], ["Selectors", "Matchers"]),
  devopsTool("resource-utilization-calculator", "CPU / Memory / Disk Calculator", "Calculate used, free and utilization percentages for monitoring metrics.", ["cpu", "memory", "disk", "utilization", "percentage", "monitoring"], ["monitoring", "availability-calculator", "grafana-threshold-helper"], ["Utilization", "Percent", "Free"]),
  devopsTool("availability-calculator", "Availability Calculator", "Calculate service availability from observed uptime and downtime.", ["availability", "uptime", "downtime", "percentage", "monitoring"], ["observability", "error-budget-calculator", "monitoring"], ["Availability", "Uptime"]),
  devopsTool("error-budget-calculator", "Error Budget Calculator", "Calculate allowed downtime and failed requests from an SLO target.", ["error budget", "slo", "availability", "downtime", "failures"], ["observability", "availability-calculator", "percentile-helper"], ["Error budget", "Downtime", "Failures"]),
  devopsTool("percentile-helper", "Latency Percentile Helper", "Calculate and explain p50, p90, p95, p99 and p99.9 from latency samples.", ["percentile", "p50", "p90", "p95", "p99", "latency"], ["observability", "monitoring", "grafana"], ["Percentiles", "Latency"]),
  devopsTool("json-log-formatter", "JSON Log Formatter", "Format newline-delimited JSON logs into normalized readable lines.", ["json logs", "log formatter", "ndjson", "logging"], ["logs", "log-cleaner", "json"], ["JSON logs", "Format"]),
  devopsTool("log-cleaner", "Log Cleaner", "Remove ANSI codes, control bytes and inconsistent whitespace from logs.", ["logs", "cleaner", "ansi", "whitespace"], ["logs", "stack-trace-formatter", "log-level-extractor"], ["Clean", "Normalize"]),
  devopsTool("log-level-extractor", "Log Level Extractor", "Filter trace, debug, info, warn, error and fatal log entries.", ["logs", "level", "error", "warn", "filter"], ["logs", "log-cleaner", "errors"], ["Levels", "Filter"]),
  devopsTool("log-timestamp-normalizer", "Log Timestamp Normalizer", "Convert parseable log timestamps to ISO 8601 UTC.", ["logs", "timestamp", "iso 8601", "normalize"], ["logs", "timestamp", "log-cleaner"], ["Timestamps", "UTC"]),
  devopsTool("stack-trace-formatter", "Stack Trace Formatter", "Clean and indent common stack trace continuation lines.", ["stack trace", "logs", "exception", "formatter"], ["logs", "errors", "log-cleaner"], ["Stacks", "Format"]),
  devopsTool("log-diff", "Log Diff", "Normalize and compare two log captures line by line.", ["logs", "diff", "compare", "debug"], ["logs", "diff", "log-cleaner"], ["Normalize", "Diff"]),
  devopsTool("docker-log-formatter", "Docker Log Formatter", "Normalize Docker timestamp-prefixed stdout and stderr logs.", ["docker logs", "stdout", "stderr", "formatter"], ["logs", "docker", "errors"], ["Docker", "Format"]),
  devopsTool("kubernetes-log-cleaner", "Kubernetes Log Cleaner", "Clean Kubernetes CRI log prefixes and isolate container errors.", ["kubernetes logs", "kubectl logs", "cri", "cleaner"], ["logs", "kubernetes", "errors"], ["Kubernetes", "Clean"]),
  devopsTool("nginx-log-parser", "Nginx Log Parser", "Parse common Nginx access log lines into normalized entries.", ["nginx", "access log", "status", "parser"], ["logs", "http", "errors"], ["Nginx", "Parse"]),
  devopsTool("apache-log-parser", "Apache Log Parser", "Parse Apache combined/common access log lines into normalized entries.", ["apache", "access log", "httpd", "parser"], ["logs", "http", "errors"], ["Apache", "Parse"]),
  devopsTool("syslog-parser", "Syslog Parser", "Parse common syslog timestamp, host, source and message fields.", ["syslog", "rsyslog", "journal", "parser"], ["logs", "systemd", "errors"], ["Syslog", "Parse"]),
];

const CLOUD_STANDALONE_TOOLS: Tool[] = [
  cloudTool("aws-arn-parser", "AWS ARN Parser", "Parse an AWS ARN into partition, service, region, account and resource components.", ["aws", "arn", "amazon", "resource", "parser"], ["aws-arn-builder", "aws-iam-policy-generator", "cloud"], ["Parse", "Components"]),
  cloudTool("aws-arn-builder", "AWS ARN Builder", "Build AWS ARNs from validated partition, service, region, account and resource fields.", ["aws", "arn", "builder", "resource"], ["aws-arn-parser", "aws-iam-policy-generator"], ["Build", "Validate"]),
  cloudTool("aws-cli-builder", "AWS CLI Command Builder", "Generate non-executing AWS CLI commands for EC2, S3, IAM, Lambda, CloudWatch, ECR, ECS, EKS, RDS and Route 53.", ["aws", "cli", "ec2", "s3", "iam", "lambda", "ecr", "eks"], ["aws-ecr-command-generator", "aws-arn-parser", "terraform"], ["CLI", "Commands"]),
  cloudTool("aws-iam-policy-generator", "AWS IAM Policy Generator", "Generate IAM policy JSON with action/resource wildcard warnings.", ["aws", "iam", "policy", "action", "resource", "condition"], ["aws-arn-parser", "aws-s3-policy-generator", "websec"], ["IAM", "Warnings", "JSON"]),
  cloudTool("aws-security-group-rule-builder", "AWS Security Group Rule Builder", "Generate inbound/outbound rule JSON and warn about unrestricted CIDRs.", ["aws", "security group", "ingress", "egress", "cidr", "port"], ["subnet", "ports", "aws-iam-policy-generator"], ["Rules", "CIDR", "Warnings"]),
  cloudTool("aws-ec2-user-data-generator", "AWS EC2 User Data Generator", "Generate reviewed Ubuntu/Amazon Linux cloud-init shell templates.", ["aws", "ec2", "user data", "ubuntu", "docker", "nginx", "nodejs"], ["docker", "systemd", "aws-cli-builder"], ["User data", "Templates"]),
  cloudTool("aws-s3-policy-generator", "AWS S3 Policy Generator", "Generate S3 bucket and IAM access policy templates.", ["aws", "s3", "bucket policy", "iam"], ["aws-iam-policy-generator", "aws-s3-url-helper"], ["Bucket policy", "IAM"]),
  cloudTool("aws-s3-url-helper", "AWS S3 URL Helper", "Parse and generate s3://, virtual-hosted, and path-style S3 URLs.", ["aws", "s3", "url", "bucket", "object key"], ["aws-s3-policy-generator", "aws-cli-builder"], ["Parse", "Generate URLs"]),
  cloudTool("aws-ecr-command-generator", "AWS ECR Command Generator", "Generate login, build, tag, push, pull and registry commands.", ["aws", "ecr", "docker", "login", "push", "pull"], ["docker", "aws-cli-builder", "cicd"], ["ECR", "Docker commands"]),
  cloudTool("aws-lambda-event-examples", "AWS Lambda Event Examples", "Generate sample API Gateway, S3, SQS, EventBridge and SNS event payloads.", ["aws", "lambda", "event", "api gateway", "s3", "sqs", "eventbridge", "sns"], ["json", "aws-cli-builder"], ["Events", "JSON"]),
  cloudTool("azure-resource-id-parser", "Azure Resource ID Parser", "Parse subscription, resource group, provider, type and name from Azure resource IDs.", ["azure", "resource id", "subscription", "resource group", "parser"], ["azure-cli-builder", "azure-resource-naming-generator"], ["Parse", "Components"]),
  cloudTool("azure-cli-builder", "Azure CLI Builder", "Generate Azure CLI commands for VM, storage, resource groups, AKS, App Service and networking.", ["azure", "az cli", "vm", "storage", "aks", "app service", "network"], ["azure-resource-id-parser", "azure-bicep-helper"], ["CLI", "Commands"]),
  cloudTool("azure-resource-naming-generator", "Azure Resource Naming Generator", "Generate normalized Azure names from organization, environment, region, service and resource type.", ["azure", "naming", "resource", "convention"], ["infrastructure", "azure-resource-id-parser"], ["Naming", "Conventions"]),
  cloudTool("azure-bicep-helper", "Azure Bicep Helper", "Generate reviewable Bicep starters for storage, VNet, NSG, App Service and AKS.", ["azure", "bicep", "arm", "vnet", "nsg", "aks"], ["azure-cli-builder", "terraform"], ["Bicep", "Templates"]),
  cloudTool("gcp-resource-name-helper", "GCP Resource Name Helper", "Generate normalized GCP resource names and naming patterns.", ["gcp", "google cloud", "resource name", "naming"], ["infrastructure", "gcp-resource-parser"], ["Naming", "Validate"]),
  cloudTool("gcloud-cli-builder", "gcloud CLI Builder", "Generate gcloud commands for Compute, Storage, GKE, IAM and Cloud Run.", ["gcp", "gcloud", "compute", "storage", "gke", "cloud run"], ["gcp-resource-parser", "terraform"], ["CLI", "Commands"]),
  cloudTool("gcp-iam-policy-helper", "GCP IAM Policy Helper", "Generate GCP IAM binding examples with member and role validation.", ["gcp", "iam", "policy", "role", "member"], ["gcloud-cli-builder", "aws-iam-policy-generator"], ["IAM", "Bindings"]),
  cloudTool("gcp-resource-parser", "GCP Resource Parser", "Parse common full GCP resource names into project, location, collection and resource.", ["gcp", "resource", "project", "location", "parser"], ["gcloud-cli-builder", "gcp-resource-name-helper"], ["Parse", "Components"]),
  cloudTool("cloud-cidr-planner", "Cloud CIDR Planner", "Plan VPC/VNet subnets using the existing deterministic subnet splitter.", ["cloud", "cidr", "vpc", "vnet", "subnet planner"], ["subnet", "ip", "aws-security-group-rule-builder"], ["CIDR", "Subnets"]),
  cloudTool("cloud-cli-converter", "Cloud CLI Comparison Helper", "Generate clearly labeled AWS, Azure and gcloud command patterns for similar high-level intents.", ["cloud", "cli", "aws", "azure", "gcloud", "converter"], ["aws-cli-builder", "azure-cli-builder", "gcloud-cli-builder"], ["Compare", "Commands"]),
];

export const TOOLS: Tool[] = [
  ...CLOUD_STANDALONE_TOOLS,
  ...DEVOPS_STANDALONE_TOOLS,
  {
    id: "json", name: "JSON Toolkit", slug: "json", route: "/json", category: "development",
    description: "Format, validate, minify, diff, query and convert JSON instantly.",
    longDescription: "Paste JSON and format, validate, minify, sort, flatten, query with JSONPath, diff two documents, or convert to TypeScript, Python, Go, YAML, CSV, XML and JSON Schema — all locally in your browser.",
    keywords: ["json", "formatter", "validator", "minify", "beautify", "diff", "jsonpath", "json pointer", "json patch", "merge patch", "sort", "flatten", "typescript", "yaml", "csv", "schema"],
    aliases: ["json formatter", "format json", "json validator", "json minifier", "json beautifier", "json diff", "json sorter", "json to yaml", "json to typescript", "jsonpath", "json pointer", "json patch"],
    featured: true, clientSide: true,
    capabilities: ["Format", "Validate", "Patch", "Pointer", "Diff", "Query", "Convert", "Generate"],
    related: ["converter", "regex", "encode", "diff", "jsonschema", "text"],
    howItWorks: ["Paste JSON into the input pane.", "Pick an operation tab — Format, Validate, Minify, Diff, Query, Flatten or Convert.", "Results update instantly. Copy or download the output."],
    example: { label: "Sample JSON", value: '{\n  "name": "devutils",\n  "fast": true,\n  "localFirst": true,\n  "tags": ["json", "devtools"]\n}' },
    faq: [
      { q: "Is my JSON uploaded anywhere?", a: "No. All JSON processing runs locally in your browser via the native JSON parser." },
      { q: "How large a file can I format?", a: "Multi-megabyte documents format instantly. For very large files (50MB+) your browser tab may slow down — consider splitting the file." },
    ],
  },
  {
    id: "api-schema", name: "API Schema Toolkit", slug: "api-schema", route: "/api-schema", category: "development",
    description: "Format and validate OpenAPI/GraphQL; generate types and client skeletons.",
    longDescription: "An integrated OpenAPI and GraphQL workbench. Format and structurally validate documents, generate TypeScript models and fetch client skeletons, or turn sample JSON into an OpenAPI schema without executing any request.",
    keywords: ["openapi", "swagger", "graphql", "api schema", "api client", "typescript types", "schema validator"],
    aliases: ["format openapi", "validate swagger", "openapi to typescript", "graphql formatter", "graphql validator", "api client generator"],
    clientSide: true, capabilities: ["OpenAPI", "GraphQL", "Validate", "TypeScript", "Client"],
    related: ["json", "jsonschema", "curl", "code-format", "converter"],
    howItWorks: ["Paste OpenAPI JSON/YAML or a GraphQL document.", "Format or run deterministic structural checks.", "Generate types/client skeletons, then review before using in production."],
  },
  {
    id: "regex", name: "Regex Toolkit", slug: "regex", route: "/regex", category: "development",
    description: "Test, debug and explain regular expressions with live highlighting.",
    longDescription: "Live regex tester with match highlighting, capture groups, replace preview, flags, cheat-sheet and common-pattern generators.",
    keywords: ["regex", "regexp", "tester", "matches", "groups", "replace", "pattern", "escape"],
    aliases: ["regex tester", "test regex", "regular expression", "regex escape", "explain regex"],
    featured: true, clientSide: true, capabilities: ["Test", "Replace", "Explain", "Generate"],
    related: ["text", "json", "diff"],
    howItWorks: ["Type a pattern and test string.", "Matches highlight live with group breakdown.", "Use Replace mode to preview substitutions."],
    example: { label: "Email pattern", value: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}" },
  },
  {
    id: "code-format", name: "Code Formatter", slug: "code-format", route: "/code-format", category: "development",
    description: "Format JS, TS, JSON, CSS, HTML, XML, SQL, YAML and Markdown.",
    longDescription: "Opinionated code formatter for 10 languages. Normalizes indentation, quotes, spacing and line breaks deterministically in your browser.",
    keywords: ["format", "prettier", "beautify", "javascript", "typescript", "css", "html", "xml", "sql", "graphql", "yaml", "markdown"],
    aliases: ["format code", "beautify js", "format sql", "format xml", "prettify"],
    clientSide: true, capabilities: ["Format", "Validate"],
    related: ["json", "sql", "converter", "diff"],
    howItWorks: ["Pick a language.", "Paste code.", "Press Format — copy or download the result."],
  },
  {
    id: "code-minify", name: "Code Minifier", slug: "code-minify", route: "/code-minify", category: "development",
    description: "Minify JavaScript, CSS, HTML and JSON by stripping whitespace & comments.",
    longDescription: "Safe whitespace/comment minifier for JS, CSS, HTML and JSON with size-before/after readout and savings percentage.",
    keywords: ["minify", "uglify", "compress", "javascript", "css", "html", "json", "size"],
    aliases: ["minify js", "minify css", "compress js", "minify html"],
    clientSide: true, capabilities: ["Minify"],
    related: ["code-format", "text"],
    howItWorks: ["Paste code, choose language, minify.", "Check bytes saved before copying."],
  },
  {
    id: "diff", name: "Diff Toolkit", slug: "diff", route: "/diff", category: "development",
    description: "Compare text, JSON, YAML, XML and CSV side-by-side or unified.",
    longDescription: "Line-based diff engine with side-by-side and unified views, word-level highlighting and JSON-aware comparison.",
    keywords: ["diff", "compare", "side by side", "unified", "changes", "patch"],
    aliases: ["compare text", "text diff", "json diff", "compare json", "diff checker"],
    clientSide: true, capabilities: ["Side-by-side", "Unified", "Word diff"],
    related: ["json", "text", "converter"],
    howItWorks: ["Paste original and modified text.", "Toggle side-by-side / unified.", "Copy the changed lines."],
  },
  {
    id: "generators", name: "Generators", slug: "generators", route: "/generators", category: "development",
    description: "UUIDs, passwords, random strings, mock JSON, test data & Lorem Ipsum.",
    longDescription: "Cryptographically-secure generators: UUID v4, Nano IDs, passwords, passphrases, API keys, hex tokens, mock JSON records and Lorem Ipsum.",
    keywords: ["uuid", "guid", "random", "password", "lorem", "mock", "test data", "nanoid", "token"],
    aliases: ["generate uuid", "uuid generator", "random string", "lorem ipsum", "mock json"],
    clientSide: true, capabilities: ["UUID", "Password", "Token", "Mock data"],
    related: ["secrets", "hash", "text"],
    howItWorks: ["Choose a generator.", "Tune length / count / options.", "Regenerate and copy in one click."],
  },
  {
    id: "monitoring", name: "Monitoring Threshold Calculator", slug: "monitoring-threshold-calculator", route: "/tools/monitoring-threshold-calculator", category: "devops",
    description: "Generate warning and critical percentage thresholds for monitoring metrics.",
    longDescription: "Build practical monitoring thresholds and alert conditions for CPU, memory, disk, network, load and availability. Calculations are deterministic and configuration output stays local.",
    keywords: ["monitoring", "metrics", "cpu", "memory", "disk", "network", "threshold", "alert", "availability"],
    aliases: ["metrics calculator", "threshold calculator", "alert rule builder", "cpu alert", "memory alert"],
    featured: true, clientSide: true, capabilities: ["Metrics", "Thresholds", "Alerts"],
    related: ["prometheus", "grafana", "zabbix", "observability", "logs"],
    howItWorks: ["Choose a metric and enter real values.", "Set warning and critical boundaries.", "Copy a portable condition or move to a platform-specific rule builder."],
  },
  {
    id: "prometheus", name: "PromQL Builder", slug: "promql-builder", route: "/tools/promql-builder", category: "devops",
    description: "Build common PromQL rate, increase, aggregation and histogram queries.",
    longDescription: "Generate common PromQL expressions, static scrape jobs, Prometheus alert rules and recording rules. Supports rate, increase, aggregation, grouping and histogram quantiles.",
    keywords: ["prometheus", "promql", "metrics", "scrape config", "alert rules", "recording rules", "histogram_quantile"],
    aliases: ["promql builder", "prometheus config", "prometheus alert", "recording rule", "rate metric"],
    featured: true, clientSide: true, capabilities: ["PromQL", "Scrape config", "Alerts", "Recording rules"],
    related: ["monitoring", "grafana", "observability", "loki"],
    howItWorks: ["Enter a metric, labels and operation.", "Preview valid PromQL immediately.", "Generate scrape or rule YAML for review and deployment."],
  },
  {
    id: "grafana", name: "Grafana Dashboard Template Generator", slug: "grafana-dashboard-template-generator", route: "/tools/grafana-dashboard-template-generator", category: "devops",
    description: "Generate usable starter dashboard JSON for common infrastructure stacks.",
    longDescription: "A dedicated Grafana workbench for dashboard JSON, common panels, Prometheus queries, dashboard variables, alert provisioning and usable Linux, Docker, Kubernetes, Nginx, PostgreSQL and Redis templates.",
    keywords: ["grafana", "dashboard", "panel", "promql", "variables", "alerts", "dashboard json", "node exporter"],
    aliases: ["grafana dashboard builder", "grafana panel", "grafana json validator", "linux dashboard", "kubernetes dashboard"],
    featured: true, clientSide: true, capabilities: ["Dashboards", "Panels", "Variables", "Alerts", "Templates", "Validate"],
    related: ["prometheus", "loki", "monitoring", "observability"],
    howItWorks: ["Choose a dashboard template or build a panel.", "Configure queries, units, time range and variables.", "Validate and export dashboard JSON for review in Grafana."],
  },
  {
    id: "zabbix", name: "Zabbix Template Helper", slug: "zabbix-template-helper", route: "/tools/zabbix-template-helper", category: "devops",
    description: "Generate practical Zabbix 7.0 template JSON structures.",
    longDescription: "A dedicated Zabbix workbench for 7.0 template JSON, item and trigger definitions, common expressions, discovery structures, macros and safe cURL/Python/JavaScript API examples.",
    keywords: ["zabbix", "template", "item", "trigger", "discovery", "macro", "api", "snmp", "agent"],
    aliases: ["zabbix template builder", "zabbix trigger expression", "zabbix item", "zabbix api helper"],
    featured: true, clientSide: true, capabilities: ["Templates", "Items", "Triggers", "Discovery", "Macros", "API"],
    related: ["monitoring", "prometheus", "grafana", "observability"],
    howItWorks: ["Build an item, trigger or template structure.", "Use deterministic helpers for common monitoring requirements.", "Export JSON or API code without connecting to a server."],
  },
  {
    id: "loki", name: "LogQL Builder", slug: "logql-builder", route: "/tools/logql-builder", category: "devops",
    description: "Build LogQL selectors, line filters, parsers and range aggregations.",
    longDescription: "Construct LogQL label selectors, line and regex filters, JSON/logfmt/regexp parsers, range selectors and rate/count aggregations for Grafana Loki.",
    keywords: ["loki", "logql", "logs", "label selector", "json parser", "logfmt", "count_over_time"],
    aliases: ["logql builder", "loki query", "grafana logs query"],
    clientSide: true, capabilities: ["Selectors", "Filters", "Parsers", "Aggregations"],
    related: ["logs", "grafana", "prometheus", "regex"],
    howItWorks: ["Add stream label matchers.", "Choose a line filter and parser.", "Optionally wrap the stream in a range aggregation."],
  },
  {
    id: "observability", name: "SLO Calculator", slug: "slo-calculator", route: "/tools/slo-calculator", category: "devops",
    description: "Calculate allowed downtime and request error budgets from an SLO target.",
    longDescription: "Turn availability targets into real downtime and failure budgets, calculate latency percentiles from samples, and connect metrics, logs, traces, alerts and dashboards into practical observability decisions.",
    keywords: ["observability", "sli", "slo", "error budget", "availability", "latency", "p95", "p99", "downtime"],
    aliases: ["slo calculator", "error budget calculator", "availability calculator", "latency percentile"],
    featured: true, clientSide: true, capabilities: ["SLI", "SLO", "Error budget", "Percentiles"],
    related: ["monitoring", "prometheus", "grafana", "loki", "logs"],
    howItWorks: ["Enter an SLO target and measurement window.", "See the exact downtime/failure budget.", "Use percentile helpers to interpret latency samples."],
  },
  {
    id: "cloud", name: "Cloud Policy & ARN Toolkit", slug: "cloud", route: "/cloud", category: "cloud",
    description: "Parse AWS ARNs, build IAM policies and generate safe cloud commands.",
    longDescription: "Safe, non-executing AWS/Azure/GCP helpers. Parse ARNs, build IAM policy JSON with broad-permission warnings, and generate copy-pasteable CLI command skeletons without cloud credentials.",
    keywords: ["cloud", "aws", "azure", "gcp", "arn", "iam", "policy", "cli", "security group"],
    aliases: ["arn parser", "iam policy builder", "aws cli builder", "cloud naming"],
    clientSide: true, capabilities: ["ARN", "IAM", "CLI", "Naming"],
    related: ["infrastructure", "terraform", "websec"],
    howItWorks: ["Choose a safe parser or generator.", "Enter resource identifiers and least-privilege intent.", "Review warnings before copying; DevUtils never executes cloud actions."],
  },
  {
    id: "infrastructure", name: "Multi-cloud Naming Generator", slug: "infrastructure", route: "/infrastructure", category: "cloud",
    description: "Generate consistent names and prepare provider-neutral infrastructure models.",
    longDescription: "Generate naming conventions for AWS, Azure, GCP, Kubernetes and Terraform. Includes provider constraints and a cost-estimation architecture that intentionally avoids stale hard-coded cloud prices.",
    keywords: ["infrastructure", "naming", "aws", "azure", "gcp", "kubernetes", "terraform", "cost architecture"],
    aliases: ["resource naming generator", "infrastructure naming", "cloud name", "cost calculator"],
    clientSide: true, capabilities: ["Naming", "Conventions", "Cost model"],
    related: ["cloud", "terraform", "kubernetes"],
    howItWorks: ["Choose a target provider and naming pattern.", "Fill environment, service, region and resource.", "Copy a normalized name and review provider-specific warnings."],
  },
  {
    id: "docker", name: "Docker Toolkit", slug: "docker", route: "/docker", category: "devops",
    description: "Build docker run commands, Dockerfiles & Compose files visually.",
    longDescription: "Interactive builders for docker run / build / exec, multi-stage Dockerfile generator and Compose generator with validator, plus port, volume and healthcheck helpers.",
    keywords: ["docker", "dockerfile", "compose", "container", "run", "build", "exec", "image", "volume", "port"],
    aliases: ["docker run", "dockerfile generator", "docker compose", "compose generator", "docker build"],
    featured: true, clientSide: true, capabilities: ["Run", "Build", "Exec", "Compose", "Dockerfile"],
    related: ["kubernetes", "cicd", "env", "errors"],
    howItWorks: ["Pick Run, Build, Exec, Compose or Dockerfile.", "Fill the form — flags, ports, volumes, env.", "Copy the generated command or YAML."],
    example: { label: "Run nginx", value: "docker run -d --name web -p 8080:80 -v ./html:/usr/share/nginx/html nginx:alpine" },
  },
  {
    id: "kubernetes", name: "Kubernetes Toolkit", slug: "kubernetes", route: "/kubernetes", category: "devops",
    description: "Generate Deployment, Service, Ingress, ConfigMap, RBAC & kubectl commands.",
    longDescription: "Form-driven generators for 12 Kubernetes resource types with valid YAML output, plus a kubectl command builder and error explainer for CrashLoopBackOff, ImagePullBackOff and OOMKilled.",
    keywords: ["kubernetes", "k8s", "deployment", "service", "ingress", "configmap", "secret", "kubectl", "helm", "cronjob", "rbac"],
    aliases: ["k8s deployment", "kubectl", "k8s yaml", "CrashLoopBackOff", "ImagePullBackOff", "generate deployment"],
    featured: true, clientSide: true, capabilities: ["Deployment", "Service", "Ingress", "ConfigMap", "Secret", "kubectl"],
    related: ["docker", "terraform", "cicd", "cron", "errors"],
    howItWorks: ["Select a resource type.", "Fill name, image, replicas, ports.", "Copy production-ready YAML."],
  },
  {
    id: "terraform", name: "Terraform Toolkit", slug: "terraform", route: "/terraform", category: "devops",
    description: "Generate resources, variables, outputs & tfvars for AWS, Azure, GCP.",
    longDescription: "HCL generators for common AWS/Azure/GCP resources, variable/output blocks, tfvars files and a formatter, plus JSON conversion.",
    keywords: ["terraform", "hcl", "aws", "azure", "gcp", "iac", "tfvars", "resource", "module"],
    aliases: ["terraform generator", "tf resource", "hcl format", "aws s3 terraform"],
    clientSide: true, capabilities: ["Resources", "Variables", "Outputs", "Format"],
    related: ["kubernetes", "docker", "env", "cicd"],
    howItWorks: ["Choose a provider & resource.", "Fill required arguments.", "Copy HCL or download main.tf."],
  },
  {
    id: "git", name: "Git Toolkit", slug: "git", route: "/git", category: "devops",
    description: "Command builder, .gitignore generator, branch & commit helpers.",
    longDescription: "Visual git command builder, cheat-sheet, .gitignore generator for 20+ stacks, branch-name sanitizer, conventional-commit builder and URL parser.",
    keywords: ["git", "github", "commit", "branch", "gitignore", "rebase", "merge", "cheat sheet"],
    aliases: ["git command", "gitignore generator", "commit message", "branch name", "git cheat sheet"],
    clientSide: true, capabilities: ["Commands", ".gitignore", "Commits", "Branches"],
    related: ["cicd", "docker", "env"],
    howItWorks: ["Pick a workflow — commit, branch, remote, undo.", "Fill options to build the exact command.", "Copy and run locally."],
  },
  {
    id: "cicd", name: "CI/CD Toolkit", slug: "cicd", route: "/cicd", category: "devops",
    description: "Generate GitHub Actions, GitLab CI & Jenkins pipelines.",
    longDescription: "Generators for Node, Python, Docker, Terraform and K8s-deploy workflows with matrix, caching, plus GitLab CI and Jenkinsfile helpers and a YAML validator.",
    keywords: ["github actions", "gitlab ci", "jenkins", "pipeline", "workflow", "matrix", "cache", "deploy"],
    aliases: ["github actions generator", "gitlab ci yaml", "jenkinsfile", "ci pipeline", "node workflow"],
    clientSide: true, capabilities: ["GitHub Actions", "GitLab CI", "Jenkins"],
    related: ["docker", "kubernetes", "git", "terraform"],
    howItWorks: ["Choose a platform & stack.", "Toggle matrix, cache, docker.", "Copy workflow YAML."],
  },
  {
    id: "env", name: ".env Toolkit", slug: "env", route: "/env", category: "devops",
    description: "Format, validate, sort & convert .env files. Never stored.",
    longDescription: "Parse and validate .env files: formatter, sorter, duplicate detector, dotenv ⇄ JSON conversion and config diff. Values never leave your browser.",
    keywords: ["env", "dotenv", "environment variables", "config", " twelve-factor"],
    aliases: ["env formatter", "dotenv to json", "json to env", "env validator", "sort env"],
    clientSide: true, capabilities: ["Format", "Validate", "Sort", "Convert", "Diff"],
    related: ["docker", "kubernetes", "terraform"],
    howItWorks: ["Paste .env content.", "Format, sort or convert to JSON.", "Copy the sanitized result."],
  },
  {
    id: "cron", name: "Cron Toolkit", slug: "cron", route: "/cron", category: "devops",
    description: "Generate, parse & explain cron schedules with next-run times.",
    longDescription: "Visual cron builder with presets, plain-English explanations, validator, next-5-run calculator, plus Kubernetes CronJob and GitHub Actions schedule helpers.",
    keywords: ["cron", "crontab", "schedule", "every", "quartz", "cronjob"],
    aliases: ["cron generator", "cron parser", "every 15 minutes", "cron to human", "crontab guru"],
    featured: true, clientSide: true, capabilities: ["Generate", "Parse", "Explain", "Next runs"],
    related: ["kubernetes", "cicd", "timestamp"],
    howItWorks: ["Use presets or toggle minute/hour/day fields.", "Read the human explanation.", "Copy cron + next runs."],
    example: { label: "Every 15 minutes", value: "*/15 * * * *" },
  },
  {
    id: "chmod", name: "chmod Calculator", slug: "chmod", route: "/chmod", category: "linux",
    description: "Convert 755 ⇄ rwxr-xr-x with explanations, chown & umask.",
    longDescription: "Interactive permission calculator: numeric ⇄ symbolic conversion, per-class rwx toggles, plain-English explanation, chown builder and umask calculator.",
    keywords: ["chmod", "permissions", "755", "644", "700", "rwx", "chown", "umask", "linux permissions"],
    aliases: ["755", "644", "chmod calculator", "convert 755", "permissions calculator", "rwxr-xr-x"],
    featured: true, clientSide: true, capabilities: ["Numeric ⇄ Symbolic", "Explain", "chown", "umask"],
    related: ["linux-cmd", "ssh", "errors"],
    howItWorks: ["Type 755 or rwxr-xr-x.", "Toggle checkboxes per class.", "Copy chmod / chown commands."],
    example: { label: "Typical web dir", value: "755" },
  },
  {
    id: "linux-cmd", name: "Linux Command Builder", slug: "linux-commands", route: "/linux-commands", category: "linux",
    description: "Build safe grep, find, tar, rsync, curl, awk & sed commands.",
    longDescription: "Form-driven builders for grep, find, tar, curl, wget, rsync, ssh, scp, awk and sed that produce quoted, copy-pasteable commands with explanations.",
    keywords: ["grep", "find", "tar", "curl", "wget", "rsync", "ssh", "scp", "awk", "sed", "linux", "bash"],
    aliases: ["grep builder", "find command", "tar extract", "rsync command", "curl builder"],
    clientSide: true, capabilities: ["grep", "find", "tar", "rsync", "curl", "awk", "sed"],
    related: ["chmod", "ssh", "systemd", "errors"],
    howItWorks: ["Pick a command.", "Fill flags via toggles.", "Copy the quoted command."],
  },
  {
    id: "ssh", name: "SSH Toolkit", slug: "ssh", route: "/ssh", category: "linux",
    description: "SSH/SCP command builder, ssh_config helper & key inspector.",
    longDescription: "Build hardened ssh/scp commands, generate ssh_config blocks, and inspect public/private key formats locally (type, bits, fingerprint).",
    keywords: ["ssh", "scp", "ssh config", "key", "openssh", "authorized_keys", "fingerprint"],
    aliases: ["ssh command", "scp builder", "ssh config generator", "ssh key inspector"],
    clientSide: true, capabilities: ["ssh", "scp", "config", "keys"],
    related: ["chmod", "linux-cmd", "systemd"],
    howItWorks: ["Enter host, user, port, key.", "Copy the ssh/scp command or config block."],
  },
  {
    id: "systemd", name: "systemd Toolkit", slug: "systemd", route: "/systemd", category: "linux",
    description: "Generate units, timers & journalctl/systemctl commands.",
    longDescription: "Service and timer unit generator with install targets, restart policies, plus systemctl and journalctl command builders.",
    keywords: ["systemd", "systemctl", "service", "timer", "journalctl", "unit file"],
    aliases: ["systemd service generator", "systemctl", "journalctl", "timer unit"],
    clientSide: true, capabilities: ["service", "timer", "systemctl", "journalctl"],
    related: ["linux-cmd", "cron", "docker"],
    howItWorks: ["Describe the service.", "Generate the unit file.", "Copy enable/start commands."],
  },
  {
    id: "subnet", name: "Subnet Calculator", slug: "subnet", route: "/subnet", category: "networking",
    description: "CIDR math: network, broadcast, range, hosts & subnet splitting.",
    longDescription: "Exact IPv4 CIDR calculator: network, broadcast, first/last usable, host count, mask, wildcard, binary view, subnet splitter and range tools. Deterministic integer math — no lookups.",
    keywords: ["subnet", "cidr", "ip", "network", "broadcast", "mask", "wildcard", "192.168", "10.0.0.0"],
    aliases: ["subnet calculator", "cidr calculator", "calculate 192.168.1.0/24", "ip range", "broadcast address"],
    featured: true, clientSide: true, capabilities: ["CIDR", "Split", "Range", "Binary"],
    related: ["ip", "dns", "ports"],
    howItWorks: ["Enter CIDR like 192.168.1.0/24.", "Read every derived address instantly.", "Split or export the range."],
    example: { label: "Home network", value: "192.168.1.0/24" },
  },
  {
    id: "ip", name: "IP Toolkit", slug: "ip", route: "/ip", category: "networking",
    description: "IPv4/IPv6 conversion, binary, decimal, compression & classification.",
    longDescription: "IP ↔ binary ↔ decimal ↔ hex conversion, IPv6 compress/expand, private/public/loopback classification and CIDR containment checks.",
    keywords: ["ipv4", "ipv6", "binary", "decimal", "compress", "expand", "private ip", "localhost"],
    aliases: ["ip to binary", "ipv6 compress", "private public ip", "ip calculator"],
    clientSide: true, capabilities: ["Convert", "Classify", "IPv6"],
    related: ["subnet", "dns", "ports"],
    howItWorks: ["Paste an IPv4 or IPv6 address.", "See every representation at once."],
  },
  {
    id: "dns", name: "DNS Toolkit", slug: "dns", route: "/dns", category: "networking",
    description: "Live DNS lookups (DoH) + SPF/DKIM/DMARC reference.",
    longDescription: "Real DNS-over-HTTPS lookups for A, AAAA, MX, TXT, CNAME, NS and SOA via Google & Cloudflare resolvers, plus SPF/DKIM/DMARC record builders. Network-dependent — clearly labeled.",
    keywords: ["dns", "lookup", "mx", "txt", "cname", "spf", "dkim", "dmarc", "ns", "soa"],
    aliases: ["dns lookup", "mx lookup", "txt record", "reverse dns", "spf generator"],
    clientSide: false, capabilities: ["Lookup", "SPF", "DMARC"],
    related: ["subnet", "ip", "http"],
    howItWorks: ["Enter a domain.", "Query live resolvers over HTTPS.", "Build SPF/DMARC records from the answers."],
  },
  {
    id: "http", name: "HTTP Toolkit", slug: "http", route: "/http", category: "networking",
    description: "Status code lookup, header parser, URL & query inspector.",
    longDescription: "Searchable reference for common HTTP status codes with causes and fixes, plus a raw header parser, URL decomposer and query-string table.",
    keywords: ["http", "status", "404", "500", "headers", "url", "query string", "request"],
    aliases: ["http status", "404 meaning", "header parser", "url parser", "query string parser"],
    clientSide: true, capabilities: ["Status", "Headers", "URL"],
    related: ["curl", "dns", "errors"],
    howItWorks: ["Search a status code or paste headers/URL.", "Get cause, fix and parsed fields."],
  },
  {
    id: "curl", name: "cURL Toolkit", slug: "curl", route: "/curl", category: "networking",
    description: "Build cURL commands & convert to Python, JS, Go and PHP.",
    longDescription: "Visual request builder (method, URL, headers, auth, body) plus a real cURL parser that converts to Python requests, JavaScript fetch, Go and PHP with correct escaping.",
    keywords: ["curl", "http", "request", "python", "fetch", "go", "php", "api", "convert"],
    aliases: ["curl to python", "curl converter", "curl builder", "curl to javascript", "curl to fetch"],
    featured: true, clientSide: true, capabilities: ["Build", "Parse", "Convert"],
    related: ["http", "jwt", "encode"],
    howItWorks: ["Build a request or paste a curl command.", "Convert to 4 languages instantly.", "Copy with proper escaping."],
    example: { label: "GET with auth", value: 'curl -H "Authorization: Bearer TOKEN" https://api.example.com/users' },
  },
  {
    id: "ports", name: "Port Reference", slug: "ports", route: "/ports", category: "networking",
    description: "Searchable TCP/UDP port database with ranges & Docker mapping.",
    longDescription: "Search 100+ well-known ports by number or service, check ranges, and generate Docker -p mappings and firewall hints.",
    keywords: ["port", "tcp", "udp", "80", "443", "8080", "3306", "5432", "6379", "27017"],
    aliases: ["port lookup", "tcp ports", "what port", "port 443", "common ports"],
    clientSide: true, capabilities: ["Lookup", "Ranges"],
    related: ["subnet", "docker", "http"],
    howItWorks: ["Search 443 or postgres.", "See protocol, service and mapping snippet."],
  },
  {
    id: "jwt", name: "JWT Toolkit", slug: "jwt", route: "/jwt", category: "security",
    description: "Decode & inspect JWTs locally. Never verifies signature.",
    longDescription: "Local JWT decoder: header/payload inspector, claims table, expiry countdown, algorithm warning and Authorization-header generator. Decoding ≠ verification — stated clearly in the UI.",
    keywords: ["jwt", "token", "decode", "jose", "claims", "exp", "bearer", "jws"],
    aliases: ["decode jwt", "jwt decoder", "jwt inspector", "jwt exp", "parse jwt"],
    featured: true, clientSide: true, capabilities: ["Decode", "Inspect", "Expiry"],
    related: ["hash", "encode", "curl"],
    howItWorks: ["Paste a token.", "Inspect header, payload and expiry.", "Generate the Authorization header."],
    faq: [{ q: "Does decoding verify the signature?", a: "No. Decoding only parses Base64URL JSON. Always verify signatures server-side with the correct key and algorithm." }],
  },
  {
    id: "hash", name: "Hash Toolkit", slug: "hash", route: "/hash", category: "security",
    description: "MD5, SHA-1/2/3 & HMAC digests computed locally.",
    longDescription: "One interface, 8 algorithms: MD5, SHA-1, SHA-256/384/512, SHA3 variants and HMAC-SHA256/512. Hashing via WebCrypto + audited fallbacks, file hashing supported.",
    keywords: ["hash", "md5", "sha256", "sha1", "sha512", "hmac", "checksum", "digest"],
    aliases: ["sha256 generator", "md5 hash", "hmac", "checksum calculator", "hash string"],
    featured: true, clientSide: true, capabilities: ["MD5", "SHA-2", "SHA-3", "HMAC"],
    related: ["encode", "jwt", "secrets"],
    howItWorks: ["Type or drop a file.", "Pick algorithms.", "Compare digests side by side."],
  },
  {
    id: "secrets", name: "Secret Generator", slug: "secrets", route: "/secrets", category: "security",
    description: "Secure passwords, passphrases, API keys & tokens.",
    longDescription: "Crypto.getRandomValues-powered generator: memorable passphrases, high-entropy passwords, hex/base64 tokens, UUID v4 and strength meter with crack-time estimate.",
    keywords: ["password", "passphrase", "api key", "secret", "token", "random", "entropy", "uuid"],
    aliases: ["password generator", "generate password", "api key generator", "random token", "passphrase"],
    clientSide: true, capabilities: ["Password", "Passphrase", "Token", "UUID"],
    related: ["hash", "generators", "env"],
    howItWorks: ["Choose password / passphrase / token.", "Tune entropy.", "Copy — nothing is stored."],
  },
  {
    id: "websec", name: "Web Security Toolkit", slug: "security-headers", route: "/security-headers", category: "security",
    description: "Generate CSP, CORS, security headers, robots.txt & security.txt.",
    longDescription: "Policy builders: Content-Security-Policy, Permissions-Policy, CORS, HSTS/referrer/X-Frame helpers, plus robots.txt and security.txt generators with validation.",
    keywords: ["csp", "cors", "headers", "hsts", "permissions-policy", "robots.txt", "security.txt"],
    aliases: ["csp generator", "cors helper", "security headers", "robots.txt generator"],
    clientSide: true, capabilities: ["CSP", "CORS", "Headers", "robots.txt"],
    related: ["http", "curl", "cert"],
    howItWorks: ["Toggle directives.", "Preview the header value.", "Copy into your server config."],
  },
  {
    id: "cert", name: "Certificate Toolkit", slug: "certificates", route: "/certificates", category: "security",
    description: "Decode PEM certs, CSRs & keys locally. Expiry & fingerprints.",
    longDescription: "Local PEM parser: subject/issuer/SANs/validity decoding, expiry countdown, SHA-256 fingerprint, key-type detection and PEM re-formatter. Parsing ≠ TLS validation.",
    keywords: ["certificate", "x509", "pem", "csr", "tls", "ssl", "expiry", "fingerprint", "openssl"],
    aliases: ["decode certificate", "pem decoder", "csr decoder", "cert expiry", "x509 inspector"],
    clientSide: true, capabilities: ["Decode", "Expiry", "Fingerprint"],
    related: ["hash", "encode", "websec"],
    howItWorks: ["Paste a PEM block.", "Inspect subject, SANs and validity.", "Compute fingerprints."],
  },
  {
    id: "encode", name: "Encode / Decode", slug: "encode", route: "/encode", category: "encoding",
    description: "Base64, URL, Hex, HTML, Unicode & 15 formats in one box.",
    longDescription: "Unified codec workbench: Base64(+URL), URL component, HTML entities, Hex, Binary, Octal, Decimal, Unicode escapes, ROT13/47, Morse, quoted-printable and Data-URI with swap/copy/download.",
    keywords: ["base64", "encode", "decode", "url", "hex", "binary", "html entities", "unicode", "rot13", "data uri"],
    aliases: ["base64 decode", "base64 encode", "url encode", "hex decode", "decode base64"],
    featured: true, clientSide: true, capabilities: ["15 codecs", "Swap", "File → Data URI"],
    related: ["jwt", "hash", "text"],
    howItWorks: ["Pick a format + Encode/Decode.", "Type or drop a file.", "Swap direction in one click."],
  },
  {
    id: "qr", name: "QR Toolkit", slug: "qr", route: "/qr", category: "encoding",
    description: "Generate QR codes: URL, Wi-Fi, vCard, email & SMS.",
    longDescription: "Client-side QR generator (no tracking pixels): URL, plain text, Wi-Fi credentials, vCard, mailto and SMS payloads with size/error-correction control and PNG download.",
    keywords: ["qr", "qrcode", "wifi", "vcard", "scan", "generate qr"],
    aliases: ["qr generator", "generate qr", "wifi qr", "url qr"],
    clientSide: true, capabilities: ["URL", "Wi-Fi", "vCard", "Email", "SMS"],
    related: ["encode"],
    howItWorks: ["Pick a payload type.", "Fill fields.", "Download the PNG."],
  },
  {
    id: "converter", name: "Data Converter", slug: "convert", route: "/convert", category: "data",
    description: "Convert JSON ⇄ YAML ⇄ XML ⇄ CSV ⇄ TOML, correctly.",
    longDescription: "Loss-aware converter between JSON, YAML, XML, CSV and TOML with validation, formatting and error positions. Only conversions that round-trip are exposed.",
    keywords: ["json", "yaml", "xml", "csv", "toml", "convert", "transform"],
    aliases: ["json to yaml", "yaml to json", "json to csv", "csv to json", "json to xml", "xml to json", "toml to json"],
    clientSide: true, capabilities: ["8 conversions", "Validate", "Format"],
    related: ["json", "sql", "code-format"],
    howItWorks: ["Paste source data.", "Pick source → target.", "Copy validated output."],
  },
  {
    id: "jsonschema", name: "JSON Schema", slug: "json-schema", route: "/json-schema", category: "data",
    description: "Infer JSON Schema from JSON & validate instances.",
    longDescription: "Generate draft-07 schemas from sample JSON (with required detection and format hints) and validate instances with precise error paths.",
    keywords: ["json schema", "validate", "draft-07", "infer", "ajv"],
    aliases: ["json to schema", "generate schema", "validate json schema"],
    clientSide: true, capabilities: ["Infer", "Validate", "Format"],
    related: ["json", "converter"],
    howItWorks: ["Paste sample JSON to infer a schema.", "Paste an instance to validate."],
  },
  {
    id: "sql", name: "SQL Toolkit", slug: "sql", route: "/sql", category: "data",
    description: "Format, minify & generate SELECT/INSERT/CREATE + connection strings.",
    longDescription: "Dialect-aware SQL formatter (Postgres/MySQL/SQLServer/SQLite), minifier, diff, CREATE TABLE / INSERT / SELECT builders and connection-string composer. Never executes SQL.",
    keywords: ["sql", "format", "postgres", "mysql", "sqlite", "select", "insert", "create table", "connection string"],
    aliases: ["format sql", "sql formatter", "sql beautifier", "create table generator", "connection string builder"],
    featured: true, clientSide: true, capabilities: ["Format", "Minify", "Generate", "Diff"],
    related: ["converter", "json", "diff"],
    howItWorks: ["Paste SQL or use a builder.", "Pick a dialect.", "Copy formatted SQL."],
  },
  {
    id: "text", name: "Text Toolkit", slug: "text", route: "/text", category: "text",
    description: "Transform case, clean, extract & analyze plain text.",
    longDescription: "Integrated text workbench: 10 case transforms, whitespace/dedup/sort cleaners, email/URL/IP/domain/UUID extractors, readability stats and an integrated diff — with live counts.",
    keywords: ["text", "case", "uppercase", "lowercase", "camelcase", "snake", "kebab", "slug", "extract email", "word count", "sort lines"],
    aliases: ["uppercase", "lowercase converter", "camel to snake", "word counter", "remove duplicates", "extract emails", "slug generator"],
    featured: true, clientSide: true, capabilities: ["Transform", "Clean", "Extract", "Analyze", "Compare"],
    related: ["regex", "diff", "encode"],
    howItWorks: ["Paste text.", "Switch Transform / Clean / Extract / Analyze.", "Copy the result."],
  },
  {
    id: "timestamp", name: "Timestamp Converter", slug: "timestamp", route: "/timestamp", category: "datetime",
    description: "Unix ⇄ date, seconds ⇄ ms, epoch inspector.",
    longDescription: "Bidirectional epoch converter with ms/s auto-detect, current-timestamp ticker, ISO/RFC/JS/date-fns outputs and relative-time readout.",
    keywords: ["timestamp", "unix", "epoch", "milliseconds", "seconds", "date", "iso"],
    aliases: ["unix timestamp", "epoch converter", "timestamp to date", "date to timestamp", "current timestamp"],
    featured: true, clientSide: true, capabilities: ["Unix ⇄ Date", "ms ⇄ s", "Relative"],
    related: ["timezone", "datecalc", "cron"],
    howItWorks: ["Paste 1717785600 or a date.", "See every representation.", "Copy ISO or epoch."],
    example: { label: "Epoch", value: "1717785600" },
  },
  {
    id: "timezone", name: "Timezone Converter", slug: "timezone", route: "/timezone", category: "datetime",
    description: "Convert across IANA timezones with DST handled by the OS.",
    longDescription: "Proper IANA timezone conversion via Intl: world-clock table, UTC/local helpers and meeting-planner overlap view. No hard-coded offsets.",
    keywords: ["timezone", "utc", "convert time", "world clock", "dst", "iana"],
    aliases: ["timezone converter", "utc converter", "world time", "convert timezone"],
    clientSide: true, capabilities: ["Convert", "World clock"],
    related: ["timestamp", "datecalc", "cron"],
    howItWorks: ["Pick a moment.", "Add zones.", "Compare wall-times side by side."],
  },
  {
    id: "datecalc", name: "Date Calculator", slug: "date-calc", route: "/date-calc", category: "datetime",
    description: "Date diff, add/subtract, business days & age calculator.",
    longDescription: "Exact calendar math: duration breakdown, add/subtract days/hours, business-day counter (weekends + optional holidays) and age calculator.",
    keywords: ["date", "difference", "add days", "business days", "age", "days between"],
    aliases: ["days between dates", "add days to date", "business days calculator", "age calculator"],
    clientSide: true, capabilities: ["Diff", "Add/Subtract", "Business days", "Age"],
    related: ["timestamp", "timezone"],
    howItWorks: ["Pick two dates or an offset.", "Read the breakdown.", "Copy the result."],
  },
  {
    id: "logs", name: "Logs Toolkit", slug: "logs", route: "/logs", category: "devops",
    description: "Format, clean, normalize, filter and compare application logs.",
    longDescription: "A local log workbench for JSON logs, Docker/Kubernetes output, Nginx/Apache access logs, syslog and stack traces. Detect formats, normalize timestamps, remove duplicates, extract errors and compare runs without uploading logs.",
    keywords: ["logs", "debug", "json logs", "docker logs", "kubernetes logs", "nginx", "apache", "syslog", "stack trace", "timestamp", "deduplicate"],
    aliases: ["log formatter", "format logs", "clean logs", "extract errors", "stack trace formatter", "docker log parser", "kubernetes logs"],
    featured: true, clientSide: true, capabilities: ["Format", "Clean", "Normalize", "Filter", "Errors", "Diff"],
    related: ["errors", "regex", "text", "diff", "timestamp"],
    howItWorks: ["Paste logs from a service, container or web server.", "DevUtils detects common formats and extracts timestamps and levels.", "Clean, filter or compare the result, then copy it locally."],
    example: { label: "Mixed application log", value: '{"timestamp":"2026-04-18T10:12:00Z","level":"info","service":"api","message":"listening on :8080"}\n{"timestamp":"2026-04-18T10:12:03Z","level":"error","service":"api","message":"ECONNREFUSED database:5432"}\n2026-04-18T10:12:03Z stderr F Error: connection failed\n    at connect (db.js:42:9)' },
  },
  {
    id: "errors", name: "Error Explorer", slug: "errors", route: "/errors", category: "development",
    description: "Detect and explain Docker, K8s, HTTP, Linux, network, Git & Terraform errors.",
    longDescription: "Paste an error, stack trace, log excerpt or kubectl describe output. DevUtils deterministically detects known patterns, extracts useful facts, explains causes, lists checks and links to the relevant tool. No AI and no upload.",
    keywords: ["error", "crashloopbackoff", "imagepullbackoff", "oomkilled", "500", "502", "404", "econnrefused", "permission denied", "explain"],
    aliases: ["CrashLoopBackOff", "ImagePullBackOff", "OOMKilled", "explain error", "http 500", "port already allocated", "permission denied"],
    clientSide: true, capabilities: ["Linux", "Docker", "K8s", "HTTP", "Network"],
    related: ["kubernetes", "docker", "http", "linux-cmd"],
    howItWorks: ["Search an error string or code.", "Read cause → fix.", "Jump to the tool that fixes it."],
  },
];

export const TOOL_MAP: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
export const ROUTE_MAP: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.route, t]));

/* ---------- deterministic intent search ---------- */

function norm(s: string) { return s.toLowerCase().trim(); }

const INTENT_RULES: { test: (q: string) => boolean; toolIds: string[] }[] = [
  { test: (q) => /\b(755|644|700|777|600|750|rwx|r-x|chmod|permission)\b/.test(q), toolIds: ["chmod"] },
  { test: (q) => /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?\b/.test(q) || q.includes("cidr") || q.includes("subnet") || q.includes("broadcast"), toolIds: ["subnet", "ip"] },
  { test: (q) => q.startsWith("every ") || /every \d+ (minute|hour|day|second)/.test(q) || q.includes("cron"), toolIds: ["cron"] },
  { test: (q) => q.includes("curl") , toolIds: ["curl", "http"] },
  { test: (q) => q.includes("jwt") || /^eyj[A-Za-z0-9_-]*\./.test(q.replace(/\s/g, "")), toolIds: ["jwt"] },
  { test: (q) => q.includes("base64") || q.includes("url encode") || q.includes("hex decode"), toolIds: ["encode"] },
  { test: (q) => /crashloop|imagepull|oomkilled|pending|containerconfig/i.test(q), toolIds: ["kubernetes", "errors"] },
  { test: (q) => /port already|image not found|container exited/i.test(q), toolIds: ["docker", "errors"] },
  { test: (q) => /^(400|401|403|404|408|409|429|500|502|503|504)\b/.test(q) || q.includes("http status"), toolIds: ["http", "errors"] },
  { test: (q) => q.includes("docker") || q.includes("compose") || q.includes("dockerfile"), toolIds: ["docker"] },
  { test: (q) => q.includes("kuber") || q.includes("k8s") || q.includes("kubectl") || q.includes("deployment"), toolIds: ["kubernetes"] },
  { test: (q) => q.includes("terraform") || q.includes("tfvars") || q.includes(" hcl"), toolIds: ["terraform"] },
  { test: (q) => q.includes("timestamp") || q.includes("epoch") || /^\d{10}(\d{3})?$/.test(q), toolIds: ["timestamp"] },
  { test: (q) => q.includes("sha256") || q.includes("md5") || q.includes("hmac") || q.includes("hash"), toolIds: ["hash"] },
  { test: (q) => q.includes("uuid") || q.includes("password") || q.includes("secret") || q.includes("api key"), toolIds: ["secrets", "generators"] },
  { test: (q) => q.includes("yaml") , toolIds: ["converter", "code-format"] },
  { test: (q) => q.includes("sql") || q.includes("select ") || q.includes("create table"), toolIds: ["sql"] },
  { test: (q) => q.includes("regex") || q.includes("regular expression"), toolIds: ["regex"] },
  { test: (q) => q.includes("ssh") || q.includes("scp"), toolIds: ["ssh"] },
  { test: (q) => q.includes("systemd") || q.includes("journalctl") || q.includes("systemctl"), toolIds: ["systemd"] },
  { test: (q) => q.includes("qr"), toolIds: ["qr"] },
  { test: (q) => /econnrefused|etimedout|enotfound|dns/.test(q), toolIds: ["errors", "dns"] },
  { test: (q) => q.includes("diff") || q.includes("compare"), toolIds: ["diff"] },
  { test: (q) => q.includes("log") || q.includes("stack trace") || q.includes("syslog") || q.includes("nginx access"), toolIds: ["logs", "errors"] },
  { test: (q) => q.includes("json"), toolIds: ["json"] },
  { test: (q) => q.includes("env") || q.includes("dotenv"), toolIds: ["env"] },
  { test: (q) => q.includes("git") , toolIds: ["git"] },
  { test: (q) => q.includes("word count") || q.includes("uppercase") || q.includes("lowercase") || q.includes("case convert"), toolIds: ["text"] },
  { test: (q) => q.includes("cert") || q.includes("pem") || q.includes("x509") || q.includes("csr"), toolIds: ["cert"] },
  { test: (q) => q.includes("csp") || q.includes("cors") || q.includes("robots"), toolIds: ["websec"] },
  { test: (q) => q.includes("timezone") || q.includes("utc"), toolIds: ["timezone"] },
  { test: (q) => q.includes("port ") || /^port/.test(q) || /:\d{2,5}$/.test(q), toolIds: ["ports"] },
];

export type SearchHit = { tool: Tool; score: number; reason?: string };

export function searchTools(query: string, limit = 12): SearchHit[] {
  const q = norm(query);
  if (!q) return TOOLS.filter((t) => t.featured).map((tool) => ({ tool, score: 0 }));
  const tokens = q.split(/[\s,;|/]+/).filter(Boolean);
  const intentBoost: Record<string, number> = {};
  INTENT_RULES.forEach((r) => {
    try { if (r.test(q)) r.toolIds.forEach((id, i) => { intentBoost[id] = (intentBoost[id] ?? 0) + (40 - i * 8); }); } catch { /* noop */ }
  });
  const hits: SearchHit[] = TOOLS.map((tool) => {
    let score = intentBoost[tool.id] ?? 0;
    let reason: string | undefined = score > 0 ? "intent match" : undefined;
    const hay = norm([tool.name, tool.description, ...tool.keywords, ...tool.aliases].join(" "));
    if (norm(tool.name) === q) score += 120;
    if (tool.aliases.some((a) => norm(a) === q)) { score += 100; reason = "exact alias"; }
    if (norm(tool.name).includes(q) && q.length > 2) score += 50;
    if (tool.slug === q) score += 90;
    tokens.forEach((tok) => {
      if (tok.length < 2) return;
      if (hay.includes(tok)) score += tok.length >= 5 ? 12 : 7;
      if (tool.keywords.some((k) => k.startsWith(tok))) score += 8;
      if (norm(tool.name).toLowerCase().includes(tok)) score += 10;
    });
    // alias word overlap
    tool.aliases.forEach((a) => { if (q.includes(norm(a)) || norm(a).includes(q)) score += 18; });
    return { tool, score, reason };
  }).filter((h) => h.score > 0);
  hits.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return hits.slice(0, limit);
}

export function getRelated(id: string, n = 4): Tool[] {
  const t = TOOL_MAP[id];
  if (!t) return [];
  const rel = (Array.isArray(t.related) ? t.related : []).map((r) => TOOL_MAP[r]).filter(Boolean);
  if (rel.length >= n) return rel.slice(0, n);
  const sameCat = TOOLS.filter((x) => x.category === t.category && x.id !== id && !rel.includes(x));
  return [...rel, ...sameCat].slice(0, n);
}

export function getCategory(slug: string) { return CATEGORIES.find((c) => c.slug === slug); }
export function getToolsByCategory(catId: string) { return TOOLS.filter((t) => t.category === catId); }

/* ================= runtime override layer =================
 * The base TOOLS/CATEGORIES arrays above are the implementation source of
 * truth. Administrators may overlay metadata (name, description, category,
 * order, visibility, tags, keywords) stored in the database. Applying an
 * overlay mutates these canonical arrays in place so every existing consumer
 * — search, home, category pages, routing, breadcrumbs, related tools, and
 * the sitemap generator — reflects the change from a single source.
 */

export type ToolOverlay = Partial<Pick<Tool,
  "name" | "slug" | "route" | "description" | "longDescription" | "category" |
  "keywords" | "aliases" | "related" | "tags" | "featured">> & {
  id: string; order?: number; enabled?: boolean; visibility?: "published" | "draft" | "archived";
};
export type CategoryOverlay = Partial<Pick<Category, "name" | "slug" | "description" | "tagline">> & {
  id: string; order?: number; enabled?: boolean;
};

const BASE_TOOLS: Tool[] = TOOLS.map((t) => ({ ...t }));
const BASE_CATEGORIES: Category[] = CATEGORIES.map((c) => ({ ...c }));
let registryVersion = 0;
const registrySubscribers = new Set<() => void>();

function rebuildIndexes(): void {
  Object.keys(TOOL_MAP).forEach((k) => delete TOOL_MAP[k]);
  Object.keys(ROUTE_MAP).forEach((k) => delete ROUTE_MAP[k]);
  TOOLS.forEach((t) => { TOOL_MAP[t.id] = t; ROUTE_MAP[t.route] = t; });
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Applies administrator overlays and rebuilds the canonical registry in place. */
export function applyRegistryOverlays(toolOverlays: ToolOverlay[] = [], categoryOverlays: CategoryOverlay[] = []): void {
  const tById = new Map(toolOverlays.map((o) => [o.id, o]));
  type MergedTool = Tool & { __order: number; __visibility: string };
  const merged: MergedTool[] = BASE_TOOLS.map((base, index) => {
    const o = tById.get(base.id);
    const slug = o?.slug ?? base.slug;
    const route = o?.route ?? (slug !== base.slug ? `/tools/${slug}` : base.route);
    const visibility = o?.visibility ?? (o?.enabled === false ? "draft" : "published");
    const patch: Partial<Tool> = o ? {
      name: o.name, description: o.description, longDescription: o.longDescription,
      category: o.category, keywords: o.keywords, aliases: o.aliases, related: o.related, featured: o.featured,
    } : {};
    return {
      ...base, ...stripUndefined(patch), id: base.id, slug, route,
      tags: o?.tags ?? base.tags ?? [],
      capabilities: base.capabilities, clientSide: base.clientSide, howItWorks: base.howItWorks,
      __order: Number.isFinite(o?.order) ? Number(o?.order) : index,
      __visibility: visibility,
    };
  });

  const published = merged
    .filter((t) => t.__visibility === "published")
    .sort((a, b) => a.__order - b.__order || a.name.localeCompare(b.name));
  TOOLS.splice(0, TOOLS.length, ...published.map(({ __order, __visibility, ...rest }) => { void __order; void __visibility; return rest as Tool; }));

  const cById = new Map(categoryOverlays.map((o) => [o.id, o]));
  type MergedCat = Category & { __order: number };
  const cats: MergedCat[] = BASE_CATEGORIES.map((base, index) => {
    const o = cById.get(base.id);
    const patch: Partial<Category> = o ? { name: o.name, slug: o.slug, description: o.description, tagline: o.tagline } : {};
    return { ...base, ...stripUndefined(patch), id: base.id, __order: Number.isFinite(o?.order) ? Number(o?.order) : index };
  })
    .filter((c) => cById.get(c.id)?.enabled !== false)
    .sort((a, b) => a.__order - b.__order);
  CATEGORIES.splice(0, CATEGORIES.length, ...cats.map(({ __order, ...rest }) => { void __order; return rest as Category; }));

  rebuildIndexes();
  registryVersion += 1;
  registrySubscribers.forEach((fn) => fn());
}

export function resetRegistry(): void { applyRegistryOverlays([], []); }
export function getRegistryVersion(): number { return registryVersion; }
export function subscribeRegistry(fn: () => void): () => void { registrySubscribers.add(fn); return () => registrySubscribers.delete(fn); }

/** Fetches and applies published overlays from the gateway; safe when offline. */
export async function loadRegistryOverlays(): Promise<{ applied: boolean; degraded: boolean }> {
  try {
    const res = await fetch("/api/tools/registry", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!res.ok) return { applied: false, degraded: true };
    const payload = await res.json() as { tools?: ToolOverlay[]; categories?: CategoryOverlay[]; degraded?: boolean };
    if (payload.degraded) return { applied: false, degraded: true };
    applyRegistryOverlays(payload.tools ?? [], payload.categories ?? []);
    return { applied: true, degraded: false };
  } catch {
    return { applied: false, degraded: true };
  }
}
