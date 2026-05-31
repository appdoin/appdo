import { createContext, useContext, useCallback, useRef } from 'react'

const DataCacheCtx = createContext({
  getCached: () => null,
  setCache: () => {},
  invalidate: () => {},
  invalidateAll: () => {},
  fetchWithCache: async () => { throw new Error('No cache provider') },
})

export const useDataCache = () => useContext(DataCacheCtx)

const DEFAULT_MAX_AGE = 60_000

export function DataCacheProvider({ children }) {
  const cacheRef = useRef(new Map())

  const getCached = useCallback((key, maxAgeMs = DEFAULT_MAX_AGE) => {
    const entry = cacheRef.current.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > maxAgeMs) {
      cacheRef.current.delete(key)
      return null
    }
    return entry.data
  }, [])

  const setCache = useCallback((key, data) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() })
  }, [])

  const invalidate = useCallback((key) => {
    cacheRef.current.delete(key)
  }, [])

  const invalidateAll = useCallback(() => {
    cacheRef.current.clear()
  }, [])

  const fetchWithCache = useCallback(async (key, fetcher, maxAgeMs = DEFAULT_MAX_AGE) => {
    const cached = getCached(key, maxAgeMs)
    if (cached !== null) return cached
    const data = await fetcher()
    setCache(key, data)
    return data
  }, [getCached, setCache])

  return (
    <DataCacheCtx.Provider value={{ getCached, setCache, invalidate, invalidateAll, fetchWithCache }}>
      {children}
    </DataCacheCtx.Provider>
  )
}
