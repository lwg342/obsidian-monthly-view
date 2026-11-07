import { Notice, Plugin, PluginSettingTab, Setting, type App } from 'obsidian';
import { normalizeFolder } from './calendar';
import { MonthlyView, VIEW_TYPE } from './view';

export default class MonthlyCalendarPlugin extends Plugin {
  folder = 'Calendar';

  async onload(): Promise<void> {
    const saved = await this.loadData();
    try { if (typeof saved?.folder === 'string') this.folder = normalizeFolder(saved.folder); }
    catch { new Notice('月度日历的文件夹设置无效，暂时使用 Calendar。'); }
    this.registerView(VIEW_TYPE, leaf => new MonthlyView(leaf, () => this.folder));
    this.addCommand({ id: 'open-monthly-calendar', name: '打开月度日历', callback: () => { void this.openCalendar().catch(error => new Notice(String(error))); } });
    this.addRibbonIcon('calendar-days', '打开月度日历', () => { void this.openCalendar().catch(error => new Notice(String(error))); });
    this.addSettingTab(new CalendarSettings(this.app, this));
  }

  async openCalendar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      if (existing.view instanceof MonthlyView) existing.view.revealToday();
      return;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async setFolder(value: string): Promise<void> {
    const folder = normalizeFolder(value);
    await this.saveData({ folder });
    this.folder = folder;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof MonthlyView) leaf.view.scheduleRefresh();
    }
  }
}

class CalendarSettings extends PluginSettingTab {
  constructor(app: App, private calendar: MonthlyCalendarPlugin) { super(app, calendar); }

  display(): void {
    this.containerEl.empty();
    let draft = this.calendar.folder;
    new Setting(this.containerEl)
      .setName('月份文件夹')
      .setDesc('相对于 vault 根目录。每月只读取此目录下的 YYYY-MM.md。留空使用根目录；保存设置不会创建文件或移动笔记。')
      .addText(input => input.setPlaceholder('Calendar').setValue(draft).onChange(value => { draft = value; }))
      .addButton(control => control.setButtonText('保存').setCta().onClick(async () => {
        try { await this.calendar.setFolder(draft); new Notice('月份文件夹已保存。'); }
        catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
      }));
  }
}
