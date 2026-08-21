'use strict'

/**
 * Rebuild native modules for the architecture currently being packaged.
 *
 * electron-builder with `npmRebuild: false` (required for multi-arch packs)
 * would otherwise ship the host-arch better-sqlite3 binary into every target
 * (e.g. arm64 .node inside the Intel x64 .dmg) — see #18.
 */

const path = require('path')
const { archName } = require('./native-arch')

/** @param {import('electron-builder').BeforePackContext} context */
exports.default = async function beforePack(context) {
  const arch = archName(context.arch)
  const projectDir = context.packager.projectDir
  const electronVersion = require(path.join(projectDir, 'node_modules/electron/package.json')).version

  console.log(`[beforePack] Rebuilding better-sqlite3 for ${context.electronPlatformName}-${arch} (electron ${electronVersion})`)

  const { rebuild } = require('@electron/rebuild')

  await rebuild({
    buildPath: projectDir,
    electronVersion,
    arch,
    force: true,
    onlyModules: ['better-sqlite3']
  })

  console.log(`[beforePack] better-sqlite3 rebuild complete for ${arch}`)
}
