const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclude nodemailer's ephemeral postinstall temp directories.
// nodemailer v9 compiles TypeScript during postinstall, creates a tmp dir,
// then removes it — if Metro's file watcher races with the cleanup it throws
// ENOENT. The blockList regex prevents Metro from watching those paths at all.
const { blockList: existingBlockList } = config.resolver;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  /nodemailer_tmp_[^/]+\//,
];

module.exports = config;
