#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)

const archIndex = process.argv.indexOf('--arch')
const requestedArch = (archIndex >= 0 ? process.argv[archIndex + 1] : '') || process.env.TARGET_ARCH || process.arch
const targets = {
  arm64: 'arm64-apple-macosx14.4',
  x64: 'x86_64-apple-macosx14.4',
}
const cpuTypes = { arm64: 0x0100000c, x64: 0x01000007 }
if (requestedArch === 'universal') {
  // electron-builder's universal target contains both slices. Build each one
  // explicitly, then combine them instead of silently shipping an arm64-only
  // helper inside an otherwise universal app.
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const outputDir = join(projectRoot, 'resources', 'bin')
  const outputPath = join(outputDir, 'macos-audio-tap')
  const slices = ['arm64', 'x64'].map((arch) => `${outputPath}.${arch}`)
  const sourcePath = join(projectRoot, 'resources', 'macos-audio-tap.swift')
  const infoPlistPath = join(projectRoot, 'resources', 'macos-audio-tap-Info.plist')
  const moduleCache = join(outputDir, '.swift-module-cache')
  mkdirSync(outputDir, { recursive: true })
  if (!existsSync(sourcePath) || !existsSync(infoPlistPath)) {
    console.error(`[audio-tap] Swift source or helper Info.plist is missing`)
    process.exit(1)
  }
  const compileSlice = (arch, slicePath) => {
    const result = spawnSync('xcrun', [
      'swiftc', sourcePath, '-O', '-target', targets[arch],
      '-module-cache-path', moduleCache, '-o', slicePath,
      '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', infoPlistPath,
      '-framework', 'CoreAudio', '-framework', 'AudioToolbox',
      '-framework', 'AVFoundation', '-framework', 'Foundation',
    ], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`swiftc failed for ${arch}`)
    chmodSync(slicePath, 0o755)
  }
  try {
    // Recompile to dedicated paths so no stale architecture can be copied.
    compileSlice('arm64', slices[0])
    compileSlice('x64', slices[1])
    const lipo = spawnSync('lipo', ['-create', ...slices, '-output', outputPath], { stdio: 'inherit' })
    if (lipo.status !== 0) throw new Error('lipo failed')
    chmodSync(outputPath, 0o755)
  } catch (error) {
    console.error(`[audio-tap] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    for (const slice of slices) {
      try { unlinkSync(slice) } catch { /* stale slice did not exist */ }
    }
  }
  if (process.exitCode) process.exit(process.exitCode)
  console.log(`[audio-tap] Built ${outputPath} (universal)`)
  process.exit(0)
}

const target = targets[requestedArch]
if (!target) {
  console.error(`[audio-tap] Unsupported architecture: ${requestedArch}`)
  process.exit(1)
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(projectRoot, 'resources', 'macos-audio-tap.swift')
const infoPlistPath = join(projectRoot, 'resources', 'macos-audio-tap-Info.plist')
const outputDir = join(projectRoot, 'resources', 'bin')
const outputPath = join(outputDir, 'macos-audio-tap')
const moduleCache = join(outputDir, '.swift-module-cache')
const hashPath = join(outputDir, `.macos-audio-tap.${requestedArch}.sha256`)

if (!existsSync(sourcePath)) {
  console.error(`[audio-tap] Swift source not found at ${sourcePath}`)
  process.exit(1)
}
if (!existsSync(infoPlistPath)) {
  console.error(`[audio-tap] Helper Info.plist not found at ${infoPlistPath}`)
  process.exit(1)
}
mkdirSync(outputDir, { recursive: true })
mkdirSync(moduleCache, { recursive: true })

function isCorrectArch(path) {
  try {
    const header = readFileSync(path).subarray(0, 8)
    return header.readUInt32LE(0) === 0xfeedfacf && header.readInt32LE(4) === cpuTypes[requestedArch]
  } catch {
    return false
  }
}

const sourceHash = createHash('sha256')
  .update(readFileSync(sourcePath))
  .update(readFileSync(infoPlistPath))
  .digest('hex')
let needsBuild = !existsSync(outputPath) || !isCorrectArch(outputPath)
if (!needsBuild && existsSync(hashPath)) needsBuild = readFileSync(hashPath, 'utf8').trim() !== sourceHash
if (!needsBuild && existsSync(outputPath)) needsBuild = statSync(outputPath).mtimeMs < statSync(sourcePath).mtimeMs
if (!needsBuild) {
  console.log(`[audio-tap] ${requestedArch} helper is up to date`)
  process.exit(0)
}

const args = [
  'swiftc', sourcePath, '-O', '-target', target,
  '-module-cache-path', moduleCache,
  '-o', outputPath,
  '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', infoPlistPath,
  '-framework', 'CoreAudio',
  '-framework', 'AudioToolbox',
  '-framework', 'AVFoundation',
  '-framework', 'Foundation',
]
const result = spawnSync('xcrun', args, { stdio: 'inherit' })
if (result.status !== 0) {
  console.error('[audio-tap] Failed to compile macOS CoreAudio Tap helper')
  process.exit(result.status ?? 1)
}

chmodSync(outputPath, 0o755)
if (!isCorrectArch(outputPath)) {
  console.error(`[audio-tap] Compiled helper has the wrong architecture; expected ${requestedArch}`)
  process.exit(1)
}
writeFileSync(hashPath, `${sourceHash}\n`)
console.log(`[audio-tap] Built ${outputPath} (${requestedArch})`)
