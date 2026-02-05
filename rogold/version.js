/**
 * RoGold Engine Versioning System
 * 
 * This module provides version constants and utilities for tracking
 * which engine version created/edited games. It enables:
 * - Version embedding in saved games
 * - Legacy game detection and compatibility
 * - Asset cache busting based on engine version
 * - Safe defaults for missing data in old games
 */

// Semantic versioning: MAJOR.MINOR.PATCH
export const ENGINE_VERSION = '1.0.0';

// Minimum supported version for compatibility
export const MINIMUM_COMPATIBLE_VERSION = '1.0.0';

// Version history for migration reference
export const VERSION_HISTORY = {
    '1.0.0': {
        releaseDate: '2024-01-01',
        features: ['Initial engine release', 'Basic part physics', 'Lua scripting'],
        migration: null
    },
    '1.1.0': {
        releaseDate: '2024-03-15',
        features: ['Enhanced physics', 'New asset loading'],
        migration: null
    }
};

/**
 * Get cache busting parameter for assets
 * @returns {string} Cache busting parameter (e.g., "v=1.0.0")
 */
export function getCacheBustParam() {
    return `v=${ENGINE_VERSION}`;
}

/**
 * Apply cache busting to an asset URL
 * @param {string} url - The original URL
 * @returns {string} URL with cache busting parameter
 */
export function bustAssetUrl(url) {
    if (!url || typeof url !== 'string') return url;
    
    // Skip data URLs and external URLs that shouldn't be cache busted
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}${getCacheBustParam()}`;
    }
    
    // For local URLs, apply cache busting
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${getCacheBustParam()}`;
}

/**
 * Compare two semantic versions
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a, b) {
    const parse = v => v.split('.').map(Number);
    const [majorA, minorA, patchA] = parse(a);
    const [majorB, minorB, patchB] = parse(b);
    
    if (majorA !== majorB) return majorA - majorB;
    if (minorA !== minorB) return minorA - minorB;
    return patchA - patchB;
}

/**
 * Check if version A is older than version B
 * @param {string} versionA - Version to check
 * @param {string} versionB - Version to compare against
 * @returns {boolean} True if versionA < versionB
 */
export function isVersionOlder(versionA, versionB) {
    return compareVersions(versionA, versionB) < 0;
}

/**
 * Check if version A is newer than version B
 * @param {string} versionA - Version to check
 * @param {string} versionB - Version to compare against
 * @returns {boolean} True if versionA > versionB
 */
export function isVersionNewer(versionA, versionB) {
    return compareVersions(versionA, versionB) > 0;
}

/**
 * Apply legacy defaults for games without version field
 * @param {Object} data - Game data object
 * @returns {Object} Game data with legacy defaults applied
 */
export function applyLegacyDefaults(data) {
    console.log('[VERSION] Applying legacy defaults for pre-version game data');
    
    return {
        ...data,
        // Mark as legacy for debugging
        _isLegacy: true,
        // Default settings for old games
        settings: {
            gravity: -196.2,
            friction: 0.4,
            restitution: 0.05,
            ...data.settings
        },
        // Apply legacy physics defaults to objects
        objects: Object.fromEntries(
            Object.entries(data.objects || {}).map(([name, obj]) => [
                name,
                {
                    ...obj,
                    // Legacy defaults - parts were always anchored by default
                    Anchored: obj.Anchored !== false,
                    // Legacy behavior - parts could collide by default
                    CanCollide: obj.CanCollide !== false,
                    // Legacy transparency handling
                    Transparency: obj.Transparency || 0,
                    // Default color for legacy parts
                    Color: obj.Color || [0.5, 0.5, 0.5]
                }
            ])
        )
    };
}

/**
 * Apply version compatibility migration
 * @param {Object} data - Game data object
 * @param {string} fromVersion - Original game version
 * @param {string} toVersion - Target engine version
 * @returns {Object} Migrated game data
 */
export function applyVersionCompatibility(data, fromVersion, toVersion) {
    console.log(`[VERSION] Applying compatibility migration: ${fromVersion} -> ${toVersion}`);
    
    const migrated = { ...data };
    migrated._migratedFrom = fromVersion;
    migrated._migratedTo = toVersion;
    migrated._migrationTimestamp = new Date().toISOString();
    
    // Migration from any version < 1.1.0 to 1.1.0+
    if (isVersionOlder(fromVersion, '1.1.0') && !isVersionOlder('1.1.0', toVersion)) {
        migrated.objects = Object.fromEntries(
            Object.entries(migrated.objects || {}).map(([name, obj]) => [
                name,
                {
                    ...obj,
                    // New properties added in 1.1.0
                    Mass: obj.Mass || 1,
                    Friction: obj.Friction || 0.4,
                    Restitution: obj.Restitution || 0.05
                }
            ])
        );
        console.log('[VERSION] Applied 1.1.0 compatibility changes');
    }
    
    return migrated;
}

/**
 * Log warnings for legacy games
 * @param {Object} data - Game data object
 */
export function logLegacyGameWarnings(data) {
    const version = data.engineVersion || 'unknown';
    
    console.group(`[VERSION] Loading game from engine version: ${version}`);
    
    if (!data.engineVersion) {
        console.warn('⚠️  This game was created with an unknown/old engine version (pre-1.0.0)');
        console.warn('⚠️  Some features may not work correctly');
        console.warn('💡 Consider re-saving this game in the latest RoGold Studio');
    } else if (isVersionOlder(version, '1.0.0')) {
        console.warn('⚠️  This game was created with a very old engine version');
        console.warn('⚠️  Physics behavior may differ from original');
    } else if (isVersionOlder(version, ENGINE_VERSION)) {
        console.warn(`⚠️  This game was created with engine version ${version}`);
        console.warn(`⚠️  Current engine version is ${ENGINE_VERSION}`);
        console.warn('💡 Some features may behave differently');
    }
    
    console.groupEnd();
}

/**
 * Create version info object for embedding in game data
 * @returns {Object} Version info object
 */
export function createVersionInfo() {
    return {
        engineVersion: ENGINE_VERSION,
        minimumCompatibleVersion: MINIMUM_COMPATIBLE_VERSION,
        savedAt: new Date().toISOString(),
        saveType: 'automatic'
    };
}

/**
 * Validate version string format (semantic versioning)
 * @param {string} version - Version string to validate
 * @returns {boolean} True if valid semantic version
 */
export function isValidVersion(version) {
    if (typeof version !== 'string') return false;
    const regex = /^\d+\.\d+\.\d+$/;
    return regex.test(version);
}
