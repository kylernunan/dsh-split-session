/**
 * Host half of the split-session plugin.
 *
 * The feature is browser-only: the Web Client loader mounts `lib/client.js`,
 * which registers the `split` main panel and its sidebar entry. This entry
 * exists so the Loader row resolves to a real plugin and so the package can
 * carry an ordinary bundle patch; it owns no services, tools, or Session
 * state.
 */

export const name = 'split-session'

/** Keep the row mountable without touching the Host. */
export function apply() {}
