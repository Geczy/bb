import { useEffect, useState } from "react";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import { ProviderIcon } from "@/components/plugin/ProviderIcon";
import { AgentStep, OnboardingLayout, ProjectsStep } from "@/components/onboarding/OnboardingViews";
import { defaultSelectedRepoPaths, shortRemoteName } from "@/components/onboarding/onboarding-model";
import { useHostDiscoveredRepos, usePrimaryHost } from "@/hooks/queries/host-queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { nativeGuidanceFixture } from "./native-fixture-selection";
import claudeLogo from "../../../../../plugins/provider-claude-code/icons/claude-code.svg";
import codexLogo from "../../../../../plugins/provider-codex/icons/codex.svg";

const steps = [{ id: "agent", label: "Agent" }, { id: "projects", label: "Projects" }] as const;
function open(kind: string) { window.location.href = `/?guidancePrototype=${kind}`; }

export default function NativeSetupPrototype() {
  const [step, setStep] = useState<"agent" | "projects">(nativeGuidanceFixture?.kind === "setup-projects" ? "projects" : "agent");
  const [stage, setStage] = useState<"idle" | "installing" | "signing-in" | "ready">("idle");
  const [agent, setAgent] = useState("Claude Code");
  const [alternative, setAlternative] = useState(false);
  const host = usePrimaryHost();
  const reposQuery = useHostDiscoveredRepos(host?.id ?? null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [folderEntry, setFolderEntry] = useState(false);
  const repos = reposQuery.data?.repos ?? [];
  const chosen = selection ?? new Set(defaultSelectedRepoPaths(repos, Date.now()));
  useEffect(() => {
    if (stage !== "installing" && stage !== "signing-in") return;
    const timer = window.setTimeout(() => setStage(stage === "installing" ? "signing-in" : "ready"), stage === "installing" ? 1800 : 4000);
    return () => window.clearTimeout(timer);
  }, [stage]);
  const setup = (name: string) => { setAgent(name); setStage("installing"); setAlternative(false); };
  return <div className="flex h-dvh w-full flex-col bg-background" data-guidance-prototype="setup">
    {step === "agent" ? <OnboardingLayout step="agent" steps={steps} showSkipAll={false} title="Connect a coding agent" description="bb runs the agents you already use. Set one up to run your first task." primaryLabel="Continue" onPrimary={() => setStep("projects")} onSelectStep={() => {}} onSkipAll={() => open("no-agent")} footerContent={<div className="flex w-full flex-col items-end gap-1.5">
      {stage === "ready" ? <Button size="sm" onClick={() => setStep("projects")}>Continue<Icon name="ArrowRight" /></Button> : <Button variant="ghost" size="sm" onClick={() => open("no-agent")}>Continue without an agent<Icon name="ArrowRight" /></Button>}
      {stage !== "ready" && <p className="max-w-sm text-right text-xs text-muted-foreground">You'll need a signed-in agent before bb can run a task. We'll keep your first message.</p>}
    </div>}>
      <div data-guidance-focus="agent" className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3"><ProviderIcon providerKind="agent" provider={{ id: agent === "Claude Code" ? "claude-code" : "codex", logoUrl: agent === "Claude Code" ? claudeLogo : codexLogo }} className="size-8" /><div><h2 className="text-base font-semibold">{agent}</h2><p className="text-xs text-muted-foreground">{agent === "Claude Code" ? "Recommended" : "Your selected agent"}</p></div></div>
        <p className="mt-4 text-sm text-muted-foreground">Install it here, then sign in with your account.</p>
        {stage === "idle" ? <Button className="mt-4" onClick={() => setup(agent)}>Set up {agent}</Button> : <div className="mt-4 flex items-center gap-2 text-sm" role="status"><Icon name={stage === "ready" ? "CircleCheck" : "Spinner"} className={stage === "ready" ? "size-4 text-success" : "size-4 animate-spin"} />{stage === "installing" ? `Installing ${agent}…` : stage === "signing-in" ? "Installed. Finish signing in in your browser…" : "Signed in. Ready for your first task."}</div>}
      </div>
      <div><Button variant="ghost" size="sm" aria-expanded={alternative} onClick={() => setAlternative(!alternative)}><Icon name={alternative ? "ChevronDown" : "ChevronRight"} />Use a different agent</Button>
        {alternative && <div className="mt-3"><AgentStep machineName={host?.name ?? "this computer"} agents={[{ id: "codex", name: "Codex", provider: { id: "codex", logoUrl: codexLogo }, state: { status: "install", canInstall: true } }]} onInstall={() => setup("Codex")} onSignIn={() => setup("Codex")} onViewInstallLog={() => {}} onCancelSignIn={() => setStage("idle")} onRecheck={() => {}} /></div>}
      </div>
    </OnboardingLayout> : <OnboardingLayout step="projects" steps={steps} showSkipAll={false} title="Add your projects" description="Git repos on this computer that you've worked in over the last 30 days." primaryLabel={chosen.size > 0 || newProject ? "Start using bb" : "Skip"} onPrimary={() => open(newProject || chosen.size === 0 ? "jobs" : "suggestions")} onBack={() => setStep("agent")} onSelectStep={() => setStep("agent")} onSkipAll={() => open("jobs")}>
      <ProjectsStep status={reposQuery.isPending ? { kind: "scanning" } : { kind: "results", truncated: reposQuery.data?.truncated ?? false }} repos={repos.map(repo => ({ id: repo.path, name: repo.name, path: repo.path, remote: shortRemoteName(repo.originUrl), lastActive: formatRelativeTime({ timestamp: Date.parse(repo.lastActivityAt), now: Date.now() }), added: repo.projectId !== null }))} selectedIds={chosen} onToggle={id => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); setSelection(next); }} onSelectAll={() => setSelection(new Set(repos.map(repo => repo.path)))} onSelectNone={() => setSelection(new Set())} onAddFolder={() => setFolderEntry(true)} onRetry={() => void reposQuery.refetch()} />
      {folderEntry && <label className="flex flex-col gap-2 text-sm">Folder path<input autoFocus className="rounded-md border border-input bg-background px-3 py-2" placeholder="Path to your project" onKeyDown={event => { if (event.key === "Enter" && event.currentTarget.value.trim()) { setNewProject(true); setFolderEntry(false); } }} /><span className="text-xs text-muted-foreground">Press Enter to select this folder for the prototype.</span></label>}
      <button data-guidance-focus="project" className="flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-state-hover" onClick={() => { setNewProject(true); setSelection(new Set()); }}><Icon name={newProject ? "CircleCheck" : "Plus"} className="size-4" /><span>{newProject ? "New project ready" : "Start something new"}</span></button>
    </OnboardingLayout>}
  </div>;
}
