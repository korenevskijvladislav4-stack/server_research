/**
 * Utility functions for GEO field handling
 */

/**
 * Parse GEO value from various formats to array
 */
export function parseGeoValue(geo: any): string[] | null {
  if (!geo) return null;

  if (Array.isArray(geo)) {
    return geo
      .filter((g) => g && String(g).trim())
      .map((g) => String(g).trim().toUpperCase());
  }

  if (typeof geo === 'string') {
    const geoStr = geo.trim();
    if (!geoStr) return null;

    // Check if JSON
    if (geoStr.startsWith('[') || geoStr.startsWith('{')) {
      try {
        const parsed = JSON.parse(geoStr);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr
          .filter((g) => g && String(g).trim())
          .map((g) => String(g).trim().toUpperCase());
      } catch {
        // Not valid JSON, continue to comma-separated parsing
      }
    }

    // Parse as comma-separated
    const parts = geoStr
      .split(/[,;]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    
    return parts.length > 0 ? parts : null;
  }

  return null;
}

/**
 * Convert GEO array to JSON string for database storage
 */
export function geoToJson(geo: any): string | null {
  const parsed = parseGeoValue(geo);
  return parsed && parsed.length > 0 ? JSON.stringify(parsed) : null;
}

/**
 * Parse GEO from database value
 */
export function geoFromDb(dbValue: any): string[] | null {
  if (!dbValue) return null;

  if (typeof dbValue === 'string') {
    try {
      const parsed = JSON.parse(dbValue);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [dbValue];
    }
  }

  if (Array.isArray(dbValue)) {
    return dbValue;
  }

  return null;
}
