import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDay, dateKey, daysInMonth, isMonth, localToday, monthPath, monthTemplate, normalizeFolder, parseMonth, previewMarkdown, shiftMonth, weekday } from '../src/calendar';

test('Gregorian leap years, month lengths, year rollover and boundaries', () => {
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('1900-02'), 28);
  assert.equal(daysInMonth('2000-02'), 29);
  assert.equal(daysInMonth('2026-04'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('0001-01', -1), '0001-01');
  assert.equal(shiftMonth('9999-12', 1), '9999-12');
  assert.equal(isMonth('2026-13'), false);
  assert.equal(isMonth('0000-01'), false);
  assert.equal(weekday('2026-11-07'), 6);
  assert.equal(localToday(new Date(2026, 10, 7, 23, 59)), '2026-11-07');
});

test('multiline Markdown and h3 survive; h1/h2 terminate date sections', () => {
  const source = '# 2026-11\n\n## 2026-11-01\n正文\n\n- [ ] Task\n- [[Link]]\n### 子标题\n内容\n## 月度备注\n不属于日期\n## 2026-11-02\n';
  const result = parseMonth(source, '2026-11');
  assert.equal(result.days.size, 2);
  assert.equal(result.days.get('2026-11-01')![0].headingLine, 2);
  assert.equal(result.days.get('2026-11-01')![0].markdown, '正文\n\n- [ ] Task\n- [[Link]]\n### 子标题\n内容');
  assert.equal(result.days.get('2026-11-02')![0].markdown, '');
});

test('headings inside YAML, comments, fenced or indented code do not become days', () => {
  const source = '\uFEFF---\ntitle: |\n  ## 2026-11-02\n---\n## 2026-11-01\n```markdown\n## 2026-11-03\n```\n<!--\n## 2026-11-04\n-->\n    ## 2026-11-05\n~~~\n## 2026-11-06\n~~~\n## 2026-11-07 ##\nHello';
  assert.deepEqual([...parseMonth(source, '2026-11').days.keys()], ['2026-11-01', '2026-11-07']);
});

test('invalid/foreign dates are not merged into a preceding valid date', () => {
  const result = parseMonth('## 2026-02-01\none\n## 2026-02-29\ninvalid\n## 2026-03-01\nforeign\n## 2026-02-00\ninvalid', '2026-02');
  assert.equal(result.days.size, 1);
  assert.equal(result.days.get('2026-02-01')![0].markdown, 'one');
  assert.equal(result.warnings.length, 3);
  assert.throws(() => dateKey('2026-02', 29));
});

test('duplicate dates retain all text, and creation never duplicates a heading', () => {
  const source = '## 2026-11-01\nfirst\n## 2026-11-01\nsecond';
  const result = parseMonth(source, '2026-11');
  assert.deepEqual(result.days.get('2026-11-01')!.map(section => section.markdown), ['first', 'second']);
  assert.equal(result.warnings.length, 1);
  assert.equal(appendDay(source, '2026-11', 1), source);
});

test('new month includes every valid day once, including Feb 29', () => {
  for (const month of ['2024-02', '2026-02', '2026-11', '2026-12']) {
    const parsed = parseMonth(monthTemplate(month), month);
    assert.equal(parsed.days.size, daysInMonth(month));
    assert.equal(parsed.warnings.length, 0);
    assert.equal(parsed.unclosedBlock, false);
  }
});

test('append preserves original bytes, BOM, CRLF, arbitrary notes and trailing spaces', () => {
  const original = '\uFEFF---\r\ntags: [calendar]\r\n---\r\n# My notes\r\n\r\nExisting text  ';
  const updated = appendDay(original, '2026-11', 20);
  assert.equal(updated.slice(0, original.length), original);
  assert.equal(updated.slice(original.length), '\r\n\r\n## 2026-11-20\r\n\r\n');
  assert.equal(appendDay(updated, '2026-11', 20), updated);
});

test('refuses to append into unclosed fences, YAML or HTML comments', () => {
  for (const source of ['---\ntitle: hi', '## 2026-11-01\n```\ncontent', '<!-- comment']) {
    assert.equal(parseMonth(source, '2026-11').unclosedBlock, true);
    assert.throws(() => appendDay(source, '2026-11', 2));
  }
});

test('only an explicit vault-relative monthly path is allowed', () => {
  assert.equal(monthPath('Notes/Calendar', '2026-11'), 'Notes/Calendar/2026-11.md');
  assert.equal(monthPath('', '2026-11'), '2026-11.md');
  assert.equal(normalizeFolder(' Calendar/ '), 'Calendar');
  for (const folder of ['../Calendar', '/tmp/Calendar', '.obsidian', 'A/../B', 'C:\\notes', 'A//B', 'A/.hidden']) assert.throws(() => normalizeFolder(folder));
});

test('preview leaves tasks, links and blockquotes while making embeds inert', () => {
  const source = '- [ ] Task\n[[Note]]\n> Quote\n![image](https://example.com/image.png)\n![[Another note]]\n<img src="https://example.com/track">';
  const preview = previewMarkdown(source);
  assert.ok(preview.includes('- [ ] Task\n[[Note]]\n> Quote'));
  assert.ok(preview.includes('[image](https://example.com/image.png)'));
  assert.ok(preview.includes('[[Another note]]'));
  assert.ok(!preview.includes('<img'));
  assert.ok(!preview.includes('!['));
});
