import { useEffect, useState } from "react";
import { AgentRow, AgentStep, OnboardingLayout, ProjectsStep, type OnboardingAgent } from "@/components/onboarding/OnboardingViews";
import { defaultSelectedRepoPaths, shortRemoteName, type AgentSetupState } from "@/components/onboarding/onboarding-model";
import { useHostDiscoveredRepos, usePrimaryHost } from "@/hooks/queries/host-queries";
import { useSystemProviders } from "@/hooks/queries/system-queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { nativeGuidanceFixture } from "./native-fixture-selection";
import { guidanceAgentChoices } from "./native-agent-fixture";
import { guidanceProjectFixture } from "./native-project-fixture";

const steps = [{ id: "agent", label: "Agent" }, { id: "projects", label: "Projects" }] as const;
function open(kind: string) { window.location.href = `/?guidancePrototype=${kind}`; }

export default function NativeSetupPrototype() {
  const [step, setStep] = useState<"agent" | "projects">(nativeGuidanceFixture?.kind === "setup-projects" ? "projects" : "agent");
  const [agentStates, setAgentStates] = useState<Record<string, AgentSetupState>>({});
  const [showMore, setShowMore] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const host = usePrimaryHost();
  const providers = useSystemProviders(host ? { hostId: host.id } : { enabled: false });
  const reposQuery = useHostDiscoveredRepos(host?.id ?? null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [folderEntry, setFolderEntry] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const discoveredRepos = reposQuery.data?.repos ?? [];
  const projectFixture = guidanceProjectFixture(discoveredRepos, Date.now());
  const repos = projectFixture?.repos ?? discoveredRepos;
  const chosen = selection ?? projectFixture?.selected ?? defaultSelectedRepoPaths(repos, Date.now());
  const choices = guidanceAgentChoices();
  const stateFor = (id: string): AgentSetupState => agentStates[id] ?? { status: "install", canInstall: true };
  const setAgentState = (id: string, state: AgentSetupState) => setAgentStates(current => ({ ...current, [id]: state }));
  const ready = Object.values(agentStates).some(state => state.status === "ready");
  useEffect(() => {
    const timers = Object.entries(agentStates).flatMap(([id, state]) => {
      if (state.status !== "installing" && state.status !== "signingIn") return [];
      return [window.setTimeout(() => setAgentStates(current => ({
        ...current,
        [id]: state.status === "installing"
          ? { status: "signIn", reason: "signedOut", canSignIn: true }
          : nativeGuidanceFixture?.agentOutcome === "failed"
            ? { status: "signIn", reason: "failed", canSignIn: true }
            : { status: "ready", detail: "Signed in" },
      })), state.status === "installing" ? 1800 : 15000)];
    });
    return () => timers.forEach(window.clearTimeout);
  }, [agentStates]);
  const handlers = {
    onInstall: (id: string) => setAgentState(id, { status: "installing" }),
    onSignIn: (id: string) => setAgentState(id, { status: "signingIn" }),
    onCancelSignIn: (id: string) => setAgentState(id, { status: "signIn", reason: "signedOut", canSignIn: true }),
    onViewInstallLog: (id: string) => setLog(id),
  };
  const featured: OnboardingAgent[] = choices.map(agent => ({
    ...agent, provider: agent, state: stateFor(agent.id),
    expanded: stateFor(agent.id).status === "signingIn"
      ? <p className="mt-3 text-xs text-muted-foreground" role="status">Finish signing in in your browser…</p> : null,
  }));
  const moreAgents: OnboardingAgent[] = (providers.data ?? [])
    .filter(provider => !choices.some(agent => agent.id === provider.id))
    .map(provider => ({ id: provider.id, name: provider.displayName, provider, state: stateFor(provider.id) }));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelection(next);
  };
  const repoRows = repos.map(repo => ({
    id: repo.path, name: repo.name, path: projectFixture?.displayPath(repo.path) ?? repo.path, remote: shortRemoteName(repo.originUrl),
    lastActive: formatRelativeTime({ timestamp: Date.parse(repo.lastActivityAt), now: Date.now() }),
    added: repo.projectId !== null,
  })).concat(folders.map(path => ({ id: path, name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path, path, remote: null, lastActive: "Selected folder", added: false })));

  return <div className="flex h-dvh w-full flex-col bg-background" data-guidance-prototype="setup">
    {step === "agent" ? <OnboardingLayout
      step="agent" steps={steps} showSkipAll={false} title="Connect a coding agent"
      description="Choose the agent you want to work with."
      primaryLabel="Continue" primaryDisabled={!ready} onPrimary={() => setStep("projects")}
      onSelectStep={() => {}} onSkipAll={() => open("no-agent")}
      footerNote={<>Threads can't start until one agent is ready. <button className="rounded-sm underline underline-offset-2 hover:text-foreground" onClick={() => open("no-agent")}>Continue without an agent</button></>}
    >
      <ul data-guidance-focus="agent" className="flex flex-col gap-3">
        {featured.map(agent => <AgentRow key={agent.id} agent={agent} prominent {...handlers} />)}
      </ul>
      {moreAgents.length > 0 && <div>
        <button className="rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>More agents ({moreAgents.length})</button>
        {showMore && <div className="mt-3"><AgentStep machineName={host?.name ?? null} agents={moreAgents} {...handlers} onRecheck={() => void providers.refetch()} /></div>}
      </div>}
      {log && <p className="text-xs text-muted-foreground">{log}: no install errors in this fixture.</p>}
    </OnboardingLayout> : <OnboardingLayout
      step="projects" steps={steps} title="Add your projects"
      description="Git repos on this computer that you've worked in over the last 30 days."
      primaryLabel={`Import ${chosen.size} ${chosen.size === 1 ? "project" : "projects"}`}
      primaryDisabled={chosen.size === 0} onPrimary={() => open("suggestions")}
      secondaryLabel="Skip" onSecondary={() => open("jobs")}
      onBack={() => setStep("agent")} onSelectStep={() => setStep("agent")} onSkipAll={() => open("jobs")}
    >
      <ProjectsStep
        status={reposQuery.isPending ? { kind: "scanning" } : reposQuery.isError ? { kind: "error", message: "Couldn't read the folders on this computer." } : { kind: "results", truncated: reposQuery.data?.truncated ?? false }}
        repos={repoRows} selectedIds={chosen} onToggle={toggle}
        onSelectAll={() => setSelection(new Set(repoRows.filter(repo => !repo.added).map(repo => repo.id)))}
        onSelectNone={() => setSelection(new Set())} onAddFolder={() => setFolderEntry(true)}
        onRetry={() => void reposQuery.refetch()} folderAction="button"
      />
      {folderEntry && <label className="flex flex-col gap-2 text-sm">Folder path
        <input autoFocus className="rounded-md border border-input bg-background px-3 py-2" placeholder="Path to your project" onKeyDown={event => {
          const path = event.currentTarget.value.trim();
          if (event.key !== "Enter" || !path) return;
          setFolders(current => current.includes(path) || repos.some(repo => repo.path === path) ? current : [...current, path]);
          setSelection(new Set([...chosen, path]));
          setFolderEntry(false);
        }} />
        <span className="text-xs text-muted-foreground">Press Enter to select this folder for the prototype.</span>
      </label>}
      <button data-guidance-focus="project" className="self-start rounded-sm text-xs text-muted-foreground hover:text-foreground" onClick={() => open("jobs")}>Start something new</button>
    </OnboardingLayout>}
  </div>;
}
