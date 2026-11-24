export interface QrMatrix {
  version: number;
  size: number;
  maskPattern: number;
  modules: boolean[][];
}

export interface QrSvgOptions {
  quietZone?: number;
  darkColor?: string;
  lightColor?: string;
  title?: string;
}

interface VersionSpecM {
  version: number;
  byteCapacity: number;
  totalDataCodewords: number;
  ecPerBlock: number;
  blocks: ReadonlyArray<{ count: number; dataCodewords: number }>;
  alignmentCenters: readonly number[];
}

// ISO/IEC 18004 Table 9 (Error Correction Level M, Versions 1-10) & Table E.1 alignment centers
const VERSION_SPECS_M: readonly VersionSpecM[] = [
  {
    version: 1,
    byteCapacity: 14,
    totalDataCodewords: 16,
    ecPerBlock: 10,
    blocks: [{ count: 1, dataCodewords: 16 }],
    alignmentCenters: [],
  },
  {
    version: 2,
    byteCapacity: 26,
    totalDataCodewords: 28,
    ecPerBlock: 16,
    blocks: [{ count: 1, dataCodewords: 28 }],
    alignmentCenters: [6, 18],
  },
  {
    version: 3,
    byteCapacity: 42,
    totalDataCodewords: 44,
    ecPerBlock: 26,
    blocks: [{ count: 1, dataCodewords: 44 }],
    alignmentCenters: [6, 22],
  },
  {
    version: 4,
    byteCapacity: 62,
    totalDataCodewords: 64,
    ecPerBlock: 18,
    blocks: [{ count: 2, dataCodewords: 32 }],
    alignmentCenters: [6, 26],
  },
  {
    version: 5,
    byteCapacity: 84,
    totalDataCodewords: 86,
    ecPerBlock: 24,
    blocks: [{ count: 2, dataCodewords: 43 }],
    alignmentCenters: [6, 30],
  },
  {
    version: 6,
    byteCapacity: 106,
    totalDataCodewords: 108,
    ecPerBlock: 16,
    blocks: [{ count: 4, dataCodewords: 27 }],
    alignmentCenters: [6, 34],
  },
  {
    version: 7,
    byteCapacity: 122,
    totalDataCodewords: 124,
    ecPerBlock: 18,
    blocks: [{ count: 4, dataCodewords: 31 }],
    alignmentCenters: [6, 22, 38],
  },
  {
    version: 8,
    byteCapacity: 152,
    totalDataCodewords: 154,
    ecPerBlock: 22,
    blocks: [
      { count: 2, dataCodewords: 38 },
      { count: 2, dataCodewords: 39 },
    ],
    alignmentCenters: [6, 24, 42],
  },
  {
    version: 9,
    byteCapacity: 180,
    totalDataCodewords: 182,
    ecPerBlock: 22,
    blocks: [
      { count: 3, dataCodewords: 36 },
      { count: 2, dataCodewords: 37 },
    ],
    alignmentCenters: [6, 26, 46],
  },
  {
    version: 10,
    byteCapacity: 213,
    totalDataCodewords: 216,
    ecPerBlock: 26,
    blocks: [
      { count: 4, dataCodewords: 43 },
      { count: 1, dataCodewords: 44 },
    ],
    alignmentCenters: [6, 28, 50],
  },
];

// GF(256) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildReedSolomonGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMultiply(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

export function reedSolomonRemainder(data: readonly number[], ecCount: number): number[] {
  const generator = buildReedSolomonGenerator(ecCount);
  const remainder = new Array<number>(ecCount).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i += 1) {
        remainder[i] ^= gfMultiply(generator[i + 1], factor);
      }
    }
  }

  return remainder;
}

/**
 * ISO/IEC 18004 BCH(15, 5) format information for Error Correction Level M (00) + mask (0..7).
 */
export function computeFormatInfoBits(maskPattern: number): number {
  const ecLevelM = 0b00;
  const data = (ecLevelM << 3) | (maskPattern & 0b111);
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((remainder >> bit) & 1) {
      remainder ^= 0x537 << (bit - 10);
    }
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

/**
 * ISO/IEC 18004 BCH(18, 6) version information for Versions >= 7.
 */
export function computeVersionInfoBits(version: number): number {
  let remainder = version << 12;
  for (let bit = 17; bit >= 12; bit -= 1) {
    if ((remainder >> bit) & 1) {
      remainder ^= 0x1f25 << (bit - 12);
    }
  }
  return (version << 12) | remainder;
}

function encodeDataCodewords(bytes: Uint8Array, spec: VersionSpecM): number[] {
  const bits: number[] = [];
  const pushBits = (value: number, bitLength: number) => {
    for (let i = bitLength - 1; i >= 0; i -= 1) {
      bits.push((value >> i) & 1);
    }
  };

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator: 8 bits for Versions 1-9, 16 bits for Version 10
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);

  for (const byte of bytes) {
    pushBits(byte, 8);
  }

  const totalDataBits = spec.totalDataCodewords * 8;
  // Terminator (up to 4 zero bits)
  const terminatorLength = Math.min(4, totalDataBits - bits.length);
  pushBits(0, terminatorLength);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) {
      byte = (byte << 1) | bits[i + b];
    }
    codewords.push(byte);
  }

  // Alternate pad codewords 0xEC (236) and 0x11 (17)
  let padToggle = true;
  while (codewords.length < spec.totalDataCodewords) {
    codewords.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  return codewords;
}

function interleaveBlocks(dataCodewords: number[], spec: VersionSpecM): number[] {
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;

  for (const group of spec.blocks) {
    for (let i = 0; i < group.count; i += 1) {
      const slice = dataCodewords.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(slice);
      ecBlocks.push(reedSolomonRemainder(slice, spec.ecPerBlock));
    }
  }

  const result: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        result.push(block[i]);
      }
    }
  }

  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) {
      result.push(block[i]);
    }
  }

  return result;
}

function createBaseMatrix(spec: VersionSpecM): {
  modules: boolean[][];
  isFunction: boolean[][];
} {
  const size = 21 + 4 * (spec.version - 1);
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunction = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // Finder patterns + 1-module white separators
  const drawFinder = (originRow: number, originCol: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const mr = originRow + r;
        const mc = originCol + c;
        if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
        const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const isDark =
          inFinder &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFunction(mr, mc, isDark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // Alignment patterns (Versions 2+)
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = 0; j < centers.length; j += 1) {
      const overlapsFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (overlapsFinder) continue;

      const cr = centers[i];
      const cc = centers[j];
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunction(cr + dr, cc + dc, dist === 0 || dist === 2);
        }
      }
    }
  }

  // Reserve format info modules & set fixed dark module
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      setFunction(8, i, false);
      setFunction(i, 8, false);
    }
  }
  for (let i = size - 8; i < size; i += 1) {
    setFunction(8, i, false);
    setFunction(i, 8, false);
  }
  setFunction(4 * spec.version + 9, 8, true);

  // Version information (Versions 7+)
  if (spec.version >= 7) {
    const versionBits = computeVersionInfoBits(spec.version);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((versionBits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  return { modules, isFunction };
}

function drawFormatInfo(modules: boolean[][], maskPattern: number): void {
  const size = modules.length;
  const bits = computeFormatInfoBits(maskPattern);
  const bitAt = (index: number) => ((bits >> index) & 1) === 1;

  // Copy 1: around top-left finder (bits 14..0)
  const topLeftRow8Cols = [0, 1, 2, 3, 4, 5, 7, 8];
  for (let i = 0; i < topLeftRow8Cols.length; i += 1) {
    modules[8][topLeftRow8Cols[i]] = bitAt(14 - i);
  }
  const topLeftCol8Rows = [7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < topLeftCol8Rows.length; i += 1) {
    modules[topLeftCol8Rows[i]][8] = bitAt(6 - i);
  }

  // Copy 2: bottom-left (bits 14..8) and top-right (bits 7..0)
  for (let i = 0; i < 7; i += 1) {
    modules[size - 1 - i][8] = bitAt(14 - i);
  }
  for (let i = 0; i < 8; i += 1) {
    modules[8][size - 8 + i] = bitAt(7 - i);
  }
}

function placeDataCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: number[],
): void {
  const size = modules.length;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let upward = true;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) {
      rightCol = 5; // Skip vertical timing pattern column
    }

    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let colOffset = 0; colOffset < 2; colOffset += 1) {
        const col = rightCol - colOffset;
        if (isFunction[row][col]) continue;

        let dark = false;
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >> 3];
          dark = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex += 1;
        }
        modules[row][col] = dark;
      }
    }

    upward = !upward;
  }
}

function maskCondition(maskPattern: number, row: number, col: number): boolean {
  switch (maskPattern) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function applyMask(
  baseModules: boolean[][],
  isFunction: boolean[][],
  maskPattern: number,
): boolean[][] {
  const size = baseModules.length;
  const masked = baseModules.map((row, r) =>
    row.map((val, c) => (!isFunction[r][c] && maskCondition(maskPattern, r, c) ? !val : val)),
  );
  drawFormatInfo(masked, maskPattern);
  // Keep fixed dark module invariant
  masked[size - 8][8] = true;
  return masked;
}

function scoreMaskPenalty(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // Rule 1: 5+ consecutive same-color modules in rows and columns
  const scoreLineRuns = (getVal: (idx: number) => boolean) => {
    let runColor = getVal(0);
    let runLen = 1;
    for (let i = 1; i < size; i += 1) {
      const val = getVal(i);
      if (val === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = val;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  };

  for (let r = 0; r < size; r += 1) {
    scoreLineRuns((c) => modules[r][c]);
  }
  for (let c = 0; c < size; c += 1) {
    scoreLineRuns((r) => modules[r][c]);
  }

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 3: Finder-like 1:1:3:1:1 patterns with 4 light modules on either side
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  const matchesPattern = (getVal: (idx: number) => boolean, start: number, pat: boolean[]) => {
    for (let i = 0; i < pat.length; i += 1) {
      if (getVal(start + i) !== pat[i]) return false;
    }
    return true;
  };

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c <= size - 11; c += 1) {
      if (
        matchesPattern((i) => modules[r][i], c, patternA) ||
        matchesPattern((i) => modules[r][i], c, patternB)
      ) {
        penalty += 40;
      }
    }
  }
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r <= size - 11; r += 1) {
      if (
        matchesPattern((i) => modules[i][c], r, patternA) ||
        matchesPattern((i) => modules[i][c], r, patternB)
      ) {
        penalty += 40;
      }
    }
  }

  // Rule 4: Dark/light ratio balance
  let darkCount = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) darkCount += 1;
    }
  }
  const darkPct = (darkCount * 100) / (size * size);
  penalty += Math.floor(Math.abs(darkPct - 50) / 5) * 10;

  return penalty;
}

export function generateQrMatrix(text: string): QrMatrix {
  if (!text) {
    throw new Error('QR code input cannot be empty.');
  }

  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS_M.find((candidate) => bytes.length <= candidate.byteCapacity);
  if (!spec) {
    throw new Error(
      `Text (${bytes.length} bytes) exceeds maximum QR capacity of ${VERSION_SPECS_M[VERSION_SPECS_M.length - 1].byteCapacity} bytes.`,
    );
  }

  const dataCodewords = encodeDataCodewords(bytes, spec);
  const finalCodewords = interleaveBlocks(dataCodewords, spec);
  const { modules: baseModules, isFunction } = createBaseMatrix(spec);
  placeDataCodewords(baseModules, isFunction, finalCodewords);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = applyMask(baseModules, isFunction, 0);

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMask(baseModules, isFunction, mask);
    const penalty = scoreMaskPenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = candidate;
    }
  }

  return {
    version: spec.version,
    size: bestModules.length,
    maskPattern: bestMask,
    modules: bestModules,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function generateQrCodeSvg(text: string, options: QrSvgOptions = {}): string {
  const quietZone = options.quietZone ?? 4;
  const darkColor = options.darkColor ?? '#000000';
  const lightColor = options.lightColor ?? '#ffffff';
  const qr = generateQrMatrix(text);
  const totalSize = qr.size + quietZone * 2;

  const pathCommands: string[] = [];
  for (let r = 0; r < qr.size; r += 1) {
    for (let c = 0; c < qr.size; c += 1) {
      if (qr.modules[r][c]) {
        pathCommands.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }

  const titleEl = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" role="img">${titleEl}<rect width="${totalSize}" height="${totalSize}" fill="${lightColor}"/><path d="${pathCommands.join('')}" fill="${darkColor}"/></svg>`;
}
