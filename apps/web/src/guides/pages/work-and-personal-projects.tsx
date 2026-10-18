import { ProductShot, PromptBlock, Substeps } from "../guide-blocks";
import { withIntake } from "../prompt-intake";
import type { Guide, GuideShot } from "../guide-types";
import { meta } from "./work-and-personal-projects.meta";

const shot = (name: string, alt: string): GuideShot => ({
  src: `/guides/work-and-personal-projects/${name}.png`,
  alt,
  width: 2048,
  height: 1280,
});

const WORK_PROJECTS = shot(
  "work-projects",
  "The Projects settings in a separate bb instance, showing only the Work project",
);

const AGENT_PROMPT = withIntake(
  [
    { label: "Computer", hint: "the computer that will run both instances" },
    {
      label: "Accounts",
      hint: "two ChatGPT accounts for Codex; tell me which is work and which is personal, without sharing passwords or tokens",
    },
    {
      label: "Projects",
      hint: "the work folders and personal folders to add; leave existing bb data untouched",
    },
    {
      label: "Switching",
      hint: "start with two local browser tabs; ask separately before registering servers for remote access",
    },
  ],
  `Set up two bb instances so I can keep work and personal project lists, threads, and Codex accounts separate.
Guide: https://getbb.app/guides/work-and-personal-projects

This is a two-instance setup, not built-in profiles or a security boundary. Both instances still have the OS user's file and tool access. Limit this setup to Codex with two ChatGPT accounts; do not claim other providers are isolated. Never inspect, print, copy, or import my existing credentials. Stop if company policy requires stronger isolation.

1. Read the current bb Startup Flags documentation, the account-pool skill's accounts-and-routing.md, and the server-switcher skill. Check the installed launcher help for --data-dir, --server-port, and --host-daemon-port. Inspect occupied ports and existing instance paths without reading credentials. Propose two NEW persistent data directories, two separate Codex homes, and four unused ports. Do not copy an existing data directory or overwrite an existing config.
Check: the paths and ports are distinct, and neither instance uses my existing bb data or ~/.codex directory.

2. Create owner-only directories for each instance and its Codex home. In each new Codex home's config.toml, set cli_auth_credentials_store = "file" so fallback credentials have an explicit location. Explain that any auth.json created there contains access tokens and must stay private. Keep those files out of Git.
Launch each instance with its own CODEX_HOME and explicit --data-dir, --server-port and --host-daemon-port values, in a persistent terminal. The server AND its host daemon must get the matching environment. Start from a sanitized environment: remove inherited bb thread/server/host targeting, BB_ACCOUNT_POOL_PARENT_URL, BB_ACCOUNT_POOL_PARENT_TOKEN, CODEX_OPENAI_BASE_URL, CODEX_POOL_AUTH_TOKEN, OPENAI_BASE_URL, OPENAI_API_KEY and other provider auth overrides. Do not log their values. Do not change HOME. Bind to loopback; do not expose an unauthenticated server.
Check: both local URLs return the app, each server reports its intended data directory, and each host uses its intended CODEX_HOME. With those homes and no inherited auth overrides, run codex login status; both must report not logged in before any sign-in. A different result is a stop, not permission to reuse the account.

3. For every bb command, explicitly target the intended server and clear inherited BB_CLI, BB_THREAD_ID, BB_PROJECT_ID, BB_ENVIRONMENT_ID and host targeting. Verify the target before any mutation. On EACH new server, run bb plugin enable account-pool, bb pool parent isolate, and bb pool routing codex. Read bb pool parent, bb pool config and bb pool status --json.
Check: parentMode is isolate on both. No parent is serving either pool. If a parent is detected, verify its routing is neutralized before starting an agent. Do not disable or bypass Account Pooler to get around a failure.

4. Give me each instance's Account Pooler settings link. Have me choose Sign in to Codex and authorize the intended ChatGPT account in the browser myself, one instance at a time. A private browser window can avoid reusing the other website login. Do not use bb pool account add --import. If using the CLI-assisted flow, first read bb pool account add --help and bb pool account login-poll --help, then use --provider codex --login and poll the returned session.
Check: exactly one intended Codex account is enabled in each instance, the accounts differ, and routing is on. Confirm from the pool's account details, never by asking a model which account it is. Stop if either pool is empty, has extra accounts, or cannot authenticate.

5. Add only the approved folders to each instance. Check bb project create --help before creating anything. Do not move files or change Git/SSH credentials. Create one harmless test thread in each instance and verify which account the pool actually routed. Check the configured native Codex homes remain separate and empty unless I explicitly signed in there. Verify missing or unavailable credentials cannot route to the other context. Do not mark the setup complete on an account list alone.
Check: the project lists and thread histories differ, and a real test turn uses the intended account in each. If account attribution or the fallback behavior cannot be verified, stop and report that gap.

6. Keep the two local URLs available. For the Server Switcher, inspect the current plugin and install it only as agreed. In the browser, it lists servers registered to my bb account; two localhost instances do not automatically appear. Ask before signing these instances into my bb account and registering remote access. In the desktop app, use its own configured server list. Do not reuse another server's Connect identity. After registration, switch work → personal → work and check the destination, projects and account each time.
Check: switching reaches the right instance. If registration isn't approved, keep the local tabs and state that the switcher flow is not yet configured.

If any step fails, stop and report the command, redacted error, and next action. Do not push, publish, migrate existing data or send messages. Stop only the PIDs you recorded for this setup, never processes by name.
Reply with the two clickable local URLs, data and Codex-home paths, terminal IDs and restart instructions, account-routing and switching results, the shared-OS limitations, and any checks still blocked.`,
);

export const guide: Guide = {
  ...meta,
  description:
    "Give work and side projects their own project lists, conversations, and account setup. Ask an agent to set up two bb instances, then choose which one to open.",
  heroTop: null,
  concept: (
    <div>
      <ProductShot shot={WORK_PROJECTS} />
    </div>
  ),
  agentPrompt: AGENT_PROMPT,
  requirement:
    "two ChatGPT accounts for Codex, permission to use them for this work, and a computer that can run both instances",
  steps: [
    {
      id: "step-1",
      title: "Ask your agent to set up two instances",
      lead: "You describe what belongs to work and what belongs to you. Your agent handles the setup.",
      body: (
        <>
          <p>
            Choose <strong>Copy for agent</strong> above and paste it into a bb
            thread. Your agent asks about your computer, accounts, and project
            folders before creating anything.
          </p>
          <PromptBlock
            name="Ask your agent"
            prompt="Keep my work and personal projects in separate bb instances. Leave my current setup alone. Ask me which accounts and folders belong in each one, and verify the account routing before I start work."
          />
          <p>
            This creates two bb instances, not built-in profiles. Separate bb
            data directories keep their project records, threads, and server
            settings apart. Provider logins need separate configuration too.
          </p>
        </>
      ),
      shot: shot(
        "setup-prompt",
        "A setup request typed into a new bb thread, asking the agent to keep work and personal projects separate",
      ),
      options: [],
    },
    {
      id: "step-2",
      title: "Sign in to the right account in each instance",
      lead: "Keep one intended Codex account in each instance's pool.",
      body: (
        <>
          <Substeps>
            <li>Open the work link your agent gives you.</li>
            <li>
              Open <strong>Settings → Account Pooler [Experimental]</strong>
              and choose <strong>Sign in to Codex</strong>. Check which ChatGPT
              account the sign-in page is using before authorizing it.
            </li>
            <li>
              Repeat in the personal instance with your personal account. A
              private browser window can help when the website keeps choosing
              the first account.
            </li>
            <li>
              Ask your agent to verify both accounts and a test turn in each.
            </li>
          </Substeps>
          <p>
            Account Pooler selects accounts by availability; it does not assign
            accounts to projects. Putting both accounts in one pool would not
            keep work tied to one account. An empty or bypassed pool can fall
            back to the machine's provider credentials, which is why the setup
            prompt also separates the native Codex configuration and checks
            inherited routing.
          </p>
        </>
      ),
      shot: shot(
        "account-pool",
        "Account Pooler settings in the fresh work instance, with Sign in to Codex and no accounts added yet",
      ),
      options: [],
    },
    {
      id: "step-3",
      title: "Open the context you want to work in",
      lead: "Start with your two local links; add the server switcher when both servers are registered.",
      body: (
        <>
          <Substeps>
            <li>
              Keep the work and personal links in separate browser tabs. Check
              the destination before starting a thread.
            </li>
            <li>
              To use <strong>Server Switcher</strong> in a browser, ask your
              agent to help register both servers to your bb account. This is
              separate from signing in to your provider accounts and requires
              your approval for remote access.
            </li>
            <li>
              Once configured, choose the current server above the sidebar
              footer, then choose the other server. In the desktop app, the
              switcher uses the desktop app's configured server list.
            </li>
          </Substeps>
          <p>
            Two local instances do not appear in the browser switcher
            automatically. Until registration is complete, use their local
            links.
          </p>
        </>
      ),
      shot: shot(
        "server-switcher",
        "The Server Switcher in a fresh bb instance, asking for bb account sign-in before it can list servers",
      ),
      options: [],
    },
    {
      id: "step-4",
      title: "Check before starting work",
      lead: "Confirm the project list and account belong to the context you opened.",
      body: (
        <>
          <Substeps>
            <li>
              Open <strong>Settings → Projects</strong>. The work instance
              should list your work projects; the personal instance should list
              your personal projects.
            </li>
            <li>
              Check <strong>Account Pooler [Experimental]</strong> for the
              intended account. Have your agent verify a harmless test turn in
              each instance, including what happens when its credentials are
              unavailable.
            </li>
            <li>
              Switch back and check again. Keep the local links and restart
              instructions your agent gives you.
            </li>
          </Substeps>
          <p>
            Both instances still run as the same OS user. They can reach the
            same files, Git and SSH credentials, and other shared tools. If work
            policy requires a security boundary, use a separate OS account or
            machine and follow your company's requirements.
          </p>
        </>
      ),
      shot: WORK_PROJECTS,
      options: [],
    },
  ],
  troubleshooting: [
    {
      question:
        "Both instances seem to use the same account. What should I check?",
      answer: (
        <p>
          Open Account Pooler in each instance and confirm that only the
          intended account is enabled. Ask your agent to check native Codex
          configuration, inherited provider variables, and parent-pool routing.
          A separate bb data directory alone does not separate provider
          credentials. Stop work until a test turn confirms the account used.
        </p>
      ),
    },
    {
      question:
        "The second instance was started by an agent in the first. Does that matter?",
      answer: (
        <p>
          Yes. Nested bb servers can inherit the parent's Account Pooler
          routing. The setup prompt asks your agent to remove that inheritance
          and set each new pool to isolate from its parent. Have it verify the
          result before signing in or starting a thread.
        </p>
      ),
    },
    {
      question: "Why doesn't the server switcher show my second instance?",
      answer: (
        <p>
          In a browser, Server Switcher lists the servers registered to your bb
          account, not every instance running on the computer. Ask your agent to
          check registration and sign-in, or open the instance's local link. In
          the desktop app, check its configured server list.
        </p>
      ),
    },
    {
      question: "The sign-in page keeps picking the other ChatGPT account.",
      answer: (
        <p>
          Open the sign-in link in a private browser window and choose the
          intended account yourself. Confirm the account in that instance's
          Account Pooler after authorization. Do not import the machine's
          existing login as a shortcut.
        </p>
      ),
    },
    {
      question:
        "An instance stops working after I close its terminal or restart the computer.",
      answer: (
        <p>
          Ask your agent to restart that instance using its recorded data
          directory, provider configuration, and ports. Keeping a tab open does
          not keep the server running. Ask for a persistent launch setup if you
          want it to start with the computer.
        </p>
      ),
    },
  ],
  faq: [
    {
      question: "Is this the same as browser profiles?",
      answer: (
        <p>
          No. This runs two bb instances with separate bb data and an explicit
          provider-account setup. It does not create built-in profiles or
          prevent either instance from accessing files available to the OS user.
        </p>
      ),
    },
    {
      question: "Which settings are separate?",
      answer: (
        <p>
          Each data directory has its own bb database, including projects,
          threads, and server settings, plus its plugin state. The setup also
          gives Codex separate native configuration directories. OS credentials,
          filesystem access, shared repository instructions, and other tools are
          not automatically separated.
        </p>
      ),
    },
    {
      question:
        "Can I put both accounts in one pool and assign one to each project?",
      answer: (
        <p>
          Account Pooler does not provide that project-to-account mapping. It
          chooses an eligible account according to priority and availability.
          This guide keeps one intended account in each instance instead.
        </p>
      ),
    },
    {
      question: "Does this separate every agent provider?",
      answer: (
        <p>
          This guide covers two ChatGPT accounts used through Codex. Other
          providers have their own credential stores and environment settings.
          Ask your agent to verify those separately before using them in either
          context.
        </p>
      ),
    },
    {
      question: "Will this move my existing projects or conversations?",
      answer: (
        <p>
          The setup prompt leaves existing bb data alone and creates two new
          instances. Adding a project points at a folder; it does not move its
          files. Moving existing conversations or data is a separate task.
        </p>
      ),
    },
    {
      question: "Do I need a bb account for two local instances?",
      answer: (
        <p>
          The local links let you open the instances directly. Browser-based
          Server Switcher uses your bb account's registered servers. That bb
          account is distinct from the ChatGPT accounts used by your agents.
        </p>
      ),
    },
  ],
  closer: {
    title: "Give each part of your day its own place",
    body: "Ask your agent to set up the two instances, then check the projects and account before you start.",
  },
};
