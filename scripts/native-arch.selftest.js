'use strict'

/**
 * Lightweight self-check for native-arch helpers (no Electron required).
 * Run: node scripts/native-arch.selftest.js
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { archName, detectBinaryArch } = require('./native-arch')

assert.strictEqual(archName(1), 'x64')
assert.strictEqual(archName(3), 'arm64')
assert.strictEqual(archName('x64'), 'x64')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-arch-'))

// Minimal PE (Windows) x64
{
  const pe = Buffer.alloc(0x100)
  pe.write('MZ', 0)
  pe.writeUInt32LE(0x80, 0x3c)
  pe.write('PE\0\0', 0x80)
  pe.writeUInt16LE(0x8664, 0x84) // Machine = AMD64
  const p = path.join(tmp, 'win-x64.node')
  fs.writeFileSync(p, pe)
  assert.strictEqual(detectBinaryArch(p, 'win32'), 'x64')
}

// Minimal PE ARM64
{
  const pe = Buffer.alloc(0x100)
  pe.write('MZ', 0)
  pe.writeUInt32LE(0x80, 0x3c)
  pe.write('PE\0\0', 0x80)
  pe.writeUInt16LE(0xaa64, 0x84)
  const p = path.join(tmp, 'win-arm64.node')
  fs.writeFileSync(p, pe)
  assert.strictEqual(detectBinaryArch(p, 'win32'), 'arm64')
}

// Minimal Mach-O 64 little-endian x86_64
{
  const macho = Buffer.alloc(32)
  macho.writeUInt32LE(0xfeedfacf, 0)
  macho.writeInt32LE(0x01000007, 4) // CPU_TYPE_X86_64
  const p = path.join(tmp, 'mac-x64.node')
  fs.writeFileSync(p, macho)
  assert.strictEqual(detectBinaryArch(p, 'darwin'), 'x64')
}

// Minimal Mach-O 64 little-endian arm64
{
  const macho = Buffer.alloc(32)
  macho.writeUInt32LE(0xfeedfacf, 0)
  macho.writeInt32LE(0x0100000c, 4) // CPU_TYPE_ARM64
  const p = path.join(tmp, 'mac-arm64.node')
  fs.writeFileSync(p, macho)
  assert.strictEqual(detectBinaryArch(p, 'darwin'), 'arm64')
}

// Minimal ELF x86_64
{
  const elf = Buffer.alloc(64)
  elf[0] = 0x7f
  elf.write('ELF', 1)
  elf[4] = 2 // 64-bit
  elf[5] = 1 // little-endian
  elf.writeUInt16LE(62, 18) // EM_X86_64
  const p = path.join(tmp, 'linux-x64.node')
  fs.writeFileSync(p, elf)
  assert.strictEqual(detectBinaryArch(p, 'linux'), 'x64')
}

// Minimal ELF aarch64
{
  const elf = Buffer.alloc(64)
  elf[0] = 0x7f
  elf.write('ELF', 1)
  elf[4] = 2
  elf[5] = 1
  elf.writeUInt16LE(183, 18) // EM_AARCH64
  const p = path.join(tmp, 'linux-arm64.node')
  fs.writeFileSync(p, elf)
  assert.strictEqual(detectBinaryArch(p, 'linux'), 'arm64')
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log('native-arch.selftest: ok')
