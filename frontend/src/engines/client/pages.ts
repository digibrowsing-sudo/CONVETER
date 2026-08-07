// Page-range parsing, shared by split, extract, remove, organise and rotate.
//
// Users type "1-3, 7, 10-12" and expect it to mean what it looks like. They
// also type "0", "5-2" and "999" on a twelve-page document, and every one of
// those needs a message that says which page was wrong rather than a stack
// trace or a silently empty result.

import { EngineError } from './types';

export interface PageRange {
  from: number;
  to: number;
  /** The text the user typed, reused to name the output file. */
  label: string;
}

const RANGE_RE = /^(\d+)(?:\s*-\s*(\d+))?$/;

/**
 * Parse a range expression into 1-based inclusive ranges.
 * @throws {EngineError} with a message naming the offending part
 */
export function parseRanges(input: string, pageCount: number): PageRange[] {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new EngineError('Enter at least one page or range, for example 1-3,7.');
  }

  return parts.map((part) => {
    const match = RANGE_RE.exec(part);
    if (!match) {
      throw new EngineError(`"${part}" is not a page or range. Use numbers and dashes, e.g. 1-3,7.`);
    }

    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);

    if (from < 1 || to < 1) {
      throw new EngineError('Pages are numbered from 1.');
    }
    if (from > pageCount || to > pageCount) {
      throw new EngineError(
        `"${part}" is outside this document, which has ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
      );
    }
    if (to < from) {
      throw new EngineError(`"${part}" runs backwards — write it as ${to}-${from}.`);
    }

    return { from, to, label: part.replace(/\s+/g, '') };
  });
}

/** Expand ranges to a flat list of 1-based page numbers, preserving order and duplicates. */
export function expandRanges(ranges: PageRange[]): number[] {
  const pages: number[] = [];
  for (const range of ranges) {
    for (let page = range.from; page <= range.to; page += 1) pages.push(page);
  }
  return pages;
}

/** Parse a selection, or return every page when the input is blank. */
export function parseSelectionOrAll(input: string, pageCount: number): number[] {
  const trimmed = (input || '').trim();
  if (!trimmed) return Array.from({ length: pageCount }, (_, index) => index + 1);
  return expandRanges(parseRanges(trimmed, pageCount));
}
