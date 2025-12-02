#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const { promisify } = require('util')
const zlib = require('zlib')
const tar = require('tar')
const AdmZip = require('adm-zip')

const streamPipeline = promisify(pipeline)

const PYTHON_VERSION = '3.11.9+20240726'
const RELEASE_TAG = '20240726'
const PYTHON_OFFICIAL_VERSION = '3.11.9'

// python-build-standalone platforms
const PLATFORMS = {
  'darwin-arm64': {
    url: `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}-aarch64-apple-darwin-install_only.tar.gz`,
    type: 'tar.gz'
  },
  'darwin-x64': {
    url: `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}-x86_64-apple-darwin-install_only.tar.gz`,
    type: 'tar.gz'
  },
  'linux-x64': {
    url: `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
    type: 'tar.gz'
  },
  'linux-arm64': {
    url: `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}-aarch64-unknown-linux-gnu-install_only.tar.gz`,
    type: 'tar.gz'
  },
  'win32-x64': {
    url: `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}-x86_64-pc-windows-msvc-shared-install_only.tar.gz`,
    type: 'tar.gz'
  },
  // Windows ARM64 uses official Python embeddable package (python-build-standalone doesn't provide it)
  'win32-arm64': {
    url: `https://www.python.org/ftp/python/${PYTHON_OFFICIAL_VERSION}/python-${PYTHON_OFFICIAL_VERSION}-embed-arm64.zip`,
    type: 'zip'
  },
}

function getPlatformKey() {
  const platform = process.platform
  const arch = process.arch
  return `${platform}-${arch}`
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'spider-xhs-desktop' }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 跟随重定向
        download(response.headers.location, dest).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`))
        return
      }

      const fileStream = fs.createWriteStream(dest)
      const totalBytes = parseInt(response.headers['content-length'], 10)
      let downloadedBytes = 0

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1)
        process.stdout.write(`\rDownloading: ${percent}%`)
      })

      streamPipeline(response, fileStream)
        .then(() => {
          console.log('\nDownload completed!')
          resolve()
        })
        .catch(reject)
    }).on('error', reject)
  })
}

async function extractTarGz(tarPath, destDir) {
  console.log(`Extracting tar.gz to ${destDir}...`)

  await fs.promises.mkdir(destDir, { recursive: true })

  await tar.extract({
    file: tarPath,
    cwd: destDir,
    strip: 1, // 移除顶层目录
  })

  console.log('Extraction completed!')
}

async function extractZip(zipPath, destDir) {
  console.log(`Extracting zip to ${destDir}...`)

  await fs.promises.mkdir(destDir, { recursive: true })

  const zip = new AdmZip(zipPath)
  zip.extractAllTo(destDir, true)

  console.log('Extraction completed!')
}

async function downloadAndSetup(platformKey) {
  const platformConfig = PLATFORMS[platformKey]

  if (!platformConfig) {
    console.error(`Unsupported platform: ${platformKey}`)
    console.error(`Supported platforms: ${Object.keys(PLATFORMS).join(', ')}`)
    process.exit(1)
  }

  const { url, type } = platformConfig
  const resourcesDir = path.join(__dirname, '..', 'resources', 'python', platformKey)
  const filename = path.basename(url)
  const archivePath = path.join(resourcesDir, filename)
  const pythonDir = path.join(resourcesDir, 'python')

  // 检查是否已下载
  if (fs.existsSync(pythonDir)) {
    console.log(`Python already exists at ${pythonDir}`)
    return
  }

  console.log(`Downloading Python for ${platformKey}...`)
  console.log(`URL: ${url}`)
  console.log(`Type: ${type}`)

  // 创建目录
  await fs.promises.mkdir(resourcesDir, { recursive: true })

  // 下载
  await download(url, archivePath)

  // 解压（根据类型选择解压方法）
  if (type === 'tar.gz') {
    await extractTarGz(archivePath, pythonDir)
  } else if (type === 'zip') {
    await extractZip(archivePath, pythonDir)
  } else {
    throw new Error(`Unsupported archive type: ${type}`)
  }

  // 清理归档文件
  await fs.promises.unlink(archivePath)
  console.log(`Cleaned up ${type} file`)

  console.log(`\n✅ Python setup completed at: ${pythonDir}`)
}

// 主逻辑
const targetPlatform = process.argv[2] || getPlatformKey()

console.log(`Setting up Python for platform: ${targetPlatform}`)
downloadAndSetup(targetPlatform).catch((error) => {
  console.error('❌ Setup failed:', error.message)
  process.exit(1)
})
