'use strict'

const fs = require('fs')
const { execFileSync } = require('child_process')

/** electron-builder Arch enum → Node arch name */
const ARCH_NAME = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal'
}

/**
 * @param {number|string} arch
 * @returns {string}
 */
function archName(arch) {
  if (typeof arch === 'string') return arch
  const name = ARCH_NAME[arch]
  if (!name) {
    throw new Error(`Unknown electron-builder Arch value: ${arch}`)
  }
  return name
}

/**
 * Detect CPU architecture of a native .node / shared library binary.
 * @param {string} binaryPath
 * @param {string} platform electronPlatformName: darwin | win32 | linux
 * @returns {'x64'|'arm64'|'ia32'|'armv7l'|null}
 */
function detectBinaryArch(binaryPath, platform) {
  if (!fs.existsSync(binaryPath)) return null

  if (platform === 'win32') {
    const buf = fs.readFileSync(binaryPath)
    if (buf.length < 0x40 || buf.toString('ascii', 0, 2) !== 'MZ') return null
    const peOffset = buf.readUInt32LE(0x3c)
    if (peOffset + 6 > buf.length || buf.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
      return null
    }
    const machine = buf.readUInt16LE(peOffset + 4)
    // IMAGE_FILE_MACHINE_*
    if (machine === 0x8664) return 'x64'
    if (machine === 0xaa64) return 'arm64'
    if (machine === 0x014c) return 'ia32'
    if (machine === 0x01c4) return 'armv7l'
    return null
  }

  // Mach-O / ELF — prefer `file` when available (macOS & Linux CI)
  try {
    const out = execFileSync('file', ['-b', binaryPath], { encoding: 'utf8' })
    if (/arm64|aarch64/i.test(out)) return 'arm64'
    if (/x86[_-]64|x86-64|Mach-O 64-bit.*x86_64/i.test(out)) return 'x64'
    if (/\barm\b|armv7/i.test(out)) return 'armv7l'
    if (/\bi386\b|\bx86\b/i.test(out)) return 'ia32'
  } catch {
    // fall through to header parse
  }

  const buf = fs.readFileSync(binaryPath)

  // Mach-O magic
  if (buf.length >= 8) {
    const magic = buf.readUInt32LE(0)
    // MH_MAGIC_64 / MH_CIGAM_64 / FAT
    if (magic === 0xfeedfacf || magic === 0xcffaedfe) {
      const cputype = magic === 0xfeedfacf ? buf.readInt32LE(4) : buf.readInt32BE(4)
      // CPU_TYPE_X86_64 = 0x01000007, CPU_TYPE_ARM64 = 0x0100000c
      if (cputype === 0x01000007 || cputype === 0x07000001) return 'x64'
      if (cputype === 0x0100000c || cputype === 0x0c000001) return 'arm64'
    }
  }

  // ELF e_machine
  if (buf.length >= 20 && buf[0] === 0x7f && buf.toString('ascii', 1, 4) === 'ELF') {
    const little = buf[5] === 1
    const em = little ? buf.readUInt16LE(18) : buf.readUInt16BE(18)
    if (em === 62) return 'x64' // EM_X86_64
    if (em === 183) return 'arm64' // EM_AARCH64
    if (em === 3) return 'ia32' // EM_386
    if (em === 40) return 'armv7l' // EM_ARM
  }

  return null
}

/**
 * Locate better_sqlite3.node inside a packaged app resources directory.
 * @param {string} resourcesDir
 * @returns {string}
 */
function betterSqliteBinaryPath(resourcesDir) {
  return require('path').join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  )
}

/**
 * @param {string} appOutDir
 * @param {string} electronPlatformName
 * @returns {string|null}
 */
function findResourcesDir(appOutDir, electronPlatformName) {
  const path = require('path')
  if (electronPlatformName === 'darwin' || electronPlatformName === 'mas') {
    const entries = fs.readdirSync(appOutDir).filter((name) => name.endsWith('.app'))
    if (entries.length === 0) return null
    return path.join(appOutDir, entries[0], 'Contents', 'Resources')
  }
  return path.join(appOutDir, 'resources')
}

module.exports = {
  ARCH_NAME,
  archName,
  detectBinaryArch,
  betterSqliteBinaryPath,
  findResourcesDir
}
