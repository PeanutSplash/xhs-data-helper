#!/usr/bin/env node

const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function getPlatformKey() {
  const platform = process.platform
  const arch = process.arch
  return `${platform}-${arch}`
}

/**
 * Install Node.js dependencies in python-engine directory
 * Required for PyExecJS to execute JavaScript code
 */
async function installNodeDependencies() {
  const pythonEngineDir = path.join(__dirname, '..', 'python-engine')
  const packageJsonPath = path.join(pythonEngineDir, 'package.json')

  // Check if package.json exists
  if (!fs.existsSync(packageJsonPath)) {
    console.log('⚠️  No package.json found in python-engine, skipping Node.js dependencies')
    return
  }

  // Check if node_modules already exists and is up to date
  const nodeModulesPath = path.join(pythonEngineDir, 'node_modules')
  if (fs.existsSync(nodeModulesPath)) {
    console.log('ℹ️  node_modules already exists in python-engine')
  }

  console.log('📦 Installing Node.js dependencies in python-engine...')

  return new Promise((resolve, reject) => {
    // Determine package manager (prefer pnpm, fallback to npm)
    let packageManager = 'npm'
    try {
      execSync('pnpm --version', { stdio: 'ignore' })
      packageManager = 'pnpm'
    } catch {
      // pnpm not available, use npm
    }

    const installArgs = packageManager === 'pnpm'
      ? ['install', '--frozen-lockfile']
      : ['install']

    console.log(`Using ${packageManager} to install dependencies...`)

    const install = spawn(packageManager, installArgs, {
      cwd: pythonEngineDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    install.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Node.js dependencies installed successfully')
        resolve()
      } else {
        console.error(`\n❌ ${packageManager} install failed with exit code ${code}`)
        reject(new Error(`${packageManager} install failed with exit code ${code}`))
      }
    })

    install.on('error', (error) => {
      console.error(`\n❌ Failed to spawn ${packageManager}: ${error.message}`)
      reject(error)
    })
  })
}

async function installDependencies(platformKey) {
  const pythonDir = path.join(__dirname, '..', 'resources', 'python', platformKey, 'python')
  const pythonBin = process.platform === 'win32'
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3')

  const requirementsFile = path.join(__dirname, '..', 'python-engine', 'requirements.txt')
  const packagesDir = path.join(__dirname, '..', 'resources', 'python-packages')

  // Check if Python exists
  if (!fs.existsSync(pythonBin)) {
    console.error(`❌ Python not found at ${pythonBin}`)
    console.error(`Please run: node scripts/download-python.js ${platformKey}`)
    process.exit(1)
  }

  // Check if requirements.txt exists
  if (!fs.existsSync(requirementsFile)) {
    console.error(`❌ requirements.txt not found at ${requirementsFile}`)
    process.exit(1)
  }

  // Create packages directory
  if (!fs.existsSync(packagesDir)) {
    fs.mkdirSync(packagesDir, { recursive: true })
  }

  console.log(`Installing Python dependencies for ${platformKey}...`)
  console.log(`Python: ${pythonBin}`)
  console.log(`Requirements: ${requirementsFile}`)
  console.log(`Target: ${packagesDir}`)

  return new Promise((resolve, reject) => {
    const pip = spawn(pythonBin, [
      '-m',
      'pip',
      'install',
      '-r',
      requirementsFile,
      '--target',
      packagesDir,
      '--upgrade',
    ], { stdio: 'inherit' })

    pip.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Python dependencies installed successfully')
        resolve()
      } else {
        console.error(`\n❌ pip install failed with exit code ${code}`)
        reject(new Error(`pip install failed with exit code ${code}`))
      }
    })

    pip.on('error', (error) => {
      console.error(`\n❌ Failed to spawn pip: ${error.message}`)
      reject(error)
    })
  })
}

// Main
async function main() {
  const targetPlatform = process.argv[2] || getPlatformKey()
  console.log(`Target platform: ${targetPlatform}`)

  try {
    // Install Node.js dependencies first (required for PyExecJS)
    await installNodeDependencies()

    // Then install Python dependencies
    await installDependencies(targetPlatform)

    console.log('\n🎉 All dependencies installed successfully!')
  } catch (error) {
    console.error('Installation failed:', error.message)
    process.exit(1)
  }
}

main()
