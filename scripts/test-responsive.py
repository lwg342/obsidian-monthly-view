"""Opt-in responsive-layout checks in the already authorized isolated test vault.

Uses Obsidian's official CLI and viewport emulation, not a mobile-device runtime.
Does not create or edit Markdown files. Refuses every other vault path.
"""
from pathlib import Path
import base64
import json
import subprocess

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
    return json.loads(output.removeprefix('=> '))


def viewport(width, height):
    command('dev:cdp', 'method=Emulation.setDeviceMetricsOverride', 'params=' + json.dumps({
        'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False,
    }))


def screenshot(name):
    shot = json.loads(command('dev:cdp', 'method=Page.captureScreenshot',
                             'params={"format":"png","fromSurface":true,"captureBeyondViewport":false}'))
    (ROOT / 'docs/screenshots' / name).write_bytes(base64.b64decode(shot['data']))


if command('vault', 'info=path') != str(ROOT / '.test-vault'):
    raise SystemExit('Refusing to test any vault except the isolated project test vault.')

original_files = {p: p.read_bytes() for p in (ROOT / '.test-vault').rglob('*.md')}
results = []
try:
    viewport(1360, 1120)
    command('command', 'id=monthly-markdown-calendar:open-monthly-calendar')
    evaluate('''JSON.stringify((() => {
      app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse();
      return true;
    })())''')
    common = '''
      const v = app.workspace.getLeavesOfType('monthly-markdown-calendar')[0].view;
      const wait = () => new Promise(resolve => setTimeout(resolve, 180));
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const rows = () => [...v.contentEl.querySelectorAll('.mmc-day')];
      const rect = el => el.getBoundingClientRect();
    '''
    results.append(evaluate('(async () => {' + common + '''
      v.setMonth(month); await wait();
      const days = rows();
      check(rect(days[15]).x > rect(days[0]).x, 'Desktop must retain two columns');
      check(Math.abs(rect(days[15]).y-rect(days[0]).y) < 1, 'Desktop paired rows must align');
      check(!v.contentEl.textContent.includes('天有内容') && !v.contentEl.querySelector('.mmc-hint'), 'Removed hint must be absent');
      check(getComputedStyle(v.contentEl.querySelector('.mmc-status')).display === 'none', 'Empty status must not leave a gap');
      return JSON.stringify({check:'desktop two columns, paired rows, no hint or empty status gap',passed:true});
    })()'''))
    screenshot('obsidian-0.1.4-desktop.png')
    for width in (390, 320):
        viewport(width, 844)
        for theme in ('theme-light', 'theme-dark'):
            if evaluate('JSON.stringify(document.body.classList.contains(' + json.dumps(theme) + '))') is not True:
                command('command', 'id=theme:toggle-light-dark')
            results.append(evaluate('(async () => {' + common + '''
              v.setMonth(month); await wait();
              const days = rows(); const bounds = rect(v.contentEl);
              check(getComputedStyle(v.contentEl.querySelector('.mmc-board')).getPropertyValue('--mmc-single-column').trim() === '1', 'Narrow view must use single column');
              for (let i=0;i<days.length;i++) {
                check(Number(days[i].dataset.date.slice(-2)) === i+1, 'Date order must remain chronological');
                check(Math.abs(rect(days[i]).x-rect(days[0]).x) < 1, 'All dates must share one column');
                if (i) check(rect(days[i]).top >= rect(days[i-1]).bottom-1, 'Rows must not overlap');
                const content = days[i].querySelector('.mmc-day-content');
                check(content.scrollWidth <= content.clientWidth+1, 'Day text must wrap without horizontal overflow');
              }
              check(v.contentEl.scrollWidth <= v.contentEl.clientWidth+1, 'No horizontal view overflow');
              const today = rect(v.contentEl.querySelector('.is-today'));
              check(today.top >= bounds.top && today.bottom <= bounds.bottom, 'Today must be visible on opening');
              check(v.contentEl.scrollTop > 0 || new Date().getDate() <= 3, 'Opening must move to today when needed');
              v.contentEl.scrollTop = 600;
              const before = v.contentEl.scrollTop;
              await v.refresh(); await wait();
              check(Math.abs(v.contentEl.scrollTop-before) < 1, 'Refresh must preserve manual scroll position');
              const plugin = app.plugins.getPlugin('monthly-markdown-calendar');
              await plugin.openCalendar(); await wait();
              const afterOpen = rect(v.contentEl.querySelector('.is-today'));
              check(afterOpen.top >= bounds.top && afterOpen.bottom <= bounds.bottom, 'Opening existing calendar must reveal today');
              return JSON.stringify({check:'single column, date order, wrapping, auto today, refresh and reopen',width:innerWidth,theme:document.body.classList.contains('theme-dark')?'dark':'light',days:days.length,scrollTop:v.contentEl.scrollTop,passed:true});
            })()'''))
            if width == 390:
                screenshot('obsidian-0.1.4-phone-' + theme.removeprefix('theme-') + '.png')
    results.append(evaluate('(async () => {' + common + '''
      for (const [target,count] of [['2024-02',29],['2026-02',28],['2026-11',30],['2026-12',31]]) {
        v.setMonth(target); await wait();
        const days = rows();
        check(days.length === count, 'Correct month length: '+target);
        check(Number(days.at(-1).dataset.date.slice(-2)) === count, 'Last day must appear at the bottom');
        if (target !== month) check(v.contentEl.scrollTop === 0, 'Other months must open at the top');
      }
      [...v.contentEl.querySelectorAll('.mmc-controls button')].find(b=>b.textContent==='本月').click();
      await wait();
      check(v.month === month, 'This-month button must return to current month');
      const today = rect(v.contentEl.querySelector('.is-today'));
      const bounds = rect(v.contentEl);
      check(today.top >= bounds.top && today.bottom <= bounds.bottom, 'This-month button must reveal today');
      return JSON.stringify({check:'28/29/30/31 days, other-month top, this-month navigation',passed:true});
    })()'''))
    assert {p: p.read_bytes() for p in (ROOT / '.test-vault').rglob('*.md')} == original_files
    results.append({'check': 'No Markdown files created, removed, or changed', 'passed': True})
    errors = command('dev:errors')
    if errors != 'No errors captured.':
        raise RuntimeError(errors)
    results.append({'check': 'No JavaScript errors captured', 'passed': True})
finally:
    command('dev:cdp', 'method=Emulation.clearDeviceMetricsOverride')

(ROOT / 'docs/responsive-0.1.4-results.json').write_text(json.dumps({
    'version': '0.1.4', 'host': command('version'),
    'scope': 'Real desktop Obsidian with narrow viewport emulation; not a physical iOS/Android device',
    'checks': results,
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(results, ensure_ascii=False, indent=2))
