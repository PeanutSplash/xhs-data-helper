#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const { promisify } = require('util')
const zlib = require('zlib')
const tar = require('tar')

const streamPipeline = promisify(pipeline)

const PYTHON_VERSION = '3.11.9+20240726'
const RELEASE_TAG = '20240726'

const PLATFORMS = {
  'darwin-arm64': `cpython-${PYTHON_VERSION}-aarch64-apple-darwin-install_only.tar.gz`,
  'darwin-x64': `cpython-${PYTHON_VERSION}-x86_64-apple-darwin-install_only.tar.gz`,
  'linux-x64': `cpython-${PYTHON_VERSION}-x86_64-unknown-linux-gnu-install_only.tar.gz`,
  'linux-arm64': `cpython-${PYTHON_VERSION}-aarch64-unknown-linux-gnu-install_only.tar.gz`,
  'win32-x64': `cpython-${PYTHON_VERSION}-x86_64-pc-windows-msvc-shared-install_only.tar.gz`,
  'win32-arm64': `cpython-${PYTHON_VERSION}-aarch64-pc-windows-msvc-shared-install_only.tar.gz`,
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

async function extract(tarPath, destDir) {
  console.log(`Extracting to ${destDir}...`)

  await fs.promises.mkdir(destDir, { recursive: true })

  await tar.extract({
    file: tarPath,
    cwd: destDir,
    strip: 1, // 移除顶层目录
  })

  console.log('Extraction completed!')
}

async function downloadAndSetup(platformKey) {
  const filename = PLATFORMS[platformKey]

  if (!filename) {
    console.error(`Unsupported platform: ${platformKey}`)
    console.error(`Supported platforms: ${Object.keys(PLATFORMS).join(', ')}`)
    process.exit(1)
  }

  const url = `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/${filename}`
  const resourcesDir = path.join(__dirname, '..', 'resources', 'python', platformKey)
  const tarPath = path.join(resourcesDir, filename)
  const pythonDir = path.join(resourcesDir, 'python')

  // 检查是否已下载
  if (fs.existsSync(pythonDir)) {
    console.log(`Python already exists at ${pythonDir}`)
    return
  }

  console.log(`Downloading Python ${PYTHON_VERSION} for ${platformKey}...`)
  console.log(`URL: ${url}`)

  // 创建目录
  await fs.promises.mkdir(resourcesDir, { recursive: true })

  // 下载
  await download(url, tarPath)

  // 解压
  await extract(tarPath, pythonDir)

  // 清理 tar 文件
  await fs.promises.unlink(tarPath)
  console.log('Cleaned up tar file')

  console.log(`\n✅ Python setup completed at: ${pythonDir}`)
}

// 主逻辑
const targetPlatform = process.argv[2] || getPlatformKey()

console.log(`Setting up Python for platform: ${targetPlatform}`)
downloadAndSetup(targetPlatform).catch((error) => {
  console.error('❌ Setup failed:', error.message)
  process.exit(1)
})
