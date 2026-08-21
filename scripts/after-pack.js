'use strict'

/**
 * Fail packaging if the shipped better-sqlite3 binary does not match the
 * target architecture (guards against arch contamination across multi-arch builds).
 */

const {
  archName,
  detectBinaryArch,
  betterSqliteBinaryPath,
  findResourcesDir
} = require('./native-arch')

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPack(context) {
  const expectedArch = archName(context.arch)
  if (expectedArch === 'universal') {
    // Universal merges arch-specific apps; per-arch checks already ran.
    return
  }

  const resourcesDir = findResourcesDir(context.appOutDir, context.electronPlatformName)
  if (!resourcesDir) {
    throw new Error(
      `[afterPack] Could not locate Resources for ${context.electronPlatformName} in ${context.appOutDir}`
    )
  }

  const binaryPath = betterSqliteBinaryPath(resourcesDir)
  const actualArch = detectBinaryArch(binaryPath, context.electronPlatformName)

  if (!actualArch) {
    throw new Error(
      `[afterPack] better-sqlite3 native binary missing or unreadable at:\n  ${binaryPath}`
    )
  }

  if (actualArch !== expectedArch) {
    throw new Error(
      `[afterPack] FATAL: better-sqlite3 arch mismatch — refusing to ship a broken build.\n` +
        `  expected: ${expectedArch}\n` +
        `  actual:   ${actualArch}\n` +
        `  path:     ${binaryPath}`
    )
  }

  console.log(`[afterPack] verified better-sqlite3 is ${actualArch} for ${context.electronPlatformName}`)
}
