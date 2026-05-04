/**
 * FILE SUMMARY: Shared constants for the Document Collections API.
 * DATA FLOW: No backend communication; pure constants consumed by demo components.
 */

// Terminal file statuses returned by GET /api/collections/:id.
// A file with any of these statuses will not change again, so polling can stop.
export const TERMINAL_FILE_STATUSES = ['successful', 'failed', 'duplicate', 'invalid'];
