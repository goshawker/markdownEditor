// Copyright (c) 2026 goshawker@yeah.net

// Test word count logic (extracted from app.js)
function countWords(content) {
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}

// Test line/column calculation (extracted from app.js)
function getLineAndCol(content, position) {
  const textBefore = content.substring(0, position);
  const lines = textBefore.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

// Test heading parsing (extracted from app.js)
function parseHeadings(text) {
  const headings = [];
  const lines = text.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        lineIndex: i,
      });
    }
  }
  return headings;
}

// Test HTML escaping (extracted from app.js)
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

describe('countWords', () => {
  test('counts English words', () => {
    expect(countWords('Hello World')).toBe(2);
    expect(countWords('This is a test')).toBe(4);
  });

  test('counts Chinese characters', () => {
    expect(countWords('你好世界')).toBe(4);
    expect(countWords('测试')).toBe(2);
  });

  test('counts mixed content', () => {
    expect(countWords('你好World')).toBe(3);
    expect(countWords('Hello 世界 Test')).toBe(4);
  });

  test('handles empty string', () => {
    expect(countWords('')).toBe(0);
  });

  test('handles string with only spaces', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('getLineAndCol', () => {
  test('returns line 1, col 1 for empty content', () => {
    const result = getLineAndCol('', 0);
    expect(result).toEqual({ line: 1, col: 1 });
  });

  test('returns correct position at start', () => {
    const result = getLineAndCol('Hello', 0);
    expect(result).toEqual({ line: 1, col: 1 });
  });

  test('returns correct position in middle of line', () => {
    const result = getLineAndCol('Hello World', 5);
    expect(result).toEqual({ line: 1, col: 6 });
  });

  test('returns correct position at line break', () => {
    const result = getLineAndCol('Hello\nWorld', 5);
    expect(result).toEqual({ line: 1, col: 6 });
  });

  test('returns correct position on second line', () => {
    const result = getLineAndCol('Hello\nWorld', 6);
    expect(result).toEqual({ line: 2, col: 1 });
  });

  test('returns correct position in middle of second line', () => {
    const result = getLineAndCol('Hello\nWorld', 8);
    expect(result).toEqual({ line: 2, col: 3 });
  });
});

describe('parseHeadings', () => {
  test('parses h1 heading', () => {
    const result = parseHeadings('# Title');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ level: 1, text: 'Title', lineIndex: 0 });
  });

  test('parses multiple headings', () => {
    const content = '# H1\n## H2\n### H3';
    const result = parseHeadings(content);
    expect(result).toHaveLength(3);
    expect(result[0].level).toBe(1);
    expect(result[1].level).toBe(2);
    expect(result[2].level).toBe(3);
  });

  test('ignores non-heading lines', () => {
    const content = 'Regular text\n# Heading\nMore text';
    const result = parseHeadings(content);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Heading');
  });

  test('returns empty array for no headings', () => {
    const result = parseHeadings('No headings here');
    expect(result).toHaveLength(0);
  });

  test('handles headings with extra spaces', () => {
    const result = parseHeadings('#   Title   ');
    expect(result[0].text).toBe('Title');
  });
});

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  test('escapes greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  test('escapes multiple characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});
