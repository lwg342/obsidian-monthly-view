// @ts-nocheck
// Browser preview of the production view with a simulated Obsidian host.
import { AppMock, MonthlyView, MonthlyCalendarPlugin } from './subject';
import example from '../examples/Calendar/2026-11.md';

const app = new AppMock(document);
const plugin = new MonthlyCalendarPlugin(app);
await plugin.onload();
const file = app.vault.seed('Calendar/2026-11.md', example);
const leaf = app.workspace.getLeaf('tab');
const view = new MonthlyView(leaf, () => 'Calendar');
view.month = '2026-11'; leaf.view = view; view.load();
document.querySelector('#calendar').append(view.contentEl);
await view.onOpen();

const textarea = document.querySelector('#source');
textarea.value = example;
document.querySelector('#apply-edit').addEventListener('click', () => app.vault.modifyFromDisk(file, textarea.value));
document.querySelector('#theme').addEventListener('click', () => {
  document.body.classList.toggle('theme-dark');
  document.body.classList.toggle('theme-light');
});
document.querySelector('#toggle-editor').addEventListener('click', () => {
  document.querySelector('#editor').hidden = !document.querySelector('#editor').hidden;
});
const reveal = app.workspace.revealLeaf.bind(app.workspace);
app.workspace.revealLeaf = async leaf => {
  await reveal(leaf);
  if (leaf.view?.file) {
    document.querySelector('#opened').textContent = `已请求打开 ${leaf.view.file.path}（原生编辑器 API 在此预览中由测试替身模拟）`;
  }
};
document.querySelector('#restore').addEventListener('click', async () => {
  const state = view.getState();
  await view.setState(state, {});
  document.querySelector('#opened').textContent = `已恢复标签页月份 ${state.month}`;
});
