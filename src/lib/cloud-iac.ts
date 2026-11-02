// Cloud + IaC helpers - pure builders and validators. No network, no credentials.
export type CloudWatchQueryInput = {
  namespace: string;
  metricName: string;
  statistic: string;
  dimensions?: { name: string; value: string }[];
  limit?: number;
};

const STATISTICS = new Set(["AVG", "SUM", "MIN", "MAX", "COUNT", "SAMPLE_COUNT"]);
const METRIC_NAME_RE = /^[a-zA-Z0-9:_\-/]+$/;

function validateStatistic(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (STATISTICS.has(value)) return value;
  if (/^P\d+(\.\d+)?$/.test(value)) return value;
  throw new Error("Statistic must be AVG, SUM, MIN, MAX, COUNT, SAMPLE_COUNT or a percentile like P95.");
}

function validateMetric(raw: string): string {
  const value = raw.trim();
  if (!value || !METRIC_NAME_RE.test(value)) throw new Error("Metric names may only contain letters, digits and :-_/.");
  return value;
}

function validateNamespace(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("Namespace is required, for example AWS/EC2.");
  return value;
}

/** Build a CloudWatch Metrics Insights query from structured input. */
export function buildCloudWatchQuery(input: CloudWatchQueryInput): string {
  const namespace = validateNamespace(input.namespace);
  const metric = validateMetric(input.metricName);
  const statistic = validateStatistic(input.statistic);
  const dimensions = (input.dimensions ?? []).map((dimension) => ({ name: dimension.name.trim(), value: dimension.value.trim() }));
  for (const dimension of dimensions) {
    if (!dimension.name || !dimension.value) throw new Error("Each dimension needs a name and a value.");
  }
  let query = `SELECT ${statistic}(${metric}) FROM "${namespace}"`;
  if (dimensions.length) {
    query += ` WHERE ${dimensions.map((dimension) => `${dimension.name} = '${dimension.value.replace(/'/g, "''")}'`).join(" AND ")}`;
  }
  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) throw new Error("LIMIT must be an integer between 1 and 500.");
    query += ` LIMIT ${input.limit}`;
  }
  return query;
}

export type CloudWatchAlarmInput = {
  alarmName: string;
  namespace: string;
  metricName: string;
  statistic: string;
  threshold: number;
  comparisonOperator: string;
  periodSeconds: number;
  evaluationPeriods: number;
  treatMissingData?: string;
  dimensions?: { name: string; value: string }[];
};

const COMPARISON_OPERATORS = new Set(["GreaterThanThreshold", "GreaterThanOrEqualToThreshold", "LessThanThreshold", "LessThanOrEqualToThreshold"]);
const TREAT_MISSING = new Set(["missing", "notBreaching", "breaching", "ignore"]);

/** Build a CloudWatch alarm definition object from structured input. */
export function buildCloudWatchAlarm(input: CloudWatchAlarmInput): Record<string, unknown> {
  const alarmName = input.alarmName.trim();
  if (!alarmName) throw new Error("Alarm name is required.");
  const namespace = validateNamespace(input.namespace);
  const metric = validateMetric(input.metricName);
  const statistic = validateStatistic(input.statistic);
  if (!Number.isFinite(input.threshold)) throw new Error("Threshold must be a number.");
  if (!COMPARISON_OPERATORS.has(input.comparisonOperator)) throw new Error("Comparison operator must be GreaterThanThreshold, GreaterThanOrEqualToThreshold, LessThanThreshold or LessThanOrEqualToThreshold.");
  if (!Number.isInteger(input.periodSeconds) || input.periodSeconds < 1) throw new Error("Period (seconds) must be a positive integer, for example 300.");
  if (!Number.isInteger(input.evaluationPeriods) || input.evaluationPeriods < 1) throw new Error("Evaluation periods must be a positive integer.");
  const treatMissing = input.treatMissingData?.trim() ?? "missing";
  if (!TREAT_MISSING.has(treatMissing)) throw new Error("Treat-missing-data must be missing, notBreaching, breaching or ignore.");
  const dimensions = (input.dimensions ?? []).map((dimension) => ({ Name: dimension.name.trim(), Value: dimension.value.trim() }));
  for (const dimension of dimensions) {
    if (!dimension.Name || !dimension.Value) throw new Error("Each dimension needs a name and a value.");
  }
  return {
    AlarmName: alarmName,
    Namespace: namespace,
    MetricName: metric,
    Statistic: statistic,
    Threshold: input.threshold,
    ComparisonOperator: input.comparisonOperator,
    Period: input.periodSeconds,
    EvaluationPeriods: input.evaluationPeriods,
    TreatMissingData: treatMissing,
    ...(dimensions.length ? { Dimensions: dimensions } : {}),
  };
}

/** Summarize a `terraform show -json` plan document. */
export function inspectTerraformPlan(plan: Record<string, unknown>): {
  total: number;
  create: number;
  update: number;
  delete: number;
  replace: number;
  noop: number;
  destroys: string[];
  replacements: string[];
  sensitiveChanges: string[];
} {
  const changes = plan.resource_changes;
  if (!Array.isArray(changes)) throw new Error("Paste the output of 'terraform show -json <plan>'. The resource_changes array is missing.");
  const result = { total: 0, create: 0, update: 0, delete: 0, replace: 0, noop: 0, destroys: [] as string[], replacements: [] as string[], sensitiveChanges: [] as string[] };
  for (const change of changes) {
    const row = change as Record<string, unknown>;
    const address = String(row.address ?? "(no address)");
    const detail = (row.change ?? {}) as Record<string, unknown>;
    const actions = Array.isArray(detail.actions) ? detail.actions.map(String) : [];
    result.total += 1;
    const hasDelete = actions.includes("delete");
    const hasCreate = actions.includes("create");
    if (hasDelete && hasCreate) { result.replace += 1; result.replacements.push(address); }
    else if (hasDelete) { result.delete += 1; result.destroys.push(address); }
    else if (hasCreate) { result.create += 1; }
    else if (actions.includes("update")) { result.update += 1; }
    else { result.noop += 1; }
    if (detail.before_sensitive || detail.after_sensitive) result.sensitiveChanges.push(address);
  }
  return result;
}

export type RbacSubject = { kind: "User" | "Group" | "ServiceAccount"; name: string; namespace?: string };
export type RbacRule = { verbs: string[]; resources: string[]; apiGroups?: string[] };
export type RbacBindingInput = { kind: "Role" | "ClusterRole"; name: string; subjects: RbacSubject[]; rules: RbacRule[] };

const SUBJECT_KINDS = new Set(["User", "Group", "ServiceAccount"]);

/** Build a Kubernetes Role/ClusterRole plus matching Binding as YAML. */
export function buildRbacBinding(input: RbacBindingInput): string {
  if (input.kind !== "Role" && input.kind !== "ClusterRole") throw new Error("Kind must be Role or ClusterRole.");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  if (!input.subjects.length) throw new Error("Add at least one subject (User, Group or ServiceAccount).");
  const subjects = input.subjects.map((subject) => {
    if (!SUBJECT_KINDS.has(subject.kind)) throw new Error("Subject kind must be User, Group or ServiceAccount.");
    const trimmed = subject.name.trim();
    if (!trimmed) throw new Error("Each subject needs a name.");
    return { kind: subject.kind, name: trimmed, ...(subject.kind === "ServiceAccount" ? { namespace: (subject.namespace ?? "default").trim() || "default" } : {}) };
  });
  if (!input.rules.length) throw new Error("Add at least one rule with verbs and resources.");
  const rules = input.rules.map((rule) => {
    const verbs = rule.verbs.map((verb) => verb.trim()).filter(Boolean);
    const resources = rule.resources.map((resource) => resource.trim()).filter(Boolean);
    if (!verbs.length || !resources.length) throw new Error("Each rule needs at least one verb and one resource.");
    return { verbs, resources, apiGroups: rule.apiGroups ?? [""] };
  });
  const bindingKind = input.kind === "Role" ? "RoleBinding" : "ClusterRoleBinding";
  const lines: string[] = [
    "apiVersion: rbac.authorization.k8s.io/v1",
    `kind: ${input.kind}`,
    "metadata:",
    `  name: ${name}`,
    "rules:",
  ];
  for (const rule of rules) {
    lines.push(`- apiGroups: [${rule.apiGroups.map((group) => `"${group}"`).join(", ")}]`);
    lines.push(`  resources: [${rule.resources.map((resource) => `"${resource}"`).join(", ")}]`);
    lines.push(`  verbs: [${rule.verbs.map((verb) => `"${verb}"`).join(", ")}]`);
  }
  lines.push(
    "",
    "---",
    "apiVersion: rbac.authorization.k8s.io/v1",
    `kind: ${bindingKind}`,
    "metadata:",
    `  name: ${name}-binding`,
    "roleRef:",
    "  apiGroup: rbac.authorization.k8s.io",
    `  kind: ${input.kind}`,
    `  name: ${name}`,
    "subjects:",
  );
  for (const subject of subjects) {
    lines.push(`- kind: ${subject.kind}`);
    lines.push(`  name: ${subject.name}`);
    if ("namespace" in subject) lines.push(`  namespace: ${subject.namespace}`);
  }
  return lines.join("\n") + "\n";
}

export type HelmValuesInput = {
  releaseName: string;
  namespace: string;
  replicas: number;
  imageRepository: string;
  imageTag: string;
  serviceType: "ClusterIP" | "NodePort" | "LoadBalancer";
  servicePort: number;
};

/** Build a conventional Helm values.yaml from structured input. */
export function buildHelmValues(input: HelmValuesInput): string {
  const releaseName = input.releaseName.trim();
  if (!releaseName) throw new Error("Release name is required.");
  const namespace = input.namespace.trim() || "default";
  if (!Number.isInteger(input.replicas) || input.replicas < 1 || input.replicas > 50) throw new Error("Replica count must be an integer between 1 and 50.");
  const repository = input.imageRepository.trim();
  if (!repository || !/^[a-zA-Z0-9][a-zA-Z0-9._\/:@-]*$/.test(repository)) throw new Error("Image repository looks invalid, for example nginx or ghcr.io/org/api.");
  const tag = input.imageTag.trim();
  if (!tag || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error("Image tag looks invalid, for example 1.25 or latest.");
  if (input.serviceType !== "ClusterIP" && input.serviceType !== "NodePort" && input.serviceType !== "LoadBalancer") throw new Error("Service type must be ClusterIP, NodePort or LoadBalancer.");
  if (!Number.isInteger(input.servicePort) || input.servicePort < 1 || input.servicePort > 65535) throw new Error("Service port must be an integer between 1 and 65535.");
  return [
    `# values for release ${releaseName}`,
    `replicaCount: ${input.replicas}`,
    `namespace: ${namespace}`,
    "image:",
    `  repository: ${repository}`,
    `  tag: ${tag}`,
    "  pullPolicy: IfNotPresent",
    "service:",
    `  type: ${input.serviceType}`,
    `  port: ${input.servicePort}`,
    "",
  ].join("\n");
}
