'use strict';

// Per-tool option schemas (spec 7.1: "validated against per-tool Zod schema").
//
// Anything not described here is stripped rather than passed through, so a
// stray field can never reach an engine's argument list.

const { z } = require('zod');
const registry = require('../tools/registry');
const { ApiError } = require('../errors');

const empty = z.object({}).strict();

// Page selections such as "1-3,7,10-12". Parsed properly by the engines; this
// only rejects syntax that has no business being there in the first place.
const pageRanges = z
  .string()
  .trim()
  .max(200)
  .regex(/^\d+(-\d+)?(\s*,\s*\d+(-\d+)?)*$/, 'Use page numbers and ranges, for example 1-3,7');

const SCHEMAS = {
  'compress-pdf': z
    .object({ level: z.enum(['screen', 'ebook', 'printer']).default('ebook') })
    .strict(),

  'protect-pdf': z
    .object({
      // Kept in memory for the length of one qpdf call and never logged.
      password: z.string().min(4, 'Use a password of at least 4 characters.').max(128),
    })
    .strict(),

  'unlock-pdf': z
    .object({
      // Spec 15.7: we decrypt only with the password the user supplies. There
      // is deliberately no option to strip an owner password without one.
      password: z.string().min(1, 'Enter the password for this PDF.').max(128),
    })
    .strict(),

  'repair-pdf': empty,
  'word-to-pdf': empty,
  'excel-to-pdf': empty,
  'powerpoint-to-pdf': empty,
  'pdf-to-word': empty,

  // Reached only through the Tier C progressive fallback (spec 9.4).
  'image-convert': z
    .object({
      targetFormat: z.enum(['jpg', 'png', 'webp']),
      quality: z.coerce.number().int().min(1).max(100).default(85),
    })
    .strict(),

  'bank-statement-to-excel': z
    .object({
      bank: z.enum(['auto', 'hdfc', 'icici', 'sbi', 'kotak', 'generic']).default('auto'),
    })
    .strict(),

  'bank-statement-to-tally': z
    .object({
      bank: z.enum(['auto', 'hdfc', 'icici', 'sbi', 'kotak', 'generic']).default('auto'),
    })
    .strict(),

  'gst-invoice-to-excel': empty,
  'form-26as-to-excel': empty,
};

function parseRaw(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new ApiError('BAD_REQUEST', '"options" must be a JSON object.');
  }
}

/**
 * Validate the options for a tool and return the cleaned object.
 *
 * @param {object} tool registry entry
 * @param {string|object} raw the `options` form field
 * @throws {ApiError} BAD_REQUEST with the first readable validation message
 */
function validateOptions(tool, raw) {
  const schema = SCHEMAS[tool.slug];
  if (!schema) {
    throw new ApiError('INTERNAL', 'This tool is not configured correctly.');
  }
  const result = schema.safeParse(parseRaw(raw));
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new ApiError('BAD_REQUEST', field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}

/**
 * Spec 15.2: consent for the finance module is explicit, unbundled and not
 * pre-ticked. It is a separate field from `options` so it can never be folded
 * into a tool setting by accident.
 */
function requireConsent(tool, consentField) {
  if (!tool.requiresConsent) return null;
  if (String(consentField) !== 'true') {
    throw new ApiError(
      'CONSENT_REQUIRED',
      'Please confirm you agree to this document being processed before continuing.',
    );
  }
  return new Date().toISOString();
}

/** Fail fast at boot if a tool has been added to the registry without a schema. */
function assertSchemasComplete() {
  const missing = registry.serverTools
    .concat(registry.fallbackTools)
    .map((tool) => tool.slug)
    .filter((slug, i, all) => all.indexOf(slug) === i)
    .filter((slug) => !SCHEMAS[slug]);
  if (missing.length > 0) {
    throw new Error(`options schema missing for: ${missing.join(', ')}`);
  }
}

module.exports = { validateOptions, requireConsent, assertSchemasComplete, SCHEMAS, pageRanges };
