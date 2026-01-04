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
	inlineLinkBehavior: 'remove-link' | 'keep-name' | 'add-note';
	considerListItemsAsStandalone: boolean;
}

const DEFAULT_SETTINGS: RecursiveNoteDeleterSettings = {
	confirmDeletion: true,
	recursiveDelete: true,
	deleteMode: 'both',
	removeBacklinks: false,
	enableBackup: false,
	backupLocation: '',
	inlineLinkBehavior: 'add-note',
	considerListItemsAsStandalone: false,
}

export default class RecursiveNoteDeleter extends Plugin {
	settings: RecursiveNoteDeleterSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('skull', 'Recursive Note Deleter', () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				this.deleteLinkedNotes(activeFile);
			} else {
				new Notice('No active file found. Open a note to use this plugin.');
				console.error("No active file found. Open a note to use this plugin.")
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

	getLinkedFiles(file: TFile, visited: Set < TFile > ): TFile[] {
		const linkedFilesSet = new Set < TFile > ();
		const cache = this.app.metadataCache.getFileCache(file);

		if (cache && !visited.has(file)) {
			visited.add(file);

			const links = cache.links;
			if (links && Array.isArray(links)) {
				links.forEach(link => {
					const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
					if (linkedFile && !visited.has(linkedFile)) {
						linkedFilesSet.add(linkedFile);
						if (this.settings.recursiveDelete) {
							try {
								this.getLinkedFiles(linkedFile, visited).forEach(f => linkedFilesSet.add(f));
							} catch (error) {
								console.error(`Error processing linked file: ${linkedFile.path}`, error);
							}
						}
					}
				});
			} else {
				console.warn(`No links found or links is not an array in cache for file: ${file.path}`);
			}

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
				return false;
			}
			if (this.settings.deleteMode === 'attachments-only' && file.extension === 'md') {
				return false;
			}
			return true;
		});
	}

	confirmDeletion(files: TFile[]): Promise < boolean > {
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
		console.log('removeBacklinks method triggered');
		const filePaths = files.map(file => file.path);
		const fileNames = files.map(file => file.name.replace(/\.md\\$/, '')); // Get file names without .md extension
		console.log('Files to remove backlinks for:', filePaths);

		if (filePaths.length === 0) {
			console.log('No files to process for backlink removal.');
			return;
		}

		filePaths.forEach(filePath => {
			console.log(`Processing file: ${filePath}`);

			// Use Obsidian's API to get backlinks
			const backlinks = this.app.metadataCache.getBacklinksForFile(this.app.vault.getAbstractFileByPath(filePath) as TFile);
			console.log(`Backlinks for file ${filePath}:`, backlinks);

			if (backlinks.data.size === 0) {
				console.log(`No backlinks found for file: ${filePath}`);
				return;
			}

			backlinks.data.forEach((backlinkData, backlinkPath) => {
				const backlinkFile = this.app.vault.getAbstractFileByPath(backlinkPath) as TFile;
				if (!backlinkFile) {
					console.error(`No file found for path: ${backlinkPath}`);
					return;
				}
				console.log(`Processing backlink in file: ${backlinkPath}`);

				this.app.vault.read(backlinkFile).then((data) => {
					if (data == null) {
						console.error(`No data found for file: ${backlinkPath}`);
						return;
					}
					console.log(`File data for ${backlinkPath}:`, data);

					let changed = false;
					const lines = data.split('\n');
					const newLines = [];

					for (let i = 0; i < lines.length; i++) {
						let line = lines[i];
						const trimmedLine = line.trim();
						const isListItem = /^\s*[-*+]\s/.test(trimmedLine); // Check for list items with optional leading whitespace
						const isStandaloneLink = /^\s*\[{2}.*?\]{2}\s*$/.test(trimmedLine) || (this.settings.considerListItemsAsStandalone && isListItem && /^\s*[-*+]\s\[{2}.*?\]{2}\s*$/.test(trimmedLine));

						if (isStandaloneLink) {
							changed = true;
							console.log(`Removed standalone backlink in file: ${backlinkPath}`);
							// Skip adding this line to newLines
							continue;
						}

						fileNames.forEach(name => {
							const escapedName = name.replace(/[.*+?^\\${}()|[\]\\]/g, '\\\\$&'); // Escape special characters
							console.log(`Checking name against regex: ${name}`);
							const linkPattern = new RegExp(`\\[\\[.*?${escapedName}(?:\\.md)?(?:#.*)?\\]\\]|!\\[\\[.*?${escapedName}(?:\\.md)?(?:#.*)?\\]\\]`, 'gi');

							if (linkPattern.test(line)) {
								changed = true;
								console.log(`Found inline backlink to ${name} in file: ${backlinkPath}`);
								line = line.replace(linkPattern, (match) => {
									switch (this.settings.inlineLinkBehavior) {
										case 'remove-link':
											return '';
										case 'keep-name':
											return match.replace(/[\[\]]/g, '');
										case 'add-note':
											return 'BACKLINK REMOVED';
										default:
											return match;
									}
								});
							}
						});

						newLines.push(line);
					}

					if (changed) {
						console.log(`Modifying file: ${backlinkPath}`);
						this.app.vault.modify(backlinkFile, newLines.join('\n'));
					} else {
						console.log(`No changes needed for file: ${backlinkPath}`);
					}
				}).catch((error) => {
					console.error(`Error reading file: ${backlinkPath}`, error);
				});
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
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Confirm deletion')
			.setDesc('Ask for confirmation in a dialog before deleting linked notes and attachments. Deactive only to instantly delete (ultra risky).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmDeletion)
				.onChange(async (value) => {
					this.plugin.settings.confirmDeletion = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Recursively delete')
			.setDesc('Delete linked notes and attachments recursively. The depth is unlimited: beware, that this could delete big parts of your vault.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.recursiveDelete)
				.onChange(async (value) => {
					this.plugin.settings.recursiveDelete = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Delete mode')
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
			.setName('Remove backlinks')
			.setDesc('Automatically remove backlinks to deleted files.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeBacklinks)
				.onChange(async (value) => {
					this.plugin.settings.removeBacklinks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Inline link behavior')
			.setDesc('Choose how to handle inline links when removing backlinks.')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'remove-link': 'Remove only the link',
					'keep-name': 'Remove the brackets but keep the name',
					'add-note': 'Replace the link with "BACKLINK REMOVED"'
				})
				.setValue(this.plugin.settings.inlineLinkBehavior)
				.onChange(async (value) => {
					this.plugin.settings.inlineLinkBehavior = value as RecursiveNoteDeleterSettings['inlineLinkBehavior'];
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Consider list item-links as standalone links')
			.setDesc('Treat list items with standalone links as standalone links for removal. Meaning: the whole list item gets removed. If deactivated it will leave behind a bullet point.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.considerListItemsAsStandalone)
				.onChange(async (value) => {
					this.plugin.settings.considerListItemsAsStandalone = value;
					await this.plugin.saveSettings();
				}));

		const backupLocationSetting = new Setting(containerEl)
			.setName('Backup location')
			.setDesc('Set the folder location for backing up files.')
			.addButton(button => {
				button.setButtonText('Choose folder');
				button.onClick(async () => {
					const { dialog } = require('electron').remote;
					const folder = await dialog.showOpenDialog({
						properties: ['openDirectory'],
					});
					if (folder && folder.filePaths.length > 0) {
						this.plugin.settings.backupLocation = folder.filePaths[0];
						await this.plugin.saveSettings();
						backupLocationSetting.setDesc(this.plugin.settings.backupLocation);
						enableBackupSetting.setDisabled(false);
						new Notice('Backup location set successfully.');
					}
				});
				return button;
			});

		if (this.plugin.settings.backupLocation) {
			backupLocationSetting.setDesc(this.plugin.settings.backupLocation);
		} else {
			backupLocationSetting.setDesc('No folder selected');
		}

		const enableBackupSetting = new Setting(containerEl)
			.setName('Enable backup')
			.setDesc('Enable backing up files on deletion.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.enableBackup);
				toggle.onChange(async (value) => {
					this.plugin.settings.enableBackup = value;
					await this.plugin.saveSettings();
				});
				if (!this.plugin.settings.backupLocation) {
					toggle.setDisabled(true);
					toggle.toggleEl.addEventListener('click', () => {
						if (!this.plugin.settings.backupLocation) {
							new Notice('Backup location is not set. Please choose a backup location first.');
						}
					});
				} else {
					toggle.setDisabled(false);
				}
				return toggle;
			});
	}
}
