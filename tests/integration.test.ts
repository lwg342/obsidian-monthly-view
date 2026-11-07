import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { loadPlugin } from './load-plugin';
import { localToday, parseMonth } from '../src/calendar';

let api: any;
let win: Window;
const views: any[] = [];
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document });
  api = await loadPlugin();
});
afterEach(async () => {
  for (const view of views.splice(0)) { await view.onClose(); view.unload(); }
  api.Modal.current?.close();
  win.document.body.innerHTML = '';
});
const settle = () => new Promise(resolve => setTimeout(resolve, 180));
function app() { return new api.AppMock(win.document); }
async function open(app: any, month = '2026-11') {
  const leaf = app.workspace.getLeaf('tab');
  const view = new api.MonthlyView(leaf, () => 'Calendar'); leaf.view = view;
  view.month = month; view.load(); win.document.body.append(view.contentEl); views.push(view); await view.onOpen(); return view;
}
async function confirm() {
  const modal = api.Modal.current;
  assert.ok(modal, 'An explicit creation dialog must be present');
  modal.contentEl.querySelector('.mod-cta').click(); await settle();
}

test('opening or navigating missing months does not write; creation is explicit', async () => {
  const a = app(); const view = await open(a);
  assert.equal(a.vault.writes.length, 0);
  assert.equal(view.contentEl.querySelectorAll('.mmc-day').length, 30);
  view.setMonth('2024-02'); await settle();
  assert.equal(view.contentEl.querySelectorAll('.mmc-day').length, 29);
  assert.equal(a.vault.writes.length, 0);
  await view.openDay(29);
  assert.equal(a.vault.writes.length, 0);
  await confirm();
  const data = a.vault.data.get('Calendar/2024-02.md');
  assert.equal(parseMonth(data, '2024-02').days.size, 29);
  assert.equal(a.workspace.activeLeaf.view.file.path, 'Calendar/2024-02.md');
  assert.ok(a.workspace.activeLeaf.view.editor.cursor.line > 28);
});

test('month creation never overwrites an existing file or a concurrent creation', async () => {
  const a = app(); const files = new api.MonthlyFiles(a.vault);
  const original = 'Existing notes\nDO NOT REPLACE';
  a.vault.seed('Calendar/2026-11.md', original);
  await files.createMonth('Calendar', '2026-11');
  assert.equal(a.vault.data.get('Calendar/2026-11.md'), original);
  assert.equal(a.vault.writes.length, 0);
  a.vault.beforeCreate = (path: string) => { a.vault.seed(path, 'Concurrent content'); };
  await files.createMonth('Calendar', '2026-12');
  assert.equal(a.vault.data.get('Calendar/2026-12.md'), 'Concurrent content');
});

test('native unsaved edits refresh the view and only the configured file is read', async () => {
  const a = app(); const file = a.vault.seed('Calendar/2026-11.md', '## 2026-11-07\nOriginal');
  a.vault.seed('Other.md', 'private unrelated notes');
  const view = await open(a);
  await view.openDay(7);
  const editor = a.workspace.activeLeaf.view.editor;
  assert.deepEqual(editor.cursor, { line: 1, ch: 0 });
  editor.setValue('## 2026-11-07\nUnsaved native edit\n- [ ] Task');
  await settle();
  assert.match(view.contentEl.textContent, /Unsaved native edit/);
  assert.equal(a.vault.data.get(file.path), '## 2026-11-07\nOriginal');
  assert.deepEqual([...new Set(a.vault.reads)], [file.path]);
  assert.equal(view.contentEl.querySelector('input[type="checkbox"]').disabled, true);
  const before = a.vault.reads.length;
  a.vault.trigger('modify', a.vault.entries.get('Other.md')); await settle();
  assert.equal(a.vault.reads.length, before);
});

test('disk changes refresh without an open native editor; rename/delete become missing', async () => {
  const a = app(); const file = a.vault.seed('Calendar/2026-11.md', '## 2026-11-01\nOriginal');
  const view = await open(a);
  a.vault.modifyFromDisk(file, '## 2026-11-01\nDisk edit'); await settle();
  assert.match(view.contentEl.textContent, /Disk edit/);
  a.vault.rename(file, 'Calendar/other.md'); await settle();
  assert.match(view.contentEl.textContent, /本月文件尚不存在/);
  a.vault.rename(file, 'Calendar/2026-11.md'); await settle();
  assert.match(view.contentEl.textContent, /Disk edit/);
  a.vault.deleteFromDisk(file); await settle();
  assert.match(view.contentEl.textContent, /本月文件尚不存在/);
});

test('missing day appends through the open editor, retaining unsaved changes', async () => {
  const a = app(); a.vault.seed('Calendar/2026-11.md', '# My notes\n\n## 2026-11-01\nOriginal');
  const view = await open(a); await view.openDay(1);
  const editor = a.workspace.activeLeaf.view.editor;
  const unsaved = '# My notes\n\n## 2026-11-01\nUnsaved text  ';
  editor.setValue(unsaved); await view.openDay(2);
  assert.equal(editor.getValue(), unsaved);
  await confirm();
  assert.ok(editor.getValue().startsWith(unsaved));
  assert.match(editor.getValue(), /## 2026-11-02/);
  assert.equal(a.vault.writes.length, 0);
  const after = editor.getValue(); await view.openDay(2);
  assert.equal(api.Modal.current, null);
  assert.equal(editor.getValue(), after);
});

test('atomic append is idempotent and preserves concurrent edits', async () => {
  const a = app(); const file = a.vault.seed('Calendar/2026-11.md', 'Keep this prefix.');
  const files = new api.MonthlyFiles(a.vault);
  await Promise.all([files.addDay(file, '2026-11', 1), files.addDay(file, '2026-11', 1), files.addDay(file, '2026-11', 2)]);
  assert.ok(a.vault.data.get(file.path).startsWith('Keep this prefix.'));
  const parsed = parseMonth(a.vault.data.get(file.path), '2026-11');
  assert.equal(parsed.days.size, 2);
  assert.equal(parsed.warnings.length, 0);
});

test('month state persists and stale async reads cannot replace a newer month', async () => {
  const a = app(); a.vault.seed('Calendar/2026-11.md', '## 2026-11-01\nOld month');
  a.vault.seed('Calendar/2026-12.md', '## 2026-12-31\nNew month');
  const view = await open(a);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  a.vault.readGate = (file: any) => file.path.endsWith('2026-11.md') ? gate : Promise.resolve();
  const pending = view.refresh();
  view.setMonth('2026-12'); await settle(); release(); await pending;
  assert.match(view.contentEl.textContent, /New month/);
  assert.doesNotMatch(view.contentEl.textContent, /Old month/);
  assert.equal(view.contentEl.querySelectorAll('.mmc-day').length, 31);
  assert.deepEqual(view.getState(), { month: '2026-12' });
  const restored = await open(a);
  await restored.setState(view.getState(), {});
  assert.equal(restored.month, '2026-12');
  assert.match(restored.contentEl.textContent, /New month/);
});

test('command reuses the calendar tab; closing cleans listeners and render children', async () => {
  const a = app(); const plugin = new api.MonthlyCalendarPlugin(a); await plugin.onload();
  assert.equal(a.commands[0].id, 'open-monthly-calendar');
  await plugin.openCalendar(); await plugin.openCalendar();
  assert.equal(a.workspace.getLeavesOfType(api.VIEW_TYPE).length, 1);
  const view = a.workspace.getLeavesOfType(api.VIEW_TYPE)[0].view;
  await view.onClose(); view.unload();
  for (const callbacks of a.vault.listeners.values()) assert.equal(callbacks.size, 0);
  for (const callbacks of a.workspace.listeners.values()) assert.equal(callbacks.size, 0);
  assert.equal(view.children.size, 0);
});

test('path conflicts and read errors show recoverable error states without writes', async () => {
  const a = app(); a.vault.entries.set('Calendar/2026-11.md', new api.TFolder('Calendar/2026-11.md'));
  const view = await open(a);
  assert.match(view.contentEl.textContent, /是文件夹/);
  assert.equal(a.vault.writes.length, 0);
  assert.equal(view.contentEl.querySelectorAll('.mmc-day').length, 0);
});

test('today positioning waits for a visible view and does not interrupt ordinary refreshes', async () => {
  const a = app();
  const month = localToday().slice(0, 7);
  const view = await open(a, month);
  const content = view.contentEl;
  // Happy DOM has no layout; supply geometry to exercise the view lifecycle.
  let height = 0;
  Object.defineProperty(content, 'clientHeight', { get: () => height });
  content.getBoundingClientRect = () => ({ top: 100 });
  const board = content.querySelector('.mmc-board');
  board.style.setProperty('--mmc-single-column', '1');
  board.querySelector('.is-today').getBoundingClientRect = () => ({ top: 1800 });
  view.onResize();
  assert.equal(content.scrollTop, 0, 'A hidden restored tab must defer positioning');
  height = 600;
  a.workspace.trigger('active-leaf-change', view.leaf);
  assert.equal(content.scrollTop, 1550, 'Today should appear with some preceding context');
  content.scrollTop = 540;
  await view.refresh();
  view.onResize();
  assert.equal(content.scrollTop, 540, 'Content refresh and resizing must not pull the user back to today');
  view.setMonth(month === '2024-02' ? '2024-03' : '2024-02');
  await settle();
  assert.equal(content.scrollTop, 0, 'A different month starts at the top');
  assert.equal(a.vault.writes.length, 0, 'Positioning and browsing never create notes');
});
