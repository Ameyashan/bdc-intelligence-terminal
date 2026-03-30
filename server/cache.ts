/**
 * cache.ts — File-based cache layer
 * Caches raw EDGAR XML bytes and normalized output to /cache/*.json
 * TTL: 24 hours (configurable)
 */

import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "cache");
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePath(key: string): string {
  // Sanitize key to be filename-safe
  const safe = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

/** Return cached value if it exists and is fresh. */
export function cacheGet<T>(key: string): T | null {
  ensureCacheDir();
  const file = cachePath(key);
  if (!fs.existsSync(file)) return null;

  try {
    const stat = fs.statSync(file);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > TTL_MS) {
      console.log(`[cache] STALE  ${key} (age ${Math.round(ageMs / 60000)}m)`);
      return null;
    }
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    console.log(`[cache] HIT    ${key} (age ${Math.round(ageMs / 60000)}m)`);
    return parsed as T;
  } catch (e) {
    console.error(`[cache] Read error for ${key}:`, e);
    return null;
  }
}

/** Write value to cache. */
export function cacheSet<T>(key: string, value: T): void {
  ensureCacheDir();
  const file = cachePath(key);
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
    console.log(`[cache] WRITE  ${key}`);
  } catch (e) {
    console.error(`[cache] Write error for ${key}:`, e);
  }
}

/** Delete a specific cache entry. */
export function cacheDelete(key: string): void {
  ensureCacheDir();
  const file = cachePath(key);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`[cache] DELETE ${key}`);
  }
}

/** Get cache file stats for diagnostics. */
export function cacheStats(): Array<{ key: string; ageMin: number; sizeKb: number }> {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const stat = fs.statSync(path.join(CACHE_DIR, f));
    return {
      key: f.replace(".json", ""),
      ageMin: Math.round((Date.now() - stat.mtimeMs) / 60000),
      sizeKb: Math.round(stat.size / 1024),
    };
  });
}
