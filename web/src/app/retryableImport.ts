export function createRetryableImport<T>(importModule: () => Promise<T>): () => Promise<T> {
  let importPromise: Promise<T> | null = null

  return () => {
    if (importPromise) return importPromise

    const nextImportPromise = importModule().catch((error: unknown) => {
      if (importPromise === nextImportPromise) importPromise = null
      throw error
    })
    importPromise = nextImportPromise
    return nextImportPromise
  }
}
