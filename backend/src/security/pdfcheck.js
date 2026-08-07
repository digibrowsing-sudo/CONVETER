'use strict';

// PDF structure and page-limit checks (spec 12.1 steps 6 and 7).
//
// A PDF must be shown to be structurally sound before it reaches Ghostscript,
// qpdf, pdf2docx or pdfplumber. Those engines are large C and Python codebases
// and a malformed file is exactly the input we do not want them parsing.

const fs = require('fs');
const exec = require('../utils/exec');

const PDFINFO_TIMEOUT_MS = 15_000;

// Heuristics used when poppler is unavailable. They are a safety net, not the
// primary check — see checkPdf().
const ENCRYPT_HINT = /\/Encrypt[\s/<[]/;
const PAGE_OBJECT = /\/Type\s*\/Page(?![sA-Za-z])/g;

class PdfCheckError extends Error {
  /** @param {'CORRUPT_INPUT'|'ENCRYPTED_INPUT'|'FILE_TOO_LARGE'} code */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parsePdfInfo(stdout) {
  const info = {};
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) info[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return info;
}

/**
 * Cheap in-process scan. Object streams can hide page objects from it, so its
 * page count is a lower bound only and it is never used to *allow* a file that
 * pdfinfo would reject.
 */
async function scanRaw(filePath) {
  const bytes = await fs.promises.readFile(filePath);
  const text = bytes.toString('latin1');
  return {
    encrypted: ENCRYPT_HINT.test(text),
    minPages: (text.match(PAGE_OBJECT) || []).length,
    hasTrailer: text.includes('trailer') || text.includes('/Root'),
  };
}

/**
 * Validate a PDF before it reaches a heavy engine.
 *
 * @param {string} filePath
 * @param {{maxPages: number, requireExternal: boolean, logger: object}} opts
 * @returns {Promise<{pages: number|null, encrypted: boolean, checkedWith: string}>}
 * @throws {PdfCheckError}
 */
async function checkPdf(filePath, { maxPages, requireExternal, logger }) {
  let info = null;
  let pdfinfoMissing = false;

  try {
    const { stdout } = await exec.run('pdfinfo', [filePath], { timeoutMs: PDFINFO_TIMEOUT_MS });
    info = parsePdfInfo(stdout);
  } catch (err) {
    if (err.code === 'ENOENT' || /ENOENT/.test(err.message)) {
      pdfinfoMissing = true;
    } else {
      // pdfinfo ran and refused the file. Its own message distinguishes an
      // encrypted file from a broken one.
      const stderr = String(err.stderr || '');
      if (/password|encrypted/i.test(stderr)) {
        throw new PdfCheckError(
          'ENCRYPTED_INPUT',
          'This PDF is password protected. Remove the password first with our Unlock PDF tool.',
        );
      }
      throw new PdfCheckError(
        'CORRUPT_INPUT',
        'This PDF could not be read — it may be damaged or incomplete. Try our Repair PDF tool.',
      );
    }
  }

  if (pdfinfoMissing) {
    if (requireExternal) {
      // Refusing is the right failure mode: silently skipping a mandatory
      // security check is worse than an outage we can see.
      throw new PdfCheckError(
        'CORRUPT_INPUT',
        'This PDF could not be validated. Please try again shortly.',
      );
    }
    logger?.warn?.('pdfinfo unavailable — falling back to the in-process PDF scan', {
      hint: 'install poppler-utils',
    });
  }

  const raw = await scanRaw(filePath);
  if (!info && !raw.hasTrailer) {
    throw new PdfCheckError(
      'CORRUPT_INPUT',
      'This PDF could not be read — it may be damaged or incomplete. Try our Repair PDF tool.',
    );
  }

  const encrypted = info ? /yes/i.test(info.encrypted || '') : raw.encrypted;
  if (encrypted) {
    throw new PdfCheckError(
      'ENCRYPTED_INPUT',
      'This PDF is password protected. Remove the password first with our Unlock PDF tool.',
    );
  }

  const pages = info ? Number.parseInt(info.pages, 10) : null;
  const effectivePages = Number.isFinite(pages) ? pages : raw.minPages;
  if (effectivePages > maxPages) {
    throw new PdfCheckError(
      'FILE_TOO_LARGE',
      `This PDF has ${effectivePages} pages and the limit is ${maxPages}. Split it first and convert the parts.`,
    );
  }

  return {
    pages: Number.isFinite(pages) ? pages : null,
    encrypted: false,
    checkedWith: info ? 'pdfinfo' : 'builtin',
  };
}

module.exports = { checkPdf, PdfCheckError, parsePdfInfo };
