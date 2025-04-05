import { Notice, TFile, App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { FileListModal } from './file-list-modal';
import * as fs from 'fs';
import * as path from 'path';

interface RecursiveNoteDeleterSettings {
  confirmDeletion: boolean;
  recursiveDelete: boolean;
  deleteMode: 'both' | 'notes-only' | 'attachments-only';
  removeBacklinks: boolean;
  enableBackup: boolean;
  backupLocation: string;
}

const DEFAULT_SETTINGS: RecursiveNoteDeleterSettings = {
  confirmDeletion: true,
  recursiveDelete: true,
  deleteMode: 'both',
  removeBacklinks: false,
  enableBackup: false,
  backupLocation: ''
}

export default class RecursiveNoteDeleter extends Plugin {
  settings: RecursiveNoteDeleterSettings;

  async onload() {
	await this.loadSettings();

	this.addRibbonIcon('trash', 'Delete Linked Notes', () => {
	  const activeFile = this.app.workspace.getActiveFile();
	  if (activeFile) {
		this.deleteLinkedNotes(activeFile);
	  } else {
		new Notice('No active file found.');
	  }
	});

	this.addSettingTab(new RecursiveNoteDeleterSettingTab(this.app, this));
  }

  async deleteLinkedNotes(file: TFile) {
	const linkedFiles = this.getLinkedFiles(file, new Set());
	const filesToDelete = this.filterFilesToDelete(linkedFiles);

	if (filesToDelete.length === 0) {
	  this.showNoFilesFoundNotice();
	  return;
	}

	if (this.settings.confirmDeletion) {
	  const confirm = await this.confirmDeletion(filesToDelete);
	  if (!confirm) {
		return;
	  }
	}

	if (this.settings.enableBackup) {
	  this.backupFiles(filesToDelete);
	}

	filesToDelete.forEach(linkedFile => {
	  this.app.vault.delete(linkedFile);
	});

	if (this.settings.removeBacklinks) {
	  this.removeBacklinks(filesToDelete);
	}

	this.showDeletionSuccessNotice();
  }

  getLinkedFiles(file: TFile, visited: Set<TFile>): TFile[] {
	const linkedFilesSet = new Set<TFile>();
	const cache = this.app.metadataCache.getFileCache(file);

	if (cache && !visited.has(file)) {
	  visited.add(file);

	  // Process links (e.g., [[Wiki-style links]])
	  const links = cache.links;
	  if (links && Array.isArray(links)) {
		links.forEach(link => {
		  const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		  if (linkedFile && !visited.has(linkedFile)) {
			linkedFilesSet.add(linkedFile);
			if (this.settings.recursiveDelete) {
			  try {
				this.getLinkedFiles(linkedFile, visited).forEach(f => linkedFilesSet.add(f)); // Recursive call
			  } catch (error) {
				console.error(`Error processing linked file: ${linkedFile.path}`, error);
			  }
			}
		  }
		});
	  } else {
		console.warn(`No links found or links is not an array in cache for file: ${file.path}`);
	  }

	  // Process embeds (e.g., ![[image.jpg]])
	  const embeds = cache.embeds;
	  if (embeds && Array.isArray(embeds)) {
		embeds.forEach(embed => {
		  const embeddedFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
		  if (embeddedFile && !visited.has(embeddedFile)) {
			linkedFilesSet.add(embeddedFile);
		  }
		});
	  } else {
		console.warn(`No embeds found or embeds is not an array in cache for file: ${file.path}`);
	  }
	} else {
	  console.warn(`No cache found or file already visited: ${file.path}`);
	}

	return Array.from(linkedFilesSet);
  }

  filterFilesToDelete(files: TFile[]): TFile[] {
	return files.filter(file => {
	  if (this.settings.deleteMode === 'notes-only' && file.extension !== 'md') {
		return false; // Skip non-note files
	  }
	  if (this.settings.deleteMode === 'attachments-only' && file.extension === 'md') {
		return false; // Skip note files
	  }
	  return true;
	});
  }

  confirmDeletion(files: TFile[]): Promise<boolean> {
	return new Promise((resolve) => {
	  new FileListModal(this.app, files, (result) => {
		resolve(result);
	  }).open();
	});
  }

  backupFiles(files: TFile[]) {
	if (!this.settings.backupLocation) {
	  new Notice('Backup location is not set.');
	  return;
	}

	files.forEach(file => {
	  const filePath = path.join(this.app.vault.adapter.basePath, file.path);
	  const backupPath = path.join(this.settings.backupLocation, file.path);
	  const backupDir = path.dirname(backupPath);

	  if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	  }

	  fs.copyFileSync(filePath, backupPath);
	});

	new Notice('Files backed up successfully.');
  }

  removeBacklinks(files: TFile[]) {
	const filePaths = files.map(file => file.path);
	this.app.vault.getMarkdownFiles().forEach(note => {
	  this.app.vault.process(note, (data) => {
		let changed = false;
		const lines = data.split('\n');
		const newLines = lines.filter(line => {
		  const hasLink = filePaths.some(path => line.includes(`[[${path}]]`) || line.includes(`![[${path}]]`));
		  if (hasLink) {
			changed = true;
			return false; // Remove the line
		  }
		  return true;
		});
		if (changed) {
		  this.app.vault.modify(note, newLines.join('\n'));
		}
	  });
	});
  }

  showNoFilesFoundNotice() {
	const mode = this.settings.deleteMode;
	let message = 'No linked items found to delete.';
	if (mode === 'notes-only') {
	  message = 'No linked notes found to delete.';
	} else if (mode === 'attachments-only') {
	  message = 'No linked attachments found to delete.';
	}
	new Notice(message);
  }

  showDeletionSuccessNotice() {
	const mode = this.settings.deleteMode;
	let message = 'Linked notes and attachments deleted.';
	if (mode === 'notes-only') {
	  message = 'Linked notes deleted.';
	} else if (mode === 'attachments-only') {
	  message = 'Linked attachments deleted.';
	}
	new Notice(message);
  }

  onunload() {
	// Clean up code here
  }

  async loadSettings() {
	this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
	await this.saveData(this.settings);
  }
}

class RecursiveNoteDeleterSettingTab extends PluginSettingTab {
  plugin: RecursiveNoteDeleter;

  constructor(app: App, plugin: RecursiveNoteDeleter) {
	super(app, plugin);
	this.plugin = plugin;
  }

  display(): void {
	const {containerEl} = this;

	containerEl.empty();

	new Setting(containerEl)
	  .setName('Confirm Deletion')
	  .setDesc('Ask for confirmation before deleting linked notes and attachments.')
	  .addToggle(toggle => toggle
		.setValue(this.plugin.settings.confirmDeletion)
		.onChange(async (value) => {
		  this.plugin.settings.confirmDeletion = value;
		  await this.plugin.saveSettings();
		}));

	new Setting(containerEl)
	  .setName('Recursive Delete')
	  .setDesc('Delete linked notes and attachments recursively.')
	  .addToggle(toggle => toggle
		.setValue(this.plugin.settings.recursiveDelete)
		.onChange(async (value) => {
		  this.plugin.settings.recursiveDelete = value;
		  await this.plugin.saveSettings();
		}));

	new Setting(containerEl)
	  .setName('Delete Mode')
	  .setDesc('Choose what to delete: notes, attachments, or both.')
	  .addDropdown(dropdown => dropdown
		.addOptions({
		  both: 'Delete both notes and attachments',
		  'notes-only': 'Delete only notes',
		  'attachments-only': 'Delete only attachments'
		})
		.setValue(this.plugin.settings.deleteMode)
		.onChange(async (value) => {
		  this.plugin.settings.deleteMode = value as RecursiveNoteDeleterSettings['deleteMode'];
		  await this.plugin.saveSettings();
		}));

	new Setting(containerEl)
	  .setName('Remove Backlinks')
	  .setDesc('Automatically remove backlinks to deleted files.')
	  .addToggle(toggle => toggle
		.setValue(this.plugin.settings.removeBacklinks)
		.onChange(async (value) => {
		  this.plugin.settings.removeBacklinks = value;
		  await this.plugin.saveSettings();
		}));

	const backupLocationSetting = new Setting(containerEl)
	  .setName('Backup Location')
	  .setDesc('Set the folder location for backing up files.')
	  .addButton(button => button
		.setButtonText('Choose Folder')
		.onClick(async () => {
		  const { dialog } = require('electron').remote;
		  const folder = await dialog.showOpenDialog({
			properties: ['openDirectory'],
		  });
		  if (folder && folder.filePaths.length > 0) {
			this.plugin.settings.backupLocation = folder.filePaths[0];
			await this.plugin.saveSettings();
			backupLocationSetting.setDesc(this.plugin.settings.backupLocation);
			enableBackupSetting.setDisabled(false);
		  }
		}));

	if (this.plugin.settings.backupLocation) {
	  backupLocationSetting.setDesc(this.plugin.settings.backupLocation);
	} else {
	  backupLocationSetting.setDesc('No folder selected');
	}

	const enableBackupSetting = new Setting(containerEl)
	  .setName('Enable Backup')
	  .setDesc('Enable backing up files before deletion.')
	  .addToggle(toggle => {
		toggle.setValue(this.plugin.settings.enableBackup);
		toggle.onChange(async (value) => {
		  this.plugin.settings.enableBackup = value;
		  await this.plugin.saveSettings();
		});
		if (!this.plugin.settings.backupLocation) {
		  toggle.setDisabled(true);
		} else {
		  toggle.setDisabled(false);
		}
		return toggle;
	  });
  }
}
