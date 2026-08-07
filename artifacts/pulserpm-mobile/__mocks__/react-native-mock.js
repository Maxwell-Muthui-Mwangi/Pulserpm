/**
 * Minimal react-native mock for jest unit tests.
 * Provides only what BackgroundSync.ts and AppContext.tsx actually need.
 * No native module loading, no expo runtime.
 */
'use strict';

const AppState = {
  currentState: 'active',
  addEventListener: jest.fn((_event, _handler) => ({ remove: jest.fn() })),
};

const Platform = {
  OS: 'android',
  select: (obj) => obj.android ?? obj.default,
};

module.exports = {
  AppState,
  Platform,
};
