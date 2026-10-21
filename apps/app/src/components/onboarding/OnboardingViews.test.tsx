// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentStep, type OnboardingAgent } from "./OnboardingViews";
import {
  resolveFreeAgentOffer,
  type AgentSetupState,
} from "./onboarding-model";

function agent(id: string, state: AgentSetupState): OnboardingAgent {
  return { id, name: id, provider: { id, logoUrl: null }, state };
}

function renderAgents(agents: OnboardingAgent[]) {
  const handlers = {
    onSignIn: vi.fn(),
    onInstall: vi.fn(),
    onViewInstallLog: vi.fn(),
    onCancelSignIn: vi.fn(),
    onGetNodejs: vi.fn(),
    onSetUpFreeAgent: vi.fn(),
    onCreateChatGptAccount: vi.fn(),
    onRecheck: vi.fn(),
  };
  render(
    <AgentStep
      machineName="bee"
      agents={agents}
      freeAgentOffer={resolveFreeAgentOffer(agents)}
      {...handlers}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe("AgentStep", () => {
  it("offers the install log only on the agent whose install failed", () => {
    const handlers = renderAgents([
      agent("claude-code", { status: "install", canInstall: true }),
      agent("codex", {
        status: "installFailed",
        message: "Install failed",
        canInstall: true,
      }),
      agent("pi", { status: "installing" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "View log" }));

    expect(handlers.onViewInstallLog).toHaveBeenCalledExactlyOnceWith("codex");
    expect(handlers.onInstall).not.toHaveBeenCalled();
  });

  it("keeps the install log reachable when the machine offers no retry", () => {
    const handlers = renderAgents([
      agent("codex", {
        status: "installFailed",
        message: "Install failed",
        canInstall: false,
      }),
    ]);

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View log" }));

    expect(handlers.onViewInstallLog).toHaveBeenCalledExactlyOnceWith("codex");
  });

  it("sends an agent that needs Node.js to the download instead of an install that cannot run", () => {
    const handlers = renderAgents([agent("pi", { status: "needsNodejs" })]);

    expect(screen.getByText("Needs Node.js to install")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Install/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Get Node.js (opens nodejs.org)" }),
    );

    expect(handlers.onGetNodejs).toHaveBeenCalledOnce();
  });

  it("offers Codex as the free path when no agent is ready, and hides it once one is", () => {
    const handlers = renderAgents([
      agent("claude-code", { status: "install", canInstall: true }),
      agent("codex", { status: "install", canInstall: true }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Set up Codex" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a free ChatGPT account (opens chatgpt.com)",
      }),
    );

    expect(handlers.onSetUpFreeAgent).toHaveBeenCalledOnce();
    expect(handlers.onCreateChatGptAccount).toHaveBeenCalledOnce();

    cleanup();
    renderAgents([
      agent("claude-code", { status: "ready", detail: null }),
      agent("codex", { status: "install", canInstall: true }),
    ]);
    expect(screen.queryByRole("button", { name: "Set up Codex" })).toBeNull();
  });
});
