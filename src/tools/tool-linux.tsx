import { useMemo, useState } from "react";
import { numToSymbolic, symbolicToNum, explainChmod, umaskResult } from "../lib/engine";
import {
  buildGrep, buildFind, buildTar, buildRsync, buildSsh, buildScp, sshConfigBlock,
  inspectSshKey, systemdService, systemdTimer, shQuote,
} from "../lib/blueprints";
import { TOOL_MAP } from "../lib/registry";
import {
  ToolScaffold, Panel, Tabs, Field, TextInput, Select, Check, Btn,
  OutputBox, ErrorCallout, Split, Stat,
} from "../components/ui";
import { cn } from "../utils/cn";

/* ================= CHMOD ================= */

export function ChmodTool() {
  const tool = TOOL_MAP.chmod;
  const [num, setNum] = useState("755");
  const [sym, setSym] = useState("rwxr-xr-x");
  const [checks, setChecks] = useState<boolean[]>([true, true, true, true, false, true, true, false, true]);
  const [user, setUser] = useState("www-data");
  const [group, setGroup] = useState("www-data");
  const [path, setPath] = useState("/var/www/app");
  const [recur, setRecur] = useState(false);
  const [umask, setUmask] = useState("022");
  const [acl, setAcl] = useState("u:deploy:rwx,g:www-data:r-x,o::---");

  const res = useMemo(() => {
    try {
      const symbolic = numToSymbolic(num);
      const back = symbolicToNum(symbolic);
      const expl = explainChmod(num);
      const um = umaskResult(umask);
      return { ok: true as const, symbolic, back, expl, um };
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [num, umask]);

  const fromChecks = () => {
    const n = [0, 1, 2].map((cls) => (checks[cls * 3] ? 4 : 0) + (checks[cls * 3 + 1] ? 2 : 0) + (checks[cls * 3 + 2] ? 1 : 0)).join("");
    setNum(n);
    setSym(numToSymbolic(n));
  };
  const toggleCheck = (i: number) => {
    const c = [...checks]; c[i] = !c[i]; setChecks(c);
    const n = [0, 1, 2].map((cls) => (c[cls * 3] ? 4 : 0) + (c[cls * 3 + 1] ? 2 : 0) + (c[cls * 3 + 2] ? 1 : 0)).join("");
    setNum(n);
  };

  const presets = ["777", "755", "750", "700", "644", "640", "600", "400"];

  return (
    <ToolScaffold tool={tool} next={[{ label: "chown builder (below)", to: "/chmod" }, { label: "SSH key permissions", to: "/ssh" }, { label: "Fix permission denied", to: "/errors" }]}
      onExample={() => setNum("755")}>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Numeric (octal)"><TextInput value={num} onChange={(e) => { setNum(e.target.value); try { setSym(numToSymbolic(e.target.value)); } catch { /* keep */ } }} className="w-28 text-center font-mono text-xl font-bold" maxLength={4} /></Field>
            <Field label="Symbolic" className="flex-1"><TextInput value={sym} onChange={(e) => { setSym(e.target.value); try { setNum(symbolicToNum(e.target.value)); } catch { /* keep */ } }} className="font-mono text-xl" maxLength={10} /></Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => { setNum(p); setSym(numToSymbolic(p)); }}
                className={cn("rounded-lg border px-2.5 py-1 font-mono text-[13px]", num === p ? "border-emerald-500 text-emerald-600" : "border-zinc-200 text-zinc-500 dark:border-zinc-700")}>{p}</button>
            ))}
          </div>
          {!res.ok ? <div className="mt-3"><ErrorCallout title="Invalid mode" message={res.err} hint="Use 3–4 octal digits (0–7), e.g. 755 or 0644." /></div> : (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {(["Owner", "Group", "Other"] as const).map((who, cls) => (
                  <div key={who} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">{who} <span className="ml-1 font-mono text-emerald-600">{num.slice(-3)[cls]}</span></p>
                    <p className="mt-1 font-mono text-lg font-bold tracking-wider">{res.symbolic.slice(cls * 3, cls * 3 + 3)}</p>
                    <div className="mt-2 space-y-1.5">
                      {(["Read", "Write", "Execute"] as const).map((perm, bi) => (
                        <label key={perm} className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-400">
                          <input type="checkbox" checked={checks[cls * 3 + bi]} onChange={() => toggleCheck(cls * 3 + bi)} className="h-4 w-4 accent-emerald-600" />
                          <span className="font-mono font-bold text-zinc-400">{"rwx"[bi]}</span> {perm}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-zinc-100 p-3 text-[13px] leading-relaxed dark:bg-zinc-900">
                <p className="font-mono font-bold">{num} → {res.symbolic}</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{res.expl.owner}</p>
                <p className="text-zinc-600 dark:text-zinc-400">{res.expl.group}</p>
                <p className="text-zinc-600 dark:text-zinc-400">{res.expl.other}</p>
                <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-300">{res.expl.summary}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn variant="primary" onClick={fromChecks}>Apply checkboxes</Btn>
                <Btn onClick={() => { const c = num.slice(-3).split("").flatMap((d) => { const v = parseInt(d, 10); return [!!(v & 4), !!(v & 2), !!(v & 1)]; }); setChecks(c); }}>Sync from {num}</Btn>
              </div>
            </>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-[13px] font-bold">chown builder</p>
            <div className="mt-2 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="User"><TextInput value={user} onChange={(e) => setUser(e.target.value)} className="font-mono text-[13px]" /></Field>
                <Field label="Group"><TextInput value={group} onChange={(e) => setGroup(e.target.value)} className="font-mono text-[13px]" /></Field>
              </div>
              <Field label="Path"><TextInput value={path} onChange={(e) => setPath(e.target.value)} className="font-mono text-[13px]" /></Field>
              <Check label="Recursive (-R)" checked={recur} onChange={setRecur} />
              <OutputBox value={`chown ${recur ? "-R " : ""}${user || "<user>"}:${group || "<group>"} ${shQuote(path || "<path>")}\nchmod ${recur ? "-R " : ""}${num || "755"} ${shQuote(path || "<path>")}`} label="" rows={3} filename="perms.sh" />
            </div>
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-bold">umask calculator</p>
            <Field label="umask" className="mt-2"><TextInput value={umask} onChange={(e) => setUmask(e.target.value)} className="w-28 font-mono" maxLength={4} /></Field>
            {res.ok && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Stat label="New files" value={res.um.file} /><Stat label="New dirs" value={res.um.dir} />
              </div>
            )}
            <p className="mt-2 text-[12px] text-zinc-500">Files start at 666, dirs at 777, minus the umask bits.</p>
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-bold">ACL explanation</p>
            <Field label="getfacl / setfacl entries" className="mt-2"><TextInput value={acl} onChange={(e) => setAcl(e.target.value)} className="font-mono text-[12px]" /></Field>
            <div className="mt-2 rounded-lg bg-zinc-100 p-2.5 dark:bg-zinc-900">
              {acl.split(",").map((entry, index) => {
                const [kind, name, perms] = entry.trim().split(":");
                const who = kind === "u" ? `user ${name || "owner"}` : kind === "g" ? `group ${name || "owner group"}` : kind === "m" ? "effective mask" : kind === "o" ? "everyone else" : kind;
                const actions = [perms?.includes("r") ? "read" : "", perms?.includes("w") ? "write" : "", perms?.includes("x") ? "execute" : ""].filter(Boolean).join(", ") || "no permissions";
                return <p key={index} className="font-mono text-[11.5px] text-zinc-600 dark:text-zinc-400"><span className="font-bold text-zinc-800 dark:text-zinc-200">{who}:</span> {perms || "?"} ({actions})</p>;
              })}
            </div>
            <p className="mt-2 text-[11.5px] text-zinc-500">ACL mask entries can reduce named user/group permissions. Verify effective rights with <code className="font-mono">getfacl path</code>.</p>
          </Panel>
        </div>
      </div>
    </ToolScaffold>
  );
}

/* ================= LINUX COMMANDS ================= */

export function LinuxCmdTool() {
  const tool = TOOL_MAP["linux-cmd"];
  const [tab, setTab] = useState("grep");
  const [grep, setGrep] = useState({ pattern: "TODO", path: ".", recursive: true, ignoreCase: false, lineNumbers: true, invert: false, count: false, fixed: false });
  const [find, setFind] = useState({ path: ".", name: "*.log", type: "f", newer: "", exec: "" });
  const [tar, setTar] = useState({ mode: "create", archive: "backup.tar.gz", sources: "src/ data/", gzip: true, verbose: true });
  const [rsync, setRsync] = useState({ src: "./build/", dest: "deploy@prod:/var/www/app/", archive: true, compress: true, delete: false, dry: true, exclude: "node_modules\n.git" });
  const [awk, setAwk] = useState({ field: "$2", delim: "", file: "access.log" });
  const [sed, setSed] = useState({ find: "http://", replace: "https://", file: "config.txt", global: true });

  const out = useMemo(() => {
    try {
      switch (tab) {
        case "grep": return { ok: true as const, text: buildGrep(grep) };
        case "find": return { ok: true as const, text: buildFind(find) };
        case "tar": return { ok: true as const, text: buildTar(tar) };
        case "rsync": return { ok: true as const, text: buildRsync(rsync) };
        case "awk": return { ok: true as const, text: `awk ${awk.delim ? `-F ${shQuote(awk.delim)} ` : ""}'{ print ${awk.field || "$0"} }' ${shQuote(awk.file || "<file>")}` };
        case "sed": return { ok: true as const, text: `sed -i 's|${sed.find || "<find>"}|${sed.replace || "<replace>"}|${sed.global ? "g" : ""}' ${shQuote(sed.file || "<file>")}` };
        case "curl": return { ok: true as const, text: `curl -fsSL ${shQuote("https://example.com/install.sh")} -o install.sh` };
        case "wget": return { ok: true as const, text: `wget -q --show-progress ${shQuote("https://example.com/file.tar.gz")}` };
        default: return { ok: true as const, text: "" };
      }
    } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [tab, grep, find, tar, rsync, awk, sed]);

  const G = (k: keyof typeof grep) => ({
    checked: !!grep[k],
    onChange: (v: boolean) => setGrep({ ...grep, [k]: v }),
  });

  return (
    <ToolScaffold tool={tool} next={[{ label: "SSH to run it remotely", to: "/ssh" }, { label: "Fix permission denied", to: "/errors" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "grep", label: "grep" }, { id: "find", label: "find" }, { id: "tar", label: "tar" }, { id: "rsync", label: "rsync" }, { id: "awk", label: "awk" }, { id: "sed", label: "sed" }, { id: "curl", label: "curl" }, { id: "wget", label: "wget" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          <Split
            left={
              <div className="space-y-3">
                {tab === "grep" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Pattern"><TextInput value={grep.pattern} onChange={(e) => setGrep({ ...grep, pattern: e.target.value })} className="font-mono" /></Field>
                    <Field label="Path"><TextInput value={grep.path} onChange={(e) => setGrep({ ...grep, path: e.target.value })} className="font-mono" /></Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Check label="-r recursive" {...G("recursive")} /><Check label="-i ignore case" {...G("ignoreCase")} />
                    <Check label="-n line numbers" {...G("lineNumbers")} /><Check label="-v invert" {...G("invert")} />
                    <Check label="-c count" {...G("count")} /><Check label="-F fixed string" {...G("fixed")} />
                  </div>
                </>)}
                {tab === "find" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Path"><TextInput value={find.path} onChange={(e) => setFind({ ...find, path: e.target.value })} className="font-mono" /></Field>
                    <Field label="-name"><TextInput value={find.name} onChange={(e) => setFind({ ...find, name: e.target.value })} className="font-mono" /></Field>
                  </div>
                  <Field label="-type"><Select value={find.type} onChange={(e) => setFind({ ...find, type: e.target.value })}><option value="">any</option><option value="f">file</option><option value="d">directory</option><option value="l">symlink</option></Select></Field>
                  <Field label="-exec (optional)"><TextInput value={find.exec} onChange={(e) => setFind({ ...find, exec: e.target.value })} className="font-mono" placeholder="e.g. rm / chmod 644" /></Field>
                </>)}
                {tab === "tar" && (<>
                  <Field label="Mode"><Select value={tar.mode} onChange={(e) => setTar({ ...tar, mode: e.target.value })}><option value="create">create</option><option value="extract">extract</option><option value="list">list</option></Select></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Archive"><TextInput value={tar.archive} onChange={(e) => setTar({ ...tar, archive: e.target.value })} className="font-mono" /></Field>
                    <Field label="Sources"><TextInput value={tar.sources} onChange={(e) => setTar({ ...tar, sources: e.target.value })} className="font-mono" /></Field>
                  </div>
                  <div className="flex gap-2"><Check label="gzip (-z)" checked={tar.gzip} onChange={(v) => setTar({ ...tar, gzip: v })} /><Check label="verbose (-v)" checked={tar.verbose} onChange={(v) => setTar({ ...tar, verbose: v })} /></div>
                </>)}
                {tab === "rsync" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Source"><TextInput value={rsync.src} onChange={(e) => setRsync({ ...rsync, src: e.target.value })} className="font-mono" /></Field>
                    <Field label="Dest"><TextInput value={rsync.dest} onChange={(e) => setRsync({ ...rsync, dest: e.target.value })} className="font-mono" /></Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Check label="-a archive" checked={rsync.archive} onChange={(v) => setRsync({ ...rsync, archive: v })} />
                    <Check label="-z compress" checked={rsync.compress} onChange={(v) => setRsync({ ...rsync, compress: v })} />
                    <Check label="--delete" checked={rsync.delete} onChange={(v) => setRsync({ ...rsync, delete: v })} />
                    <Check label="--dry-run" checked={rsync.dry} onChange={(v) => setRsync({ ...rsync, dry: v })} />
                  </div>
                  <Field label="Excludes (one per line)"><textarea value={rsync.exclude} onChange={(e) => setRsync({ ...rsync, exclude: e.target.value })} rows={2} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
                </>)}
                {tab === "awk" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Field"><TextInput value={awk.field} onChange={(e) => setAwk({ ...awk, field: e.target.value })} className="font-mono" placeholder="$2 or $1,$3" /></Field>
                    <Field label="Delimiter (-F)"><TextInput value={awk.delim} onChange={(e) => setAwk({ ...awk, delim: e.target.value })} className="font-mono" placeholder="default: whitespace" /></Field>
                  </div>
                  <Field label="File"><TextInput value={awk.file} onChange={(e) => setAwk({ ...awk, file: e.target.value })} className="font-mono" /></Field>
                </>)}
                {tab === "sed" && (<>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Find"><TextInput value={sed.find} onChange={(e) => setSed({ ...sed, find: e.target.value })} className="font-mono" /></Field>
                    <Field label="Replace"><TextInput value={sed.replace} onChange={(e) => setSed({ ...sed, replace: e.target.value })} className="font-mono" /></Field>
                  </div>
                  <Field label="File"><TextInput value={sed.file} onChange={(e) => setSed({ ...sed, file: e.target.value })} className="font-mono" /></Field>
                  <Check label="Replace all (g flag)" checked={sed.global} onChange={(v) => setSed({ ...sed, global: v })} />
                </>)}
                {(tab === "curl" || tab === "wget") && <p className="text-[13px] text-zinc-500">For full request building & language conversion, use the <a href="#/curl" className="font-medium text-emerald-600">cURL Toolkit →</a></p>}
              </div>
            }
            right={out.ok ? <OutputBox value={out.text} label="Command" filename="cmd.sh" /> : <ErrorCallout title="Error" message={out.err} />}
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= SSH ================= */

export function SshTool() {
  const tool = TOOL_MAP.ssh;
  const [tab, setTab] = useState("ssh");
  const [user, setUser] = useState("deploy");
  const [host, setHost] = useState("203.0.113.10");
  const [port, setPort] = useState("22");
  const [key, setKey] = useState("~/.ssh/id_ed25519");
  const [fwd, setFwd] = useState("8080:localhost:80");
  const [src, setSrc] = useState("./dist/");
  const [dest, setDest] = useState("deploy@203.0.113.10:/var/www/app/");
  const [keyText, setKeyText] = useState("");

  const sshCmd = useMemo(() => buildSsh({ user, host, port, key, forward: tab === "ssh" ? fwd : "", extra: "" }), [user, host, port, key, fwd, tab]);
  const scpCmd = useMemo(() => buildScp({ src, dest, port, key, recursive: true }), [src, dest, port, key]);
  const cfg = useMemo(() => sshConfigBlock({ host: "prod", hostname: host, user, port, key }), [host, user, port, key]);
  const keyInfo = useMemo(() => {
    if (!keyText.trim()) return null;
    try { return { ok: true as const, v: inspectSshKey(keyText) }; } catch (e) { return { ok: false as const, err: (e as Error).message }; }
  }, [keyText]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Key file needs 600", to: "/chmod" }, { label: "Sync with rsync", to: "/linux-commands" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "ssh", label: "SSH" }, { id: "scp", label: "SCP" }, { id: "config", label: "ssh_config" }, { id: "keys", label: "Key inspector" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          {(tab === "ssh" || tab === "scp" || tab === "config") && (
            <Split
              left={
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="User"><TextInput value={user} onChange={(e) => setUser(e.target.value)} className="font-mono" /></Field>
                    <Field label="Host"><TextInput value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Port"><TextInput value={port} onChange={(e) => setPort(e.target.value)} className="font-mono" /></Field>
                    <Field label="Identity file"><TextInput value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" /></Field>
                  </div>
                  {tab === "ssh" && <Field label="Local forward (-L)"><TextInput value={fwd} onChange={(e) => setFwd(e.target.value)} className="font-mono" placeholder="8080:localhost:80" /></Field>}
                  {tab === "scp" && (<>
                    <Field label="Source"><TextInput value={src} onChange={(e) => setSrc(e.target.value)} className="font-mono" /></Field>
                    <Field label="Destination"><TextInput value={dest} onChange={(e) => setDest(e.target.value)} className="font-mono" /></Field>
                  </>)}
                  {tab === "config" && <p className="text-[12.5px] text-zinc-500">Append to <code className="font-mono">~/.ssh/config</code>, then connect with <code className="font-mono">ssh prod</code>.</p>}
                </div>
              }
              right={<OutputBox value={tab === "ssh" ? sshCmd : tab === "scp" ? scpCmd : cfg} label={tab === "ssh" ? "SSH command" : tab === "scp" ? "SCP command" : "~/.ssh/config"} filename={tab === "config" ? "ssh_config" : "ssh.sh"} />}
            />
          )}
          {tab === "keys" && (
            <Split
              left={<div>
                <Field label="Paste public key or PEM block" hint="Inspection is local. Never paste a private key into any website you don't trust — including this one.">
                  <textarea value={keyText} onChange={(e) => setKeyText(e.target.value)} rows={6} spellCheck={false}
                    placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI… user@host"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 font-mono text-[12.5px] dark:border-zinc-700 dark:bg-zinc-900" />
                </Field>
                <div className="mt-2"><Btn variant="secondary" onClick={() => setKeyText("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzF5nyzZz2Rwf1A5o5o5o5o5o5o5o5o5o5o5o5o demo@example")}>Load sample</Btn></div>
              </div>}
              right={!keyInfo ? <OutputBox value="" placeholder="Key analysis appears here" /> : !keyInfo.ok ? <ErrorCallout title="Unrecognized key" message={keyInfo.err} />
                : <OutputBox value={Object.entries(keyInfo.v).map(([k, v]) => `${k}: ${v}`).join("\n")} label="Analysis" />}
            />
          )}
        </div>
      </Panel>
    </ToolScaffold>
  );
}

/* ================= SYSTEMD ================= */

export function SystemdTool() {
  const tool = TOOL_MAP.systemd;
  const [tab, setTab] = useState("service");
  const [desc, setDesc] = useState("My web API");
  const [exec, setExec] = useState("/usr/bin/myapp --port 8080");
  const [user, setUser] = useState("www-data");
  const [workdir, setWorkdir] = useState("/opt/myapp");
  const [restart, setRestart] = useState("on-failure");
  const [env, setEnv] = useState("PORT=8080\nLOG_LEVEL=info");
  const [sched, setSched] = useState("*-*-* 03:00:00");
  const [svc, setSvc] = useState("myapp.service");
  const [lines, setLines] = useState("50");

  const out = useMemo(() => {
    if (tab === "service") return systemdService({ desc, exec, user, workdir, restart, env });
    if (tab === "timer") return systemdTimer({ desc, schedule: sched });
    if (tab === "systemctl") return `# enable + start\nsudo systemctl enable --now ${svc}\n\n# status / restart / logs\nsystemctl status ${svc}\nsudo systemctl restart ${svc}\njournalctl -u ${svc} -n ${lines} --no-pager`;
    return `journalctl -u ${svc} -n ${lines} --no-pager\njournalctl -u ${svc} --since "1 hour ago" -p err\njournalctl -f -u ${svc}  # follow`;
  }, [tab, desc, exec, user, workdir, restart, env, sched, svc, lines]);

  return (
    <ToolScaffold tool={tool} next={[{ label: "Schedule with cron instead", to: "/cron" }, { label: "Run via Docker", to: "/docker" }]}>
      <Panel className="p-4">
        <Tabs tabs={[{ id: "service", label: "Service" }, { id: "timer", label: "Timer" }, { id: "systemctl", label: "systemctl" }, { id: "journal", label: "journalctl" }]} active={tab} onChange={setTab} />
        <div className="mt-4">
          <Split
            left={
              <div className="space-y-3">
                {(tab === "service" || tab === "timer") && <Field label="Description"><TextInput value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>}
                {tab === "service" && (<>
                  <Field label="ExecStart"><TextInput value={exec} onChange={(e) => setExec(e.target.value)} className="font-mono" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="User"><TextInput value={user} onChange={(e) => setUser(e.target.value)} className="font-mono" /></Field>
                    <Field label="WorkingDirectory"><TextInput value={workdir} onChange={(e) => setWorkdir(e.target.value)} className="font-mono" /></Field>
                  </div>
                  <Field label="Restart"><Select value={restart} onChange={(e) => setRestart(e.target.value)}><option>on-failure</option><option>always</option><option>no</option><option>on-abnormal</option></Select></Field>
                  <Field label="Environment (KEY=value per line)"><textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] dark:border-zinc-700 dark:bg-zinc-900" /></Field>
                </>)}
                {tab === "timer" && <Field label="OnCalendar" hint="systemd format, e.g. *-*-* 03:00:00 or hourly"><TextInput value={sched} onChange={(e) => setSched(e.target.value)} className="font-mono" /></Field>}
                {(tab === "systemctl" || tab === "journal") && (<>
                  <Field label="Service"><TextInput value={svc} onChange={(e) => setSvc(e.target.value)} className="font-mono" /></Field>
                  <Field label="Lines"><TextInput value={lines} onChange={(e) => setLines(e.target.value)} className="font-mono" /></Field>
                </>)}
              </div>
            }
            right={<OutputBox value={out} label={tab === "service" ? "myapp.service" : tab === "timer" ? "myapp.timer" : "Commands"} filename={tab === "service" ? "myapp.service" : tab === "timer" ? "myapp.timer" : "systemd.sh"} rows={14} />}
          />
        </div>
      </Panel>
    </ToolScaffold>
  );
}
