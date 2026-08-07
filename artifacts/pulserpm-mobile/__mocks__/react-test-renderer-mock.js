/**
 * Minimal react-test-renderer stub so @testing-library/react-native can import
 * it without pulling in the real renderer (which requires native modules).
 */
'use strict';

const React = require('react');

let _currentRoot = null;

const act = (cb) => {
  const result = cb();
  if (result && typeof result.then === 'function') {
    return result;
  }
  return Promise.resolve();
};

const create = (element) => {
  _currentRoot = element;
  return {
    root: { findAll: () => [] },
    update: (el) => { _currentRoot = el; },
    unmount: () => { _currentRoot = null; },
    toJSON: () => null,
  };
};

module.exports = { create, act };
