export interface DaySection {
  date: string;
  headingLine: number;
  endLine: number;
  markdown: string;
}

export interface ParsedMonth {
  days: Map<string, DaySection[]>;
  warnings: string[];
  unclosedBlock: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function daysInMonth(month: string): number {
  if (!isMonth(month)) throw new Error('月份格式应为 YYYY-MM。');
  const [year, m] = month.split('-').map(Number);
  if (m === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function dateKey(month: string, day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month)) throw new Error('日期不在本月内。');
  return `${month}-${pad(day)}`;
}

export function localToday(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shiftMonth(month: string, delta: number): string {
  if (!isMonth(month) || !Number.isInteger(delta)) throw new Error('无效月份。');
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + m - 1 + delta;
  const next = `${String(Math.floor(index / 12)).padStart(4, '0')}-${pad((index % 12) + 1)}`;
  return isMonth(next) ? next : month;
}

export function weekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(0);
  value.setFullYear(year, month - 1, day);
  value.setHours(12, 0, 0, 0);
  return value.getDay();
}

/** A deliberately small format: ATX date headings, with fenced-code/frontmatter/comment guards. */
export function parseMonth(source: string, month: string): ParsedMonth {
  const count = daysInMonth(month);
  const lines = source.split(/\r?\n/);
  const days = new Map<string, DaySection[]>();
  const warnings: string[] = [];
  let active: { date: string; line: number } | null = null;
  let fence: { char: string; length: number } | null = null;
  let frontmatter = false;
  let comment = false;

  const finish = (end: number) => {
    if (!active) return;
    const sections = days.get(active.date) ?? [];
    sections.push({ date: active.date, headingLine: active.line, endLine: end,
      markdown: lines.slice(active.line + 1, end).join('\n').trim() });
    days.set(active.date, sections);
    active = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = index === 0 ? lines[index].replace(/^\uFEFF/, '') : lines[index];
    if (index === 0 && line === '---') { frontmatter = true; continue; }
    if (frontmatter) {
      if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      continue;
    }
    if (fence) {
      const end = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (end && end[1][0] === fence.char && end[1].length >= fence.length) fence = null;
      continue;
    }
    if (comment) {
      if (line.includes('-->')) comment = false;
      continue;
    }
    if (line.includes('<!--')) {
      comment = !line.slice(line.indexOf('<!--') + 4).includes('-->');
      continue;
    }
    const start = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (start && !(start[1][0] === '`' && start[2].includes('`'))) {
      fence = { char: start[1][0], length: start[1].length };
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,2})[ \t]+(.*?)[ \t]*$/);
    if (!heading) continue;
    finish(index);
    const title = heading[2].replace(/[ \t]+#+[ \t]*$/, '');
    if (heading[1] !== '##' || !/^\d{4}-\d{2}-\d{2}$/.test(title)) continue;
    const day = Number(title.slice(8));
    if (!title.startsWith(`${month}-`) || day < 1 || day > count) {
      warnings.push(`第 ${index + 1} 行的日期 ${title} 不属于本月的有效日期，未显示。`);
      continue;
    }
    active = { date: title, line: index };
  }
  finish(lines.length);
  for (const [date, sections] of days) {
    if (sections.length > 1) warnings.push(`${date} 有 ${sections.length} 个分节，均已显示；点击日期定位到第一节。`);
  }
  const unclosedBlock = frontmatter || !!fence || comment;
  if (unclosedBlock) warnings.push('文件有未闭合的 frontmatter、代码围栏或 HTML 注释，请先在原生编辑器中修正。');
  return { days, warnings, unclosedBlock };
}

export function monthTemplate(month: string): string {
  return `# ${month}\n\n` + Array.from({ length: daysInMonth(month) }, (_, i) => `## ${dateKey(month, i + 1)}\n\n`).join('');
}

/** Never edits the original prefix. Duplicate clicks become a no-op. */
export function appendDay(source: string, month: string, day: number): string {
  const key = dateKey(month, day);
  const parsed = parseMonth(source, month);
  if (parsed.days.has(key)) return source;
  if (parsed.unclosedBlock) throw new Error('请先闭合文件中的 frontmatter、代码围栏或 HTML 注释，再创建日期分节。');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const gap = !source || source.endsWith(eol + eol) ? '' : source.endsWith(eol) ? eol : eol + eol;
  return source + gap + `## ${key}${eol}${eol}`;
}

export function normalizeFolder(value: string): string {
  const folder = value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!folder) return '';
  if (folder.startsWith('/') || folder.split('/').some(part => !part || part.startsWith('.') || /[:*?"<>|\u0000-\u001f]/.test(part))) {
    throw new Error('请输入 vault 内的普通文件夹，例如 Calendar 或 Notes/Calendar，不要使用绝对路径、隐藏目录或 ..。');
  }
  return folder;
}

export function monthPath(folder: string, month: string): string {
  if (!isMonth(month)) throw new Error('月份格式应为 YYYY-MM。');
  const safe = normalizeFolder(folder);
  return `${safe ? `${safe}/` : ''}${month}.md`;
}

/** Preview embeds become links; raw HTML is text. Nothing embedded is fetched. */
export function previewMarkdown(source: string): string {
  return source.replace(/!\[/g, '[').replace(/</g, '&lt;');
}
