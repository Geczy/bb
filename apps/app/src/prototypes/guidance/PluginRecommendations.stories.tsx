import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createStore, Provider as JotaiProvider } from "jotai";
import { PERSONAL_PROJECT_ID, type ResolvedThreadExecutionOptions } from "@bb/domain";
import { updateThreadTabsRequestSchema, type ThreadTabsResponse } from "@bb/server-contract";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppCommandProvider } from "@/components/commands/AppCommandProvider";
import { QuickCreateProjectProvider } from "@/hooks/useQuickCreateProject";
import { SplitThreadArea } from "@/views/thread-detail/SplitThreadArea";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { collectPluginAppRegistrations } from "@/lib/plugin-app-definition";
import { setPluginSlotRegistrations, removePluginSlotRegistrations } from "@/lib/plugin-slots";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import { makeThreadResponse, makeThreadTimelineResponse } from "@/test/fixtures/thread-responses";
import { conversationRow } from "@/test/fixtures/thread-timeline-rows";
import { makeProject, makeThreadListEntry, STORY_PROVIDERS_BY_ID } from "../../../.ladle/story-fixtures";
import { loadPluginAppDefinition } from "../../../.ladle/plugin-app-module";
import { hostsQueryKey, projectsQueryKey, sidebarNavigationQueryKey, threadDetailBootstrapQueryKey, threadQueryKey, threadTimelineQueryKey, threadPendingInteractionsQueryKey, threadQueuedMessagesQueryKey, systemConfigQueryKey, threadDefaultExecutionOptionsQueryKey, systemProvidersQueryKey } from "@/hooks/queries/query-keys";
import "./plugin-capture.css";

installTestPluginRuntime();
const threadListApp = await loadPluginAppDefinition(import.meta.glob<unknown>("../../../../../plugins/thread-list/app.tsx"));

export default { title: "guidance/Plugin recommendations", meta: { modelPickerCatalog: { environmentIds: [] } } };

const projectId = "proj_bb";
const fixtures = {
  install: {
    id: "thr_notebookexample",
    title: "Notebook results",
    prompt: "Walk me through the results in analysis.ipynb and show me the charts.",
    reply: "I reviewed analysis.ipynb. The model comparison shows precision improving from 81% to 89%, while recall stays near 76%. The second chart shows most errors in the smallest input group.\n\nI can explain the results, but bb has no notebook viewer installed to render the saved charts inline.",
    caption: "Maya is reviewing analysis.ipynb. Notebook Viewer is an example; author and review metadata are illustrative.",
  },
  build: {
    id: "thr_testpanelexample",
    title: "Flaky tests",
    prompt: "Show me the flaky-test list again. Can we keep it visible in bb?",
    reply: "The flaky tests are composer focus, queued reply, and draft recovery. They passed on retry in CI run #1842.\n\nYou’ve asked for this list three times this week. I can summarize it here, but bb has no panel that keeps it visible as runs change.",
    caption: "Maya keeps asking for the flaky-test list. Test Results is an example template for a panel inside bb.",
  },
};

function PluginRecommendation({ kind }: { kind: keyof typeof fixtures }) {
  const fixture = fixtures[kind];
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const store = useMemo(() => {
    const next = createStore();
    next.set(splitLayoutAtom, { root: { type: "pane", paneId: "guidance-plugin", content: { kind: "thread", projectId, threadId: fixture.id } }, focusedPaneId: "guidance-plugin" });
    return next;
  }, [fixture.id]);
  useEffect(() => {
    const originalOptions = client.getDefaultOptions();
    client.setDefaultOptions({ queries: { enabled: false, staleTime: Infinity, gcTime: Infinity, retry: false }, mutations: { retry: false } });
    const project = makeProject({ id: projectId, name: "bb", sources: [] });
    const thread = makeThreadResponse({ id: fixture.id, projectId, environmentId: null, title: fixture.title, titleFallback: fixture.title, providerId: "claude-code", canSpawnChild: false });
    const providers = [...STORY_PROVIDERS_BY_ID.values()];
    client.setQueryData(systemProvidersQueryKey(), providers);
    client.setQueryData(hostsQueryKey(), []);
    client.setQueryData(projectsQueryKey(), [project]);
    client.setQueryData(sidebarNavigationQueryKey(), { sections: [], projects: [{ ...project, defaultExecutionOptions: null, threads: [makeThreadListEntry({ ...thread, lastReadAt: Date.now() })] }], personalProject: { ...makeProject({ id: PERSONAL_PROJECT_ID, kind: "personal", name: "Personal", sources: [] }), defaultExecutionOptions: null, threads: [] } });
    const execution: ResolvedThreadExecutionOptions = { model: "claude-sonnet-5", serviceTier: "default", reasoningLevel: "medium", permissionMode: "auto", source: "client/turn/start" };
    client.setQueryData(threadDefaultExecutionOptionsQueryKey(fixture.id), execution);
    client.setQueryData(threadQueryKey(fixture.id), thread);
    client.setQueryData(threadDetailBootstrapQueryKey(fixture.id), thread);
    client.setQueryData(threadPendingInteractionsQueryKey(fixture.id), []);
    client.setQueryData(threadQueuedMessagesQueryKey(fixture.id), []);
    client.setQueryData(threadTimelineQueryKey(fixture.id), makeThreadTimelineResponse({ completedTurnDisplay: "flat", maxSeq: 2, rows: [conversationRow({ id: `${fixture.id}:user`, role: "user", text: fixture.prompt, threadId: fixture.id, turnId: "turn_example", sourceSeqStart: 1 }), conversationRow({ id: `${fixture.id}:assistant`, role: "assistant", text: fixture.reply, threadId: fixture.id, turnId: "turn_example", sourceSeqStart: 2 })], timelinePage: { returnedSegmentCount: 1 } }));
    let tabs: ThreadTabsResponse = { revision: 1, tabs: [] };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
      const path = url.pathname;
      let data: unknown;
      if (path.endsWith("/rpc/listPreferences")) data = { ok: true, result: { preferences: {} } };
      else if (path === "/api/v1/system/providers") data = providers;
      else if (path.endsWith("/child-summary")) data = { nonDeletedChildCount: 0, unarchivedDescendantCount: 0 };
      else if (path === "/api/v1/system/config") data = client.getQueryData(systemConfigQueryKey());
      else if (path === "/api/v1/sidebar-bootstrap") data = client.getQueryData(sidebarNavigationQueryKey());
      else if (path === "/api/v1/projects") data = [project];
      else if (path === "/api/v1/hosts") data = [];
      else if (path === `/api/v1/threads/${fixture.id}/default-execution-options`) data = execution;
      else if (path === `/api/v1/threads/${fixture.id}/tabs`) {
        const request = input instanceof Request ? input : new Request(url, init);
        if (request.method === "PUT") {
          const update = updateThreadTabsRequestSchema.parse(await request.json());
          tabs = { revision: tabs.revision + 1, tabs: update.tabs };
        }
        data = tabs;
      }
      else if (path === `/api/v1/threads/${fixture.id}/timeline`) data = client.getQueryData(threadTimelineQueryKey(fixture.id));
      else if (path === `/api/v1/threads/${fixture.id}/interactions` || path.endsWith("/queued-messages") || path.endsWith("/prompt-history")) data = [];
      else if (path === `/api/v1/threads/${fixture.id}` || path.endsWith("/read")) data = thread;
      else return new Response(JSON.stringify({ error: "Unavailable in this isolated visual fixture" }), { status: 404, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(data ?? null), { headers: { "content-type": "application/json" } });
    };
    setPluginSlotRegistrations("thread-list", makePluginRegistrationSet({ threadLists: collectPluginAppRegistrations(threadListApp).threadLists }));
    void navigate(`/projects/${projectId}/threads/${fixture.id}`, { replace: true });
    setReady(true);
    return () => {
      window.fetch = originalFetch;
      client.setDefaultOptions(originalOptions);
      removePluginSlotRegistrations("thread-list");
    };
  }, [client, fixture, navigate]);
  if (!ready || !location.pathname.includes(fixture.id)) return null;
  return <JotaiProvider store={store}>
    <div data-plugin-capture className="flex h-dvh flex-col bg-background text-foreground">
      <div data-capture-caption className="flex h-9 shrink-0 items-center border-b border-border px-5 text-xs text-muted-foreground">{fixture.caption}</div>
      <div className="min-h-0 flex-1">
        <QuickCreateProjectProvider><AppCommandProvider><AppLayout>
          <SplitThreadArea routeContent={{ kind: "thread", projectId, threadId: fixture.id }} />
        </AppLayout></AppCommandProvider></QuickCreateProjectProvider>
      </div>
    </div>
  </JotaiProvider>;
}

export const InstallExample = () => <PluginRecommendation kind="install" />;
export const BuildExample = () => <PluginRecommendation kind="build" />;
