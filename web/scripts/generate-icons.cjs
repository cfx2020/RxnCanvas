const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { chromium } = require("playwright")

const projectRoot = path.resolve(__dirname, "..")
const buildDir = path.join(projectRoot, "build")
const sourceSvgPath = path.join(buildDir, "icon.svg")
const iconsetDir = path.join(buildDir, "icon.iconset")
const iconPngPath = path.join(buildDir, "icon.png")
const icoPath = path.join(buildDir, "icon.ico")
const icnsPath = path.join(buildDir, "icon.icns")

const iconsetTargets = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
]
const icoSizes = [16, 32, 48, 64, 128, 256]

async function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Missing source icon: ${sourceSvgPath}`)
  }

  fs.mkdirSync(iconsetDir, { recursive: true })
  const svg = fs.readFileSync(sourceSvgPath, "utf8")
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  const rendered = new Map()
  for (const size of uniqueSizes([...iconsetTargets.map((target) => target[1]), ...icoSizes, 1024])) {
    const buffer = await renderIcon(page, svg, size)
    rendered.set(size, buffer)
  }

  await browser.close()

  for (const [fileName, size] of iconsetTargets) {
    fs.writeFileSync(path.join(iconsetDir, fileName), rendered.get(size))
  }
  fs.writeFileSync(iconPngPath, rendered.get(1024))
  fs.writeFileSync(icoPath, createIco(icoSizes.map((size) => rendered.get(size))))
  generateIcns()

  console.log("RxnCanvas desktop icons generated")
}

function uniqueSizes(sizes) {
  return [...new Set(sizes)].sort((a, b) => a - b)
}

async function renderIcon(page, svg, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html,
          body {
            width: ${size}px;
            height: ${size}px;
            margin: 0;
            overflow: hidden;
            background: transparent;
          }
          svg {
            display: block;
            width: ${size}px;
            height: ${size}px;
          }
        </style>
      </head>
      <body>${svg}</body>
    </html>
  `)
  return page.screenshot({
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: true,
    type: "png",
  })
}

function createIco(pngBuffers) {
  const headerSize = 6
  const directorySize = 16 * pngBuffers.length
  const totalSize = headerSize + directorySize + pngBuffers.reduce((total, buffer) => total + buffer.length, 0)
  const ico = Buffer.alloc(totalSize)
  let offset = 0
  ico.writeUInt16LE(0, offset)
  offset += 2
  ico.writeUInt16LE(1, offset)
  offset += 2
  ico.writeUInt16LE(pngBuffers.length, offset)
  offset += 2

  let imageOffset = headerSize + directorySize
  pngBuffers.forEach((buffer) => {
    const size = pngSize(buffer)
    ico.writeUInt8(size.width >= 256 ? 0 : size.width, offset)
    ico.writeUInt8(size.height >= 256 ? 0 : size.height, offset + 1)
    ico.writeUInt8(0, offset + 2)
    ico.writeUInt8(0, offset + 3)
    ico.writeUInt16LE(1, offset + 4)
    ico.writeUInt16LE(32, offset + 6)
    ico.writeUInt32LE(buffer.length, offset + 8)
    ico.writeUInt32LE(imageOffset, offset + 12)
    buffer.copy(ico, imageOffset)
    offset += 16
    imageOffset += buffer.length
  })

  return ico
}

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("ICO input must be PNG data")
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function generateIcns() {
  if (process.platform !== "darwin") {
    console.warn("Skipping icon.icns generation outside macOS; icon.iconset remains available.")
    return
  }
  const result = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath], {
    cwd: projectRoot,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || "iconutil failed to generate icon.icns")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
