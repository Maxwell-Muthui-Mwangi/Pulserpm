/**
 * Runs in setupFilesAfterFramework — after expo's setup.js has installed its
 * winter-runtime lazy-getter Proxy on globalThis.
 *
 * We eagerly set concrete values for the globals that expo's Proxy would
 * lazily require. Setting a value triggers expo's Proxy setter, which records
 * the value and marks the slot as resolved. Subsequent reads return the
 * concrete value without ever calling require(), preventing jest 30's
 * between-test require guard (throwIfBetweenTests) from firing.
 */

'use strict';

const { TextDecoder, TextEncoder } = require('util');
const { URL, URLSearchParams } = require('url');

// Assign through the Proxy so expo's setters record the concrete values.
// Using Object.defineProperty would bypass the Proxy setter and leave
// the lazy getter installed.
globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;

// structuredClone is built-in in Node 17+, but expo polyfills it on older
// environments. Ensure it exists so the lazy getter never fires.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClone(val) {
    return JSON.parse(JSON.stringify(val));
  };
}
