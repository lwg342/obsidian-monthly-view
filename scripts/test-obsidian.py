"""Opt-in integration test for the dedicated project test vault only.

Requires the separately authorized test vault/profile already running in Obsidian.
Uses the official Obsidian CLI. Refuses all other vault paths.
"""
from pathlib import Path
import json
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CLI = '/Applications/Obsidian.app/Contents/MacOS/obsidian-cli'
BASE = [CLI, 'vault=202611070001abcd']


def command(*args):
    result = subprocess.run(BASE + list(args), text=True, capture_output=True, timeout=30)
    result.check_returncode()
    output = result.stdout.strip()
    if output.startswith('Error:'):
        raise RuntimeError(output)
    return output


def evaluate(code):
    output = command('eval', 'code=' + code)
    if output.startswith('=> '):
        output = output[3:]
    return json.loads(output)


if command('vault', 'info=path') != str(ROOT / '.test-vault'):
    raise SystemExit('Refusing to test any vault except the isolated project test vault.')

results = evaluate(r'''(async () => {
  const v = app.workspace.getLeavesOfType('monthly-markdown-calendar')[0]?.view;
  if (!v) throw new Error('Calendar view must already be open');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  if (app.vault.getAbstractFileByPath('Calendar/2024-02.md')) {
    throw new Error('This first-run test requires a fresh isolated fixture without Calendar/2024-02.md');
  }
  v.setMonth('2026-11'); await wait(200);
  const file = app.vault.getAbstractFileByPath('Calendar/2026-11.md');
  const original = await app.vault.read(file);
  await v.openDay(7);
  const native = app.workspace.getLeavesOfType('markdown').find(leaf => leaf.view.file === file)?.view;
  assert(native?.getMode() === 'source', 'Date click must open the native editor');
  const expected = original.split('\n').findIndex(line => line === '## 2026-11-07') + 1;
  assert(native.editor.getCursor().line === expected, 'Cursor should be after the date heading');
  results.push('Native Markdown editor opens at the selected date');
  native.editor.replaceRange('实机自动刷新验证。\n', native.editor.getCursor());
  await wait(350);
  assert(v.contentEl.textContent.includes('实机自动刷新验证。'), 'Editor changes should refresh the calendar');
  results.push('Real editor-change event refreshes the calendar');
  const unsaved = original.replace('## 2026-11-03', '测试保留文字') + '\n未保存编辑保留验证。';
  native.editor.setValue(unsaved);
  await v.openDay(3); await wait(100);
  assert(native.editor.getValue() === unsaved, 'Opening creation dialog must not write');
  const create = document.querySelector('.modal-content .mod-cta');
  assert(create, 'Missing day must show an explicit creation button');
  create.click(); await wait(350);
  const updated = native.editor.getValue();
  assert(updated.startsWith(unsaved), 'Append must preserve the complete original buffer');
  assert(updated.split('## 2026-11-03').length === 2, 'Date must be appended exactly once');
  await v.openDay(3);
  assert(native.editor.getValue() === updated, 'Clicking again must not duplicate the date');
  results.push('Creating a missing day preserves unsaved content and is idempotent');
  native.editor.setValue(original); await wait(1200);
  const before = await app.vault.read(file);
  await v.openMonth();
  assert((await app.vault.read(file)) === before, 'Existing month must not be overwritten');
  results.push('Opening an existing month preserves its exact bytes');
  v.setMonth('2024-02'); await wait(200);
  assert(!app.vault.getAbstractFileByPath('Calendar/2024-02.md'), 'Browsing must not create a month');
  assert(v.contentEl.querySelectorAll('.mmc-day').length === 29, 'Leap year must have 29 days');
  await v.openDay(29); await wait(100);
  const monthCreate = document.querySelector('.modal-content .mod-cta');
  assert(monthCreate, 'Missing month must show explicit creation');
  monthCreate.click(); await wait(500);
  const leap = app.vault.getAbstractFileByPath('Calendar/2024-02.md');
  const leapText = await app.vault.read(leap);
  assert((leapText.match(/^## /gm) ?? []).length === 29, 'Created leap month must have 29 sections');
  results.push('New month creation and leap-day editor navigation work in Obsidian');
  v.setMonth('2026-02'); await wait(200);
  assert(v.contentEl.querySelectorAll('.mmc-day').length === 28, 'Ordinary February must have 28 days');
  assert(!app.vault.getAbstractFileByPath('Calendar/2026-02.md'), 'Ordinary February should remain uncreated');
  v.setMonth('2026-12'); await wait(200);
  assert(v.contentEl.querySelectorAll('.mmc-day').length === 31, 'December must have 31 days');
  v.setMonth('2027-01'); await wait(200);
  assert(v.month === '2027-01', 'Year transition must work');
  results.push('Month lengths and year transition work in the real view');
  v.setMonth('2024-02');
  await app.workspace.revealLeaf(v.leaf);
  app.workspace.requestSaveLayout(); await wait(2500);
  return JSON.stringify(results);
})()''')
print(json.dumps(results, ensure_ascii=False, indent=2))

command('reload')
for attempt in range(20):
    time.sleep(0.4)
    try:
        state = evaluate("JSON.stringify(app.workspace.getLeavesOfType('monthly-markdown-calendar').map(leaf=>leaf.view.getState()))")
        if any(item.get('month') == '2024-02' for item in state):
            results.append('Actual Obsidian window reload restores the calendar and selected month')
            break
    except (RuntimeError, ValueError):
        pass
else:
    raise RuntimeError('Calendar month was not restored after reload')

errors = command('dev:errors')
if errors != 'No errors captured.':
    raise RuntimeError(errors)
results.append('No JavaScript errors captured by Obsidian')
(ROOT / 'docs/obsidian-test-results.json').write_text(json.dumps({
    'date': '2026-11-07', 'version': command('version'),
    'vault': str(ROOT / '.test-vault'), 'checks': results,
}, ensure_ascii=False, indent=2) + '\n')
print(f'Passed {len(results)} real Obsidian checks.')
