/**
 * Load the browser bundle outside the Web shell and assert its plugin face.
 *
 * The bundle only touches `window.__ModuleLoader__` and `document` at module
 * scope, so a small stub proves it parses, registers the expected module id,
 * and exports the `apply`/`inject` pair Cordis needs. It does not render.
 *
 * Run with `node scripts/smoke.mjs` (or `npm run smoke`).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const bundlePath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

let registration
globalThis.window = {
  __ModuleLoader__: {
    load(row) { registration = row },
  },
  localStorage: { getItem: () => null, setItem: () => {} },
}
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', id: '' }),
  head: { appendChild: () => {} },
}

class Component {
  constructor(props) {
    this.props = props
    this.state = {}
  }
}

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Component,
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
}

const primitives = new Proxy({}, {
  get: (_target, name) => (typeof name === 'string'
    ? function PrimitiveStub() { return null }
    : undefined),
})

const requireStub = (specifier) => {
  if (specifier === 'react') return React
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected module request: ${specifier}`)
}

// eslint-disable-next-line no-eval -- evaluate the browser script with the stubs above
eval(readFileSync(bundlePath, 'utf8'))

assert.ok(registration, 'bundle must call window.__ModuleLoader__.load')
assert.equal(registration.id, 'dsh-split-session')
const plugin = registration.factory(requireStub)
assert.equal(typeof plugin.apply, 'function')
assert.deepEqual(plugin.inject, ['slots', 'sessions', 'layout', 'locale'])

console.log('ok: dsh-split-session client bundle registers and exports apply/inject')
