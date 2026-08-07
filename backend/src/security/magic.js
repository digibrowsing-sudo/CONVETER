'use strict';

// Content-type sniffing by magic bytes (spec 12.1 step 2).
//
// The browser-supplied Content-Type and the filename extension are both
// attacker-controlled and are never trusted. Everything below is decided from
// the bytes on disk.

const fs = require('fs');
const { readCentralDirectory, classifyZip, ZipReadError } = require('./zip');

const HEADER_BYTES = 4096;

// How far into the file a %PDF- header may appear. Real PDFs produced by some
// tools carry a short preamble, and readers tolerate it, so we do too — but a
// bounded amount of it.
const PDF_HEADER_SEARCH_BYTES = 1024;

const startsWith = (buf, bytes) =>
  buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

/**
 * Formats detected purely from a fixed-position signature.
 * `format` is our internal name; `exts` are the extensions that may legitimately
 * carry this content.
 */
const SIGNATURES = [
  { format: 'png', exts: ['.png'], test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { format: 'jpeg', exts: ['.jpg', '.jpeg'], test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { format: 'gif', exts: ['.gif'], test: (b) => b.subarray(0, 6).toString('latin1').match(/^GIF8[79]a$/) !== null },
  { format: 'bmp', exts: ['.bmp'], test: (b) => startsWith(b, [0x42, 0x4d]) },
  {
    format: 'tiff',
    exts: ['.tif', '.tiff'],
    test: (b) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]),
  },
  {
    format: 'webp',
    exts: ['.webp'],
    test: (b) =>
      b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  },
  {
    format: 'heic',
    exts: ['.heic'],
    test: (b) =>
      b.length >= 12 &&
      b.toString('latin1', 4, 8) === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(b.toString('latin1', 8, 12)),
  },
  { format: 'rtf', exts: ['.rtf'], test: (b) => b.toString('latin1', 0, 5) === '{\\rtf' },
  {
    // Legacy Office binary formats all share the OLE2 compound-file header.
    // We confirm it is a genuine OLE2 container and let the declared extension
    // choose between doc/xls/ppt; LibreOffice fails cleanly on a mismatch.
    format: 'ole2',
    exts: ['.doc', '.xls', '.ppt'],
    test: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
];

const ODF_MIMETYPES = {
  'application/vnd.oasis.opendocument.text': { format: 'odf-text', exts: ['.odt'] },
  'application/vnd.oasis.opendocument.spreadsheet': { format: 'odf-spreadsheet', exts: ['.ods'] },
  'application/vnd.oasis.opendocument.presentation': { format: 'odf-presentation', exts: ['.odp'] },
};

const ZIP_FORMATS = {
  'ooxml-word': { format: 'ooxml-word', exts: ['.docx'] },
  'ooxml-excel': { format: 'ooxml-excel', exts: ['.xlsx'] },
  'ooxml-powerpoint': { format: 'ooxml-powerpoint', exts: ['.pptx'] },
};

const isZip = (buf) =>
  startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWith(buf, [0x50, 0x4b, 0x05, 0x06]) ||
  startsWith(buf, [0x50, 0x4b, 0x07, 0x08]);

function findPdfHeader(buf) {
  const window = buf.subarray(0, Math.min(buf.length, PDF_HEADER_SEARCH_BYTES));
  return window.indexOf('%PDF-', 0, 'latin1');
}

/**
 * Plain text has no signature, so we assert the negative: no NUL bytes and no
 * C0 control characters other than tab, newline and carriage return. That is
 * enough to keep a renamed binary out of the text path.
 */
function looksLikeText(buf) {
  for (const byte of buf) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x20 || byte === 0x7f) return false;
  }
  return true;
}

function readOdfMimetype(header) {
  // The ODF `mimetype` entry is stored uncompressed as the first zip entry, so
  // its literal content sits within the first few dozen bytes of the file.
  const text = header.toString('latin1', 0, Math.min(header.length, 256));
  const match = text.match(/application\/vnd\.oasis\.opendocument\.[a-z]+/);
  return match ? match[0] : null;
}

/**
 * Identify a file from its content.
 *
 * @param {string} filePath
 * @param {string} declaredExt lower-case extension the client claimed, e.g. '.docx'
 * @returns {Promise<{format: string, matchesExtension: boolean, zip: object|null}>}
 *          `format` is 'unknown' when nothing matched.
 */
async function identify(filePath, declaredExt) {
  const handle = await fs.promises.open(filePath, 'r');
  let header;
  try {
    const buf = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEADER_BYTES, 0);
    header = buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const result = (format, exts, zip = null) => ({
    format,
    matchesExtension: exts.includes(declaredExt),
    zip,
  });

  if (findPdfHeader(header) >= 0) return result('pdf', ['.pdf']);

  for (const signature of SIGNATURES) {
    if (signature.test(header)) return result(signature.format, signature.exts);
  }

  if (isZip(header)) {
    let summary;
    try {
      summary = await readCentralDirectory(filePath);
    } catch (err) {
      if (err instanceof ZipReadError) return result('zip-unreadable', [], null);
      throw err;
    }
    const kind = classifyZip(summary.entries);
    if (kind === 'odf') {
      const mimetype = readOdfMimetype(header);
      const odf = ODF_MIMETYPES[mimetype];
      return odf ? result(odf.format, odf.exts, summary) : result('odf-unknown', [], summary);
    }
    const ooxml = ZIP_FORMATS[kind];
    return ooxml ? result(ooxml.format, ooxml.exts, summary) : result('zip', ['.zip'], summary);
  }

  // Only fall back to text for extensions where text is actually expected —
  // otherwise a renamed script would sail through as a "valid" .txt.
  if (['.txt', '.csv'].includes(declaredExt) && looksLikeText(header)) {
    return result(declaredExt === '.csv' ? 'csv' : 'text', ['.txt', '.csv']);
  }

  return result('unknown', []);
}

module.exports = { identify, looksLikeText };
