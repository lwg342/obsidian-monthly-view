import {
  Component, ItemView, MarkdownRenderer, MarkdownView, Modal, Notice, TFile,
  type App, type Editor, type ViewStateResult, type WorkspaceLeaf,
} from 'obsidian';
import { appendDay, dateKey, daysInMonth, isMonth, localToday, monthPath, parseMonth, previewMarkdown, shiftMonth, weekday } from './calendar';
import { MonthlyFiles } from './storage';

export const VIEW_TYPE = 'monthly-markdown-calendar';

function element<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc: Document, label: string, action: () => void, cls = ''): HTMLButtonElement {
  const node = element(doc, 'button', cls, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

class CreateSectionModal extends Modal {
  constructor(app: App, private heading: string, private explanation: string, private action: () => Promise<void>) { super(app); }
  onOpen(): void {
    const doc = this.contentEl.ownerDocument;
    this.contentEl.replaceChildren(element(doc, 'h2', '', this.heading), element(doc, 'p', '', this.explanation));
    const actions = element(doc, 'div', 'mmc-modal-actions');
    const create = button(doc, '创建并打开', () => {
      create.disabled = true;
      void this.action().then(() => this.close()).catch(error => {
        new Notice(error instanceof Error ? error.message : String(error));
        create.disabled = false;
      });
    }, 'mod-cta');
    actions.append(button(doc, '取消', () => this.close()), create);
    this.contentEl.append(actions);
  }
  onClose(): void { this.contentEl.replaceChildren(); }
}

export class MonthlyView extends ItemView {
  month = localToday().slice(0, 7);
  private files: MonthlyFiles;
  private ready = false;
  private revision = 0;
  private renderOwner: Component | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private titleEl!: HTMLElement;
  private monthInput!: HTMLInputElement;
  private sourceEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private prev!: HTMLButtonElement;
  private next!: HTMLButtonElement;
  private liveBuffer: { path: string; editor: Editor } | null = null;
  private pendingScroll = true;

  constructor(leaf: WorkspaceLeaf, private getFolder: () => string) {
    super(leaf);
    this.files = new MonthlyFiles(this.app.vault);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return '月度日历'; }
  getIcon(): string { return 'calendar-days'; }
  getState(): Record<string, unknown> { return { month: this.month }; }
  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    if (isMonth(state?.month) && state.month !== this.month) {
      this.month = state.month;
      this.pendingScroll = true;
    }
    await super.setState(state, result);
    if (this.ready) await this.refresh();
  }

  get path(): string { return monthPath(this.getFolder(), this.month); }

  async onOpen(): Promise<void> {
    this.ready = true;
    this.contentEl.classList.add('mmc-view');
    const doc = this.contentEl.ownerDocument;
    const header = element(doc, 'header', 'mmc-header');
    const heading = element(doc, 'div', 'mmc-heading');
    this.titleEl = element(doc, 'h2', 'mmc-title');
    this.sourceEl = element(doc, 'div', 'mmc-source');
    heading.append(this.titleEl, this.sourceEl);
    const controls = element(doc, 'div', 'mmc-controls');
    controls.setAttribute('aria-label', '月份导航');
    this.prev = button(doc, '上月', () => this.setMonth(shiftMonth(this.month, -1)));
    this.prev.setAttribute('aria-label', '上个月');
    this.monthInput = element(doc, 'input');
    this.monthInput.type = 'month';
    this.monthInput.min = '0001-01';
    this.monthInput.max = '9999-12';
    this.monthInput.setAttribute('aria-label', '选择月份');
    this.monthInput.addEventListener('change', () => {
      if (isMonth(this.monthInput.value)) this.setMonth(this.monthInput.value);
    });
    this.next = button(doc, '下月', () => this.setMonth(shiftMonth(this.month, 1)));
    this.next.setAttribute('aria-label', '下个月');
    controls.append(this.prev, this.monthInput, this.next, button(doc, '本月', () => this.setMonth(localToday().slice(0, 7))));
    header.append(heading, controls);
    this.statusEl = element(doc, 'div', 'mmc-status');
    this.statusEl.setAttribute('role', 'status');
    this.bodyEl = element(doc, 'div', 'mmc-body');
    this.contentEl.replaceChildren(header, this.statusEl, this.bodyEl);

    const onFileEvent = (file: { path: string }) => {
      if (this.affectsPath(file.path)) this.scheduleRefresh();
    };
    this.registerEvent(this.app.vault.on('create', onFileEvent));
    this.registerEvent(this.app.vault.on('modify', onFileEvent));
    this.registerEvent(this.app.vault.on('delete', onFileEvent));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (this.affectsPath(file.path) || this.affectsPath(oldPath)) this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
      if (info.file?.path !== this.path) return;
      this.liveBuffer = { path: info.file.path, editor };
      this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      if (this.liveBuffer && !this.openEditor(this.path)) {
        this.liveBuffer = null;
        this.scheduleRefresh();
      }
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
      if (leaf === this.leaf) this.scrollToTodayIfPending();
    }));
    // Refresh today's marker after midnight and when returning from background.
    this.registerInterval(window.setInterval(() => {
      if (this.bodyEl.dataset.today !== localToday()) this.scheduleRefresh();
    }, 60_000));
    this.registerDomEvent(doc, 'visibilitychange', () => {
      if (!doc.hidden) this.scheduleRefresh();
    });
    await this.refresh();
  }

  private affectsPath(path: string): boolean { return path === this.path || this.path.startsWith(`${path}/`); }

  setMonth(month: string): void {
    if (!isMonth(month)) return;
    this.month = month;
    this.pendingScroll = true;
    this.liveBuffer = null;
    this.app.workspace.requestSaveLayout();
    void this.refresh();
  }

  /** Explicitly opening an existing calendar also reveals today on a narrow panel. */
  revealToday(): void {
    this.pendingScroll = true;
    this.scrollToTodayIfPending();
  }

  onResize(): void { this.scrollToTodayIfPending(); }

  private scrollToTodayIfPending(): void {
    if (!this.ready || !this.pendingScroll || !this.contentEl.clientHeight) return;
    const board = this.bodyEl?.querySelector<HTMLElement>('.mmc-board');
    if (!board || board.dataset.month !== this.month) return;
    const win = this.contentEl.ownerDocument.defaultView;
    if (!win) return;
    this.pendingScroll = false;
    // CSS is the single source of truth for the responsive breakpoint.
    const singleColumn = win.getComputedStyle(board).getPropertyValue('--mmc-single-column').trim() === '1';
    const today = board.querySelector<HTMLElement>('.is-today');
    if (!singleColumn || !today) {
      this.contentEl.scrollTop = 0;
      return;
    }
    const offset = today.getBoundingClientRect().top - this.contentEl.getBoundingClientRect().top;
    // Scroll this view only, leaving a little context above today; never move keyboard focus.
    this.contentEl.scrollTop = Math.max(0, this.contentEl.scrollTop + offset - this.contentEl.clientHeight / 4);
  }

  scheduleRefresh(): void {
    // Invalidate pending I/O immediately so an old read cannot replace newer content.
    this.revision++;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 120);
  }

  private openEditor(path: string): MarkdownView | null {
    const views = this.app.workspace.getLeavesOfType('markdown')
      .map(leaf => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file?.path === path && view.getMode() === 'source');
    const live = views.find(view => this.liveBuffer?.path === path && view.editor === this.liveBuffer.editor);
    return live ?? views[0] ?? null;
  }

  private async currentText(file: TFile): Promise<string> {
    const editor = this.openEditor(file.path);
    return editor ? editor.editor.getValue() : this.app.vault.cachedRead(file);
  }

  async refresh(): Promise<void> {
    if (!this.ready) return;
    const revision = ++this.revision;
    const month = this.month;
    const path = this.path;
    const doc = this.contentEl.ownerDocument;
    this.titleEl.textContent = `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
    this.monthInput.value = month;
    this.prev.disabled = month === '0001-01';
    this.next.disabled = month === '9999-12';
    const fileButton = button(doc, path, () => this.perform(() => this.openMonth()), 'mmc-source-link');
    this.sourceEl.replaceChildren(fileButton);
    try {
      const file = this.files.find(path);
      const text = file ? await this.currentText(file) : '';
      if (revision !== this.revision || !this.ready) return;
      const parsed = parseMonth(text, month);
      const owner = this.addChild(new Component());
      const board = element(doc, 'div', 'mmc-board');
      board.dataset.month = month;
      board.setAttribute('aria-label', `${month} 月度日历`);
      const today = localToday();
      const renders: Promise<void>[] = [];
      const count = daysInMonth(month);
      for (let day = 1; day <= count; day++) {
        const date = dateKey(month, day);
        const sections = parsed.days.get(date) ?? [];
        const dayOfWeek = weekday(date);
        const row = element(doc, 'section', 'mmc-day');
        row.dataset.date = date;
        row.style.setProperty('--mmc-column', day <= 15 ? '1' : '2');
        row.style.setProperty('--mmc-row', String(day <= 15 ? day : day - 15));
        row.classList.toggle('is-today', date === today);
        row.classList.toggle('is-week-end', dayOfWeek === 0);
        row.classList.toggle('is-missing', sections.length === 0);
        if (date === today) row.setAttribute('aria-current', 'date');
        const label = button(doc, String(day), () => this.perform(() => this.openDay(day)), 'mmc-date');
        label.setAttribute('aria-label', `${date} 星期${'日一二三四五六'[dayOfWeek]}${date === today ? ' 今天' : ''}，${sections.length ? '在原生编辑器中编辑' : '创建日期分节'}`);
        label.title = label.getAttribute('aria-label')!;
        const content = element(doc, 'div', 'mmc-day-content');
        if (sections.some(section => section.markdown)) {
          for (const section of sections) {
            if (!section.markdown) continue;
            const preview = element(doc, 'div', 'mmc-markdown markdown-rendered');
            content.append(preview);
            renders.push(MarkdownRenderer.render(this.app, previewMarkdown(section.markdown), preview, path, owner).then(() => {
              for (const checkbox of preview.querySelectorAll<HTMLInputElement>('input')) {
                checkbox.disabled = true;
                checkbox.tabIndex = -1;
              }
            }));
          }
        } else {
          const add = button(doc, sections.length ? '+' : '+ 创建日期分节', () => this.perform(() => this.openDay(day)), 'mmc-empty-day');
          if (sections.length) add.classList.add('mmc-add-content');
          add.setAttribute('aria-label', `${date}，${sections.length ? '添加内容' : '创建日期分节'}`);
          add.title = add.getAttribute('aria-label')!;
          content.append(add);
        }
        // Date/content whitespace opens the native editor. Links remain independently usable.
        row.addEventListener('click', event => {
          const target = event.target as HTMLElement;
          if (target.closest('a, button, input, summary') || doc.getSelection()?.toString()) return;
          this.perform(() => this.openDay(day));
        });
        content.addEventListener('click', event => {
          const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link');
          if (!link) return;
          event.preventDefault();
          event.stopPropagation();
          const target = link.dataset.href ?? link.getAttribute('href');
          if (target) this.perform(() => this.app.workspace.openLinkText(target, path, event.ctrlKey || event.metaKey));
        });
        row.append(label, content);
        board.append(row);
      }
      try { await Promise.all(renders); }
      catch (error) { this.removeChild(owner); throw error; }
      if (revision !== this.revision || !this.ready) { this.removeChild(owner); return; }
      const focusedDate = (doc.activeElement as HTMLElement | null)?.closest<HTMLElement>('.mmc-day')?.dataset.date;
      const scrollTop = this.contentEl.scrollTop;
      if (this.renderOwner) this.removeChild(this.renderOwner);
      this.renderOwner = owner;
      this.bodyEl.replaceChildren(board);
      this.bodyEl.dataset.today = today;
      this.statusEl.replaceChildren();
      if (!file) {
        this.statusEl.append(element(doc, 'span', '', '本月文件尚不存在。'), button(doc, '创建月份文件', () => this.perform(() => this.openMonth()), 'mmc-create-month'));
      }
      if (parsed.warnings.length) {
        const details = element(doc, 'details', 'mmc-warnings');
        details.append(element(doc, 'summary', '', `${parsed.warnings.length} 条格式提示`));
        for (const warning of parsed.warnings) details.append(element(doc, 'p', '', warning));
        this.statusEl.append(details);
      }
      if (focusedDate) board.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"] .mmc-date`)?.focus({ preventScroll: true });
      this.contentEl.scrollTop = scrollTop;
      this.scrollToTodayIfPending();
    } catch (error) {
      if (revision !== this.revision || !this.ready) return;
      if (this.renderOwner) { this.removeChild(this.renderOwner); this.renderOwner = null; }
      this.bodyEl.replaceChildren();
      this.statusEl.replaceChildren(element(doc, 'span', 'mmc-error', `无法读取 ${path}：${error instanceof Error ? error.message : String(error)}`), button(doc, '重试', () => { void this.refresh(); }));
    }
  }

  private perform(action: () => Promise<void>): void {
    void action().catch(error => new Notice(error instanceof Error ? error.message : String(error)));
  }

  async openMonth(): Promise<void> {
    const file = this.files.find(this.path);
    if (file) { await this.openEditorAt(file); return; }
    this.offerCreateMonth();
  }

  private offerCreateMonth(day?: number): void {
    const month = this.month;
    const folder = this.getFolder();
    const path = monthPath(folder, month);
    new CreateSectionModal(this.app, '创建月份文件', `将创建 ${path}，包含本月全部日期标题。若文件已存在，直接打开，保留已有内容。`, async () => {
      const file = await this.files.createMonth(folder, month);
      await this.openEditorAt(file, day ? dateKey(month, day) : undefined);
      await this.refresh();
    }).open();
  }

  async openDay(day: number): Promise<void> {
    const month = this.month;
    const date = dateKey(month, day);
    const file = this.files.find(this.path);
    if (!file) { this.offerCreateMonth(day); return; }
    const parsed = parseMonth(await this.currentText(file), month);
    if (parsed.days.has(date)) { await this.openEditorAt(file, date); return; }
    new CreateSectionModal(this.app, `创建 ${date} 分节`, `将在 ${file.path} 末尾追加“## ${date}”，已有文字和日期不会被替换或重新排序。`, async () => {
      // If the file is open, append through that native editor, preserving unsaved edits and undo.
      const open = this.openEditor(file.path);
      if (open) {
        const current = open.editor.getValue();
        const updated = appendDay(current, month, day);
        if (updated !== current) open.editor.replaceRange(updated.slice(current.length), open.editor.offsetToPos(current.length));
      } else {
        await this.files.addDay(file, month, day);
      }
      await this.openEditorAt(file, date);
      await this.refresh();
    }).open();
  }

  private async openEditorAt(file: TFile, date?: string): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType('markdown').find(candidate => candidate.view instanceof MarkdownView && candidate.view.file?.path === file.path);
    if (!leaf) leaf = this.app.workspace.getLeaf('tab');
    if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== file.path || leaf.view.getMode() !== 'source') {
      await leaf.openFile(file, { active: true, state: { mode: 'source' } });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof MarkdownView)) return;
    if (date) {
      const section = parseMonth(leaf.view.editor.getValue(), date.slice(0, 7)).days.get(date)?.[0];
      if (section) {
        const line = Math.min(section.headingLine + 1, leaf.view.editor.lastLine());
        const pos = { line, ch: 0 };
        leaf.view.editor.setCursor(pos);
        leaf.view.editor.scrollIntoView({ from: pos, to: pos }, true);
      } else {
        new Notice('日期分节已变化，已打开月份文件，请在原生编辑器中查看。');
      }
    }
    leaf.view.editor.focus();
  }

  async onClose(): Promise<void> {
    this.ready = false;
    this.revision++;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    if (this.renderOwner) { this.removeChild(this.renderOwner); this.renderOwner = null; }
    this.liveBuffer = null;
    this.contentEl.replaceChildren();
  }
}
