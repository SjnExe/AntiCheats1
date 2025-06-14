/**
 * @file AntiCheatsBP/scripts/core/reportManager.js
 * Manages player-submitted reports. Reports are stored in a world dynamic property
 * with an in-memory cache for performance. This includes adding reports, retrieving them,
 * and clearing reports.
 * @version 1.0.1
 */
import { world } from '@minecraft/server';
import * as playerUtils from '../utils/playerUtils.js'; // For console logging consistency if needed

/**
 * @const {string} reportsPropertyKeyName - The dynamic property key used for storing player reports.
 */
const reportsPropertyKeyName = "anticheat:reports_v1"; // Changed to camelCase, added version

/**
 * @const {number} maxReportsCount - Maximum number of report entries to keep in memory and persisted storage.
 */
const maxReportsCount = 100; // Changed to camelCase

/**
 * @typedef {object} ReportEntry
 * @property {string} id - Unique ID for the report.
 * @property {number} timestamp - Unix timestamp (ms) of when the report was created.
 * @property {string} reporterId - ID of the player who made the report.
 * @property {string} reporterName - NameTag of the player who made the report.
 * @property {string} reportedId - ID of the player who was reported.
 * @property {string} reportedName - NameTag of the player who was reported.
 * @property {string} reason - The reason provided for the report.
 */

/**
 * @type {ReportEntry[]}
 * In-memory cache for report entries. Initialized on script load.
 */
let reportsInMemory = [];

/**
 * @type {boolean}
 * Flag indicating if the in-memory reports have changed and need to be persisted.
 */
let reportsAreDirty = false;

/**
 * Generates a somewhat unique report ID combining timestamp and random characters.
 * @returns {string} A unique report ID.
 */
function generateReportId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Loads reports from the dynamic property into the in-memory cache.
 * Should be called once during script initialization.
 * @returns {void}
 */
function initializeReportCache() {
    try {
        const rawReports = world.getDynamicProperty(reportsPropertyKeyName);
        if (typeof rawReports === 'string') {
            const parsedReports = JSON.parse(rawReports);
            if (Array.isArray(parsedReports)) {
                reportsInMemory = parsedReports;
                // Ensure reports are sorted newest first if not already (optional, depends on how they were saved)
                // For now, assume they are saved in desired order or rely on addReport's unshift.
                console.log(`[ReportManager] Successfully loaded ${reportsInMemory.length} reports into memory cache.`);
                return;
            }
        }
        console.log(`[ReportManager] No valid reports found in dynamic properties for key '${reportsPropertyKeyName}'. Initializing with empty cache.`);
    } catch (error) {
        console.warn(`[ReportManager] Error reading or parsing reports from dynamic property during initialization: ${error.stack || error}`);
    }
    reportsInMemory = []; // Ensure reportsInMemory is an array
}

// Initialize the report cache when the script module loads.
(function() {
    initializeReportCache();
})();

/**
 * Persists the current in-memory report cache to dynamic properties if changes have been made.
 * @returns {boolean} True if saving was successful or not needed, false on error.
 */
export function persistReportsToDisk() {
    if (!reportsAreDirty && world.getDynamicProperty(reportsPropertyKeyName) !== undefined) {
        // console.log("[ReportManager] persistReportsToDisk: No changes to save.");
        return true;
    }
    try {
        world.setDynamicProperty(reportsPropertyKeyName, JSON.stringify(reportsInMemory));
        reportsAreDirty = false; // Reset dirty flag after successful save
        console.log(`[ReportManager] Successfully persisted ${reportsInMemory.length} reports to dynamic property.`);
        return true;
    } catch (error) {
        console.error(`[ReportManager] Error saving reports to dynamic property: ${error.stack || error}`);
        return false;
    }
}

/**
 * Retrieves reports from the in-memory cache. Reports are stored newest first if added via `addReport`.
 * @returns {ReportEntry[]} An array of report objects (a copy of the cache).
 */
export function getReports() {
    // Return a copy to prevent external modification of the cache
    return [...reportsInMemory];
}

/**
 * Adds a new player report to the in-memory cache and marks reports as dirty for saving.
 * Manages report limits by removing the oldest if `maxReportsCount` is exceeded.
 * New reports are added to the beginning of the array (newest first).
 * @param {import('@minecraft/server').Player} reporterPlayer - The player making the report.
 * @param {import('@minecraft/server').Player} reportedPlayer - The player being reported.
 * @param {string} reason - The reason for the report.
 * @returns {ReportEntry | null} The newly created report object, or null if arguments are invalid.
 */
export function addReport(reporterPlayer, reportedPlayer, reason) {
    if (!reporterPlayer?.id || !reporterPlayer?.nameTag ||
        !reportedPlayer?.id || !reportedPlayer?.nameTag || !reason) {
        console.warn("[ReportManager] addReport called with invalid arguments (player objects or reason missing/invalid).");
        return null;
    }

    const newReport = {
        id: generateReportId(),
        timestamp: Date.now(),
        reporterId: reporterPlayer.id,
        reporterName: reporterPlayer.nameTag,
        reportedId: reportedPlayer.id,
        reportedName: reportedPlayer.nameTag,
        reason: reason.trim() // Trim reason
    };

    reportsInMemory.unshift(newReport); // Add new report to the beginning (newest first)

    if (reportsInMemory.length > maxReportsCount) {
        reportsInMemory.length = maxReportsCount; // Truncate to keep only newest N entries
    }

    reportsAreDirty = true;
    console.log(`[ReportManager] Added report by ${newReport.reporterName} against ${newReport.reportedName}. Cache size: ${reportsInMemory.length}.`);

    // Strategy: Save immediately. For high frequency, this should be deferred.
    return newReport;
}

/**
 * Clears all stored player reports from memory and persists the empty list.
 * @returns {boolean} True if clearing and persisting was successful.
 */
export function clearAllReports() {
    reportsInMemory = [];
    reportsAreDirty = true;
    console.log("[ReportManager] All reports cleared from memory. Attempting to persist change.");
    return persistReportsToDisk();
}

/**
 * Clears a specific report from storage by its ID.
 * Operates on the in-memory cache and then persists changes.
 * @param {string} reportId - The ID of the report to clear.
 * @returns {boolean} True if a report was found and cleared (and persisted), false otherwise.
 */
export function clearReportById(reportId) {
    const initialCount = reportsInMemory.length;
    reportsInMemory = reportsInMemory.filter(report => report.id !== reportId);

    if (reportsInMemory.length < initialCount) {
        reportsAreDirty = true;
        console.log(`[ReportManager] Cleared report with ID: ${reportId} from memory. Attempting to persist.`);
        return persistReportsToDisk();
    }
    console.log(`[ReportManager] Report with ID: ${reportId} not found for clearing.`);
    return false;
}
