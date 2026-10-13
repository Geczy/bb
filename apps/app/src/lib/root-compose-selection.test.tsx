// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { PERSONAL_PROJECT_ID } from "@bb/domain";
import { getPromptDraftAccessor } from "@/hooks/usePromptDraftStorage";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  useRootComposePlacement,
  useRootComposeReuseEnvironment,
  useRootComposeProjectId,
  rememberUsedRootComposeProject,
} from "./root-compose-selection";

beforeEach(() => {
  getPromptDraftAccessor({ kind: "new-thread" }).clear();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(cleanup);

describe("returning composer projects", () => {
  it.each([
    { saved: null, hasDraft: false, expected: "proj_last-used" },
    { saved: "proj_explicit", hasDraft: false, expected: "proj_explicit" },
    {
      saved: PERSONAL_PROJECT_ID,
      hasDraft: false,
      expected: PERSONAL_PROJECT_ID,
    },
    { saved: null, hasDraft: true, expected: PERSONAL_PROJECT_ID },
  ])(
    "restores $expected with saved=$saved and draft=$hasDraft",
    ({ saved, hasDraft, expected }) => {
      rememberUsedRootComposeProject("proj_last-used");
      if (saved !== null)
        window.localStorage.setItem("bb.root-compose.project-id", saved);
      const draft = getPromptDraftAccessor({ kind: "new-thread" });
      if (hasDraft) draft.setTextAndMentions("An unfinished prompt", []);
      const store = createStore();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      );
      const view = renderHook(useRootComposeProjectId, { wrapper });
      expect(view.result.current[0]).toBe(expected);
      view.unmount();
      draft.clear();
    },
  );

  it("keeps the tab's choice when another tab changes the saved project", () => {
    window.sessionStorage.setItem(
      "bb.root-compose.project-id",
      "proj_this-tab",
    );
    window.localStorage.setItem("bb.root-compose.project-id", "proj_other-tab");
    const store = createStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const view = renderHook(useRootComposeProjectId, { wrapper });
    expect(view.result.current[0]).toBe("proj_this-tab");
  });
});

describe("root compose targets across layout remounts", () => {
  it("persists placement into a fresh store, then clears it", () => {
    const store = createStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const useTargets = () => ({
      placement: useRootComposePlacement(),
      environment: useRootComposeReuseEnvironment(),
    });
    const first = renderHook(useTargets, { wrapper });
    act(() => {
      first.result.current.placement[1]({
        sectionId: "sec_research",
        pinned: true,
      });
      first.result.current.environment[1]("reuse:env_test");
    });
    first.unmount();
    const reloadedWrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={createStore()}>{children}</Provider>
    );
    const remounted = renderHook(useTargets, { wrapper: reloadedWrapper });
    expect(remounted.result.current.placement[0]).toEqual({
      sectionId: "sec_research",
      pinned: true,
    });
    expect(remounted.result.current.environment[0]).toBe("reuse:env_test");
    act(() => {
      remounted.result.current.placement[1]({ sectionId: null, pinned: false });
      remounted.result.current.environment[1](null);
    });
    remounted.unmount();
    const fresh = renderHook(useTargets, { wrapper: reloadedWrapper });
    expect(fresh.result.current.placement[0]).toEqual({
      sectionId: null,
      pinned: false,
    });
  });
});
