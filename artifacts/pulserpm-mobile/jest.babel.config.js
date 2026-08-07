/**
 * Jest-only Babel config.
 * Extends the main babel-preset-expo config with babel-plugin-dynamic-import-node
 * so that `await import(...)` calls inside modules under test are transformed to
 * synchronous `require()` calls, allowing jest.mock() to intercept them.
 */
module.exports = {
  presets: [
    ['babel-preset-expo', { unstable_transformImportMeta: true }],
  ],
  plugins: [
    // Transform dynamic import() to require() so jest can intercept them.
    'babel-plugin-dynamic-import-node',
  ],
};
