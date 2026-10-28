/**
 * Browser half of `dsh-split-session`.
 *
 * Registers a `split` main panel and its left-sidebar entry. The panel renders
 * two live Conversations side by side: each pane retains its own Session
 * reference, binds it through the standard `SessionProvider` seat, and renders
 * the shared `conversation.content` Factory in its `embedded` variant — the
 * same composition the right-Sidebar subagent chat uses.
 *
 * The bundle is plain browser JavaScript in the module-loader factory form, so
 * the package needs no client build step. It requires only baseline platform
 * modules (React, ui-primitives) and never imports another feature plugin's
 * values: the conversation arrives through the public Factory and Session
 * state through standard seats.
 */

window.__ModuleLoader__.load({
  id: 'dsh-split-session',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const { useState, useEffect, useMemo, useRef, useCallback } = React;
    const {
      Button,
      Menu,
      StateDot,
      Tooltip,
      IconAppsAddOutlineRegular,
      IconChevronDownOutlineRegular,
      IconCloseOutlineRegular,
      IconCompareSplitOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'splitSession';
    /** Keyed `main` panel id; also the sidebar entry id. */
    const PANEL_ID = 'split';
    /** Persisted pane/geometry preferences (v2: pane list + two axes). */
    const STORAGE_KEY = 'dsh.split-session.v2';
    /** Read-only migration source for the two-pane schema. */
    const LEGACY_STORAGE_KEY = 'dsh.split-session.v1';
    /** One window holds at most a quad. */
    const MAX_PANES = 4;
    /** Divider track width shared by both axes. */
    const SPLITTER_SIZE = 7;
    /** Reference-source label for the panes' Session retention. */
    const SESSION_SOURCE = 'splitView';
    /** Divider travel keeps both panes usable. */
    const MIN_RATIO = 0.2;
    const MAX_RATIO = 0.8;
    const DEFAULT_RATIO = 0.5;
    /** A menu longer than this stops being scannable. */
    const MAX_MENU_ROWS = 60;
    /** Pointer distance from a divider that keeps the current drop target. */
    const DROP_DEAD_BAND = 20;
    /** localStorage opt-out of the launch panel; any other value keeps it on. */
    const OPEN_ON_LAUNCH_KEY = 'dsh.split-session.open-on-launch';
    /** One launch auto-open per page lifetime, not per bundle reload. */
    const LAUNCH_TAG_KEY = 'dsh.split-session.launch-tag';
    /** Set by the launch selection; the first panel mount expands the sidebar. */
    const LAUNCH_EXPAND_KEY = 'dsh.split-session.expand-launch';

    const zh = {
      'panel.name': '分屏视图',
      'title': '分屏视图',
      'subtitle.2row': '两个会话，并排查看',
      'subtitle.2column': '两个会话，上下排列',
      'subtitle.3': '三个会话，下方宽窗格',
      'subtitle.4': '四个会话，四宫格',
      'addPane': '添加窗格',
      'addPaneLimit': '最多四个窗格',
      'closePane': '关闭窗格',
      'blankSession': '新会话',
      'close': '关闭分屏视图',
      'swap': '交换窗格',
      'stack': '上下排列',
      'sideBySide': '左右排列',
      'choose': '选择会话',
      'choosePane': '为这个窗格选择一个会话',
      'resize.column': '调整列宽',
      'resize.row': '调整行高',
      'loading': '正在加载会话…',
      'loadingSessions': '正在加载会话列表…',
      'unavailable': '无法打开此会话',
      'retry': '重试',
      'empty.noSessions': '还没有会话',
      'empty.noSessionsHint': '从侧边栏新建一个会话后，即可在此打开。',
      'empty.single': '还需要一个会话',
      'empty.singleHint': '再新建一个会话，就能并排对比。',
      'empty.hint': '点击上方标题，为这个窗格选择一个会话。',
      'menu.label': '切换此窗格的会话',
      'menu.empty': '没有其他会话',
      'drop.title': '松开，在此窗格打开',
    };

    const en = {
      'panel.name': 'Split view',
      'title': 'Split view',
      'subtitle.2row': 'Two sessions, side by side',
      'subtitle.2column': 'Two sessions, stacked',
      'subtitle.3': 'Three sessions, one wide pane',
      'subtitle.4': 'Four sessions, quad view',
      'addPane': 'Add pane',
      'addPaneLimit': 'Four panes is the maximum',
      'closePane': 'Close pane',
      'blankSession': 'New session',
      'close': 'Close split view',
      'swap': 'Swap panes',
      'stack': 'Stack panes',
      'sideBySide': 'Place side by side',
      'choose': 'Choose a session',
      'choosePane': 'Choose a session for this pane',
      'resize.column': 'Resize columns',
      'resize.row': 'Resize rows',
      'loading': 'Loading session…',
      'loadingSessions': 'Loading sessions…',
      'unavailable': 'This session could not be opened',
      'retry': 'Retry',
      'empty.noSessions': 'No sessions yet',
      'empty.noSessionsHint': 'Start a session from the sidebar to open it here.',
      'empty.single': 'One more session needed',
      'empty.singleHint': 'Start another session to compare it side by side.',
      'empty.hint': 'Choose a session for this pane from the title above.',
      'menu.label': 'Switch this pane’s session',
      'menu.empty': 'No other sessions',
      'drop.title': 'Drop to open in this pane',
    };

    const CSS = `
      .dss-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-width: 0;
        min-height: 0;
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family);
        font-size: var(--dsh-content-font-size, 14px);
      }

      .dss-header {
        flex: none;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: calc(10px + var(--dsh-frame-top-clearance, 0px))
          max(16px, var(--dsh-frame-leading-clearance, 0px)) 10px 20px;
        border-bottom: 0.5px solid var(--dsw-alias-border-l3);
      }

      .dss-heading {
        display: flex;
        align-items: baseline;
        gap: 10px;
        min-width: 0;
      }

      .dss-headingIcon {
        align-self: center;
        display: inline-flex;
        color: var(--dsw-alias-label-secondary);
      }

      .dss-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        white-space: nowrap;
      }

      .dss-subtitle {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        line-height: 16px;
        color: var(--dsw-alias-label-tertiary);
      }

      .dss-headerActions {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .dss-body {
        flex: 1;
        display: grid;
        min-width: 0;
        min-height: 0;
      }

      .dss-body[data-dragging='column'] {
        cursor: col-resize;
        user-select: none;
      }

      .dss-body[data-dragging='row'] {
        cursor: row-resize;
        user-select: none;
      }

      .dss-pane {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }

      .dss-paneHeader {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 38px;
        padding: 0 6px;
        border-bottom: 0.5px solid var(--dsw-alias-border-l2);
      }

      /* Menu wraps its anchor in an inline-flex span; let a long Session title
         shrink and ellipsize inside the pane instead of widening the header. */
      .dss-paneHeader > * {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 100%;
      }

      .dss-paneTools {
        display: flex;
        flex: none;
        align-items: center;
        margin-left: auto;
      }

      .dss-sessionButton {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        max-width: 100%;
        height: 28px;
        padding: 0 8px;
        border: 0;
        border-radius: var(--dsw-radius-sm);
        background: transparent;
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 13px;
        line-height: 18px;
        cursor: pointer;
      }

      .dss-sessionButton:hover {
        background: var(--dsw-alias-interactive-bg-hover);
      }

      .dss-sessionButton:active {
        background: var(--dsw-alias-interactive-bg-active);
      }

      .dss-sessionButton[data-empty='true'] {
        color: var(--dsw-alias-label-tertiary);
      }

      .dss-sessionName {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }

      .dss-chevron {
        display: inline-flex;
        flex: none;
        color: var(--dsw-alias-label-tertiary);
      }

      .dss-paneBody {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }

      .dss-paneBody > * {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }

      .dss-splitter {
        position: relative;
        z-index: 1;
        padding: 0;
        border: 0;
        background: transparent;
        touch-action: none;
      }

      .dss-splitter[data-axis='column'] {
        cursor: col-resize;
      }

      .dss-splitter[data-axis='row'] {
        cursor: row-resize;
      }

      .dss-splitter::before {
        content: '';
        position: absolute;
        inset: 0 3px;
        background: var(--dsw-alias-border-l3);
        transition: background 120ms var(--ds-ease-in-out, ease),
          inset 120ms var(--ds-ease-in-out, ease);
      }

      .dss-splitter[data-axis='row']::before {
        inset: 3px 0;
      }

      .dss-splitter:hover::before,
      .dss-splitter:focus-visible::before,
      .dss-splitter[data-active='true']::before {
        inset: 0 2px;
        background: var(--dsw-alias-label-tertiary);
      }

      .dss-splitter[data-axis='row']:hover::before,
      .dss-splitter[data-axis='row']:focus-visible::before,
      .dss-splitter[data-axis='row'][data-active='true']::before {
        inset: 2px 0;
      }

      .dss-dropLayer {
        position: absolute;
        inset: 6px;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border: 1.5px dashed var(--dsw-alias-border-l4);
        border-radius: var(--dsw-radius-md);
        background: transparent;
        pointer-events: none;
        opacity: 0;
        transition: opacity 120ms var(--ds-ease-in-out, ease);
      }

      .dss-dropLayer[data-visible='true'] {
        opacity: 1;
      }

      .dss-dropLayer[data-active='true'] {
        border-color: var(--dsw-alias-state-business-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, var(--dsw-alias-bg-base) 45%);
        box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary);
      }

      .dss-dropCard {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        max-width: calc(100% - 32px);
        padding: 10px 16px;
        border-radius: var(--dsw-radius-md);
        background: var(--dsw-alias-bg-layer-2);
        box-shadow: var(--dsw-elevation-panel);
        text-align: center;
      }

      .dss-dropTitle {
        font-size: 12px;
        line-height: 18px;
        color: var(--dsw-alias-label-secondary);
      }

      .dss-dropName {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
        color: var(--dsw-alias-label-primary);
      }

      .dss-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 24px;
        text-align: center;
        color: var(--dsw-alias-label-tertiary);
      }

      .dss-emptyTitle {
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
      }

      .dss-emptyText {
        max-width: 280px;
        font-size: 12px;
        line-height: 18px;
      }

      .dss-emptyError {
        max-width: 360px;
        overflow-wrap: anywhere;
      }

      .dss-loading {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--dsw-alias-label-tertiary);
        font-size: 12px;
        line-height: 18px;
      }

      @media (max-width: 900px) {
        .dss-subtitle {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .dss-splitter::before {
          transition: none;
        }
      }
    `;

    /**
     * Install the plugin stylesheet once per document.
     * @returns nothing.
     */
    function installStyles() {
      // Replace on reload so an HMR bundle swap also refreshes the stylesheet.
      const existing = document.getElementById('dsh-split-session-styles');
      if (existing !== null) {
        existing.textContent = CSS;
        return;
      }
      const style = document.createElement('style');
      style.id = 'dsh-split-session-styles';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    installStyles();

    /** Normalize an unknown thrown value for display. */
    function asError(value) {
      return value instanceof Error ? value : new Error(String(value));
    }

    /** Clamp a divider ratio into the usable band. */
    function clampRatio(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_RATIO;
      return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
    }

    /**
     * Read persisted pane preferences, tolerating absent or malformed data.
     * v2 stores the pane list and both axis ratios; v1's two panes migrate.
     * @returns remembered panes and geometry, or an empty object.
     */
    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
          ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw === null) return {};
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return {};
        let panes;
        if (Array.isArray(parsed.panes)) {
          panes = parsed.panes
            .slice(0, MAX_PANES)
            .map(id => (typeof id === 'string' ? id : null));
          while (panes.length < 2) panes.push(null);
        } else {
          const left = typeof parsed.left === 'string' ? parsed.left : null;
          const right = typeof parsed.right === 'string' ? parsed.right : null;
          panes = [left, right];
        }
        const orientation = parsed.orientation === 'column' ? 'column' : 'row';
        const legacyRatio = typeof parsed.ratio === 'number' ? parsed.ratio : DEFAULT_RATIO;
        return {
          panes,
          columnRatio: clampRatio(
            typeof parsed.columnRatio === 'number'
              ? parsed.columnRatio
              : orientation === 'row' ? legacyRatio : DEFAULT_RATIO,
          ),
          rowRatio: clampRatio(
            typeof parsed.rowRatio === 'number'
              ? parsed.rowRatio
              : orientation === 'column' ? legacyRatio : DEFAULT_RATIO,
          ),
          orientation,
        };
      } catch (_error) {
        return {};
      }
    }

    /** Persist pane preferences, ignoring quota or privacy failures. */
    function writePrefs(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (_error) {
        // Preferences are a convenience; a read-only profile keeps working.
      }
    }

    /**
     * Project the Session catalog into pickable rows, most recently active first.
     * @param state - the Session Controller list snapshot.
     * @returns rows carrying the display title and running state.
     */
    function collectRows(state) {
      const rows = [];
      for (const id of state.ids) {
        const row = state.byId[id];
        if (row === undefined) continue;
        // Subagent children are reached through their parent's conversation;
        // listing them here would bury the top-level Sessions in prompts.
        if (row.origin === 'subagent' || row.parentId !== undefined) continue;
        rows.push({
          id,
          title: row.displayTitle || row.title || String(id),
          running: row.running === true,
          blank: row.blank === true,
          updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
          mainView: (row.retainedBy?.mainView ?? 0) > 0,
        });
      }
      rows.sort((left, right) => right.updatedAt - left.updatedAt);
      return rows;
    }

    /**
     * Resolve every pane to a distinct Session: remembered ids first, then the
     * per-pane fallbacks, then the first still-unused row. Panes beyond the
     * catalog's Session count stay empty (and keep their picker).
     * @param candidates - remembered pane ids from state.
     * @param rows - pickable catalog rows.
     * @param fallbacks - per-pane preferred ids (the current Conversation first).
     * @returns one id (or undefined) per pane, in pane order.
     */
    function resolvePanes(candidates, rows, fallbacks) {
      const used = new Set();
      return candidates.map((candidate, index) => {
        const usable = (id) => typeof id === 'string'
          && !used.has(id)
          && rows.some(row => row.id === id);
        let id;
        if (usable(candidate)) id = candidate;
        else if (usable(fallbacks[index])) id = fallbacks[index];
        else id = rows.find(row => !used.has(row.id))?.id;
        if (id !== undefined) used.add(id);
        return id;
      });
    }

    /**
     * Find a row's display title; blank Sessions read as a new Session.
     * @param rows - pickable catalog rows.
     * @param id - session id.
     * @param t - active translator.
     * @returns the pane-facing title.
     */
    function titleOf(rows, id, t) {
      if (id === undefined) return '';
      const row = rows.find(candidate => candidate.id === id);
      if (row === undefined) return String(id);
      return row.blank ? t('blankSession') : row.title;
    }

    /**
     * Retain one Session reference for a pane and release it on change/unmount.
     * @param acquire - injected retain operation.
     * @param sessionId - pane target.
     * @returns the current reference with an error/retry surface.
     */
    function useRetainedSession(acquire, sessionId) {
      const [nonce, setNonce] = useState(0);
      const [state, setState] = useState({ id: undefined, reference: undefined, error: undefined });
      useEffect(() => {
        if (sessionId === undefined) {
          setState({ id: undefined, reference: undefined, error: undefined });
          return undefined;
        }
        let reference;
        try {
          reference = acquire(sessionId);
        } catch (error) {
          setState({ id: sessionId, reference: undefined, error: asError(error) });
          return undefined;
        }
        setState({ id: sessionId, reference, error: undefined });
        return () => {
          try {
            reference.release();
          } catch (_error) {
            // A disposed Controller already dropped the reference.
          }
        };
      }, [acquire, sessionId, nonce]);
      const retry = useCallback(() => { setNonce(value => value + 1); }, []);
      return { id: state.id, reference: state.reference, error: state.error, retry };
    }

    /**
     * Keep an embedded Conversation's mount-time composer focus from stealing the
     * keyboard. The shared InputBar focuses its editor on mount and on session
     * switch (correct for the main Conversation); in a split pane that would
     * move typing into a pane the user did not choose. The guard watches the
     * frames after a pane binds a Session — after the editor's focus burst
     * settles — and, when focus landed in that pane's composer without a
     * gesture, restores the control that was focused before (or the pane's own
     * title button). Any gesture inside the pane disarms it.
     * @param sessionId - the pane's current Session.
     * @returns the body ref and a disarm handler for real user gestures.
     */
    function useComposerFocusGuard(sessionId) {
      const bodyRef = useRef(null);
      const guardRef = useRef({ armed: false, restore: null, until: 0 });
      const seenRef = useRef({ session: undefined, initialized: false });
      if (!seenRef.current.initialized || seenRef.current.session !== sessionId) {
        seenRef.current = { session: sessionId, initialized: true };
        const active = document.activeElement;
        guardRef.current = {
          armed: true,
          restore: active instanceof HTMLElement && active !== document.body ? active : null,
          until: performance.now() + 4000,
        };
      }
      useEffect(() => {
        const guard = guardRef.current;
        if (!guard.armed) return undefined;
        let frame = 0;
        const step = () => {
          if (!guard.armed) return;
          if (performance.now() > guard.until) {
            guard.armed = false;
            return;
          }
          const host = bodyRef.current;
          const active = document.activeElement;
          if (host === null || !(active instanceof HTMLElement) || !host.contains(active)
            || active.closest('[data-conversation-region="composer"]') === null) {
            frame = window.requestAnimationFrame(step);
            return;
          }
          guard.armed = false;
          const trigger = host.closest('.dss-pane')?.querySelector('.dss-sessionButton') ?? null;
          const restore = guard.restore;
          const restorable = restore !== null && restore.isConnected
            && restore.closest('[role="menu"], [role="listbox"], [role="tooltip"]') === null
            && !host.contains(restore);
          if (restorable) {
            restore.focus({ preventScroll: true });
          } else if (restore !== null && trigger instanceof HTMLElement) {
            trigger.focus({ preventScroll: true });
          } else {
            active.blur();
          }
        };
        frame = window.requestAnimationFrame(step);
        return () => { window.cancelAnimationFrame(frame); };
      }, [sessionId]);
      const disarm = useCallback(() => { guardRef.current.armed = false; }, []);
      return { bodyRef, disarm };
    }

    /** Catches a pane render failure so one broken Session cannot take the panel down. */
    class PaneBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
        this.reset = this.reset.bind(this);
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidCatch(error, info) {
        console.error('[split-session] pane render failed', error, info);
      }

      reset() {
        this.setState({ error: null });
        if (typeof this.props.onRetry === 'function') this.props.onRetry();
      }

      render() {
        if (this.state.error !== null) {
          return h(PaneError, {
            t: this.props.t,
            error: asError(this.state.error),
            onRetry: this.reset,
          });
        }
        return this.props.children;
      }
    }

    /** Unavailable-session surface with a retry that retains the Session again. */
    function PaneError({ t, error, onRetry }) {
      return h(
        'div',
        { className: 'dss-empty' },
        h('div', { className: 'dss-emptyTitle' }, t('unavailable')),
        h('div', { className: 'dss-emptyText dss-emptyError' }, error.message),
        h(Button, { size: 'sm', variant: 'outline', onClick: onRetry }, t('retry')),
      );
    }

    /** Empty pane body, phrased by how many sessions the catalog actually holds. */
    function EmptyPane({ t, rows, phase }) {
      if (phase !== 'ready') {
        return h('div', { className: 'dss-loading' }, t('loadingSessions'));
      }
      if (rows.length === 0) {
        return h(
          'div',
          { className: 'dss-empty' },
          h('div', { className: 'dss-emptyTitle' }, t('empty.noSessions')),
          h('div', { className: 'dss-emptyText' }, t('empty.noSessionsHint')),
        );
      }
      if (rows.length === 1) {
        return h(
          'div',
          { className: 'dss-empty' },
          h('div', { className: 'dss-emptyTitle' }, t('empty.single')),
          h('div', { className: 'dss-emptyText' }, t('empty.singleHint')),
        );
      }
      return h(
        'div',
        { className: 'dss-empty' },
        h('div', { className: 'dss-emptyText' }, t('empty.hint')),
      );
    }

    /** One pane's title row: a menu trigger naming the pane's Session, plus close. */
    function PaneHeader({
      t, title, running, empty, menuOpen, onOpenMenu, onCloseMenu, items, selectedId, onSelect,
      canClose, onClose,
    }) {
      const anchor = h(
        'button',
        {
          type: 'button',
          className: 'dss-sessionButton',
          'data-empty': empty ? 'true' : 'false',
          'aria-haspopup': 'menu',
          'aria-expanded': menuOpen,
          'aria-label': empty ? t('menu.label') : t('menu.label') + ': ' + title,
          title,
          onClick: onOpenMenu,
        },
        running ? h(StateDot, { state: 'ongoing', size: 12 }) : null,
        h('span', { className: 'dss-sessionName' }, title),
        h('span', { className: 'dss-chevron' }, h(IconChevronDownOutlineRegular, { size: 14 })),
      );
      return h(
        'div',
        { className: 'dss-paneHeader' },
        h(Menu, {
          open: menuOpen,
          onClose: onCloseMenu,
          anchor,
          items,
          selectedId,
          onSelect,
          align: 'start',
          portal: true,
          minWidthFromAnchor: true,
        }),
        canClose
          ? h(
            'div',
            { className: 'dss-paneTools' },
            h(
              Tooltip,
              { label: t('closePane'), side: 'bottom' },
              h(Button, {
                size: 'sm',
                variant: 'ghost',
                'aria-label': title === '' ? t('closePane') : t('closePane') + ': ' + title,
                icon: h(IconCloseOutlineRegular, { size: 14 }),
                onClick: onClose,
              }),
            ),
          )
          : null,
      );
    }

    /** One pane: its Session picker, live embedded Conversation, and close control. */
    function SplitPane({
      t, rows, phase, sessionId, usedIds, acquireSession,
      SessionProvider, renderSlot, onSelect, drop, dropActive,
      paneRef, canClose, onClose, gridColumn, gridRow,
    }) {
      const [menuOpen, setMenuOpen] = useState(false);
      const held = useRetainedSession(acquireSession, sessionId);
      const focusGuard = useComposerFocusGuard(sessionId);
      const ready = held.id === sessionId && held.reference !== undefined;
      const running = sessionId !== undefined && rows.some(row => row.id === sessionId && row.running);
      const title = sessionId === undefined ? t('choose') : titleOf(rows, sessionId, t);
      const available = rows
        .filter(row => !usedIds.includes(row.id))
        .slice(0, MAX_MENU_ROWS)
        .map(row => ({
          id: row.id,
          label: row.blank ? t('blankSession') : row.title,
          icon: row.running ? h(StateDot, { state: 'ongoing', size: 12 }) : undefined,
        }));
      const items = available.length === 0
        ? [{ type: 'label', id: 'empty', text: t('menu.empty') }]
        : available;

      let body;
      if (sessionId === undefined) {
        body = h(EmptyPane, { t, rows, phase });
      } else if (held.error !== undefined && held.id === sessionId) {
        body = h(PaneError, { t, error: held.error, onRetry: held.retry });
      } else if (!ready) {
        body = h('div', { className: 'dss-loading' }, t('loading'));
      } else {
        body = h(
          PaneBoundary,
          { key: String(sessionId), t, onRetry: held.retry },
          h(
            SessionProvider,
            { session: held.reference },
            renderSlot('split.pane', {}),
          ),
        );
      }

      return h(
        'section',
        {
          ref: paneRef,
          className: 'dss-pane',
          style: { gridColumn, gridRow },
          'aria-label': sessionId === undefined ? t('choosePane') : title,
          onPointerDownCapture: focusGuard.disarm,
          onKeyDownCapture: focusGuard.disarm,
        },
        h(PaneHeader, {
          t,
          title,
          running,
          empty: sessionId === undefined,
          menuOpen,
          onOpenMenu: () => { setMenuOpen(open => !open); },
          onCloseMenu: () => { setMenuOpen(false); },
          items,
          selectedId: sessionId,
          onSelect: (id) => {
            setMenuOpen(false);
            onSelect(id);
          },
          canClose,
          onClose,
        }),
        h('div', { className: 'dss-paneBody', ref: focusGuard.bodyRef }, body),
        drop === null
          ? null
          : h(
            'div',
            {
              className: 'dss-dropLayer',
              'data-visible': 'true',
              'data-active': dropActive ? 'true' : 'false',
              'aria-hidden': 'true',
            },
            dropActive
              ? h(
                'div',
                { className: 'dss-dropCard' },
                h('span', { className: 'dss-dropTitle' }, t('drop.title')),
                h('span', { className: 'dss-dropName' }, drop.title),
              )
              : null,
          ),
      );
    }

    /** Accessible drag/keyboard handle for one grid axis. */
    function Splitter({ t, axis, ratio, bodyRef, onChange, onDragging, gridColumn, gridRow }) {
      const dragging = useRef(false);
      const vertical = axis === 'column';
      const onPointerDown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        onDragging(axis);
      };
      const onPointerMove = (event) => {
        if (!dragging.current) return;
        const node = bodyRef.current;
        if (node === null) return;
        const rect = node.getBoundingClientRect();
        // Track the pointer across the free space beside the 7px handle so the
        // divider stays under the cursor instead of drifting by the track width.
        const free = vertical ? rect.width - SPLITTER_SIZE : rect.height - SPLITTER_SIZE;
        const offset = vertical
          ? event.clientX - rect.left - SPLITTER_SIZE / 2
          : event.clientY - rect.top - SPLITTER_SIZE / 2;
        onChange(clampRatio(offset / free));
      };
      const stop = (event) => {
        if (!dragging.current) return;
        dragging.current = false;
        onDragging(null);
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch (_error) {
          // Capture already left with the pointer.
        }
      };
      const onKeyDown = (event) => {
        const back = vertical ? 'ArrowLeft' : 'ArrowUp';
        const forward = vertical ? 'ArrowRight' : 'ArrowDown';
        if (event.key === back) {
          event.preventDefault();
          onChange(clampRatio(ratio - 0.02));
        } else if (event.key === forward) {
          event.preventDefault();
          onChange(clampRatio(ratio + 0.02));
        } else if (event.key === 'Home') {
          event.preventDefault();
          onChange(DEFAULT_RATIO);
        }
      };
      return h('div', {
        className: 'dss-splitter',
        'data-axis': axis,
        style: { gridColumn, gridRow },
        role: 'separator',
        tabIndex: 0,
        'aria-orientation': vertical ? 'vertical' : 'horizontal',
        'aria-label': t(vertical ? 'resize.column' : 'resize.row'),
        'aria-valuemin': Math.round(MIN_RATIO * 100),
        'aria-valuemax': Math.round(MAX_RATIO * 100),
        'aria-valuenow': Math.round(ratio * 100),
        'data-active': dragging.current ? 'true' : 'false',
        onPointerDown,
        onPointerMove,
        onPointerUp: stop,
        onPointerCancel: stop,
        onLostPointerCapture: stop,
        onDoubleClick: () => { onChange(DEFAULT_RATIO); },
        onKeyDown,
      });
    }

    /**
     * Pane placement for the current count: side-by-side/stacked for two,
     * two-over-one for three, and a 2x2 quad for four.
     * @param count - pane count 2..4.
     * @param orientation - the two-pane axis.
     * @param index - pane index.
     * @returns grid placement for the pane.
     */
    function panePlacement(count, orientation, index) {
      if (count === 3) {
        return [
          { gridColumn: '1', gridRow: '1' },
          { gridColumn: '3', gridRow: '1' },
          { gridColumn: '1 / span 3', gridRow: '3' },
        ][index];
      }
      if (count >= 4) {
        return [
          { gridColumn: '1', gridRow: '1' },
          { gridColumn: '3', gridRow: '1' },
          { gridColumn: '1', gridRow: '3' },
          { gridColumn: '3', gridRow: '3' },
        ][index];
      }
      return orientation === 'row'
        ? [{ gridColumn: '1', gridRow: '1' }, { gridColumn: '3', gridRow: '1' }][index]
        : [{ gridColumn: '1', gridRow: '1' }, { gridColumn: '1', gridRow: '3' }][index];
    }

    /**
     * The `split` main panel: header controls plus two to four Session panes.
     * @param props - standard root seats and the injected Session operations.
     * @returns the panel surface.
     */
    function SplitPanel(props) {
      const {
        t, useSessions, useWorkspaces, SessionProvider, renderSlot,
        acquireSession, closeSplit,
      } = props;
      const sessions = useSessions(state => state);
      const workspaces = useWorkspaces(state => state);
      const workspacesRef = useRef(workspaces);
      workspacesRef.current = workspaces;
      const rows = useMemo(() => collectRows(sessions), [sessions]);
      // The Conversation's Session is the one the main view retains; a global
      // panel gets root seats only, so the list's retention counts name it.
      const currentId = useMemo(() => rows.find(row => row.mainView)?.id, [rows]);
      const currentIdRef = useRef(currentId);
      currentIdRef.current = currentId;
      const [prefs] = useState(readPrefs);
      const [paneIds, setPaneIds] = useState(
        () => (Array.isArray(prefs.panes) && prefs.panes.length >= 2
          ? prefs.panes.slice(0, MAX_PANES)
          : [null, null]),
      );
      const [columnRatio, setColumnRatio] = useState(() => prefs.columnRatio ?? DEFAULT_RATIO);
      const [rowRatio, setRowRatio] = useState(() => prefs.rowRatio ?? DEFAULT_RATIO);
      const [orientation, setOrientation] = useState(() => prefs.orientation ?? 'row');
      const [dragging, setDragging] = useState(null);
      const [dragSession, setDragSession] = useState(null);
      const [dropTarget, setDropTarget] = useState(null);
      const [dropVisible, setDropVisible] = useState(false);
      const containerRef = useRef(null);
      const rowsRef = useRef(rows);
      const paneRefs = useRef([]);
      const dragSessionRef = useRef(null);
      const dropTargetRef = useRef(null);
      rowsRef.current = rows;

      const fallbacks = [currentId, undefined, undefined, undefined];
      const resolved = resolvePanes(paneIds, rows, fallbacks);
      const count = resolved.length;
      const hasColumns = count >= 3 || (count === 2 && orientation === 'row');
      const hasRows = count >= 3 || (count === 2 && orientation === 'column');
      const paneKey = resolved.map(id => id ?? '').join('|');
      const usedBy = (index) => resolved.filter((id, i) => i !== index && id !== undefined);

      /**
       * Assign a Session to a pane; when another pane already holds it, the
       * two panes trade places instead of duplicating the Session.
       * @param index - target pane index.
       * @param id - Session id.
       */
      const assignPane = (index, id) => {
        const other = resolved.indexOf(id);
        if (other === index) return;
        const next = resolved.slice();
        if (other !== -1) next[other] = resolved[index];
        next[index] = id;
        setPaneIds(next.map(value => value ?? null));
      };

      // Sidebar Session rows are draggable (the workspace browser's reorder
      // gesture publishes `session:<id>`), so a row dropped anywhere on this
      // panel can fill a pane. Track the dragged row by document delegation and
      // let the panel decide its target from pointer geometry.
      useEffect(() => {
        const onDragStart = (event) => {
          const row = event.target instanceof Element
            ? event.target.closest('[data-row-key^="session:"]')
            : null;
          if (row === null) return;
          const id = String(row.getAttribute('data-row-key')).slice('session:'.length);
          const found = rowsRef.current.find(candidate => candidate.id === id);
          if (found === undefined) return;
          const next = { id, title: found.blank ? null : found.title, blank: found.blank };
          dragSessionRef.current = next;
          dropTargetRef.current = null;
          setDragSession(next);
          setDropTarget(null);
          setDropVisible(false);
        };
        const onDragEnd = () => {
          dragSessionRef.current = null;
          dropTargetRef.current = null;
          setDragSession(null);
          setDropTarget(null);
          setDropVisible(false);
        };
        document.addEventListener('dragstart', onDragStart);
        document.addEventListener('dragend', onDragEnd);
        window.addEventListener('blur', onDragEnd);
        return () => {
          document.removeEventListener('dragstart', onDragStart);
          document.removeEventListener('dragend', onDragEnd);
          window.removeEventListener('blur', onDragEnd);
        };
      }, []);

      /**
       * Pane under a pointer, with a dead band along both dividers so fuzzing
       * across one does not flicker between panes.
       * @param x - viewport x.
       * @param y - viewport y.
       * @returns the pane index, or null before layout.
       */
      const paneAt = (x, y) => {
        const entries = [];
        paneRefs.current.forEach((element, index) => {
          if (element !== null && element !== undefined && element.isConnected) {
            entries.push({ index, rect: element.getBoundingClientRect() });
          }
        });
        if (entries.length === 0) return null;
        const body = containerRef.current;
        if (body !== null) {
          const box = body.getBoundingClientRect();
          const nearColumn = hasColumns
            && Math.abs(x - (box.left + box.width * columnRatio)) < DROP_DEAD_BAND;
          const nearRow = hasRows
            && Math.abs(y - (box.top + box.height * rowRatio)) < DROP_DEAD_BAND;
          if (dropTargetRef.current !== null && (nearColumn || nearRow)) {
            return dropTargetRef.current;
          }
        }
        const hit = entries.find(({ rect }) =>
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
        if (hit !== undefined) return hit.index;
        let best = null;
        let bestDistance = Infinity;
        for (const entry of entries) {
          const centerX = entry.rect.left + entry.rect.width / 2;
          const centerY = entry.rect.top + entry.rect.height / 2;
          const distance = (x - centerX) ** 2 + (y - centerY) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = entry.index;
          }
        }
        return best;
      };

      const showDrop = (target) => {
        if (dropTargetRef.current === target) return;
        dropTargetRef.current = target;
        setDropTarget(target);
      };

      const clearDrop = () => {
        dragSessionRef.current = null;
        dropTargetRef.current = null;
        setDragSession(null);
        setDropTarget(null);
        setDropVisible(false);
      };

      const onDragOver = (event) => {
        if (dragSessionRef.current === null) return;
        const target = paneAt(event.clientX, event.clientY);
        if (target === null) return;
        event.preventDefault();
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
        setDropVisible(true);
        showDrop(target);
      };

      const onDrop = (event) => {
        const dragged = dragSessionRef.current;
        if (dragged === null) return;
        event.preventDefault();
        event.stopPropagation();
        const target = paneAt(event.clientX, event.clientY);
        clearDrop();
        if (target === null) return;
        assignPane(target, dragged.id);
      };

      // Persist the resolved pane list and both axis ratios.
      useEffect(() => {
        if (sessions.phase !== 'ready') return undefined;
        const timer = window.setTimeout(() => {
          writePrefs({
            panes: resolved.map(id => id ?? null),
            columnRatio,
            rowRatio,
            orientation,
          });
        }, 200);
        return () => { window.clearTimeout(timer); };
      }, [sessions.phase, paneKey, columnRatio, rowRatio, orientation]);

      // The sidebar only auto-expands the current Session's workspace while
      // the Conversation is the selected panel. Landing directly on Split view
      // skips that, so re-run the same expansion once, right after launch, to
      // keep the sidebar's Session rows available for dragging.
      useEffect(() => {
        let pending = false;
        try {
          pending = window.sessionStorage.getItem(LAUNCH_EXPAND_KEY) === '1';
        } catch (_error) {
          return undefined;
        }
        if (!pending) return undefined;
        try { window.sessionStorage.removeItem(LAUNCH_EXPAND_KEY); } catch (_error) { /* private mode */ }
        let attempts = 0;
        let timer = 0;
        const step = () => {
          attempts += 1;
          const current = currentIdRef.current;
          const items = workspacesRef.current?.items ?? [];
          const owner = current === undefined
            ? undefined
            : items.find(workspace => workspace.sessionIds.includes(current));
          const target = owner
            ?? items.find(workspace => workspace.sessionIds.length > 0)
            ?? items[0];
          const row = target === undefined
            ? null
            : document.querySelector(`[data-row-key="workspace:${target.workspaceId}"]`);
          if (row !== null) {
            const expanded = row.getAttribute('aria-expanded') === 'true';
            if (expanded) return;
            row.click();
            return;
          }
          if (attempts < 40) timer = window.setTimeout(step, 120);
        };
        timer = window.setTimeout(step, 120);
        return () => { window.clearTimeout(timer); };
      }, []);

      const addPane = () => {
        setPaneIds(previous => (previous.length >= MAX_PANES ? previous : [...previous, null]));
      };
      const closePane = (index) => {
        setPaneIds(previous => (previous.length <= 2
          ? previous
          : previous.filter((_, position) => position !== index)));
      };
      const swap = () => {
        if (resolved.length !== 2) return;
        setPaneIds([resolved[1] ?? null, resolved[0] ?? null]);
      };
      const toggleOrientation = () => {
        setOrientation(value => (value === 'row' ? 'column' : 'row'));
      };

      const gridStyle = {
        gridTemplateColumns: hasColumns
          ? `minmax(0, ${columnRatio}fr) ${SPLITTER_SIZE}px minmax(0, ${1 - columnRatio}fr)`
          : 'minmax(0, 1fr)',
        gridTemplateRows: hasRows
          ? `minmax(0, ${rowRatio}fr) ${SPLITTER_SIZE}px minmax(0, ${1 - rowRatio}fr)`
          : 'minmax(0, 1fr)',
      };

      const splitters = [];
      if (count === 2 && hasColumns) {
        splitters.push({ axis: 'column', gridColumn: '2', gridRow: '1', ratio: columnRatio, onChange: setColumnRatio });
      }
      if (count === 2 && hasRows) {
        splitters.push({ axis: 'row', gridColumn: '1', gridRow: '2', ratio: rowRatio, onChange: setRowRatio });
      }
      if (count === 3) {
        splitters.push({ axis: 'column', gridColumn: '2', gridRow: '1', ratio: columnRatio, onChange: setColumnRatio });
        splitters.push({ axis: 'row', gridColumn: '1 / span 3', gridRow: '2', ratio: rowRatio, onChange: setRowRatio });
      }
      if (count >= 4) {
        splitters.push({ axis: 'column', gridColumn: '2', gridRow: '1 / span 3', ratio: columnRatio, onChange: setColumnRatio });
        splitters.push({ axis: 'row', gridColumn: '1 / span 3', gridRow: '2', ratio: rowRatio, onChange: setRowRatio });
      }

      const subtitleKey = count === 4
        ? 'subtitle.4'
        : count === 3
          ? 'subtitle.3'
          : orientation === 'row' ? 'subtitle.2row' : 'subtitle.2column';
      const dropState = dragSession === null || !dropVisible
        ? null
        : {
          title: dragSession.blank ? t('blankSession') : dragSession.title,
          target: dropTarget,
        };

      return h(
        'div',
        {
          className: 'dss-root',
          'data-split-session': '',
          onDragOver,
          onDragEnter: (event) => {
            if (dragSessionRef.current === null) return;
            event.preventDefault();
            setDropVisible(true);
          },
          onDragLeave: (event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            dropTargetRef.current = null;
            setDropTarget(null);
            setDropVisible(false);
          },
          onDrop,
        },
        h(
          'header',
          // Chrome row on macOS: its blank box drags the window; controls inside
          // subtract themselves through ui-web's app-region rule.
          { className: 'dss-header', 'data-window-drag': '' },
          h(
            'div',
            { className: 'dss-heading' },
            h('span', { className: 'dss-headingIcon' }, h(IconCompareSplitOutlineRegular, { size: 18 })),
            h('h1', { className: 'dss-title' }, t('title')),
            h('span', { className: 'dss-subtitle' }, t(subtitleKey)),
          ),
          h(
            'div',
            { className: 'dss-headerActions' },
            h(
              Tooltip,
              { label: count >= MAX_PANES ? t('addPaneLimit') : t('addPane'), side: 'bottom' },
              h(Button, {
                size: 'sm',
                variant: 'ghost',
                onClick: addPane,
                disabled: count >= MAX_PANES,
                'aria-label': count >= MAX_PANES ? t('addPaneLimit') : t('addPane'),
                icon: h(IconAppsAddOutlineRegular, { size: 16 }),
              }),
            ),
            count === 2
              ? h(
                Button,
                {
                  size: 'sm',
                  variant: 'ghost',
                  onClick: swap,
                  disabled: resolved[0] === undefined || resolved[1] === undefined,
                },
                t('swap'),
              )
              : null,
            count === 2
              ? h(
                Button,
                {
                  size: 'sm',
                  variant: 'ghost',
                  onClick: toggleOrientation,
                  'aria-pressed': orientation === 'column',
                },
                orientation === 'row' ? t('stack') : t('sideBySide'),
              )
              : null,
            h(
              Tooltip,
              { label: t('close'), side: 'bottom' },
              h(Button, {
                size: 'sm',
                variant: 'ghost',
                onClick: closeSplit,
                'aria-label': t('close'),
                icon: h(IconCloseOutlineRegular, { size: 16 }),
              }),
            ),
          ),
        ),
        h(
          'div',
          {
            className: 'dss-body',
            ref: containerRef,
            style: gridStyle,
            'data-dragging': dragging ?? 'none',
          },
          resolved.map((sessionId, index) => {
            const placement = panePlacement(count, orientation, index);
            return h(SplitPane, {
              key: index,
              t,
              rows,
              phase: sessions.phase,
              sessionId,
              usedIds: usedBy(index),
              acquireSession,
              SessionProvider,
              renderSlot,
              onSelect: (id) => { assignPane(index, id); },
              drop: dropState,
              dropActive: dropState !== null && dropState.target === index,
              paneRef: (element) => { paneRefs.current[index] = element; },
              canClose: count > 2,
              onClose: () => { closePane(index); },
              gridColumn: placement.gridColumn,
              gridRow: placement.gridRow,
            });
          }),
          splitters.map((splitter) => h(Splitter, {
            key: splitter.axis,
            t,
            axis: splitter.axis,
            ratio: splitter.ratio,
            bodyRef: containerRef,
            onChange: splitter.onChange,
            onDragging: setDragging,
            gridColumn: splitter.gridColumn,
            gridRow: splitter.gridRow,
          })),
        ),
      );
    }

    /**
     * One pane's Conversation body. Registered into `split.pane`, so it runs in
     * the pane's Session scope and renders the shared Conversation Factory in
     * its embedded variant with the same phase rules as the main Conversation.
     * @param props - Session-scope standard seats.
     * @returns the embedded Conversation content.
     */
    function PaneConversation(props) {
      const { sessionId, useSession, useConversation, useSessions, renderFactorySlot, t } = props;
      const session = useSession(value => value);
      const conversation = useConversation(value => value);
      const summaryBlank = useSessions(state => (sessionId === undefined ? undefined : state.byId[sessionId]?.blank));
      if (session === undefined || conversation === undefined) {
        return h('div', { className: 'dss-loading' }, t('loading'));
      }
      const active = conversation.activeTargets.size > 0
        || (!session.blank && !session.awaitingFirstTurn)
        || session.running;
      const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank';
      const parentAvailabilityPending = session.subagent?.address.mode === 'continuable'
        && session.subagent.parentAvailable === undefined;
      const settling = (shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true)
        || parentAvailabilityPending;
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true);
      const phase = settling ? 'settling' : hero ? 'hero' : 'active';
      return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, {
        fallback: h('div', { className: 'dss-loading' }, t('loading')),
      });
    }

    /** Sidebar entry glyph for the `split` panel. */
    function SplitIcon({ size }) {
      return h(IconCompareSplitOutlineRegular, { size: size ?? 16 });
    }

    /** Cordis services used by this plugin's browser half. */
    const inject = ['slots', 'sessions', 'layout', 'locale'];

    /**
     * Register the panel, its sidebar entry, its pane content, and the copy.
     * @param ctx - Client root context.
     * @returns nothing.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'split-session: dictionaries');
      const t = ctx.locale.bind(NS);

      // Stable closures: components retain/release Sessions and close the panel
      // through these, never through ctx.
      const acquireSession = (id) => ctx.sessions.retain(id, { source: SESSION_SOURCE });
      const closeSplit = () => { ctx.layout.selectPanel(null); };

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        children: {
          'split.pane': { kind: 'single', scope: 'session' },
        },
        inject: () => ({ acquireSession, closeSplit }),
      }, SplitPanel));

      ctx.slots.inject('split.pane', () => ctx.slots.register({
        name: 'split.pane',
        locale: NS,
      }, PaneConversation));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => t('panel.name'),
        locale: NS,
      }, SplitIcon));

      // Land on the split view once per page load. The tag is the page's time
      // origin, so a reload opens it again while a bundle HMR reload in the
      // same page does not; `open-on-launch=false` opts out. Selecting now —
      // rather than after a timer — keeps the Conversation from painting first.
      ctx.effect(() => {
        let tag;
        try {
          if (window.localStorage.getItem(OPEN_ON_LAUNCH_KEY) === 'false') return;
          tag = String(performance.timeOrigin);
          if (window.sessionStorage.getItem(LAUNCH_TAG_KEY) === tag) return;
        } catch (_error) {
          return;
        }
        const timers = [];
        const finish = () => {
          try { window.sessionStorage.setItem(LAUNCH_TAG_KEY, tag); } catch (_error) { /* private mode */ }
        };
        const attempt = (index) => {
          try {
            if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) {
              finish();
              return;
            }
            const registered = ctx.slots.entries('main').some(entry => entry.options.key === PANEL_ID);
            if (!registered) {
              if (index < 3) timers.push(window.setTimeout(() => attempt(index + 1), 120));
              return;
            }
            try { window.sessionStorage.setItem(LAUNCH_EXPAND_KEY, '1'); } catch (_error) { /* private mode */ }
            ctx.layout.selectPanel(PANEL_ID);
            finish();
          } catch (error) {
            if (index < 3) {
              timers.push(window.setTimeout(() => attempt(index + 1), 120));
            } else {
              console.warn('[split-session] launch auto-open failed', error);
            }
          }
        };
        attempt(0);
        return () => {
          for (const timer of timers) window.clearTimeout(timer);
        };
      }, 'split-session: launch auto-open');
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

