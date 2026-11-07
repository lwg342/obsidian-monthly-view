// @ts-nocheck
// Host simulation only. Never included in main.js. Real Obsidian remains the runtime API.
import MarkdownIt from 'markdown-it';

export class Events {
  listeners = new Map();
  on(event, callback) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback); this.listeners.set(event, listeners);
    return { off: () => listeners.delete(callback) };
  }
  trigger(event, ...args) { for (const callback of this.listeners.get(event) ?? []) callback(...args); }
}

export class Component {
  children = new Set(); cleanups = [];
  addChild(child) { this.children.add(child); child.load(); return child; }
  removeChild(child) { child.unload(); this.children.delete(child); return child; }
  load() {}
  unload() { for (const child of this.children) child.unload(); this.children.clear(); this.cleanups.forEach(fn => fn()); this.cleanups = []; }
  registerEvent(ref) { this.cleanups.push(() => ref.off()); }
  registerInterval(id) { this.cleanups.push(() => window.clearInterval(id)); }
  registerDomEvent(node, event, fn) { node.addEventListener(event, fn); this.cleanups.push(() => node.removeEventListener(event, fn)); }
}

export class TFile { constructor(path) { this.path = path; } }
export class TFolder { constructor(path) { this.path = path; } }

export class VaultMock extends Events {
  entries = new Map(); data = new Map(); reads = []; writes = []; queue = Promise.resolve(); beforeCreate = null; readGate = null;
  getAbstractFileByPath(path) { return this.entries.get(path) ?? null; }
  seed(path, data) { const file = new TFile(path); this.entries.set(path, file); this.data.set(path, data); return file; }
  async cachedRead(file) { this.reads.push(file.path); const text = this.data.get(file.path); if (this.readGate) await this.readGate(file); return text; }
  async createFolder(path) { if (this.entries.has(path)) throw new Error('Already exists'); const folder = new TFolder(path); this.entries.set(path, folder); this.writes.push(['folder', path]); this.trigger('create', folder); return folder; }
  async create(path, data) {
    if (this.beforeCreate) await this.beforeCreate(path);
    if (this.entries.has(path)) throw new Error('Already exists');
    const file = this.seed(path, data); this.writes.push(['create', path]); this.trigger('create', file); return file;
  }
  async process(file, fn) {
    const result = this.queue.then(() => {
      if (this.entries.get(file.path) !== file) throw new Error('File no longer exists');
      const updated = fn(this.data.get(file.path)); this.data.set(file.path, updated);
      this.writes.push(['process', file.path]); this.trigger('modify', file); return updated;
    });
    this.queue = result.catch(() => {}); return result;
  }
  modifyFromDisk(file, text) { this.data.set(file.path, text); this.trigger('modify', file); }
  rename(file, path) { const oldPath = file.path; this.entries.delete(oldPath); this.entries.set(path, file); this.data.set(path, this.data.get(oldPath)); this.data.delete(oldPath); file.path = path; this.trigger('rename', file, oldPath); }
  deleteFromDisk(file) { this.entries.delete(file.path); this.data.delete(file.path); this.trigger('delete', file); }
}

export class ItemView extends Component {
  constructor(leaf) { super(); this.leaf = leaf; this.app = leaf.app; this.contentEl = leaf.app.doc.createElement('div'); this.contentEl.className = 'view-content'; }
  async setState() {}
}

class EditorMock {
  cursor = null; scrolled = null; focused = false;
  constructor(view, text) { this.view = view; this.text = text; }
  getValue() { return this.text; }
  setValue(text) { this.text = text; this.view.app.workspace.trigger('editor-change', this, this.view); }
  offsetToPos(offset) { const lines = this.text.slice(0, offset).split('\n'); return { line: lines.length - 1, ch: lines.at(-1).length }; }
  posToOffset(pos) { return this.text.split('\n').slice(0, pos.line).reduce((total, line) => total + line.length + 1, 0) + pos.ch; }
  replaceRange(text, pos) { const offset = this.posToOffset(pos); this.setValue(this.text.slice(0, offset) + text + this.text.slice(offset)); }
  lastLine() { return this.text.split('\n').length - 1; }
  setCursor(pos) { this.cursor = pos; }
  scrollIntoView(range) { this.scrolled = range; }
  focus() { this.focused = true; }
}

export class MarkdownView extends ItemView {
  constructor(leaf, file, text) { super(leaf); this.file = file; this.editor = new EditorMock(this, text); this.mode = 'source'; }
  getMode() { return this.mode; }
  getViewType() { return 'markdown'; }
}

class LeafMock {
  constructor(app) { this.app = app; this.view = null; }
  async openFile(file, state) {
    this.openState = state;
    if (!(this.view instanceof MarkdownView) || this.view.file !== file) this.view = new MarkdownView(this, file, this.app.vault.data.get(file.path));
    this.view.mode = state?.state?.mode ?? 'source';
  }
  async setViewState(state) {
    this.view = this.app.views.get(state.type)(this); this.view.load(); await this.view.onOpen();
  }
}

export class WorkspaceMock extends Events {
  leaves = []; saves = 0; openedLinks = [];
  constructor(app) { super(); this.app = app; }
  getLeavesOfType(type) { return this.leaves.filter(leaf => leaf.view?.getViewType() === type); }
  getLeaf() { const leaf = new LeafMock(this.app); this.leaves.push(leaf); return leaf; }
  async revealLeaf(leaf) { this.activeLeaf = leaf; }
  requestSaveLayout() { this.saves++; }
  async openLinkText(...args) { this.openedLinks.push(args); }
}

export class AppMock {
  constructor(doc) { this.doc = doc; this.vault = new VaultMock(); this.workspace = new WorkspaceMock(this); this.views = new Map(); this.commands = []; this.settingsTabs = []; }
}

export class Modal {
  static current = null;
  constructor(app) { this.app = app; this.contentEl = app.doc.createElement('div'); this.contentEl.className = 'modal-content'; }
  open() { Modal.current = this; this.overlay = this.app.doc.createElement('div'); this.overlay.className = 'modal-container'; this.overlay.setAttribute('role', 'dialog'); this.overlay.append(this.contentEl); this.app.doc.body.append(this.overlay); this.onOpen(); }
  close() { this.onClose(); this.overlay.remove(); Modal.current = null; }
}

export class Notice { static messages = []; constructor(message) { Notice.messages.push(message); } }
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false });
export class MarkdownRenderer {
  static async render(app, source, target, path, owner) {
    let text = source.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, title) => `[${title ?? link}](${encodeURI(link)})`);
    target.innerHTML = markdown.render(text);
    for (const link of target.querySelectorAll('a')) if (!/^[a-z]+:/i.test(link.getAttribute('href'))) { link.classList.add('internal-link'); link.dataset.href = decodeURI(link.getAttribute('href')); }
    for (const item of target.querySelectorAll('li')) {
      if (!/^\[[ xX]\] /.test(item.textContent)) continue;
      const checked = /^\[[xX]\]/.test(item.textContent);
      item.classList.add('task-list-item');
      item.innerHTML = item.innerHTML.replace(/^\[[ xX]\] /, '');
      const input = app.doc.createElement('input'); input.type = 'checkbox'; input.className = 'task-list-item-checkbox'; input.checked = checked; item.prepend(input);
    }
  }
}

export class Plugin extends Component {
  constructor(app) { super(); this.app = app; }
  async loadData() { return this.saved ?? null; }
  async saveData(data) { this.saved = data; }
  registerView(type, factory) { this.app.views.set(type, factory); }
  addCommand(command) { this.app.commands.push(command); }
  addRibbonIcon() {}
  addSettingTab(tab) { this.app.settingsTabs.push(tab); }
}
export class PluginSettingTab { constructor(app) { this.app = app; this.containerEl = app.doc.createElement('div'); } }
export class Setting {}
