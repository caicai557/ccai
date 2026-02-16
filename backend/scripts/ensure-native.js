#!/usr/bin/env node
/* eslint-env node */

const { spawnSync } = require('node:child_process');

function getErrorMessage(error) {
  if (!error) return '';
  return [error.message, error.stack, String(error)].filter(Boolean).join('\n');
}

function isNativeAbiMismatch(message) {
  const text = message.toLowerCase();
  return (
    text.includes('node_module_version') ||
    text.includes('was compiled against a different node.js version') ||
    text.includes('module version mismatch') ||
    text.includes('better_sqlite3.node')
  );
}

function tryLoadBetterSqlite3() {
  return require('better-sqlite3');
}

function rebuildBetterSqlite3() {
  const result = spawnSync('pnpm', ['rebuild', 'better-sqlite3'], {
    cwd: __dirname + '/..',
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`pnpm rebuild better-sqlite3 失败，退出码: ${result.status}`);
  }
}

function main() {
  try {
    tryLoadBetterSqlite3();
    console.log(
      `[native] better-sqlite3 已就绪（Node ${process.version}, ABI ${process.versions.modules}）`,
    );
    return;
  } catch (error) {
    const message = getErrorMessage(error);

    if (!isNativeAbiMismatch(message)) {
      throw error;
    }

    console.warn('[native] 检测到 better-sqlite3 ABI 不匹配，开始自动 rebuild...');
    rebuildBetterSqlite3();

    tryLoadBetterSqlite3();
    console.log('[native] better-sqlite3 rebuild 成功，已通过加载校验。');
  }
}

main();
