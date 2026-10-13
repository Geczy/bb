import { useEffect, useState } from "react";

import { trackLandingEvent } from "./analytics";
import { CommandButton } from "./command-button";
import { GitHubLink, SubscribeSection } from "./cta";
import {
  Band,
  BuildDemo,
  CompanyProofLogos,
  InstallOptions,
  useScrollReveal,
} from "./landing-blocks";
import { Spinner } from "./mock-icons";
import type { Persona } from "./personas";
import {
  PROVIDER_LABEL,
  ProviderMark,
  WalkLine,
} from "./agent-thread-mock";
import { OrchestraDemo } from "./orchestra-demo";
import { SiteFooter, SiteNav } from "./site-chrome";

const STEP_HOLD_MS = 6200;

function Walkthrough({ persona }: { persona: Persona }) {
  const { steps } = persona.walkthrough;
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (pinned) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(
      () => setActive((i) => (i + 1) % steps.length),
      STEP_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, pinned, steps.length]);
  const step = steps[active];
  if (!step) return null;
  return (
    <section className="pw-section pw-walk" data-reveal>
      <div className="pw-head">
        <h2 className="sec-title">{persona.walkthrough.title}</h2>
        <p>{persona.walkthrough.intro}</p>
      </div>
      <div className="pw-walk-grid">
        <ol className="pw-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                className={i === active ? "pw-step is-active" : "pw-step"}
                aria-current={i === active ? "step" : undefined}
                onClick={() => {
                  setActive(i);
                  setPinned(true);
                }}
              >
                <span className="pw-step-num">{i + 1}</span>
                <span className="pw-step-body">
                  <span className="pw-step-title">{s.title}</span>
                  <span className="pw-step-detail">{s.detail}</span>
                </span>
                {i === active && !pinned ? (
                  <span
                    className="pw-step-timer"
                    key={active}
                    style={{ animationDuration: `${STEP_HOLD_MS}ms` }}
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ol>
        <div className="pw-window" aria-live="polite">
          <div className="pw-window-bar">
            <span className="pw-window-title">{step.thread.title}</span>
            <span className="pw-window-prov">
              <ProviderMark provider={step.thread.provider} />
              {PROVIDER_LABEL[step.thread.provider]}
            </span>
          </div>
          <div className="pw-feed" key={active}>
            {step.thread.messages.map((message, i) => (
              <WalkLine
                key={`${message.role}-${message.text}`}
                message={message}
                delay={0.15 + i * 0.45}
              />
            ))}
          </div>
          <div className="pw-window-foot">
            {step.thread.status === "running" ? (
              <>
                <Spinner className="pw-foot-spin" />
                Working
              </>
            ) : (
              <>
                <span className="pw-foot-dot" />
                {step.thread.status === "waiting" ? "Needs you" : "Done"}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OrchestraHero({ persona }: { persona: Persona }) {
  return (
    <section className="pw-orch" aria-label="Agents working together">
      <OrchestraDemo orchestra={persona.orchestra} />
    </section>
  );
}

function AppActions({ persona }: { persona: Persona }) {
  const { actions } = persona;
  return (
    <Band
      title="You don’t need to learn bb. Just ask it."
      visual={
        <div className="pw-window pw-actions">
          <div className="pw-window-bar">
            <span className="pw-window-title">{actions.title}</span>
            <span className="pw-window-prov">
              <ProviderMark provider={actions.provider} />
              {PROVIDER_LABEL[actions.provider]}
            </span>
          </div>
          <div className="pw-feed">
            {actions.messages.map((message, i) => (
              <WalkLine
                key={`${message.role}-${message.text}`}
                message={message}
                delay={0.2 + i * 0.5}
              />
            ))}
          </div>
        </div>
      }
    >
      <p>
        <strong>Ask it to set things up.</strong> Anything you can do in bb, an
        agent can do for you.
      </p>
      <p>
        <strong>Ask it to run the work.</strong> One agent starts the others,
        hands out tasks, and checks in on them, so you never end up managing
        agents yourself.
      </p>
      <p>
        <strong>Ask it for what&rsquo;s missing.</strong> Describe a tool bb
        doesn&rsquo;t have, and an agent builds it for you as a plugin.
      </p>
    </Band>
  );
}

function Jobs({ persona }: { persona: Persona }) {
  return (
    <section className="pw-section" data-reveal>
      <div className="pw-head">
        <h2 className="sec-title">{persona.jobsTitle}</h2>
      </div>
      <div className="pw-jobs">
        {persona.jobs.map((job) => (
          <article className="pw-job" key={job.title}>
            <h3>{job.title}</h3>
            <p className="pw-job-outcome">{job.outcome}</p>
            <p className="pw-job-prompt">{job.prompt}</p>
            <p className="pw-job-uses">
              {job.uses.map((use) => (
                <span key={use}>{use}</span>
              ))}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Plugins({ persona }: { persona: Persona }) {
  return (
    <>
      <section className="pw-section pw-plugins" data-reveal>
        <div className="pw-head">
          <h2 className="sec-title">Make it yours.</h2>
          <p>{persona.customize}</p>
        </div>
        <h3 className="pw-subhead">{persona.pluginsTitle}</h3>
        <div className="pw-plugin-grid">
          {persona.plugins.map((plugin) => (
            <article className="pw-plugin" key={plugin.id}>
              <div className="pw-plugin-shot">
                {plugin.screenshot ? (
                  <img src={plugin.screenshot} alt="" loading="lazy" />
                ) : (
                  <span className="pw-plugin-glyph" aria-hidden>
                    {plugin.name.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="pw-plugin-body">
                <h3>
                  {plugin.name}
                  <span className="pw-plugin-badge">
                    {plugin.builtIn ? "Built in" : "Community"}
                  </span>
                </h3>
                <p>{plugin.summary}</p>
                {plugin.builtIn ? (
                  <p className="pw-plugin-included">Included with bb</p>
                ) : (
                  <CommandButton
                    command={`bb plugin install ${plugin.id}`}
                    label={`Copy install command for ${plugin.name}`}
                    size="compact"
                    onCopy={() =>
                      trackLandingEvent({
                        name: "marketplace_install_command_copied",
                        properties: { plugin_id: plugin.id },
                      })
                    }
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <Band
        title={persona.build.title}
        flip
        visual={<BuildDemo scenario={persona.build.scenario} />}
      >
        {persona.build.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="pw-build-prompt">
          <span>Try it:</span> {persona.build.scenario.prompt}
        </p>
      </Band>
    </>
  );
}

function Setup({ persona }: { persona: Persona }) {
  return (
    <section className="pw-section" data-reveal>
      <div className="pw-head">
        <h2 className="sec-title">What&rsquo;s built in, and what you set up</h2>
        <p>
          bb runs the agents you already use. Here is everything between
          installing it and the walkthrough above.
        </p>
      </div>
      <div className="pw-table-wrap">
        <table className="pw-table">
          <thead>
            <tr>
              <th scope="col">To do this</th>
              <th scope="col">bb gives you</th>
              <th scope="col">You set up</th>
            </tr>
          </thead>
          <tbody>
            {persona.setup.map((row) => (
              <tr key={row.task}>
                <th scope="row">{row.task}</th>
                <td>
                  <span
                    className={
                      row.source === "Built in"
                        ? "pw-source is-built"
                        : "pw-source"
                    }
                  >
                    {row.source}
                  </span>
                  {row.provides}
                </td>
                <td>{row.youSetUp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Faq({ persona }: { persona: Persona }) {
  return (
    <section className="pw-section" data-reveal>
      <div className="pw-head">
        <h2 className="sec-title">Questions</h2>
      </div>
      <div className="pw-faq">
        {persona.faq.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PersonaPage({ persona }: { persona: Persona }) {
  useScrollReveal();
  return (
    <div className="wrap">
      <SiteNav current="for" />

      <header className="hero pw-hero">
        <p className="pw-eyebrow">{persona.eyebrow}</p>
        <h1>{persona.hero}</h1>
        {persona.heroBody.map((paragraph) => (
          <p className="sub" key={paragraph}>
            {paragraph}
          </p>
        ))}
        <InstallOptions placement="hero" />
        <p className="pw-prereq">
          Runs on the Claude or ChatGPT plan you already pay for · Free and MIT
          open source
        </p>
      </header>

      <OrchestraHero persona={persona} />
      <Walkthrough persona={persona} />
      <AppActions persona={persona} />
      <Plugins persona={persona} />
      <Jobs persona={persona} />
      <Setup persona={persona} />
      <Faq persona={persona} />

      <section className="pw-proof" aria-labelledby="pw-proof-title">
        <h2 id="pw-proof-title">Used by builders at</h2>
        <CompanyProofLogos />
      </section>

      <section className="closer" data-reveal>
        <h2 className="sec-title">{persona.closer.title}</h2>
        <p>{persona.closer.body}</p>
        <InstallOptions placement="closer" />
        <div className="cta-row cta-row-secondary">
          <GitHubLink placement="closer" className="btn btn-ghost">
            View on GitHub
          </GitHubLink>
        </div>
      </section>

      <SubscribeSection
        reveal
        blurb={
          <>Product updates and what we&rsquo;re building next. No spam.</>
        }
      />

      <SiteFooter />
    </div>
  );
}
