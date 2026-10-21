import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { describeCron, nextCronRuns, humanToCron, parseCron, CRON_PRESETS } from "../lib/engine";
import {
  dockerRun, dockerfileGen, composeGen, k8sDeployment, k8sService, k8sIngress, k8sConfigMap,
  k8sSecret, k8sCronJob, k8sJob, k8sStatefulSet, k8sDaemonSet, k8sRbac, k8sNetworkPolicy,
  k8sNamespace, k8sPersistentVolume, k8sPersistentVolumeClaim, kubectlBuild, TF_RESOURCES, tfVariables, tfOutputs, tfFormat, tfJsonResource,
  GITIGNORE_TEMPLATES, branchSanitize, commitBuild, gitUrlParse,
  ghActions, gitlabCi, jenkinsfile, parseEnv, envToJson, jsonToEnv,
} from "../lib/blueprints";
const CRON_PRESETS_SAFE = CRON_PRESETS;
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Check, Btn,
  CodeArea, OutputBox, ErrorCallout, Split, ActionBar, inputCls,
} from "../components/ui";
import { cn } from "../utils/cn";
import { PresetControl } from "../components/presets";
import { analyzeErrorText } from "../lib/error-explorer";

/* ================= DOCKER ================= */

export function DockerTool() {
  const tool = TOOL_MAP.docker;
  const [tab, setTab] = useState("run");
  const [image, setImage] = useState("nginx:alpine");
  const [name, setName] = useState("web");
  const [detach, setDetach] = useState(true);
  const [rm, setRm] = useState(false);
  const [ports, setPorts] = useState([{ host: "8080", container: "80", proto: "tcp" }]);
  const [vols, setVols] = useState([{ host: "./html", container: "/usr/share/nginx/html", ro: false }]);
  const [env, setEnv] = useState([{ k: "NGINX_HOST", v: "example.com" }]);
  const [network, setNetwork] = useState("");
  const [restart, setRestart] = useState("unless-stopped");
  const [health, setHealth] = useState("");
  const [bCmd, setBCmd] = useState("docker build -t myapp:latest .");
  const [bCtx, setBCtx] = useState("Image to build");
  const [eCont, setECont] = useState("web");
  const [eCmd, setECmd] = useState("/bin/sh");
  const [dfBase, setDfBase] = useState("node:20-alpine");
  const [dfWork, setDfWork] = useState("/app");
  const [dfCopy, setDfCopy] = useState("package*.json ./");
  const [dfRun, setDfRun] = useState("npm ci --only=production");
  const [dfExpose, setDfExpose] = useState("3000");
  const [dfCmd, setDfCmd] = useState('["node", "index.js"]');
  const [dfMulti, setDfMulti] = useState(true);
  const [coName, setCoName] = useState("web");
  const [coImage, setCoImage] = useState("nginx:alpine");
  const [coPorts, setCoPorts] = useState("8080:80");
  const [coVols, setCoVols] = useState("./html:/usr/share/nginx/html");
  const [coEnv, setCoEnv] = useState("NGINX_HOST=example.com");

  const out = useMemo(() => {
    try {
      if (tab === "run") {
        if (!image.trim()) throw new Error("Image is required (e.g. nginx:alpine).");
        const healthFlags = health.trim() ? `--health-cmd ${JSON.stringify(health.trim())} --health-interval 30s --health-timeout 5s --health-retries 3` : "";
        return { ok: true as const, text: dockerRun({ image, name, detach, rm: rm, interactive: false, tty: false, ports, volumes: vols, env, network, restart, extra: healthFlags }) };
      }
      if (tab === "exec") return { ok: true as const, text: `docker exec -it ${eCont || "<container>"} ${eCmd || "/bin/sh"}` };
      if (tab === "build") return { ok: true as const, text: bCmd || "docker build -t myapp:latest ." };
      if (tab === "dockerfile") return { ok: true as const, text: dockerfileGen({ base: dfBase, workdir: dfWork, copy: dfCopy, run: dfRun, expose: dfExpose, env: [], cmd: dfCmd, multistage: dfMulti, nodeVersion: "20" }) };
      return { ok: true as const, text: composeGen({ project: "app", services: [{ name: coName, image: coImage, ports: coPorts, volumes: coVols, env: coEnv, restart: "unless-stopped" }] }) };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [tab, image, name, detach, rm, ports, vols, env, network, restart, health, bCmd, bCtx, eCont, eCmd, dfBase, dfWork, dfCopy, dfRun, dfExpose, dfCmd, dfMulti, coName, coImage, coPorts, coVols, coEnv]);

  void bCtx;
  const kvRow = <T extends Record<string, unknown>>(rows: T[], set: (r: T[]) => void, fields: (keyof T)[], labels: string[]) => (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1.5">
          {fields.map((f, fi) => (
            typeof r[f] === "boolean"
              ? <button key={String(f)} type="button" onClick={() => { const c = [...rows]; (c[i] as Record<string, unknown>)[f as string] = !r[f]; set(c); }}
                className={cn("rounded-lg border px-2.5 py-2 text-xs", r[f] ? "border-emerald-500 text-emerald-600" : "border-zinc-300 text-zinc-400 dark:border-zinc-700")}>{labels[fi]}</button>
              : <input key={String(f)} value={String(r[f])} onChange={(e) => { const c = [...rows]; (c[i] as Record<string, unknown>)[f as string] = e.target.value; set(c); }}
                placeholder={labels[fi]} className={cn(inputCls, "py-1.5 font-mono text-[12.5px]")} />
          ))}
          <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} className="rounded-lg p-2 text-zinc-400 hover:text-red-500" aria-label="Remove row"><X size={15} /></button>
        </div>
      ))}
      <button type="button" onClick={() => set([...rows, { ...rows[0] } as T])} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-700 dark:text-emerald-300"><Plus size={13} /> Add row</button>
    </div>
  );

  return (
    <ToolScaffold tool={tool} next={[{ label: "Deploy it to Kubernetes", to: "/kubernetes" }, { label: "Build CI pipeline", to: "/cicd" }, { label: "Fix port conflicts", to: "/errors" }]}
      onExample={() => { setTab("run"); setImage("nginx:alpine"); }}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "run", label: "Run" }, { id: "build", label: "Build" }, { id: "exec", label: "Exec" }, { id: "compose", label: "Compose" }, { id: "dockerfile", label: "Dockerfile" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === "run" && (
            <Split
              left={
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Image"><TextInput value={image} onChange={(e) => setImage(e.target.value)} className="font-mono" placeholder="nginx:alpine" /></Field>
                    <Field label="--name"><TextInput value={name} onChange={(e) => setName(e.target.value)} className="font-mono" /></Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Check label="-d (detach)" checked={detach} onChange={setDetach} />
                    <Check label="--rm" checked={rm} onChange={setRm} />
                  </div>
                  <Field label="Ports (host : container)">{kvRow(ports, setPorts, ["host", "container", "proto"], ["8080", "80", "tcp"])}</Field>
                  <Field label="Volumes (host : container)">{kvRow(vols, setVols, ["host", "container", "ro"], ["./html", "/usr/share/nginx/html", "ro"])}</Field>
                  <Field label="Environment">{kvRow(env, setEnv, ["k", "v"], ["KEY", "value"])}</Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="--network"><TextInput value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="my-net" className="font-mono" /></Field>
                    <Field label="--restart"><Select value={restart} onChange={(e) => setRestart(e.target.value)}><option value="no">no</option><option value="unless-stopped">unless-stopped</option><option value="always">always</option><option value="on-failure">on-failure</option></Select></Field>
                  </div>
                  <Field label="Healthcheck command" hint="Optional. Adds interval, timeout and retry defaults."><TextInput value={health} onChange={(e) => setHealth(e.target.value)} className="font-mono" placeholder="curl -f http://localhost/health || exit 1" /></Field>
                  <p className="font-mono text-[11.5px] text-zinc-500">Image: <span className="text-zinc-800 dark:text-zinc-200">{image.includes(":") ? image.slice(0, image.lastIndexOf(":")) : image}</span> · tag: <span className="text-zinc-800 dark:text-zinc-200">{image.includes(":") ? image.slice(image.lastIndexOf(":") + 1) : "latest (implicit)"}</span></p>
                </div>
              }
              right={out.ok ? <OutputBox value={out.text} label="Generated command" filename="docker-run.sh" /> : <ErrorCallout title="Cannot build command" message={out.err} />}
            />
          )}
          {tab === "build" && (
            <Split
              left={<div className="space-y-3">
                <Field label="Build command" hint="Edit flags directly — validated as you type"><TextInput value={bCmd} onChange={(e) => setBCmd(e.target.value)} className="font-mono" /></Field>
                <div className="grid grid-cols-3 gap-2">
                  {[["-t myapp:latest", "tag"], ["--no-cache", "no cache"], ["--pull", "pull base"], ["--target runtime", "target"], ["--platform linux/amd64", "platform"], ["-f Dockerfile.prod", "dockerfile"]].map(([flag, label]) => (
                    <button key={flag} type="button" onClick={() => setBCmd((c) => (c.includes(flag) ? c.replace(` ${flag}`, "") : `${c} ${flag}`))}
                      className={cn("rounded-lg border px-2 py-1.5 font-mono text-[12px]", bCmd.includes(flag) ? "border-emerald-500 text-emerald-600" : "border-zinc-300 text-zinc-500 dark:border-zinc-700")}>{label}</button>
                  ))}
                </div>
                <Field label="Context path"><TextInput value={bCtx} onChange={(e) => setBCtx(e.target.value)} className="font-mono" /></Field>
              </div>}
              right={out.ok ? <OutputBox value={out.text} label="Build command" filename="docker-build.sh" /> : <ErrorCallout title="Error" message={out.err} />}
            />
          )}
          {tab === "exec" && (
            <Split
              left={<div className="space-y-3">
                <Field label="Container"><TextInput value={eCont} onChange={(e) => setECont(e.target.value)} className="font-mono" /></Field>
                <Field label="Command"><TextInput value={eCmd} onChange={(e) => setECmd(e.target.value)} className="font-mono" /></Field>
                <div className="flex flex-wrap gap-2">{["/bin/sh", "/bin/bash", "nginx -t", "env", "ls -la"].map((c) => <button key={c} type="button" onClick={() => setECmd(c)} className="rounded-lg border border-zinc-200 px-2 py-1 font-mono text-[12px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">{c}</button>)}</div>
              </div>}
              right={out.ok ? <OutputBox value={out.text} label="Exec command" filename="docker-exec.sh" /> : <ErrorCallout title="Error" message={out.err} />}
            />
          )}
          {tab === "dockerfile" && (
            <Split
              left={<div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base image"><TextInput value={dfBase} onChange={(e) => setDfBase(e.target.value)} className="font-mono" /></Field>
                  <Field label="WORKDIR"><TextInput value={dfWork} onChange={(e) => setDfWork(e.target.value)} className="font-mono" /></Field>
                </div>
                <Field label="COPY"><TextInput value={dfCopy} onChange={(e) => setDfCopy(e.target.value)} className="font-mono" /></Field>
                <Field label="RUN (one per line)"><textarea value={dfRun} onChange={(e) => setDfRun(e.target.value)} rows={2} className={cn(inputCls, "font-mono text-[13px]")} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="EXPOSE"><TextInput value={dfExpose} onChange={(e) => setDfExpose(e.target.value)} className="font-mono" /></Field>
                  <Field label="CMD"><TextInput value={dfCmd} onChange={(e) => setDfCmd(e.target.value)} className="font-mono" /></Field>
                </div>
                <Check label="Multi-stage build" checked={dfMulti} onChange={setDfMulti} />
              </div>}
              right={out.ok ? <OutputBox value={out.text} label="Dockerfile" filename="Dockerfile" /> : <ErrorCallout title="Error" message={out.err} />}
            />
          )}
          {tab === "compose" && (
            <Split
              left={<div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Service"><TextInput value={coName} onChange={(e) => setCoName(e.target.value)} className="font-mono" /></Field>
                  <Field label="Image"><TextInput value={coImage} onChange={(e) => setCoImage(e.target.value)} className="font-mono" /></Field>
                </div>
                <Field label="Ports (one per line)"><textarea value={coPorts} onChange={(e) => setCoPorts(e.target.value)} rows={2} className={cn(inputCls, "font-mono text-[13px]")} /></Field>
                <Field label="Volumes (one per line)"><textarea value={coVols} onChange={(e) => setCoVols(e.target.value)} rows={2} className={cn(inputCls, "font-mono text-[13px]")} /></Field>
                <Field label="Environment (KEY=value per line)"><textarea value={coEnv} onChange={(e) => setCoEnv(e.target.value)} rows={2} className={cn(inputCls, "font-mono text-[13px]")} /></Field>
              </div>}
              right={out.ok ? <OutputBox value={out.text} label="compose.yaml" filename="compose.yaml" /> : <ErrorCallout title="Error" message={out.err} />}
            />
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= KUBERNETES ================= */

const K8S_TABS = [
  { id: "deploy", label: "Deployment" }, { id: "service", label: "Service" }, { id: "ingress", label: "Ingress" },
  { id: "configmap", label: "ConfigMap" }, { id: "secret", label: "Secret" }, { id: "job", label: "Job" },
  { id: "cronjob", label: "CronJob" }, { id: "stateful", label: "StatefulSet" }, { id: "daemon", label: "DaemonSet" },
  { id: "rbac", label: "RBAC" }, { id: "netpol", label: "NetworkPolicy" }, { id: "pv", label: "PV" }, { id: "pvc", label: "PVC" },
  { id: "ns", label: "Namespace" }, { id: "kubectl", label: "kubectl" }, { id: "selectors", label: "Selectors" }, { id: "debug", label: "Debug describe" },
];

export function K8sTool() {
  const tool = TOOL_MAP.kubernetes;
  const [tab, setTab] = useState("deploy");
  const [name, setName] = useState("api");
  const [ns, setNs] = useState("default");
  const [image, setImage] = useState("nginx:1.27");
  const [replicas, setReplicas] = useState(3);
  const [port, setPort] = useState(80);
  const [extra, setExtra] = useState("");
  const [svcType, setSvcType] = useState("ClusterIP");
  const [host, setHost] = useState("app.example.com");
  const [kcmd, setKcmd] = useState("echo hello");
  const [sched, setSched] = useState("0 * * * *");
  const [cpu, setCpu] = useState("100m");
  const [memory, setMemory] = useState("128Mi");
  const [cpuLimit, setCpuLimit] = useState("500m");
  const [memoryLimit, setMemoryLimit] = useState("512Mi");
  const [storage, setStorage] = useState("10Gi");
  const [storageClass, setStorageClass] = useState("standard");
  const [describe, setDescribe] = useState("");
  const [selector, setSelector] = useState("app=api,environment=prod");
  const [jsonPath, setJsonPath] = useState("{.items[*].metadata.name}");
  const debugAnalysis = useMemo(() => analyzeErrorText(describe), [describe]);

  const out = useMemo(() => {
    const common = { name, namespace: ns, labels: "", image, replicas, port };
    try {
      switch (tab) {
        case "deploy": return k8sDeployment({ ...common, cpu, memory, cpuLimit, memoryLimit, env: extra });
        case "service": return k8sService({ ...common, type: svcType, targetPort: port });
        case "ingress": return k8sIngress({ ...common, host, path: "/", tls: true });
        case "configmap": return k8sConfigMap({ ...common, data: extra || "LOG_LEVEL=info\nAPI_URL=https://api.example.com" });
        case "secret": return k8sSecret({ ...common, data: extra || "DB_PASSWORD=s3cret" });
        case "job": return k8sJob({ ...common, command: kcmd });
        case "cronjob": return k8sCronJob({ ...common, schedule: sched, command: kcmd });
        case "stateful": return k8sStatefulSet({ ...common, storage: "1Gi" });
        case "daemon": return k8sDaemonSet(common);
        case "rbac": return k8sRbac({ ...common, role: "namespaced" });
        case "netpol": return k8sNetworkPolicy(common);
        case "pv": return k8sPersistentVolume({ ...common, storage, storageClass, hostPath: "/mnt/data" });
        case "pvc": return k8sPersistentVolumeClaim({ ...common, storage, storageClass });
        case "ns": return k8sNamespace(name);
        case "kubectl": return kubectlBuild("get", { resource: "pods", name, namespace: ns, extra, follow: true, output: "" });
        case "selectors": return `# Label selector\nkubectl get pods -n ${ns || "default"} -l ${JSON.stringify(selector)}\n\n# JSONPath output\nkubectl get pods -n ${ns || "default"} -o jsonpath=${JSON.stringify(jsonPath)}\n`;
        case "debug": return debugAnalysis.matches.length
          ? debugAnalysis.matches.map(({ doc }, index) => `${index + 1}. ${doc.title}\nWhat happened: ${doc.cause}\nWhat to check:\n${doc.fix.map((fix) => `- ${fix}`).join("\n")}`).join("\n\n")
          : describe.trim() ? "No known Kubernetes error pattern found. Inspect the Events section and container Last State." : "";
        default: return "";
      }
    } catch (e) { return `Error: ${(e as Error).message}`; }
  }, [tab, name, ns, image, replicas, port, extra, svcType, host, kcmd, sched, cpu, memory, cpuLimit, memoryLimit, storage, storageClass, describe, selector, jsonPath, debugAnalysis]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Schedule with Cron", to: "/cron" }, { label: "Explain CrashLoopBackOff", to: "/errors" }, { label: "Dockerize first", to: "/docker" }]}>
      <Panel className="p-4">
        <div className="overflow-x-auto pb-1"><Tabs tabs={K8S_TABS} active={tab} onChange={setTab} ariaLabel="Kubernetes resources" /></div>
        <div className="mt-4">
          <Split
            left={
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} className="font-mono" /></Field>
                  <Field label="Namespace"><TextInput value={ns} onChange={(e) => setNs(e.target.value)} className="font-mono" /></Field>
                </div>
                {["deploy", "job", "cronjob", "stateful", "daemon"].includes(tab) && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Image"><TextInput value={image} onChange={(e) => setImage(e.target.value)} className="font-mono" /></Field>
                    <Field label="Replicas"><TextInput value={String(replicas)} onChange={(e) => setReplicas(+e.target.value || 1)} className="font-mono" /></Field>
                  </div>
                )}
                {tab === "deploy" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CPU request"><TextInput value={cpu} onChange={(e) => setCpu(e.target.value)} className="font-mono" /></Field><Field label="CPU limit"><TextInput value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} className="font-mono" /></Field>
                    <Field label="Memory request"><TextInput value={memory} onChange={(e) => setMemory(e.target.value)} className="font-mono" /></Field><Field label="Memory limit"><TextInput value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} className="font-mono" /></Field>
                  </div>
                )}
                {(tab === "pv" || tab === "pvc") && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Storage"><TextInput value={storage} onChange={(e) => setStorage(e.target.value)} className="font-mono" /></Field>
                    <Field label="StorageClass"><TextInput value={storageClass} onChange={(e) => setStorageClass(e.target.value)} className="font-mono" /></Field>
                  </div>
                )}
                {tab === "service" && (
                  <Field label="Service type"><Select value={svcType} onChange={(e) => setSvcType(e.target.value)}>
                    <option>ClusterIP</option><option>NodePort</option><option>LoadBalancer</option>
                  </Select></Field>
                )}
                {tab === "ingress" && <Field label="Host"><TextInput value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" /></Field>}
                {(tab === "job" || tab === "cronjob") && (
                  <>
                    <Field label="Command"><TextInput value={kcmd} onChange={(e) => setKcmd(e.target.value)} className="font-mono" /></Field>
                    {tab === "cronjob" && <Field label="Schedule"><TextInput value={sched} onChange={(e) => setSched(e.target.value)} className="font-mono" /></Field>}
                  </>
                )}
                {(tab === "deploy" || tab === "configmap" || tab === "secret" || tab === "kubectl") && (
                  <Field label={tab === "deploy" ? "Env (KEY=value per line)" : tab === "kubectl" ? "Extra args" : "Data (KEY=value per line)"}>
                    <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={4} className={cn(inputCls, "font-mono text-[13px]")} placeholder={tab === "deploy" ? "LOG_LEVEL=info" : tab === "kubectl" ? "-l app=api" : "KEY=value"} />
                  </Field>
                )}
                {tab === "secret" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong>Kubernetes Secrets are base64-encoded, not encrypted.</strong> Anyone with API/read access can decode them. Use RBAC plus an external secrets/encryption-at-rest strategy for production.</p>}
                {tab === "debug" && <Field label="kubectl describe pod output" hint="Paste the full output, especially Last State and Events."><textarea value={describe} onChange={(e) => setDescribe(e.target.value)} rows={12} className={cn(inputCls, "font-mono text-[12px]")} placeholder="Name: api-…\nNamespace: default\nStatus: Running\n…\nEvents:\n  Warning FailedMount …" /></Field>}
                {tab === "selectors" && <><Field label="Label selector"><TextInput value={selector} onChange={(e) => setSelector(e.target.value)} className="font-mono" /></Field><Field label="JSONPath"><TextInput value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} className="font-mono" /></Field></>}
                {!['ns', 'rbac', 'pv', 'pvc', 'kubectl', 'selectors', 'debug'].includes(tab) && <Field label="Container port"><TextInput value={String(port)} onChange={(e) => setPort(+e.target.value || 80)} className="font-mono" /></Field>}
              </div>
            }
            right={<OutputBox value={out} label={tab === "debug" ? `Deterministic analysis · ${Object.keys(debugAnalysis.facts).length} facts extracted` : `${K8S_TABS.find((t) => t.id === tab)?.label} YAML`} filename={tab === "debug" ? "k8s-analysis.txt" : `${tab}.yaml`} rows={16} />}
          />
        </div>
        <ActionBar>
          <Btn onClick={() => { setName("api"); setNs("default"); setImage("nginx:1.27"); setReplicas(3); }}>Reset</Btn>
        </ActionBar>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= TERRAFORM ================= */

export function TerraformTool() {
  const tool = TOOL_MAP.terraform;
  const [tab, setTab] = useState("resource");
  const [res, setRes] = useState("aws_s3");
  const [rname, setRname] = useState("app");
  const [vars, setVars] = useState("environment = production\ninstance_type = t3.micro");
  const [hcl, setHcl] = useState('resource "aws_s3_bucket" "app" {\nbucket="my-bucket"\n}');
  const out = useMemo(() => {
    try {
      if (tab === "resource") return { ok: true as const, text: TF_RESOURCES.find((r) => r.id === res)!.template(rname) };
      if (tab === "json") return { ok: true as const, text: tfJsonResource(res, rname) };
      if (tab === "vars") return { ok: true as const, text: tfVariables(vars) + `\n\n# ---- tfvars ----\n` + vars.split("\n").map((l) => l.trim()).filter(Boolean).join("\n") };
      if (tab === "outputs") return { ok: true as const, text: tfOutputs(vars) };
      return { ok: true as const, text: tfFormat(hcl) };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [tab, res, rname, vars, hcl]);
  return (
    <ToolScaffold tool={tool} next={[{ label: "Store outputs in .env", to: "/env" }, { label: "Deploy via CI", to: "/cicd" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "resource", label: "Resources" }, { id: "json", label: "Terraform JSON" }, { id: "vars", label: "Variables + tfvars" }, { id: "outputs", label: "Outputs" }, { id: "format", label: "Format" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === "resource" && (
            <Split left={<div className="space-y-3">
              <Field label="Resource"><Select value={res} onChange={(e) => setRes(e.target.value)}>{TF_RESOURCES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
              <Field label="Resource name"><TextInput value={rname} onChange={(e) => setRname(e.target.value)} className="font-mono" /></Field>
            </div>} right={out.ok ? <OutputBox value={out.text} label="main.tf" filename="main.tf" rows={14} /> : <ErrorCallout title="Error" message={out.err} />} />
          )}
          {tab === "json" && (
            <Split left={<div className="space-y-3">
              <Field label="Resource"><Select value={res} onChange={(e) => setRes(e.target.value)}>{TF_RESOURCES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
              <Field label="Resource name"><TextInput value={rname} onChange={(e) => setRname(e.target.value)} className="font-mono" /></Field>
            </div>} right={out.ok ? <OutputBox value={out.text} label="main.tf.json" filename="main.tf.json" rows={14} /> : <ErrorCallout title="Error" message={out.err} />} />
          )}
          {tab === "vars" && (
            <Split left={<CodeArea label="Variables (name = default per line)" value={vars} onChange={setVars} rows={8} />} right={out.ok ? <OutputBox value={out.text} label="variables.tf + .tfvars" filename="variables.tf" /> : <ErrorCallout title="Error" message={out.err} />} />
          )}
          {tab === "outputs" && (
            <Split left={<CodeArea label="Output names (one per line)" value={vars} onChange={setVars} rows={8} />} right={out.ok ? <OutputBox value={out.text} label="outputs.tf" filename="outputs.tf" /> : <ErrorCallout title="Error" message={out.err} />} />
          )}
          {tab === "format" && (
            <Split left={<CodeArea label="HCL input" value={hcl} onChange={setHcl} rows={10} />} right={out.ok ? <OutputBox value={out.text} label="Formatted" filename="main.tf" /> : <ErrorCallout title="Error" message={out.err} />} />
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= GIT ================= */

export function GitTool() {
  const tool = TOOL_MAP.git;
  const [tab, setTab] = useState("commands");
  const [action, setAction] = useState("commit");
  const [msg, setMsg] = useState("add health check endpoint");
  const [extra, setExtra] = useState("");
  const [stack, setStack] = useState("node");
  const [branchTxt, setBranchTxt] = useState("Add user profile page!");
  const [prefix, setPrefix] = useState("feat");
  const [ctype, setCtype] = useState("feat");
  const [scope, setScope] = useState("api");
  const [curl, setCurl] = useState("git@github.com:acme/web.git");

  const cmd = useMemo(() => {
    switch (action) {
      case "commit": return `git add -A && git commit -m ${JSON.stringify(msg || "message")}${extra ? ` ${extra}` : ""}`;
      case "push": return `git push -u origin $(git branch --show-current)${extra ? ` ${extra}` : ""}`;
      case "pull": return `git pull --rebase${extra ? ` ${extra}` : ""}`;
      case "stash": return `git stash push -m ${JSON.stringify(msg || "wip")}`;
      case "undo": return `git restore --staged . && git checkout -- .  # soft undo\n# harder: git reset --soft HEAD~1`;
      case "rebase": return `git fetch origin && git rebase origin/main${extra ? ` ${extra}` : ""}`;
      case "tag": return `git tag -a ${extra || "v1.0.0"} -m ${JSON.stringify(msg || "release")} && git push origin ${extra || "v1.0.0"}`;
      default: return `git status`;
    }
  }, [action, msg, extra]);

  const urlRes = useMemo(() => { try { return { ok: true as const, v: gitUrlParse(curl) }; } catch (e) { return { ok: false as const, err: (e as Error).message }; } }, [curl]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Automate with CI", to: "/cicd" }, { label: "Ignore secrets in .env", to: "/env" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "commands", label: "Commands" }, { id: "gitignore", label: ".gitignore" }, { id: "branch", label: "Branches" }, { id: "commit", label: "Commits" }, { id: "url", label: "URL parser" }, { id: "cheatsheet", label: "Cheat sheet" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === "commands" && (
            <Split left={<div className="space-y-3">
              <Field label="Workflow"><Select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="commit">commit</option><option value="push">push</option><option value="pull">pull</option><option value="stash">stash</option><option value="undo">undo changes</option><option value="rebase">rebase on main</option><option value="tag">tag release</option>
              </Select></Field>
              <Field label="Message / detail"><TextInput value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
              <Field label="Extra flags"><TextInput value={extra} onChange={(e) => setExtra(e.target.value)} className="font-mono" placeholder="e.g. --force-with-lease" /></Field>
            </div>} right={<OutputBox value={cmd} label="Command" filename="git.sh" />} />
          )}
          {tab === "gitignore" && (
            <Split left={<Field label="Stack"><Select value={stack} onChange={(e) => setStack(e.target.value)}>
              {Object.keys(GITIGNORE_TEMPLATES).map((k) => <option key={k} value={k}>{k}</option>)}
            </Select></Field>} right={<OutputBox value={GITIGNORE_TEMPLATES[stack]} label=".gitignore" filename=".gitignore" />} />
          )}
          {tab === "branch" && (
            <Split left={<div className="space-y-3">
              <Field label="Prefix"><Select value={prefix} onChange={(e) => setPrefix(e.target.value)}><option>feat</option><option>fix</option><option>chore</option><option>docs</option><option>refactor</option><option>hotfix</option></Select></Field>
              <Field label="Describe the change"><TextInput value={branchTxt} onChange={(e) => setBranchTxt(e.target.value)} /></Field>
            </div>} right={<OutputBox value={`git checkout -b ${branchSanitize(branchTxt, prefix)}`} label="Branch command" filename="branch.sh" />} />
          )}
          {tab === "commit" && (
            <Split left={<div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type"><Select value={ctype} onChange={(e) => setCtype(e.target.value)}><option>feat</option><option>fix</option><option>docs</option><option>refactor</option><option>test</option><option>chore</option></Select></Field>
                <Field label="Scope"><TextInput value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
              </div>
              <Field label="Subject"><TextInput value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
              <Field label="Body (optional)"><TextInput value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
            </div>} right={<OutputBox value={commitBuild(ctype, scope, msg, extra, false)} label="Conventional commit" filename="commit.txt" />} />
          )}
          {tab === "url" && (
            <Split left={<CodeArea label="Remote URL" value={curl} onChange={setCurl} rows={3} />}
              right={urlRes.ok ? <OutputBox value={Object.entries(urlRes.v).map(([k, v]) => `${k}: ${v}`).join("\n")} label="Parsed" /> : <ErrorCallout title="Cannot parse URL" message={urlRes.err} />} />
          )}
          {tab === "cheatsheet" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {[["Start", "git init · git clone <url> · git status"], ["Branch", "git checkout -b feat/x · git branch -d feat/x"], ["Sync", "git fetch --all · git pull --rebase · git push -u origin HEAD"], ["Undo", "git restore <f> · git reset --soft HEAD~1 · git revert <sha>"], ["Inspect", "git log --oneline --graph -20 · git diff · git blame <f>"], ["Stash", "git stash push -m wip · git stash pop"]].map(([h, b]) => (
                <div key={h} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="text-[13px] font-bold">{h}</p><p className="mt-1 font-mono text-[12px] text-zinc-600 dark:text-zinc-400">{b}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= CI/CD ================= */

export function CicdTool() {
  const tool = TOOL_MAP.cicd;
  const [tab, setTab] = useState("github");
  const [stack, setStack] = useState("node");
  const [matrix, setMatrix] = useState(true);
  const [cache, setCache] = useState(true);
  const [docker, setDocker] = useState(false);
  const [yaml, setYaml] = useState("");
  const out = useMemo(() => {
    if (tab === "github") return ghActions(stack, { matrix, cache, docker });
    if (tab === "gitlab") return gitlabCi(stack);
    return jenkinsfile(stack);
  }, [tab, stack, matrix, cache, docker]);
  const valid = useMemo(() => {
    if (!yaml.trim()) return null;
    try {
      if (/^\s*-\s/.test(yaml)) return "Starts with a list item — GitHub workflows must be a mapping (name:, on:, jobs:).";
      if (!/jobs:/.test(yaml)) return "Missing jobs: block.";
      return "Looks structurally plausible (name/on/jobs present). Full schema validation needs the GitHub API.";
    } catch (e) { return (e as Error).message; }
  }, [yaml]);
  return (
    <ToolScaffold tool={tool} next={[{ label: "Containerize first", to: "/docker" }, { label: "Schedule nightly builds", to: "/cron" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "github", label: "GitHub Actions" }, { id: "gitlab", label: "GitLab CI" }, { id: "jenkins", label: "Jenkins" }, { id: "validate", label: "Validate" }]} active={tab} onChange={setTab} />
        {tab !== "validate" ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Stack"><Select value={stack} onChange={(e) => setStack(e.target.value)} className="w-44">
                <option value="node">Node.js</option><option value="python">Python</option><option value="go">Go</option><option value="docker">Docker</option><option value="terraform">Terraform</option><option value="kubernetes">Kubernetes deploy</option>
              </Select></Field>
              {tab === "github" && (<><Check label="Matrix" checked={matrix} onChange={setMatrix} /><Check label="Cache" checked={cache} onChange={setCache} /><Check label="+ Docker build" checked={docker} onChange={setDocker} /></>)}
            </div>
            <div className="mt-3"><OutputBox value={out} label={tab === "github" ? ".github/workflows/ci.yml" : tab === "gitlab" ? ".gitlab-ci.yml" : "Jenkinsfile"} filename={tab === "github" ? "ci.yml" : tab === "gitlab" ? ".gitlab-ci.yml" : "Jenkinsfile"} rows={16} /></div>
          </div>
        ) : (
          <div className="mt-4">
            <Split left={<CodeArea label="Paste workflow YAML" value={yaml} onChange={setYaml} rows={12} />}
              right={valid === null ? <OutputBox value="" placeholder="Validation result appears here" /> : (
                <div className="rounded-xl border border-zinc-200 p-3.5 text-sm dark:border-zinc-800">
                  <p className="font-semibold">{valid.startsWith("Looks") ? "Likely valid ✓" : "Needs attention"}</p>
                  <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">{valid}</p>
                </div>
              )} />
          </div>
        )}
      </Panel>
    </ToolScaffold>
  );
}

/* ================= ENV ================= */

export function EnvTool() {
  const tool = TOOL_MAP.env;
  const [tab, setTab] = useState("format");
  const [input, setInput] = useState('API_URL=https://api.example.com\nDEBUG=true\nPORT=8080\n# comment\nSECRET="s3cret value"\nPORT=9090');
  const [json, setJson] = useState('{\n  "API_URL": "https://api.example.com",\n  "PORT": "8080"\n}');
  const [other, setOther] = useState("API_URL=https://api.example.com\nPORT=9090\nNEW_FLAG=1");

  const parsed = useMemo(() => parseEnv(input), [input]);
  const errors = parsed.filter((e) => e.error);
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    parsed.forEach((e) => { if (e.key) seen.set(e.key, (seen.get(e.key) ?? 0) + 1); });
    return [...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k);
  }, [parsed]);

  const conv = useMemo(() => {
    try {
      if (tab === "tojson") return { ok: true as const, text: envToJson(input) };
      if (tab === "fromjson") return { ok: true as const, text: jsonToEnv(json) };
      if (tab === "sort") {
        const rows = parsed.filter((e) => !e.error);
        return { ok: true as const, text: [...rows].sort((a, b) => a.key.localeCompare(b.key)).map((e) => `${e.key}=${/[\s#"']/.test(e.value) ? JSON.stringify(e.value) : e.value}`).join("\n") + "\n" };
      }
      if (tab === "diff") {
        const a = new Map(parseEnv(input).filter((e) => !e.error).map((e) => [e.key, e.value]));
        const b = new Map(parseEnv(other).filter((e) => !e.error).map((e) => [e.key, e.value]));
        const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
        const lines = keys.map((k) => {
          if (!a.has(k)) return `+ ${k}=${b.get(k)} (added)`;
          if (!b.has(k)) return `- ${k} (removed)`;
          return a.get(k) === b.get(k) ? `  ${k} (same)` : `~ ${k}: ${a.get(k)} → ${b.get(k)}`;
        });
        return { ok: true as const, text: lines.join("\n") };
      }
      // format
      return {
        ok: true as const,
        text: input.split("\n").map((l) => {
          const t = l.trim();
          if (!t || t.startsWith("#") || t.startsWith("export ")) return l;
          const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
          if (!m) return l;
          return `${m[1]}=${m[2].trim()}`;
        }).join("\n"),
      };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [tab, input, json, other, parsed]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Inject into Compose", to: "/docker" }, { label: "Generate secrets", to: "/secrets" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "format", label: "Format" }, { id: "sort", label: "Sort" }, { id: "tojson", label: ".env → JSON" }, { id: "fromjson", label: "JSON → .env" }, { id: "diff", label: "Diff" }]} active={tab} onChange={setTab} />
        {(errors.length > 0 || dupes.length > 0) && (
          <div className="mt-3 space-y-2">
            {errors.map((e, i) => <ErrorCallout key={i} title={`Line ${e.line}`} message={e.error!} />)}
            {dupes.length > 0 && <ErrorCallout title="Duplicate keys" message={dupes.join(", ")} hint="Last value wins at runtime — remove the stale entry." />}
          </div>
        )}
        <div className="mt-3">
          {tab === "fromjson" ? (
            <Split left={<CodeArea label="JSON input" value={json} onChange={setJson} rows={10} />} right={conv.ok ? <OutputBox value={conv.text} label="Output .env" filename=".env" /> : <ErrorCallout title="Cannot convert" message={conv.err} />} />
          ) : tab === "diff" ? (
            <Split left={<><CodeArea label="Config A" value={input} onChange={setInput} rows={8} /><div className="mt-3"><CodeArea label="Config B" value={other} onChange={setOther} rows={8} /></div></>} right={conv.ok ? <OutputBox value={conv.text} label="Diff" filename="env.diff" /> : <ErrorCallout title="Error" message={conv.err} />} />
          ) : (
            <Split left={<CodeArea label=".env input" value={input} onChange={setInput} rows={12} accept=".env" onFile={(t) => setInput(t)} />}
              right={conv.ok ? <OutputBox value={conv.text} label={tab === "tojson" ? "JSON" : ".env"} filename={tab === "tojson" ? "env.json" : ".env"} /> : <ErrorCallout title="Cannot convert" message={conv.err} />} />
          )}
        </div>
        <p className="mt-2 text-[12px] text-zinc-500">Values are parsed in memory only — nothing is stored or sent anywhere.</p>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= CRON ================= */

export function CronTool() {
  const tool = TOOL_MAP.cron;
  const [expr, setExpr] = useState("*/15 * * * *");
  const [human, setHuman] = useState("every 15 minutes");
  const [m, setM] = useState("*/15");
  const [h, setH] = useState("*");
  const [dom, setDom] = useState("*");
  const [mon, setMon] = useState("*");
  const [dow, setDow] = useState("*");

  const res = useMemo(() => {
    try {
      const desc = describeCron(expr);
      const runs = nextCronRuns(expr, 5);
      return { ok: true as const, desc, runs };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [expr]);

  const guess = useMemo(() => humanToCron(human), [human]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "K8s CronJob YAML", to: "/kubernetes" }, { label: "Schedule CI runs", to: "/cicd" }, { label: "Check timestamps", to: "/timestamp" }]}
      onExample={() => setExpr(tool.example?.value ?? "")}>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel className="p-4">
          <PresetControl
            toolId="cron"
            config={{ expression: expr, humanDescription: human }}
            onApply={(config) => {
              const next = String(config.expression ?? expr);
              setExpr(next);
              setHuman(String(config.humanDescription ?? human));
              const parts = next.trim().split(/\s+/);
              if (parts.length === 5) { setM(parts[0]); setH(parts[1]); setDom(parts[2]); setMon(parts[3]); setDow(parts[4]); }
            }}
          />
          <Field label="Cron expression" hint="minute hour day month weekday — supports lists, ranges, steps and names">
            <TextInput value={expr} onChange={(e) => setExpr(e.target.value)} className="font-mono text-[15px]" placeholder="*/15 * * * *" spellCheck={false} />
          </Field>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {[["Minute", m, setM], ["Hour", h, setH], ["Day", dom, setDom], ["Month", mon, setMon], ["Weekday", dow, setDow]].map(([label, v, set]) => (
              <Field key={label as string} label={label as string}>
                <TextInput value={v as string} onChange={(e) => { (set as (v: string) => void)(e.target.value); }} className="font-mono text-[13px]" onBlur={() => { try { parseCron(`${m} ${h} ${dom} ${mon} ${dow}`); setExpr(`${m} ${h} ${dom} ${mon} ${dow}`); } catch { /* keep */ } }} />
              </Field>
            ))}
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS_SAFE.map((p) => (
                <button key={p.expr} type="button" onClick={() => { setExpr(p.expr); const parts = p.expr.split(" "); setM(parts[0]); setH(parts[1]); setDom(parts[2]); setMon(parts[3]); setDow(parts[4]); }}
                  className={cn("rounded-lg border px-2.5 py-1.5 text-[12.5px] transition", expr === p.expr ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400")}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            {!res.ok ? <ErrorCallout title="Invalid cron" message={res.err} hint='Five fields: minute hour day month weekday. Example: "0 9 * * 1-5" = weekdays 9AM.' />
              : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <p className="text-[14px] font-semibold text-emerald-800 dark:text-emerald-200">{res.desc}</p>
                  <div className="mt-2.5 space-y-1">
                    {res.runs.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 font-mono text-[12.5px] text-zinc-700 dark:text-zinc-300">
                        <span className="text-zinc-400">{i + 1}.</span> {d.toLocaleString()}
                        <span className="text-zinc-400">· {d.toISOString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
          <ActionBar>
            <Btn variant="primary" onClick={() => setExpr(`${m} ${h} ${dom} ${mon} ${dow}`)}>Apply fields</Btn>
          </ActionBar>
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-[13px] font-bold">Human → Cron</p>
            <Field label="Describe it" className="mt-2"><TextInput value={human} onChange={(e) => setHuman(e.target.value)} placeholder="every 15 minutes" /></Field>
            {guess ? (
              <div className="mt-2 rounded-lg bg-zinc-100 p-2.5 font-mono text-[13px] dark:bg-zinc-800">
                {guess}
                <button type="button" onClick={() => setExpr(guess)} className="ml-2 text-[12px] font-semibold text-emerald-600">Use →</button>
              </div>
            ) : <p className="mt-2 text-[12.5px] text-zinc-500">Try “every 15 minutes”, “daily at 3am”, “weekdays at 9”.</p>}
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-bold">Export</p>
            <div className="mt-2 space-y-2">
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">K8s CronJob</p>
                <pre className="mt-1 overflow-auto rounded-lg bg-zinc-950 p-2.5 font-mono text-[11.5px] text-zinc-100">schedule: "{expr || "*/15 * * * *"}"</pre></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">GitHub Actions</p>
                <pre className="mt-1 overflow-auto rounded-lg bg-zinc-950 p-2.5 font-mono text-[11.5px] text-zinc-100">- cron: '{expr || "*/15 * * * *"}'</pre></div>
            </div>
          </Panel>
        </div>
      </div>
    </ToolScaffold>
  );
}
