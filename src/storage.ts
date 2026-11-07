import { TFile, TFolder, type Vault } from 'obsidian';
import { appendDay, monthPath, monthTemplate } from './calendar';

export class MonthlyFiles {
  constructor(private vault: Vault) {}

  find(path: string): TFile | null {
    const entry = this.vault.getAbstractFileByPath(path);
    if (!entry) return null;
    if (!(entry instanceof TFile)) throw new Error(`${path} 是文件夹，不能作为月份文件。`);
    return entry;
  }

  async createMonth(folder: string, month: string): Promise<TFile> {
    const path = monthPath(folder, month);
    const existing = this.find(path);
    if (existing) return existing;
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const parentPath = parts.slice(0, i).join('/');
      const parent = this.vault.getAbstractFileByPath(parentPath);
      if (parent && !(parent instanceof TFolder)) throw new Error(`${parentPath} 已被文件占用。`);
      if (!parent) {
        try { await this.vault.createFolder(parentPath); }
        catch (error) {
          if (!(this.vault.getAbstractFileByPath(parentPath) instanceof TFolder)) throw error;
        }
      }
    }
    // create() refuses an existing path. If another window won the race, use its file.
    try { return await this.vault.create(path, monthTemplate(month)); }
    catch (error) {
      const raced = this.find(path);
      if (raced) return raced;
      throw error;
    }
  }

  async addDay(file: TFile, month: string, day: number): Promise<void> {
    await this.vault.process(file, current => appendDay(current, month, day));
  }
}
