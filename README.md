# dsh-split-session

A DeepSeek Harness Web plugin that turns the main window into a **quad session
view**: up to four live Conversations in one window, each pane running a native
embedded Conversation (not an iframe, not a copied transcript). It opens by
default at launch, and Sessions can be dragged in from the sidebar.

```
┌─ Split view ─────────────────────── +  Swap  Stack  ✕ ─┐
│ [Session A ▾]           │ [Session B ▾]                  │
│                         │                                │
│   live conversation A   │   live conversation B          │
│                         │                                │
├─────────────────────────┼────────────────────────────────┤
│ [Session C ▾]           │ [Session D ▾]                  │
│                         │                                │
│   live conversation C   │   live conversation D          │
│                         │                                │
└─────────────────────────┴────────────────────────────────┘
```

## Features

- **2 to 4 panes, one window.** Add panes up to a 2×2 quad; close any pane back
  down to two. Layouts: side-by-side, stacked, two-over-one, quad.
- **Native Conversations.** Each pane binds its own Session reference through
  the standard `SessionProvider` seat and renders the Conversation package's
  public `conversation.content` Factory in its `embedded` variant. Streaming,
  the composer, slash commands, approvals, queued turns, todos, and plugin views
  all work per pane.
- **Fuzzy drag targets.** Drag any Session row onto the panel: every pane shows
  its half/quarter label, the zone under the pointer lights up, and a wide dead
  band along both dividers keeps the target from flickering. Dropping one
  pane's Session on another swaps them.
- **Launch by default.** The panel is the main view at page launch, and the
  current workspace group is expanded in the sidebar so rows are ready to drag.
- **Resize both axes.** Drag the column and row dividers, use the arrow keys on
  a focused divider, `Home`/double-click to reset one axis.
- **Per-pane picker.** Click a pane title to switch that pane, with running
  spinners and the other panes' Sessions excluded.
- **Persists.** Pane list, both axis ratios, and the two-pane orientation live
  in `localStorage`; the layout survives reloads.
- **Focus-safe.** Opening or switching a pane does not yank the keyboard into
  its composer.
- **Dark/light and English/Chinese** through the host's theme and locale.

## Install

From GitHub (the checkout ships the built client bundle, so no build step
runs):

```sh
dsh plugin --profile desktop add github:kylernunan/dsh-split-session
```

From the prebuilt release tarball:

```sh
dsh plugin --profile desktop add https://github.com/kylernunan/dsh-split-session/releases/download/v0.3.1/dsh-split-session-0.3.1.tgz
```

From a local checkout:

```sh
dsh plugin --profile desktop add /path/to/dsh-split-session
```

From npm, once published:

```sh
dsh plugin --profile desktop add dsh-split-session
```

Then reload the page (or restart the app). Toggle it later under
**Plugins → Installed plugins → Split session view**.

Remove it with:

```sh
dsh plugin --profile desktop remove dsh-split-session
```

## Use

- **Add a pane**: the grid `+` button in the panel header, up to four panes.
- **Close a pane**: the ✕ in a pane's title row (available while more than two
  panes are open).
- **Switch a pane**: click its title; the picker lists top-level Sessions by
  recent activity.
- **Drag a Session in**: drag a row from the sidebar onto any pane. Each pane
  labels its half or quarter and highlights under the pointer; drag a pane's
  Session onto another pane to swap them.
- **Add by dropping**: while fewer than four panes are open, move the drag onto
  the panel header — it becomes a **Drop to add a pane** lane — and release to
  add the dragged Session as a new pane. Repeat to build the quad, then drop
  Sessions into the labeled quarters.
- **Resize**: drag a divider, focus it and use the arrow keys (±2%), press
  `Home` or double-click to reset that axis.
- **Side-by-side / stacked**: for two panes, the panel header toggles the axis.
- **Swap**: exchange the two panes (two-pane layouts).
- **Close the view**: the header ✕ returns to the Conversation without changing
  the selected Session.

The layout persists per browser in `localStorage` under
`dsh.split-session.v2` (the two-pane `v1` layout migrates automatically).

To start on the Conversation instead of the split view:

```js
localStorage.setItem('dsh.split-session.open-on-launch', 'false')
```

Remove that key to restore the launch behavior.

## How it composes

The package has no Host behavior. Its browser half:

1. registers a `main` panel keyed `split` plus the `sidebar.panellist` entry;
2. declares one session-scoped child slot, `split.pane`
   (`{ kind: 'single', scope: 'session' }`), whose occupant renders the shared
   Conversation under that pane's Session binding;
3. retains a Session reference per pane through the Session Controller and
   binds it with the standard `SessionProvider` seat;
4. renders `conversation.content` in its `embedded` variant with the same phase
   rules as the main Conversation;
5. lays the panes out on one CSS grid with two ratiometric dividers.

It never imports another feature plugin's values: the Conversation arrives
through a Factory, Session state through standard seats, and Session retention
through the `sessions` service. It requests no non-baseline modules — React and
`@deepseek-ai/dsh-client-ui-primitives` come from the shell's shared module
table — so the package needs no `dsh.client.external` declaration.

Launching selects the panel once per page lifetime (the tag is the page's
`performance.timeOrigin`, so a browser reload re-opens it and a bundle reload
does not), then expands the current workspace group that the sidebar's own
Conversation-only effect would otherwise have expanded. Drag-and-drop rides the
sidebar's own draggable rows: the panel listens for `dragstart` on
`[data-row-key^="session:"]`, tracks the pointer over its own surface, and
assigns the nearest pane — it never modifies the sidebar's rows or order.

## Alternatives

The split-view space already has capable plugins; this one is deliberately
smaller and native-rendered:

| Plugin | Shape |
| --- | --- |
| [`mhlywxl/dsh-split-workspace`](https://github.com/mhlywxl/dsh-split-workspace) | Unlimited native panes, side-by-side, stacked, 2×2 and automatic grids. Closest overlap. |
| [`dsh-split-screen`](https://www.npmjs.com/package/dsh-split-screen) | Native panes, drag-to-edge splitting, many panes, always-on workspace. |
| [`dsh-split-view`](https://www.npmjs.com/package/dsh-split-view) | Nested splits, one full DSH client per iframe, hibernation, settings. |
| [`@syncended/dsh-split-screen`](https://www.npmjs.com/package/@syncended/dsh-split-screen) | iTerm-style multiplexer, nested splits, tabs, up to 12 panes. |
| [`yuloop/dsh-web-split`](https://github.com/yuloop/dsh-web-split) | Draggable panes with unread dots and per-browser layout. |
| **dsh-split-session** | Quad cap, native embedded Conversations, launch-default, sidebar drag, zero external peers. |

## Files

| File | Role |
| --- | --- |
| `package.json` | Bundle + `dsh.client` manifest, display metadata, icon. |
| `cordis.patch.yml` | The bundle layer that inserts the plugin row. |
| `lib/index.js` | Inert Host half; the feature is browser-only. |
| `lib/client.js` | Browser bundle: panel, pane host, pickers, grid, styles, copy. |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description. |
| `scripts/smoke.mjs` | Loads the browser bundle against stubs and checks its plugin face. |

`lib/client.js` is plain browser JavaScript in the Web module-loader factory
form, so the package ships ready to load with no client build step. Check that
face without a shell with `npm run smoke`.

## Limits

- **Four panes is the cap**, and panes form one flat grid: no nested splits and
  no tabs inside a pane.
- The picker lists top-level Sessions; subagent conversations are reached
  through their parent.
- Blank and archived sidebar rows are not draggable by the sidebar (use the
  pane picker).
- Clicking a Session row (without dragging) returns to the Conversation and
  leaves the split panel; use the pane titles or drag the row while split.
- The right sidebar docks with the Conversation, so it is hidden while the
  split panel is selected.
- One Session cannot occupy two panes; each picker excludes the other panes'
  Sessions and a drop on an occupied pane swaps them.
- The plugin adds no model-facing input and no Session events.

## License

MIT
