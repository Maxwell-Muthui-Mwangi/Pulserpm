/**
 * Stub for expo/virtual/env — babel-preset-expo rewrites EXPO_PUBLIC_* env
 * references to import from this virtual module.  In tests, just forward
 * process.env so any EXPO_PUBLIC_* values set in the environment are readable.
 */
'use strict';

module.exports = { env: process.env };
