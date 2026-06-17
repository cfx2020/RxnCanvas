export function downloadText(fileName: string, content: string, type: string): void {
  triggerDownload(fileName, new Blob([content], { type }))
}

export function downloadData(fileName: string, data: string | Uint8Array, type: string): void {
  triggerDownload(fileName, new Blob([blobPartFromData(data)], { type }))
}

export function blobPartFromData(data: string | Uint8Array): BlobPart {
  if (typeof data === "string") return data
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function triggerDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
