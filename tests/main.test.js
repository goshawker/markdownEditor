// Copyright (c) 2026 goshawker@yeah.net

const fs = require('fs');
const path = require('path');

// Extract testable functions from main.js
function detectEncoding(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return { encoding: 'UTF-8 (BOM)', bom: 3 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return { encoding: 'UTF-16 LE', bom: 2 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return { encoding: 'UTF-16 BE', bom: 2 };
  }
  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xFE && buffer[2] === 0x00 && buffer[3] === 0x00) {
    return { encoding: 'UTF-32 LE', bom: 4 };
  }
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xFE && buffer[3] === 0xFF) {
    return { encoding: 'UTF-32 BE', bom: 4 };
  }

  let isValidUtf8 = true;
  let i = 0;
  while (i < buffer.length) {
    const byte = buffer[i];
    if (byte <= 0x7F) {
      i += 1;
    } else if ((byte & 0xE0) === 0xC0) {
      if (i + 1 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80) { isValidUtf8 = false; break; }
      i += 2;
    } else if ((byte & 0xF0) === 0xE0) {
      if (i + 2 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80) { isValidUtf8 = false; break; }
      i += 3;
    } else if ((byte & 0xF8) === 0xF0) {
      if (i + 3 >= buffer.length || (buffer[i + 1] & 0xC0) !== 0x80 || (buffer[i + 2] & 0xC0) !== 0x80 || (buffer[i + 3] & 0xC0) !== 0x80) { isValidUtf8 = false; break; }
      i += 4;
    } else {
      isValidUtf8 = false;
      break;
    }
  }

  if (isValidUtf8) {
    return { encoding: 'UTF-8', bom: 0 };
  }

  let highBytes = 0;
  for (let j = 0; j < buffer.length; j++) {
    if (buffer[j] > 0x7F) highBytes++;
  }
  if (buffer.length > 0 && highBytes / buffer.length > 0.3) {
    return { encoding: 'GBK/GB2312', bom: 0 };
  }

  return { encoding: 'UTF-8', bom: 0 };
}

describe('detectEncoding', () => {
  test('detects UTF-8 with BOM', () => {
    const buffer = Buffer.from([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    const result = detectEncoding(buffer);
    expect(result.encoding).toBe('UTF-8 (BOM)');
    expect(result.bom).toBe(3);
  });

  test('detects UTF-16 LE with BOM', () => {
    const buffer = Buffer.from([0xFF, 0xFE, 0x48, 0x00]);
    const result = detectEncoding(buffer);
    expect(result.encoding).toBe('UTF-16 LE');
    expect(result.bom).toBe(2);
  });

  test('detects UTF-16 BE with BOM', () => {
    const buffer = Buffer.from([0xFE, 0xFF, 0x00, 0x48]);
    const result = detectEncoding(buffer);
    expect(result.encoding).toBe('UTF-16 BE');
    expect(result.bom).toBe(2);
  });

  test('detects plain UTF-8', () => {
    const buffer = Buffer.from('Hello World', 'utf-8');
    const result = detectEncoding(buffer);
    expect(result.encoding).toBe('UTF-8');
    expect(result.bom).toBe(0);
  });

  test('detects Chinese UTF-8', () => {
    const buffer = Buffer.from('你好世界', 'utf-8');
    const result = detectEncoding(buffer);
    expect(result.encoding).toBe('UTF-8');
    expect(result.bom).toBe(0);
  });

  test('detects empty buffer as UTF-8', () => {
    const buffer = Buffer.from([]);
    const result = detectEncoding(buffer);
    expect(result.encoding).toBe('UTF-8');
    expect(result.bom).toBe(0);
  });
});
