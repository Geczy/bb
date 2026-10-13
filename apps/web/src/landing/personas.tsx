import type { BuildScenario } from "./landing-blocks";
import type { WalkMessage, WalkProvider } from "./agent-thread-mock";
import type { Orchestra } from "./orchestra-demo";

type WalkStep = {
  title: string;
  detail: string;
  thread: {
    title: string;
    provider: WalkProvider;
    status: "running" | "waiting" | "done";
    messages: WalkMessage[];
  };
};

type Job = {
  title: string;
  outcome: string;
  prompt: string;
  uses: string[];
};

type FeaturedPlugin = {
  id: string;
  name: string;
  summary: string;
  screenshot?: string;
  builtIn?: boolean;
};

type SetupRow = {
  task: string;
  source: "Built in" | "Plugin" | "Not yet";
  provides: string;
  youSetUp: string;
};

export type Persona = {
  slug: string;
  navLabel: string;
  eyebrow: string;
  seoTitle: string;
  seoDescription: string;
  hero: string;
  heroBody: string[];
  walkthrough: { title: string; intro: string; steps: WalkStep[] };
  orchestra: Orchestra;
  actions: { title: string; provider: WalkProvider; messages: WalkMessage[] };
  jobsTitle: string;
  jobs: Job[];
  customize: string;
  pluginsTitle: string;
  plugins: FeaturedPlugin[];
  build: { title: string; body: string[]; scenario: BuildScenario };
  setup: SetupRow[];
  faq: { question: string; answer: string }[];
  closer: { title: string; body: string };
};

const SCREENSHOTS = "https://getbb.app/marketplace/v2/screenshots";

function PanelRows({ rows }: { rows: { key: string; title: string }[] }) {
  return (
    <div className="plugin-panel-rows">
      {rows.map((row, i) => (
        <div
          className="plugin-task"
          key={row.key}
          style={{ animationDelay: `${8.3 + i * 0.14}s` }}
        >
          <span className="plugin-task-key">{row.key}</span>
          <span className="plugin-task-title">{row.title}</span>
        </div>
      ))}
    </div>
  );
}

const PRODUCT_MANAGERS: Persona = {
  slug: "product-managers",
  navLabel: "Product managers",
  eyebrow: "bb for product managers",
  seoTitle: "Claude Code and Codex for product managers — bb",
  seoDescription:
    "Prototype in your team's real repo, ask the codebase questions, and review PRDs beside the chat. Free, open source, on the AI plans you already pay for.",
  hero: "Hand off the whole feature, not just the ticket.",
  heroBody: [
    "There’s no coordinator to set up. Claude Code, Codex, Grok, and Pi split the prototype, the research, and the spec, and check in with each other.",
  ],
  walkthrough: {
    title: "One issue, two prototypes, before your next meeting",
    intro:
      "A real PM task in bb, start to finish. Click any step to look closer.",
    steps: [
      {
        title: "Start from the issue",
        detail:
          "Open the Linear issue in bb and start a thread. The issue and your onboarding spec come with it.",
        thread: {
          title: "Users abandon setup at step 2",
          provider: "claude",
          status: "running",
          messages: [
            {
              role: "user",
              text: "Prototype two fixes: fewer fields, or a skip link. Use our existing components.",
            },
            { role: "tool", text: "Read LIN-482 and specs/onboarding.md" },
            { role: "tool", text: "Started a Codex thread for the skip link" },
            {
              role: "agent",
              text: "I’m building fewer fields here. The skip link is running in parallel.",
            },
          ],
        },
      },
      {
        title: "Run both options at once",
        detail:
          "Claude Code builds one, Codex builds the other. Each works on its own branch, so nothing touches main.",
        thread: {
          title: "Option B: skip link",
          provider: "codex",
          status: "running",
          messages: [
            { role: "tool", text: "Created branch bb/onboarding-skip-link" },
            { role: "tool", text: "Edited SetupStepTwo.tsx" },
            { role: "tool", text: "Started the dev server" },
            {
              role: "agent",
              text: "Option B is running. Opening it in bb’s browser.",
            },
          ],
        },
      },
      {
        title: "Answer from your phone",
        detail:
          "You’re in a meeting. bb pings your phone when an agent has a question, and you answer from there.",
        thread: {
          title: "Option A: fewer fields",
          provider: "claude",
          status: "waiting",
          messages: [
            { role: "event", text: "Push notification · Option A needs you" },
            {
              role: "agent",
              text: "Should “Company size” stay as an optional field, or go away entirely?",
            },
            {
              role: "user",
              text: "Remove it. We can ask during billing.",
            },
          ],
        },
      },
      {
        title: "Mark up the prototype",
        detail:
          "Click what you want changed in bb’s browser and send your notes with screenshots. If Claude hits its limit, hand the thread to Codex.",
        thread: {
          title: "Option A: fewer fields",
          provider: "codex",
          status: "running",
          messages: [
            {
              role: "user",
              text: "2 annotations: “Primary button is too loud” · “Cut this helper text in half”",
            },
            {
              role: "event",
              text: "Claude usage limit reached · Handed off to Codex with the thread’s context",
            },
            { role: "tool", text: "Updated the button variant and helper copy" },
            { role: "agent", text: "Both changes are in. Refresh to see them." },
          ],
        },
      },
      {
        title: "Give engineering something concrete",
        detail:
          "The agent posts a comparison and both branches on the issue, labeled as prototypes.",
        thread: {
          title: "Users abandon setup at step 2",
          provider: "claude",
          status: "done",
          messages: [
            { role: "tool", text: "Commented on LIN-482" },
            {
              role: "agent",
              text: "Posted a side-by-side of both options with links to their branches, labeled “prototype, not production”.",
            },
          ],
        },
      },
    ],
  },
  orchestra: {
    label:
      "A product lead thread asks Codex, Grok, and Claude Code to prepare an onboarding redesign together, redirects one mid-task, and two of them settle a detail between themselves",
    lead: { title: "Onboarding redesign", provider: "claude" },
    threads: [
      {
        title: "Onboarding redesign",
        provider: "claude",
        child: false,
        startAt: 0.2,
        doneAt: 9.4,
      },
      {
        title: "Prototype",
        provider: "codex",
        child: true,
        startAt: 1.5,
        doneAt: 7.4,
      },
      {
        title: "Competitor teardown",
        provider: "grok",
        child: true,
        startAt: 1.9,
        doneAt: 4.6,
      },
      {
        title: "Spec",
        provider: "claude",
        child: true,
        startAt: 2.3,
        doneAt: 8.6,
      },
      {
        title: "Weekly digest",
        provider: "codex",
        child: false,
        startAt: 0.4,
        doneAt: 60,
      },
    ],
    feed: [
      {
        kind: "user",
        text: "Get the onboarding redesign ready for Thursday’s review. Work together.",
        at: 0.6,
      },
      {
        kind: "to",
        target: "Prototype",
        text: "Build the 3-step flow with our components",
        at: 1.5,
      },
      {
        kind: "to",
        target: "Competitor teardown",
        text: "How do our three closest competitors onboard?",
        at: 1.9,
      },
      {
        kind: "to",
        target: "Spec",
        text: "Update the spec; the prototype is coming",
        at: 2.3,
      },
      {
        kind: "from",
        target: "Competitor teardown",
        text: "Two of three ask for team invites after setup, not before",
        at: 4.6,
      },
      {
        kind: "to",
        target: "Prototype",
        text: "Move team invites after setup",
        at: 5.2,
      },
      { kind: "group", count: 6, at: 7.8 },
      {
        kind: "say",
        text: "The prototype and spec are ready for review. Codex and Claude Code agreed on the empty state between themselves.",
        at: 9.2,
      },
    ],
  },
  actions: {
    title: "Set up the launch",
    provider: "claude",
    messages: [
      {
        role: "user",
        text: "Set up the onboarding launch: pin the spec, have a lead agent run the prototype and research threads, and add a panel that drafts release notes from merged PRs.",
      },
      {
        role: "tool",
        text: "Ran bb thread pin on Onboarding spec",
      },
      {
        role: "tool",
        text: "Ran bb thread spawn: Launch lead (Claude Code)",
      },
      {
        role: "tool",
        text: "Wrote plugin: release-notes",
      },
      {
        role: "agent",
        text: "Done. The spec is pinned, the launch lead is running the prototype and research threads, and Release notes is in your sidebar.",
      },
    ],
  },
  jobsTitle: "What PMs hand to bb",
  jobs: [
    {
      title: "Prototype in the real product",
      outcome:
        "A clickable version built with your team’s own components, ready to mark up.",
      prompt:
        "Read specs/onboarding-v2.md and prototype the new 3-step onboarding using our existing components. Run it and open it in the browser.",
      uses: ["Branch per thread", "In-app browser", "Browser Annotate"],
    },
    {
      title: "Ask the codebase",
      outcome:
        "Answers grounded in the actual code before the meeting, without pulling an engineer away.",
      prompt:
        "What happens today when a Free workspace hits its seat limit? List the files, the error users see, and anything that looks like a bug. Don’t change code.",
      uses: ["Thread on your repo", "Read-only by request"],
    },
    {
      title: "Review a PRD like a colleague’s",
      outcome:
        "Comment on a doc, deck, or sheet, then send every comment to the agent at once.",
      prompt:
        "Address my comments on pricing-prd.docx. Where you disagree, reply with your reasoning instead of editing.",
      uses: ["Doc Review"],
    },
    {
      title: "Monday digest on autopilot",
      outcome:
        "What shipped, what’s blocked, and new feedback themes, waiting for you every week.",
      prompt:
        "Every Monday at 8am, summarize Growth issues closed in Linear last week, group new feedback in /exports into themes, and draft my status update.",
      uses: ["Automations", "Linear", "Push notifications"],
    },
  ],
  customize:
    "bb bends to how your team works. Install plugins for the tools you already use. It’s open source, so nothing is off limits.",
  pluginsTitle: "Plugins for product managers",
  plugins: [
    {
      id: "doc-review",
      name: "Doc Review",
      summary:
        "Comment on PRDs, decks, spreadsheets, and HTML prototypes beside the chat, then send every comment to the agent in one message.",
      screenshot: `${SCREENSHOTS}/doc-review/markup.png`,
    },
    {
      id: "browser-annotate",
      name: "Browser Annotate",
      summary:
        "Click elements of a running prototype, comment on each, and send the batch with a screenshot of every element.",
      screenshot: `${SCREENSHOTS}/browser-annotate/example-page.jpg`,
    },
    {
      id: "linear",
      name: "Linear",
      summary:
        "Browse issues in bb and turn any of them into an agent thread that knows which issue it’s working on.",
    },
  ],
  build: {
    title: "Missing a tool? Ask for it.",
    body: [
      "Your agent can write a bb plugin the same way it writes any other code. It builds it, installs it, and the panel shows up in bb without a restart.",
      "bb’s own GitHub integration, memory, and scheduled jobs are plugins built the same way.",
    ],
    scenario: {
      label:
        "Mobile bb preview: a prompt asks for release notes, and the agent builds a plugin for them",
      title: "Build a release notes plugin",
      prompt: "Draft release notes from merged PRs",
      promptWidth: "250px",
      branch: "bb/release-notes-plugin",
      messages: [
        { role: "user", text: "Draft release notes from merged PRs" },
        {
          role: "agent",
          text: "I’ll build it as a plugin with a panel and a bb notes command.",
        },
        { role: "tool", text: "wrote plugin: release-notes" },
        { role: "tool", text: "registered panel + bb notes CLI" },
        {
          role: "agent",
          text: "Done. This week’s notes are drafted from 9 merged PRs.",
        },
      ],
      panelName: "Release notes",
      panel: (
        <PanelRows
          rows={[
            { key: "#812", title: "Setup is now three steps instead of five" },
            { key: "#809", title: "Invite teammates from the empty state" },
            { key: "#806", title: "Faster search across workspaces" },
            { key: "#801", title: "Billing emails show the plan name" },
            { key: "#797", title: "Fixed: exports dropped the last row" },
            { key: "#794", title: "Dark mode for the settings page" },
          ]}
        />
      ),
    },
  },
  setup: [
    {
      task: "Run Claude Code or Codex",
      source: "Built in",
      provides: "Threads for each agent, side by side",
      youSetUp:
        "Install the agent’s CLI and sign in once with your Claude or ChatGPT plan",
    },
    {
      task: "Agents message each other",
      source: "Built in",
      provides:
        "Threads can start, message, and wait on other threads, on any provider",
      youSetUp: "Nothing. Ask in plain language",
    },
    {
      task: "Prototype on your team’s repo",
      source: "Built in",
      provides: "A separate copy and branch for every thread",
      youSetUp: "A clone of the repo on your machine",
    },
    {
      task: "Keep going at a usage limit",
      source: "Built in",
      provides:
        "Hand the thread to another provider, or resend automatically when the limit resets",
      youSetUp: "Sign in to a second provider",
    },
    {
      task: "Mark up prototypes and docs",
      source: "Plugin",
      provides: "Browser Annotate and Doc Review",
      youSetUp: "One install command each",
    },
    {
      task: "Work from Linear",
      source: "Plugin",
      provides: "Linear: issues become threads",
      youSetUp: "Install, then connect your workspace",
    },
    {
      task: "Answer from your phone",
      source: "Built in",
      provides: "Remote access and push notifications",
      youSetUp: "Sign in to bb, then open it on your phone",
    },
    {
      task: "Weekly digests",
      source: "Built in",
      provides: "Scheduled automations",
      youSetUp: "The prompt and the schedule; your computer stays on",
    },
    {
      task: "Customize bb",
      source: "Built in",
      provides: "A plugin system; agents can write, install, and update plugins",
      youSetUp: "Describe what you need",
    },
  ],
  faq: [
    {
      question: "I’m not an engineer. Do I need the terminal?",
      answer:
        "Not day to day. You work in chat threads where you can see files, previews, and a browser. Installing and signing in to Claude Code or Codex is a one-time step.",
    },
    {
      question: "Could I break our codebase?",
      answer:
        "Every thread works on its own branch in a separate copy of the repo. Nothing reaches main unless someone on your team merges it.",
    },
    {
      question: "What does it cost?",
      answer:
        "bb is free and MIT-licensed. Agents run on your existing Claude or ChatGPT plans, billed by those providers, not by bb.",
    },
    {
      question: "Where does my data go?",
      answer:
        "bb runs on your machine. Your prompts, code, and files go to the AI provider you choose, and bb doesn’t receive them. Remote access is optional; the privacy page explains what its relay can see.",
    },
    {
      question: "How is this different from Lovable, Bolt, or Cursor?",
      answer:
        "Lovable and Bolt build standalone apps on their own hosting. bb runs agents in your team’s real repo, and on work that isn’t code, like PRDs and research. Cursor is an editor; bb is where you run many agents across projects and follow them from your phone.",
    },
  ],
  closer: {
    title: "Put Claude and Codex on the same team.",
    body: "Free, open source, and local-first. Install in under a minute.",
  },
};

const ANALYSTS: Persona = {
  slug: "analysts",
  navLabel: "Analysts & researchers",
  eyebrow: "bb for analysts & researchers",
  seoTitle: "Claude Code and Codex for data analysis and research — bb",
  seoDescription:
    "Free, open-source app to run Claude Code and Codex on your own data. Analyze local files and Postgres, cross-check numbers, schedule reports.",
  hero: "Hand off the whole analysis, not just the query.",
  heroBody: [
    "There’s no coordinator to set up. Claude Code, Codex, Grok, and Pi split the cleaning, coding, and write-up, and check each other’s numbers.",
  ],
  walkthrough: {
    title: "A Q3 survey, with the deck due Friday",
    intro:
      "A real analysis in bb, start to finish. Click any step to look closer.",
    steps: [
      {
        title: "Clean the data on your machine",
        detail:
          "Start a thread in the project folder. The agent writes and runs a cleaning script, so every exclusion can be rerun.",
        thread: {
          title: "Clean the Q3 survey",
          provider: "claude",
          status: "running",
          messages: [
            {
              role: "user",
              text: "Read codebook.pdf, clean q3_export.csv, drop anyone who finished in under 3 minutes, save clean.parquet.",
            },
            { role: "tool", text: "Ran clean.py · 4,212 → 3,968 rows" },
            { role: "tool", text: "Rendered a chart of exclusions by reason" },
            {
              role: "agent",
              text: "Dropped 244 speeders and no duplicates. The steps are in clean.py so you can rerun them.",
            },
          ],
        },
      },
      {
        title: "Run three analyses at once",
        detail:
          "A Codex thread codes the open-ended answers while a third builds crosstabs. All three sit in your sidebar.",
        thread: {
          title: "Code open-ended answers",
          provider: "codex",
          status: "running",
          messages: [
            {
              role: "user",
              text: "Sort the 1,800 open-ended answers into themes and save codes.csv.",
            },
            { role: "tool", text: "Read clean.parquet" },
            { role: "tool", text: "Wrote codes.csv · 9 themes" },
            {
              role: "agent",
              text: "Top theme: onboarding friction, 22% of answers. Examples for each theme are in themes.md.",
            },
          ],
        },
      },
      {
        title: "Don’t stop at a usage limit",
        detail:
          "When Claude’s window runs out mid-run, hand the thread to another lab. It picks up from where it stopped.",
        thread: {
          title: "Crosstabs by segment",
          provider: "codex",
          status: "running",
          messages: [
            {
              role: "event",
              text: "Claude usage limit reached · Handed off to Codex with the thread’s context",
            },
            { role: "tool", text: "Resumed: weighted crosstabs by segment" },
            {
              role: "agent",
              text: "Picked up at segment 3 of 5. Nothing was rerun from scratch.",
            },
          ],
        },
      },
      {
        title: "Cross-check before it ships",
        detail:
          "Models from different labs check every figure in the write-up against the script outputs.",
        thread: {
          title: "Check findings.md",
          provider: "claude",
          status: "running",
          messages: [
            {
              role: "event",
              text: "MoA preset · Claude, GPT, and Grok advisors",
            },
            {
              role: "tool",
              text: "Compared 31 figures in findings.md with script outputs",
            },
            {
              role: "agent",
              text: "2 mismatches: NPS on page 3 uses the wrong base, and the detractor share is rounded twice. Fixed both.",
            },
          ],
        },
      },
      {
        title: "Decide from your phone",
        detail:
          "The report asks the one question only you can answer. Tap a reply, then save the run as a monthly automation.",
        thread: {
          title: "Q3 survey report",
          provider: "claude",
          status: "done",
          messages: [
            {
              role: "event",
              text: "Report page · Report NPS with or without the 212 partial completes?",
            },
            { role: "user", text: "Without. Note it in the methods." },
            { role: "tool", text: "Saved as a monthly automation" },
            {
              role: "agent",
              text: "The report is ready and will rebuild on the 1st of each month.",
            },
          ],
        },
      },
    ],
  },
  orchestra: {
    label:
      "A research lead thread asks Codex, Grok, and Claude Code to prepare survey findings together, redirects one mid-task, and two of them reconcile a number between themselves",
    lead: { title: "Q3 survey", provider: "claude" },
    threads: [
      {
        title: "Q3 survey",
        provider: "claude",
        child: false,
        startAt: 0.2,
        doneAt: 9.4,
      },
      {
        title: "Clean data",
        provider: "codex",
        child: true,
        startAt: 1.5,
        doneAt: 4.6,
      },
      {
        title: "Open-ended answers",
        provider: "grok",
        child: true,
        startAt: 1.9,
        doneAt: 6.4,
      },
      {
        title: "Findings draft",
        provider: "claude",
        child: true,
        startAt: 2.3,
        doneAt: 8.6,
      },
      {
        title: "Monday report",
        provider: "codex",
        child: false,
        startAt: 0.4,
        doneAt: 60,
      },
    ],
    feed: [
      {
        kind: "user",
        text: "Get the Q3 survey findings ready for Friday. Work together.",
        at: 0.6,
      },
      {
        kind: "to",
        target: "Clean data",
        text: "Clean q3_export.csv and drop speeders",
        at: 1.5,
      },
      {
        kind: "to",
        target: "Open-ended answers",
        text: "Code the 1,800 open-ended answers into themes",
        at: 1.9,
      },
      {
        kind: "to",
        target: "Findings draft",
        text: "Start findings.md; the tables are coming",
        at: 2.3,
      },
      {
        kind: "from",
        target: "Clean data",
        text: "3,968 rows after cleaning; 244 speeders dropped",
        at: 4.6,
      },
      {
        kind: "to",
        target: "Findings draft",
        text: "Report NPS without the partial completes",
        at: 5.2,
      },
      { kind: "group", count: 6, at: 7.8 },
      {
        kind: "say",
        text: "The findings are ready. Codex and Claude Code reconciled the NPS figure between themselves.",
        at: 9.2,
      },
    ],
  },
  actions: {
    title: "Set up the study",
    provider: "claude",
    messages: [
      {
        role: "user",
        text: "Set up the Q3 study: pin the findings thread, have a lead agent run the cleaning and coding threads, and add a preview for Parquet files.",
      },
      {
        role: "tool",
        text: "Ran bb thread pin on Q3 findings",
      },
      {
        role: "tool",
        text: "Ran bb thread spawn: Study lead (Claude Code)",
      },
      {
        role: "tool",
        text: "Wrote plugin: datasets",
      },
      {
        role: "agent",
        text: "Done. Findings are pinned, the study lead is running the cleaning and coding threads, and Parquet files now open in a preview.",
      },
    ],
  },
  jobsTitle: "What analysts and researchers hand to bb",
  jobs: [
    {
      title: "Explore and clean a new dataset",
      outcome:
        "A rerunnable cleaning script and a before-and-after profile you can read in the chat.",
      prompt:
        "Profile survey_q3.csv: missing values, outliers, duplicate respondent IDs. Put the cleaning steps in clean.py, save clean.parquet, and chart row counts before and after.",
      uses: ["Python on your machine", "Charts in chat"],
    },
    {
      title: "Answer a question from Postgres",
      outcome: "Why a metric moved, with every query shown.",
      prompt:
        "Weekly active accounts fell 8% in September. Break it down by plan and signup cohort and show each query you ran.",
      uses: ["SQL plugin", "Read-only by default"],
    },
    {
      title: "Cross-check before it ships",
      outcome:
        "A list of every number in your write-up that the code doesn’t reproduce.",
      prompt:
        "Check each figure in findings.md against the outputs of analysis/*.py. List mismatches and fix them.",
      uses: ["MoA Provider", "Doc Review"],
    },
    {
      title: "Scheduled reporting",
      outcome:
        "A Monday report with anomalies flagged, and a question you can answer from your phone.",
      prompt:
        "Every Monday at 7am, rebuild report.html from last week’s data, compare to the prior 4 weeks, and flag anything beyond 2 standard deviations.",
      uses: ["Automations", "Thread Pages", "Push notifications"],
    },
  ],
  customize:
    "Add the viewers, databases, and checks your work needs. It’s open source, so you can read every line that touches your data.",
  pluginsTitle: "Plugins for analysts and researchers",
  plugins: [
    {
      id: "moa-provider",
      name: "MoA Provider",
      summary:
        "Up to six advisor models from different labs answer in parallel, then one model reads their notes and does the work.",
      screenshot: `${SCREENSHOTS}/moa-provider/advisor-panel.png`,
    },
    {
      id: "sql",
      name: "SQL",
      summary:
        "Browse Postgres schemas and run queries from a panel or through agent tools. Writes stay off unless you turn them on.",
    },
    {
      id: "thread-pages",
      name: "Thread Pages",
      summary:
        "Every analysis writes its own report page, and you can answer its questions from that page, even on your phone.",
      screenshot: `${SCREENSHOTS}/thread-pages/report-page.png`,
    },
  ],
  build: {
    title: "No viewer for your data? Ask for one.",
    body: [
      "bb doesn’t ship a CSV or Parquet viewer yet. Your agent can write one as a plugin, install it, and it opens beside the chat without a restart.",
      "bb’s own memory, scheduled jobs, and GitHub integration are plugins built the same way.",
    ],
    scenario: {
      label:
        "Mobile bb preview: a prompt asks for a CSV and Parquet viewer, and the agent builds it as a plugin",
      title: "Build a dataset viewer",
      prompt: "Add a preview for CSV and Parquet files",
      promptWidth: "270px",
      branch: "bb/datasets-plugin",
      messages: [
        { role: "user", text: "Add a preview for CSV and Parquet files" },
        {
          role: "agent",
          text: "I’ll build a file viewer plugin with column stats.",
        },
        { role: "tool", text: "wrote plugin: datasets" },
        { role: "tool", text: "registered viewer for .csv and .parquet" },
        { role: "agent", text: "Done. Open any .csv to see it." },
      ],
      panelName: "clean.parquet",
      panel: (
        <PanelRows
          rows={[
            { key: "int64", title: "respondent_id · 3,968 unique" },
            { key: "string", title: "segment · 4 values" },
            { key: "int8", title: "nps · mean 31 · 3% null" },
            { key: "float", title: "completed_min · median 7.4" },
            { key: "string", title: "theme · 9 values" },
            { key: "bool", title: "partial · 212 true" },
          ]}
        />
      ),
    },
  },
  setup: [
    {
      task: "Run agents on your files",
      source: "Built in",
      provides:
        "Threads that read local files and run Python, R, and SQL on your machine",
      youSetUp:
        "Install Claude Code or Codex and sign in; Python or R on your machine",
    },
    {
      task: "Agents message each other",
      source: "Built in",
      provides:
        "Threads can start, message, and wait on other threads, on any provider",
      youSetUp: "Nothing. Ask in plain language",
    },
    {
      task: "Query a database",
      source: "Plugin",
      provides: "SQL: browse Postgres, read-only by default",
      youSetUp: "Install, then add a connection",
    },
    {
      task: "Cross-check across labs",
      source: "Plugin",
      provides: "MoA Provider",
      youSetUp: "Install, then build a preset from providers you’ve signed in to",
    },
    {
      task: "Long runs past a usage limit",
      source: "Built in",
      provides:
        "Hand the thread to another provider, or resend automatically when the limit resets",
      youSetUp: "Sign in to a second provider",
    },
    {
      task: "Scheduled reports",
      source: "Built in",
      provides: "Automations, plus Keep Awake for macOS",
      youSetUp: "The prompt and the schedule",
    },
    {
      task: "Review reports and PDFs",
      source: "Plugin",
      provides: "Thread Pages and Doc Review",
      youSetUp: "One install command each",
    },
    {
      task: "Preview CSV, Parquet, or notebooks",
      source: "Not yet",
      provides: "No built-in viewer yet",
      youSetUp: "Ask your agent to build one, as shown above",
    },
    {
      task: "Customize bb",
      source: "Built in",
      provides: "A plugin system; agents can write, install, and update plugins",
      youSetUp: "Describe what you need",
    },
  ],
  faq: [
    {
      question: "Will it make up numbers?",
      answer:
        "Agents get results by writing and running scripts on your machine, not by doing math in their heads. The scripts and outputs stay in your folder, so you can rerun any figure, and a second lab can check the first. You still review the result.",
    },
    {
      question: "Does my data leave my machine?",
      answer:
        "Your files stay on your disk and bb doesn’t receive your prompts or files. Whatever the agent reads is sent to the model provider you chose, under your plan’s terms. For sensitive data, have agents work on aggregates or keep it out of reach. The SQL plugin can’t write unless you turn that on.",
    },
    {
      question: "I work in Jupyter. Does this replace it?",
      answer:
        "No, and bb has no notebook viewer yet. Agents do best with scripts that save their outputs, and charts render in the chat. Your notebooks still work, and an agent can turn finished scripts into one.",
    },
    {
      question: "How much setup is this?",
      answer:
        "bb is a desktop app for macOS on Apple Silicon and Linux. It uses your existing Claude or ChatGPT plan through the official command-line tools, which you install and sign in to once. It’s free and MIT-licensed.",
    },
    {
      question: "What happens when a long run hits my limit?",
      answer:
        "Hand the thread to another provider and it continues with its context, or let bb resend when the limit window resets. Scheduled runs need your computer awake; Keep Awake handles that on macOS.",
    },
  ],
  closer: {
    title: "Put a second lab on every number.",
    body: "Free, open source, and local-first. Install in under a minute.",
  },
};

const BUSINESS_OWNERS: Persona = {
  slug: "business-owners",
  navLabel: "Business owners",
  eyebrow: "bb for business owners",
  seoTitle: "Make Claude, Codex, and Grok work together — bb",
  seoDescription:
    "One place to work with all your AI agents, and let them work with each other. Free and open source, on your Claude and ChatGPT plans.",
  hero: "Hand off the whole project, not just the task.",
  heroBody: [
    "There’s no coordinator to set up. Claude Code, Codex, Grok, and Pi split the work, hand each other tasks, and check in, the way your team does.",
  ],
  walkthrough: {
    title: "A working day, from one list to inbox zero",
    intro:
      "A real day in bb, start to finish. Click any step to look closer.",
    steps: [
      {
        title: "One agent oversees the rest",
        detail:
          "Your chief-of-staff thread checks in with every client’s thread before you’re up, and puts the next actions on your board.",
        thread: {
          title: "Chief of staff",
          provider: "claude",
          status: "done",
          messages: [
            {
              role: "event",
              text: "Automation · Weekdays at 7:00",
            },
            {
              role: "tool",
              text: "Messaged the Acme, Birch, and Personal threads",
            },
            { role: "tool", text: "Collected 3 replies · added 3 cards to Triage" },
            {
              role: "agent",
              text: "Overdue: the Birch proposal. Today: Acme invoice follow-up and venue research for Dana.",
            },
          ],
        },
      },
      {
        title: "Delegate by voice",
        detail:
          "Say what needs doing from your desk or your phone. Each task gets its own thread in the right client’s project.",
        thread: {
          title: "Birch · proposal",
          provider: "claude",
          status: "running",
          messages: [
            {
              role: "user",
              text: "Turn my Birch call notes into a two-page proposal at last quarter’s pricing. Don’t send anything; I’ll review.",
            },
            { role: "tool", text: "Read call-notes-0930.md and pricing-q3.xlsx" },
            {
              role: "agent",
              text: "Drafting now. I’ll ping you if the scope is unclear.",
            },
          ],
        },
      },
      {
        title: "Work keeps going",
        detail:
          "Claude runs out at 2pm. Hand the half-finished draft to Codex, working state included, and keep going.",
        thread: {
          title: "Birch · proposal",
          provider: "codex",
          status: "running",
          messages: [
            {
              role: "event",
              text: "Claude usage limit reached · Handed off to Codex with the thread’s context",
            },
            { role: "tool", text: "Read the draft so far: 1 of 2 pages" },
            {
              role: "agent",
              text: "Picking up at the timeline section. Same pricing, same tone.",
            },
          ],
        },
      },
      {
        title: "Only hear back when it matters",
        detail:
          "Agents work in parallel across clients. Your phone buzzes only when one needs a decision.",
        thread: {
          title: "Acme · invoice follow-up",
          provider: "claude",
          status: "waiting",
          messages: [
            { role: "event", text: "Push notification · Acme needs you" },
            {
              role: "agent",
              text: "Invoice 1042 is 21 days late. Send the friendly reminder, or the one that mentions the late fee?",
            },
            { role: "user", text: "Friendly one. Copy me." },
          ],
        },
      },
      {
        title: "Evening: inbox zero",
        detail:
          "Review the drafts, close what’s finished, and put what’s waiting on someone else away until it’s back.",
        thread: {
          title: "Wrap up the day",
          provider: "claude",
          status: "done",
          messages: [
            { role: "tool", text: "Moved 4 cards to Done" },
            { role: "tool", text: "Moved Dana’s venue choice to Waiting on Dana" },
            {
              role: "agent",
              text: "Nothing else needs you today. Tomorrow’s brief runs at 7:00.",
            },
          ],
        },
      },
    ],
  },
  orchestra: {
    label:
      "A chief-of-staff thread asks Codex, Grok, and Claude Code to prepare a board meeting together, redirects one mid-task, and two of them reconcile a number between themselves",
    lead: { title: "Chief of staff", provider: "claude" },
    threads: [
      {
        title: "Chief of staff",
        provider: "claude",
        child: false,
        startAt: 0.2,
        doneAt: 9.4,
      },
      {
        title: "Board metrics",
        provider: "codex",
        child: true,
        startAt: 1.5,
        doneAt: 4.6,
      },
      {
        title: "Competitor scan",
        provider: "grok",
        child: true,
        startAt: 1.9,
        doneAt: 6.2,
      },
      {
        title: "Board memo",
        provider: "claude",
        child: true,
        startAt: 2.3,
        doneAt: 8.6,
      },
      {
        title: "Inbox triage",
        provider: "codex",
        child: false,
        startAt: 0.4,
        doneAt: 60,
      },
    ],
    feed: [
      {
        kind: "user",
        text: "Get everything ready for Thursday’s board meeting. Work together.",
        at: 0.6,
      },
      {
        kind: "to",
        target: "Board metrics",
        text: "Q3 revenue, churn, and hiring against plan",
        at: 1.5,
      },
      {
        kind: "to",
        target: "Competitor scan",
        text: "What did our three closest competitors ship this quarter?",
        at: 1.9,
      },
      {
        kind: "to",
        target: "Board memo",
        text: "Start the memo; the numbers are coming",
        at: 2.3,
      },
      {
        kind: "from",
        target: "Board metrics",
        text: "Revenue up 18%, churn up to 3.1%, hiring 4 behind plan",
        at: 4.6,
      },
      {
        kind: "to",
        target: "Board memo",
        text: "Lead with churn; it’s what they’ll ask about",
        at: 5.2,
      },
      { kind: "group", count: 6, at: 7.8 },
      {
        kind: "say",
        text: "The memo is ready for your review. Codex and Claude Code reconciled the churn number between themselves.",
        at: 9.2,
      },
    ],
  },
  actions: {
    title: "Set up my week",
    provider: "claude",
    messages: [
      {
        role: "user",
        text: "Set up my week: pin Acme and Birch, have a chief of staff check on every client thread each morning, and add a way to track unpaid invoices.",
      },
      {
        role: "tool",
        text: "Ran bb thread pin on Acme and Birch",
      },
      {
        role: "tool",
        text: "Ran bb thread spawn: Chief of staff (Claude Code)",
      },
      {
        role: "tool",
        text: "Wrote plugin: invoices",
      },
      {
        role: "agent",
        text: "Done. Your clients are pinned, your chief of staff checks in each morning, and Invoices is in your sidebar.",
      },
    ],
  },
  jobsTitle: "What owners hand to bb",
  jobs: [
    {
      title: "Put one agent in charge",
      outcome:
        "An overseer that keeps every project moving and tells you only what needs you.",
      prompt:
        "You’re my chief of staff. Every weekday at seven, check in with each client’s thread, tell me what’s overdue, and put the top three next actions on my board.",
      uses: ["Thread messaging", "Automations", "Triage"],
    },
    {
      title: "Delegate on the move",
      outcome:
        "Hand off work by voice and get pinged only when a decision is needed.",
      prompt:
        "While I drive: research the three venues Dana mentioned, compare price and capacity, and message me if you need a decision.",
      uses: ["BB Live", "Remote access"],
    },
    {
      title: "Ship client deliverables",
      outcome: "A reviewed draft, finished even if one lab runs out.",
      prompt:
        "Turn my Birch call notes into a two-page proposal at last quarter’s pricing. Don’t send anything; I’ll review.",
      uses: ["Doc Review", "Handoff to another lab"],
    },
    {
      title: "Clear the admin pile",
      outcome: "Receipts renamed, filed, and ready for your accountant.",
      prompt:
        "Rename the receipts in Downloads as date, vendor, amount, file them under September, and make a spreadsheet for my accountant.",
      uses: ["Personal workspace", "Automations"],
    },
  ],
  customize:
    "Shape bb around your business, not the other way around. It’s open source and runs on your machine, so what you build stays yours.",
  pluginsTitle: "Plugins for running a business",
  plugins: [
    {
      id: "triage",
      name: "Triage",
      summary:
        "One board for tasks, progress, and what needs you. Run a task now or schedule it, and every card links to its conversation.",
      screenshot: `${SCREENSHOTS}/triage/triage-board.png`,
    },
    {
      id: "bb-live",
      name: "BB Live",
      summary:
        "Talk to bb while your agents work. Ask for a briefing, redirect a thread, or start new work by voice.",
      screenshot: `${SCREENSHOTS}/bb-live/main.png`,
    },
    {
      id: "doc-review",
      name: "Doc Review",
      summary:
        "Comment on proposals, decks, and spreadsheets beside the chat, then send every comment to the agent in one message.",
      screenshot: `${SCREENSHOTS}/doc-review/slides.png`,
    },
  ],
  build: {
    title: "Your tools, for every lab. Ask for it.",
    body: [
      "Connect the tools your business runs on once, and every agent can use them, whichever lab is doing the work. bb doesn’t ship Drive, Gmail, or Trello plugins yet; your agent can connect them for you.",
      "bb’s own memory, scheduled jobs, and remote access are plugins built the same way.",
    ],
    scenario: {
      label:
        "Mobile bb preview: a prompt asks to connect Drive and Trello for every agent, and the agent builds it",
      title: "Connect my tools",
      prompt: "Connect Drive and Trello for every agent",
      promptWidth: "270px",
      branch: "bb/connectors-plugin",
      messages: [
        { role: "user", text: "Connect Drive and Trello for every agent" },
        {
          role: "agent",
          text: "I’ll set them up so Claude, Codex, and Grok threads can all use them.",
        },
        { role: "tool", text: "wrote plugin: connectors" },
        { role: "tool", text: "registered Drive + Trello tools" },
        { role: "agent", text: "Done. Sign in once and every agent can use them." },
      ],
      panelName: "Connectors",
      panel: (
        <PanelRows
          rows={[
            { key: "Drive", title: "Connected · Claude · Codex · Grok" },
            { key: "Trello", title: "Connected · Claude · Codex · Grok" },
            { key: "Gmail", title: "Ask your agent to add it" },
            { key: "Calendar", title: "Ask your agent to add it" },
          ]}
        />
      ),
    },
  },
  setup: [
    {
      task: "Bring your subscriptions",
      source: "Built in",
      provides: "Claude Code, Codex, Pi, Cursor, and other agents",
      youSetUp: "Install each agent and sign in once with your own plan",
    },
    {
      task: "Agents message and oversee each other",
      source: "Built in",
      provides:
        "Threads can start, message, and wait on other threads, on any provider, so one thread can run the rest",
      youSetUp: "Nothing. Ask in plain language",
    },
    {
      task: "Switch labs mid-task",
      source: "Built in",
      provides:
        "Handoff with the thread’s context, and automatic resend when a limit resets",
      youSetUp: "Sign in to a second provider",
    },
    {
      task: "Use several accounts",
      source: "Built in",
      provides:
        "Account Pooler for Claude and Codex accounts you own and are permitted to use this way. Experimental, off by default",
      youSetUp: "Add each account, and check your plan’s terms",
    },
    {
      task: "Scheduled routines",
      source: "Built in",
      provides: "Automations, recurring or one-off",
      youSetUp: "The prompt and schedule; your computer stays on",
    },
    {
      task: "Drive, Gmail, Trello, Slack",
      source: "Not yet",
      provides: "No built-in connectors yet",
      youSetUp: "Ask your agent to connect them, as shown above",
    },
    {
      task: "Work from your phone",
      source: "Built in",
      provides: "Remote access in the browser and push notifications",
      youSetUp: "Sign in to bb. The iOS app is in beta",
    },
    {
      task: "Talk instead of type",
      source: "Built in",
      provides:
        "Dictation in every thread. Hands-free conversation with the BB Live plugin",
      youSetUp: "Choose a transcription service in Settings",
    },
    {
      task: "Customize bb",
      source: "Built in",
      provides: "A plugin system; agents can write, install, and update plugins",
      youSetUp: "Describe what you need",
    },
  ],
  faq: [
    {
      question: "Is this only for developers?",
      answer:
        "The agents bb runs were built for code, but what they actually do is read, write, and organize files and use tools. You need folders and plain language, not programming. Installing and signing in to each agent is a one-time step.",
    },
    {
      question: "What if a service is down or I hit a limit?",
      answer:
        "Hand the thread to another lab and it continues with its context, or let bb resend automatically when the limit resets. Your projects, instructions, and files stay in the same workspace either way.",
    },
    {
      question: "Can I use more than one account?",
      answer:
        "bb runs each provider’s official tool under your own sign-in. The Account Pooler is opt-in and experimental, for accounts you own and are permitted to use this way. Read your plan’s terms; sharing credentials is not allowed.",
    },
    {
      question: "Is it safe to let agents work on my computer?",
      answer:
        "You choose the folders and how much the agent can do without asking. Keep approvals on for anything involving email or money. bb runs on your machine, and your prompts go only to the provider you choose.",
    },
    {
      question: "What does it cost?",
      answer:
        "bb is free and MIT-licensed. You pay your AI providers directly, and bb never resells usage.",
    },
  ],
  closer: {
    title: "Put your AI agents on the same team.",
    body: "Free, open source, and local-first. Install in under a minute.",
  },
};

export const PERSONAS: Record<string, Persona> = {
  [PRODUCT_MANAGERS.slug]: PRODUCT_MANAGERS,
  [ANALYSTS.slug]: ANALYSTS,
  [BUSINESS_OWNERS.slug]: BUSINESS_OWNERS,
};
