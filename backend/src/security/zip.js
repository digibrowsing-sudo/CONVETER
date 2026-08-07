'use strict';

// Minimal ZIP central-directory reader, used for two jobs (spec 12.1 step 5):
//
//  1. Telling OOXML, ODF and "just a zip" apart by their entry names, so the
//     container type comes from the file's own structure rather than from the
//     extension the client claimed.
//  2. Guarding against archive bombs before the file reaches LibreOffice.
//
// We deliberately do not use a zip library: we never extract anything, we only
// need to read the index, and a parser we control cannot be talked into
// writing a file somewhere it should not.

const fs = require('fs');

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP64_SENTINEL_16 = 0xffff;

class ZipReadError extends Error {}

async function readTail(handle, size, bytes) {
  const length = Math.min(bytes, size);
  const buf = Buffer.alloc(length);
  await handle.read(buf, 0, length, size - length);
  return buf;
}

function findEocd(tail) {
  // Scan backwards: the comment field means the record is not at a fixed offset.
  for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/**
 * Read the central directory of a zip file.
 *
 * @returns {Promise<{entries: {name: string, compressedSize: number,
 *   uncompressedSize: number}[], totalCompressed: number,
 *   totalUncompressed: number}>}
 * @throws {ZipReadError} when the file is not a readable zip
 */
async function readCentralDirectory(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    if (size < EOCD_MIN_SIZE) throw new ZipReadError('file is too small to be a zip');

    const tail = await readTail(handle, size, EOCD_MIN_SIZE + MAX_COMMENT_SIZE);
    const eocdOffset = findEocd(tail);
    if (eocdOffset < 0) throw new ZipReadError('no end-of-central-directory record');

    const eocd = tail.subarray(eocdOffset);
    const entryCount = eocd.readUInt16LE(10);
    const cdSize = eocd.readUInt32LE(12);
    const cdOffset = eocd.readUInt32LE(16);

    // ZIP64 needs a different record layout. Office files under our 25 MB cap
    // have no legitimate reason to use it, so we decline rather than guess.
    if (
      entryCount === ZIP64_SENTINEL_16 ||
      cdSize === ZIP64_SENTINEL_32 ||
      cdOffset === ZIP64_SENTINEL_32
    ) {
      throw new ZipReadError('ZIP64 archives are not accepted');
    }
    if (cdOffset + cdSize > size) throw new ZipReadError('central directory is out of bounds');

    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);

    const entries = [];
    let totalCompressed = 0;
    let totalUncompressed = 0;
    let pos = 0;

    for (let i = 0; i < entryCount; i += 1) {
      if (pos + 46 > cd.length || cd.readUInt32LE(pos) !== CD_SIGNATURE) {
        throw new ZipReadError('malformed central directory entry');
      }
      const compressedSize = cd.readUInt32LE(pos + 20);
      const uncompressedSize = cd.readUInt32LE(pos + 24);
      const nameLength = cd.readUInt16LE(pos + 28);
      const extraLength = cd.readUInt16LE(pos + 30);
      const commentLength = cd.readUInt16LE(pos + 32);
      const nameStart = pos + 46;
      if (nameStart + nameLength > cd.length) {
        throw new ZipReadError('central directory entry name is out of bounds');
      }

      entries.push({
        name: cd.toString('utf8', nameStart, nameStart + nameLength),
        compressedSize,
        uncompressedSize,
      });
      totalCompressed += compressedSize;
      totalUncompressed += uncompressedSize;
      pos = nameStart + nameLength + extraLength + commentLength;
    }

    return { entries, totalCompressed, totalUncompressed };
  } finally {
    await handle.close();
  }
}

/**
 * Archive-bomb guard (spec 12.1 step 5).
 *
 * Rejects a container whose declared uncompressed size is either absurd in
 * absolute terms or absurd relative to the bytes actually on disk. The sizes
 * come from the zip index and a hostile file can lie about them — but a file
 * that lies *downwards* still cannot expand past the engine's own ulimit, and
 * one that lies upwards is rejected here.
 *
 * @returns {null|{reason: string}} null when the archive is acceptable
 */
function checkZipBomb(summary, { ratio, maxUncompressedBytes }) {
  if (summary.totalUncompressed > maxUncompressedBytes) {
    return { reason: 'uncompressed size exceeds the allowed maximum' };
  }
  // The ratio is the check that catches a classic bomb, where a few kilobytes
  // expand to gigabytes — so it must not be gated on the *compressed* size
  // being large, which is exactly what a bomb is not. Gate it on the expanded
  // size instead: below a megabyte the ratio cannot do any harm however
  // extreme it is, and XML compresses well enough that small Office files
  // routinely exceed 20x.
  const RATIO_FLOOR_BYTES = 1024 * 1024;
  if (
    summary.totalUncompressed > RATIO_FLOOR_BYTES &&
    summary.totalUncompressed > summary.totalCompressed * ratio
  ) {
    return { reason: 'compression ratio is implausibly high' };
  }
  // Zip-slip: we never extract, but LibreOffice does, and an entry that escapes
  // its own directory has no legitimate reason to exist in an Office file.
  const unsafe = summary.entries.find(
    (entry) => entry.name.startsWith('/') || entry.name.split('/').includes('..'),
  );
  if (unsafe) return { reason: 'archive contains an entry with an unsafe path' };

  return null;
}

/** Classify a zip container from its entry names: 'ooxml-*', 'odf' or 'zip'. */
function classifyZip(entries) {
  const names = entries.map((entry) => entry.name);
  if (names.some((n) => n === '[Content_Types].xml')) {
    if (names.some((n) => n.startsWith('word/'))) return 'ooxml-word';
    if (names.some((n) => n.startsWith('xl/'))) return 'ooxml-excel';
    if (names.some((n) => n.startsWith('ppt/'))) return 'ooxml-powerpoint';
    return 'ooxml';
  }
  if (names.includes('mimetype') && names.some((n) => n.startsWith('META-INF/'))) return 'odf';
  return 'zip';
}

module.exports = { readCentralDirectory, checkZipBomb, classifyZip, ZipReadError };
