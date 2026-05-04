/**
 * FILE SUMMARY: Lists uploaded files that did not reach the "successful" status.
 * DATA FLOW: Presentational: receives the list of failed files via props.
 *
 * Used on the Document Processing review screen to surface terminal-but-not-successful
 * file statuses (failed, invalid, duplicate) alongside the extracted income report.
 */

// Maps a non-successful terminal status to a human-readable description.
const STATUS_MESSAGES = {
  failed: 'Processing failed',
  invalid: 'Document not recognized',
  duplicate: 'Duplicate file',
};

function describeStatus(status) {
  return STATUS_MESSAGES[status] || status;
}

// Component: FileProcessingErrors
// Props:
//   files : array of uploaded_files entries with non-successful terminal statuses
export function FileProcessingErrors({ files }) {
  if (!files?.length) return null;

  const title = files.length === 1
    ? "1 file couldn't be processed"
    : `${files.length} files couldn't be processed`;

  return (
    <div class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <div class="text-sm font-semibold text-error mb-2">{title}</div>
      <ul class="space-y-1">
        {files.map((f, i) => (
          <li key={i} class="text-sm text-error flex justify-between gap-3">
            <span class="font-medium truncate">{f.filename || 'Untitled file'}</span>
            <span class="text-xs opacity-80 whitespace-nowrap">{describeStatus(f.status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
