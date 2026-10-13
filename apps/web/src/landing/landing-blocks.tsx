import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import blackstoneLogo from "../assets/company-logos/blackstone.png";
import datadogLogo from "../assets/company-logos/datadog.svg";
import figmaLogo from "../assets/company-logos/figma.svg";
import metaLogo from "../assets/company-logos/meta.svg";
import moodysLogo from "../assets/company-logos/moodys.png";
import notionLogo from "../assets/company-logos/notion.png";
import ownerLogo from "../assets/company-logos/owner.png";
import pendoLogo from "../assets/company-logos/pendo.svg";
import renderLogo from "../assets/company-logos/render.svg";
import shortcutLogo from "../assets/company-logos/shortcut.svg";
import simileLogo from "../assets/company-logos/simile.svg";
import { trackLandingEvent } from "./analytics";
import { CommandButton } from "./command-button";
import { DownloadLink } from "./cta";
import { useDesktopPlatform } from "./desktop-platform";
import { LinuxIcon, OpenAiIcon } from "./icons";
import {
  ChevronDown,
  ChevronRight,
  GitBranchIcon,
  Maximize2,
  PanelIcon,
  Paperclip,
  SendIcon,
  Spinner,
} from "./mock-icons";
import type { CtaPlacement, DesktopPlatform } from "./site";
import { CLI_COMMAND, DESKTOP_DOWNLOADS } from "./site";

const COMPANY_PROOF = [
  ["Meta", metaLogo, "glyph"],
  ["Figma", figmaLogo, "glyph"],
  ["Notion", notionLogo, "tile"],
  ["Datadog", datadogLogo, "glyph"],
  ["Owner.com", ownerLogo, "tile"],
  ["Pendo", pendoLogo, "glyph"],
  ["Blackstone", blackstoneLogo, "tile"],
  ["Moody's", moodysLogo, "tile"],
  ["Shortcut", shortcutLogo, "tile"],
  ["Render", renderLogo, "glyph"],
  ["Simile", simileLogo, "glyph"],
] as const;

export function CompanyProofLogos({
  duplicate = false,
}: {
  duplicate?: boolean;
}) {
  return (
    <ul className="company-proof-logos" aria-hidden={duplicate || undefined}>
      {COMPANY_PROOF.map(([name, logo, kind]) => (
        <li key={name} className="company-proof-company">
          <img
            src={logo}
            alt={duplicate ? "" : name}
            width={20}
            height={20}
            className={kind === "tile" ? "company-proof-tile" : undefined}
          />
          <span aria-hidden="true">{name}</span>
        </li>
      ))}
    </ul>
  );
}

const AppleSolidIcon: IconSvgElement = [
  [
    "path",
    {
      d: "M12 5.75C12 3.75 13.5 1.75 15.5 1.75C15.5 3.75 14 5.75 12 5.75Z",
      fill: "currentColor",
      key: "0",
    },
  ],
  [
    "path",
    {
      d: "M12.5 8.09001C11.9851 8.09001 11.5867 7.92646 11.1414 7.74368C10.5776 7.51225 9.93875 7.25 8.89334 7.25C7.02235 7.25 4 8.74945 4 12.7495C4 17.4016 7.10471 22.25 9.10471 22.25C9.77426 22.25 10.3775 21.9871 10.954 21.7359C11.4815 21.5059 11.9868 21.2857 12.5 21.2857C13.0132 21.2857 13.5185 21.5059 14.046 21.7359C14.6225 21.9871 15.2257 22.25 15.8953 22.25C17.2879 22.25 18.9573 19.8992 20 16.9008C18.3793 16.2202 17.338 14.618 17.338 12.75C17.338 11.121 18.2036 10.0398 19.5 9.25C18.5 7.75 17.0134 7.25 15.9447 7.25C14.8993 7.25 14.2604 7.51225 13.6966 7.74368C13.2514 7.92646 13.0149 8.09001 12.5 8.09001Z",
      fill: "currentColor",
      key: "1",
    },
  ],
];

function DesktopDownloadIcon({ platform }: { platform: DesktopPlatform }) {
  if (platform === "linux") {
    return <LinuxIcon className="btn-ic" />;
  }
  return <HugeiconsIcon icon={AppleSolidIcon} className="btn-ic" />;
}

export function InstallOptions({ placement }: { placement: CtaPlacement }) {
  const platform = useDesktopPlatform();
  const download = DESKTOP_DOWNLOADS[platform];
  const otherPlatform: DesktopPlatform =
    platform === "macos" ? "linux" : "macos";
  return (
    <div className="install-options">
      <div className="install-actions">
        <span className="install-choice">
          <DownloadLink
            placement={placement}
            platform={platform}
            className="btn btn-primary btn-install"
          >
            <DesktopDownloadIcon platform={platform} />
            {download.buttonLabel}
          </DownloadLink>
          <span className="install-note">
            {download.note}
            {" · "}
            <DownloadLink
              placement={placement}
              platform={otherPlatform}
              className="install-note-link"
            >
              Also for {DESKTOP_DOWNLOADS[otherPlatform].label}
            </DownloadLink>
          </span>
        </span>
        <span className="install-choice">
          <CommandButton
            command={CLI_COMMAND}
            label={`Copy browser install command: ${CLI_COMMAND}`}
            size="hero"
            onCopy={() =>
              trackLandingEvent({
                name: "landing_cli_command_copied",
                properties: { placement, command: CLI_COMMAND },
              })
            }
          />
          <span className="install-note">
            Windows (via WSL), Intel Macs &amp; remote machines
          </span>
        </span>
      </div>
    </div>
  );
}

export function useScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const targets = Array.from(document.querySelectorAll("[data-reveal]"));
    for (const target of targets) {
      if (target.getBoundingClientRect().top > window.innerHeight * 0.9) {
        target.classList.add("reveal-pending");
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove("reveal-pending");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const target of targets) {
      observer.observe(target);
    }
    return () => observer.disconnect();
  }, []);
}

export function Band({
  title,
  flip,
  visual,
  children,
}: {
  title: string;
  flip?: boolean;
  visual: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={flip ? "band band-flip" : "band"} data-reveal>
      <div className="band-grid">
        <div className="band-copy">
          <h2>{title}</h2>
          {children}
        </div>
        <div className="band-visual">{visual}</div>
      </div>
    </section>
  );
}

export function useCycle(holdMs: number, fadeMs: number) {
  const [cycle, setCycle] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let holdTimer = 0;
    let fadeTimer = 0;
    const schedule = () => {
      holdTimer = window.setTimeout(() => {
        setLeaving(true);
        fadeTimer = window.setTimeout(() => {
          setCycle((c) => c + 1);
          setLeaving(false);
          schedule();
        }, fadeMs);
      }, holdMs);
    };
    schedule();
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(fadeTimer);
    };
  }, [holdMs, fadeMs]);
  return { cycle, leaving };
}

export type BuildMessage = {
  role: "user" | "agent" | "tool";
  text: string;
};

export type BuildScenario = {
  label: string;
  title: string;
  prompt: string;
  promptWidth: string;
  branch: string;
  messages: BuildMessage[];
  panelName: string;
  panel: ReactNode;
};

export function BuildDemo({ scenario }: { scenario: BuildScenario }) {
  const { cycle, leaving } = useCycle(10600, 500);
  const promptStyle = {
    "--customize-prompt-width": scenario.promptWidth,
  } as CSSProperties;
  return (
    <div className="mockup-wrap mockup-wrap-customize">
      <div className="mock mock-customize-mobile" aria-label={scenario.label}>
        <div className="mock-bar">
          <div className="bar-left">
            <span className="bar-menu" aria-hidden>
              <PanelIcon className="ri bar-ic" />
            </span>
          </div>
          <div className="bar-main">
            <span className="bar-title">{scenario.title}</span>
          </div>
        </div>

        <div
          className={
            leaving
              ? "mock-body customize-body leaving"
              : "mock-body customize-body"
          }
          key={cycle}
        >
          <div className="main">
            <div className="feed feed-live customize-feed">
              {scenario.messages.map((message, i) => {
                const style = { animationDelay: `${3.2 + i * 0.68}s` };
                if (message.role === "user") {
                  return (
                    <div
                      className="msg-user customize-msg"
                      key={`${message.role}-${message.text}`}
                      style={style}
                    >
                      {message.text}
                    </div>
                  );
                }
                if (message.role === "tool") {
                  return (
                    <div
                      className="msg-step customize-msg customize-tool"
                      key={`${message.role}-${message.text}`}
                      style={style}
                    >
                      <ChevronRight className="step-chev" />
                      {message.text}
                    </div>
                  );
                }
                return (
                  <div
                    className="msg-say customize-msg"
                    key={`${message.role}-${message.text}`}
                    style={style}
                  >
                    {message.text}
                  </div>
                );
              })}
            </div>

            <div className="composer customize-composer">
              <div className="composer-box customize-composer-box">
                <div className="composer-top">
                  <span className="composer-input customize-typeahead">
                    <span className="customize-type-text" style={promptStyle}>
                      {scenario.prompt}
                    </span>
                    <span className="customize-caret" aria-hidden />
                  </span>
                  <Maximize2 className="cb-expand" />
                </div>
                <div className="composer-row">
                  <span className="model">
                    <OpenAiIcon className="model-ic" />
                    Codex
                    <ChevronDown className="chev-sm" />
                  </span>
                  <span className="composer-actions" aria-hidden>
                    <Paperclip className="composer-clip" />
                    <span className="send-btn customize-send">
                      <SendIcon className="send-ic" />
                    </span>
                  </span>
                </div>
              </div>
              <div className="context-row customize-context">
                <span className="ctx">
                  <GitBranchIcon className="ctx-ic" />
                  <span className="ctx-branch">{scenario.branch}</span>
                </span>
                <Spinner className="ctx-spin" />
              </div>
            </div>
          </div>

          <div className="plugin-panel" aria-hidden>
            <div className="plugin-panel-bar">
              <span className="plugin-panel-name">{scenario.panelName}</span>
              <span className="plugin-panel-badge">Plugin</span>
            </div>
            {scenario.panel}
          </div>
        </div>
      </div>
    </div>
  );
}
