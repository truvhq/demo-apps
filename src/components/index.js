/**
 * FILE SUMMARY: Barrel file re-exporting all shared components
 * DATA FLOW: Barrel file: no logic or backend communication
 *
 * Single import point for layout primitives, hooks, report components,
 * and utilities used across all demo screens.
 */

// Layout and shell components
export { Layout } from './Layout.jsx';
export { Panel } from './Panel.jsx';

// Report display
export { OrderResults } from './OrderResults.jsx';

// Webhook feed and waiting UI
export { WebhookFeed, WaitingScreen, parsePayload } from './WebhookFeed.jsx';

// Hooks: polling and report fetching
export { usePanel, API_BASE } from './hooks.js';
export { useReportFetch } from './useReportFetch.js';

// Intro and diagram components
export { IntroSlide } from './IntroSlide.jsx';
export { MermaidDiagram } from './MermaidDiagram.jsx';

// Form components
export { ApplicationForm } from './ApplicationForm.jsx';

// Document Collections constants and components
export { TERMINAL_FILE_STATUSES } from './collectionStatus.js';
export { FileProcessingErrors } from './FileProcessingErrors.jsx';
