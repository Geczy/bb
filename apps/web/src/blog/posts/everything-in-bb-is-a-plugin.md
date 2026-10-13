---
title: Software You Can Shape: Making bb Malleable
date: 2026-10-01
lede: I’m not an engineer, and I build bb plugins. Here are some of my favorites from the community, the tools that make building them possible, and how the plugin API can grow with what you want to make.
---

## bb Plugins and the Marketplace

Software used to be something a team somewhere built for you. It solved your problem well enough, and buying it was cheaper than building your own. With agents, building is suddenly cheap — which changes what you should expect from the tools you use every day.

bb's bet is that a tool should get the fundamentals right and then be malleable enough to fit how *you* work. The fundamentals are an agent orchestrator: threads, a timeline, every popular coding agent on your own subscriptions. Everything past that is meant to be shaped by the person using it, usually by just asking an agent in bb to build it. **bb isn't trying to anticipate every workflow; it's trying to make every workflow buildable.**

Plugins are how that works. And they aren't a side feature bolted onto the "real" product — most of what ships in bb is built as plugins, using the same API anyone can use. Tasks, Memory, Docs, Automations, Workflows, Side Chat, Scheduled Send, Push Notifications, Browser Automation, Connect. Even the sidebar thread list and navigation are plugins. bb is also open source and MIT licensed, so when the API isn't enough, the code is yours too.

That matters because the things you can build reach into pretty much every part of the product. A plugin can add a page, a panel beside a thread, a mention in the composer, or something right in the conversation. It can give agents tools and skills, add commands to the `bb` CLI, run background work, and respond to what happens in a thread. Themes, file viewers, storage, connections to other services, even environment and machine providers are all part of that API.

**The same extension system that shapes your bb is what we use to build bb itself.** Said another way: a feature you make for yourself can become part of someone else’s everyday setup.

The [marketplace](/marketplace) is where people share those features. You can browse BB Official plugins, New & notable, and categories, then open a plugin’s page for screenshots, its author, and an install command. Install from the site or ask your agent to run `bb plugin install <id>`.

TODO(brsbl): media — add a cover image for the plugin roundup.

## Favorites From the Community

I want to start with the plugins that change how you work with agents.

[Usage Tracker](/marketplace/usage-tracker), by Mateo Cerquetella, brings together usage limits for Codex, Claude Code, Cursor, and more. Mateo’s [Host Monitor](/marketplace/host-monitor) does something similar for your machines: CPU, memory, and disk across every connected host. Both make it easier to see the constraints around the work your agents are doing.

[Handoff](/marketplace/handoff), by Vedran Burojević, moves a session between agents and machines, in either direction. [Bots Sidebar](/marketplace/bots-sidebar), by Tobi Lütke, gives you specialist bots with their own memory across projects. They’re different ways of giving work some continuity as you move between threads, models, and projects.

And there are plugins for the moments when the work comes back to you. [bb Recap](/marketplace/bb-recap), by MacHatter1, gives you a short summary when a thread goes idle. [Guided Review](/marketplace/guided-review), by Pritam Sharma, organizes a PR into chapters, with private notes and an assistant. My own [Thread Organizer](/marketplace/thread-organizer) turns sidebar sections into a workflow agents can follow, with an inbox for the things that need you.

[BB Live](/marketplace/bb-live), by Jem, lets you talk to bb while agents work. You can redirect a thread or start a new one by voice. That’s a pretty different way to interact with a room full of agents.

TODO(brsbl): media — add a BB Live clip showing voice interaction with working threads.

Some of my favorites are also just fun. [BB Office](/marketplace/bb-office), by Michael Yong, turns active threads into workers in a pixel-art office. Click a worker to open its thread, or have agents redecorate the office after you approve a preview. [Aura](/marketplace/aura), by Mateo Cerquetella, adds wallpapers and animated pixel textures. [Pets](/marketplace/pets), by Vedran Burojević, gives you a pixel companion that walks over to threads waiting on you. And [Pokémon](/marketplace/pokemon), by Sawyer Hood, lets you catch a Pokémon when you archive a thread.

I’ve been building in this direction too. [Ambient](/marketplace/ambient) is a live shader background that reacts to your agents: working threads drift as lights, waiting threads pulse, finished turns ripple, and errors ripple red. You can describe a scene and have an agent write the shader, or use Automations to paint a new one daily.

TODO(brsbl): media — add the Ambient hero video showing agent activity and a scene change.

[Context Katamari](/marketplace/context-katamari) makes a thread’s context window into a ball rolled by a tiny royal cousin. It grows with the context, gulps on heavy turns, and pops on compaction. Desktop gives bb folders for threads, a finder, and draggable windows.

What I like about these is that they make the state of your work visible in ways that feel personal. A thread waiting on you can be a pulsing light, a pixel companion, or an item in an inbox. The underlying event is the same; the way you want to live with it is up to you.

## Building bb Plugins

I don’t have an engineering background. I built [Theme Preview](/marketplace/theme-preview) with agents, and it now ships with bb. It gives you mock screens and the WCAG contrast for every token, and repaints on each save. You can have an agent thread on one side and the preview on the other while you work on a theme.

The starting point for a new plugin is the **New plugin** button in Plugins. It opens an agent thread that scaffolds the plugin and installs it into your running bb. Underneath, a plugin is a `package.json` with a `bb` block, plus `app.tsx` and/or `server.ts`. The CLI has the same workflow: `bb plugin new`, `bb plugin install .`, and `bb plugin dev` to watch changes and reload.

### Plugin Guide

The [Plugin Guide](/plugin-guide) gives you a map of what you can build. It has annotated wireframes of the app window, composer, command palette, home page, and plugin pages, alongside a map of backend capabilities. Each numbered surface shows the exact SDK symbols and plugins that already use it.

component:plugin-guide

In bb, you can find it under **Plugins → Browse → Plugin Guide**. **Copy for agent** puts an `@Surface` mention into your prompt, giving the agent the surface, its API, and the authoring skill.

That’s useful when you know where something should go but don’t know what the code calls it. You can point to a part of the product and give the agent the information it needs to build there.

### Inspector / Agentation

[Agentation](/marketplace/agentation), by Scott Sunarto, lets you point at an element and send it to the agent, including UI from other plugins. Once you have something on screen, that makes the feedback loop much more direct. You can identify the exact thing you want changed instead of trying to describe its location in a paragraph.

### Computer Use and Launching bb Dev Apps

Agents can launch an isolated bb development app and click through the plugin themselves. They can open the panel, try the interaction, and inspect what actually rendered. That gives them a chance to find bugs before the work comes back to you.

For someone building with agents, this is a useful extension of the loop: describe what you want, give the agent the right API context, then have it use what it built. There’s a real interface to react to at each step.

When you’re ready to share it, ask your agent to submit the plugin. It can open a PR to [get-bb/marketplace](https://github.com/get-bb/marketplace) with a `PLUGIN_OVERVIEW.md` and screenshots.

## An API That Can Grow With Your Ideas

The plugin API already lets you combine quite a few parts of bb into one workflow. Take Video Markup as an example of what you can build: frame-accurate video review where you draw notes on frames, send stills to an agent, and track each note across versions. That uses an inline chat player, a thread panel, composer mentions with images, agent tools, and a CLI together.

Or take Read Aloud: a local voice model reading assistant messages, using message actions and a host worker for the model. These are examples of what the API can support, with very different interfaces and very different jobs.

The thing that matters to me is how the API can grow when an idea reaches its edge. Its surfaces map to places in the product, so a new need can often be handled by adding a surface. You don’t have to rethink the whole plugin system to give a plugin another place to work.

**The API’s shape makes extending it part of the building process.** If you hit a limitation, [file an issue](https://github.com/get-bb/bb/issues) describing what you were trying to build, or open a PR against the plugin API. New APIs land with an `experimental_` prefix first, then stabilize.

## What the bb Team Uses Most

TODO(brsbl): Confirm the team’s most-used plugins and add how the team uses them. Candidates from the source notes: Tasks, Docs, Memory, Browser Automation, Inline Vis, Push Notifications, Connect, Automations, and Workflows. Do not present this as a confirmed list or ranking yet.

## What’s Next for Plugins

TODO(brsbl): Add the actual next steps for plugins, distinguishing committed plans from ideas still being explored.
