// Minimal store-only ZIP writer.
//
// A dependency would be dead weight here: everything we put in a zip is a PDF
// or a JPEG, both already compressed, so deflating them again buys nothing and
// costs CPU on the user's device. Storing them uncompressed keeps this to a
// hundred lines with no third-party code in the path.

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const STORED = 0;

// CRC-32 table, built once. Zip readers reject entries whose checksum is wrong,
// so this is not optional even for stored entries.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, which is what the zip format stores. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());

  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filename flag
    local.setUint16(8, STORED, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    localParts.push(local.buffer, nameBytes, entry.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, STORED, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, entry.data.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centralParts.push(central.buffer, nameBytes);

    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralSize = centralParts.reduce(
    (sum, part) => sum + (part as ArrayBuffer | Uint8Array).byteLength,
    0,
  );

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, EOCD_SIGNATURE, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, eocd.buffer], { type: 'application/zip' });
}

/** Pad page numbers so the files sort correctly in a file manager. */
export function numbered(base: string, index: number, total: number, extension: string): string {
  const width = String(total).length;
  return `${base}-${String(index).padStart(width, '0')}${extension}`;
}
