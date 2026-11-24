import { describe, expect, it } from 'vitest';
import {
  computeFormatInfoBits,
  computeVersionInfoBits,
  generateQrCodeSvg,
  generateQrMatrix,
  reedSolomonRemainder,
} from './qrCode';

describe('ISO/IEC 18004 QR Code generator (Byte mode, ECC Level M, Versions 1-10)', () => {
  it('computes exact ISO 18004 BCH format info and version info bitstrings', () => {
    // ISO/IEC 18004 Table C.1: Level M (00) + Mask 0..7
    expect(computeFormatInfoBits(0)).toBe(0x5412);
    expect(computeFormatInfoBits(1)).toBe(0x5125);
    expect(computeFormatInfoBits(2)).toBe(0x5e7c);
    expect(computeFormatInfoBits(3)).toBe(0x5b4b);

    // ISO/IEC 18004 Table D.1: Versions 7..10
    expect(computeVersionInfoBits(7)).toBe(0x07c94);
    expect(computeVersionInfoBits(8)).toBe(0x085bc);
    expect(computeVersionInfoBits(9)).toBe(0x09a99);
    expect(computeVersionInfoBits(10)).toBe(0x0a4d3);
  });

  it('computes exact GF(256) Reed-Solomon remainder against known ISO 18004 Version 1-M vector', () => {
    // ISO/IEC 18004 Annex I example (16 data codewords, 10 EC codewords for V1-M)
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    const ec = reedSolomonRemainder(data, 10);
    expect(ec).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('builds valid QR matrices with finder patterns, timing patterns, dark module, and alignment patterns across Versions 1-10', () => {
    const shortQr = generateQrMatrix('https://a.co/1');
    expect(shortQr.version).toBe(1);
    expect(shortQr.size).toBe(21);

    // Standard Winter Grind invite URL fits cleanly in Version 4-M (62-byte capacity)
    const inviteUrl = 'https://winter-grind-50k.pages.dev/e/2027?code=WINTER50K';
    const inviteQr = generateQrMatrix(inviteUrl);
    expect(inviteQr.version).toBe(4);
    expect(inviteQr.size).toBe(33);

    // Verify all three 7x7 finder patterns (top-left, top-right, bottom-left)
    const finderOrigins: Array<[number, number]> = [
      [0, 0],
      [0, inviteQr.size - 7],
      [inviteQr.size - 7, 0],
    ];
    for (const [originRow, originCol] of finderOrigins) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          expect(inviteQr.modules[originRow + r][originCol + c]).toBe(isBorder || isCenter);
        }
      }
    }

    // Verify timing patterns on row 6 and column 6 between separators
    for (let i = 8; i < inviteQr.size - 8; i += 1) {
      expect(inviteQr.modules[6][i]).toBe(i % 2 === 0);
      expect(inviteQr.modules[i][6]).toBe(i % 2 === 0);
    }

    // Verify fixed dark module at (4 * version + 9, 8)
    expect(inviteQr.modules[4 * inviteQr.version + 9][8]).toBe(true);

    // Verify Version 4 alignment pattern centered at (26, 26)
    expect(inviteQr.modules[26][26]).toBe(true);
    expect(inviteQr.modules[25][25]).toBe(false);
    expect(inviteQr.modules[24][24]).toBe(true);

    // Longer URL (>= 125 bytes) automatically upgrades to Version 8+ with version info
    const longUrl = `https://winter-grind-50k.pages.dev/e/winter-grind-2027?code=${'X'.repeat(80)}`;
    const longQr = generateQrMatrix(longUrl);
    expect(longQr.version).toBeGreaterThanOrEqual(8);
    expect(longQr.size).toBe(21 + 4 * (longQr.version - 1));
  });

  it('generates a crisp, self-contained SVG with 4-module quiet zone and dark path modules', () => {
    const svg = generateQrCodeSvg('https://winter-grind-50k.pages.dev/e/2027?code=WINTER50K', {
      title: 'Winter Grind 50K 2027 invite QR code',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Version 4 (33) + 4-module quiet zone on each side = 41
    expect(svg).toContain('viewBox="0 0 41 41"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('<path');
    expect(svg).toContain('Winter Grind 50K 2027 invite QR code');
  });

  it('throws a clear error when input is empty or exceeds Version 10 capacity', () => {
    expect(() => generateQrMatrix('')).toThrow(/empty/i);
    expect(() => generateQrMatrix('a'.repeat(250))).toThrow(/maximum QR capacity/i);
  });
});
