export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const SPREADSHEET_EXTENSION = /\.csv$/i;

export const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);
