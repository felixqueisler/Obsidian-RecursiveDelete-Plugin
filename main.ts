import { Notice, TFile, App, Plugin, PluginSettingTab, Setting, LinkCache } from 'obsidian';
import { FileListModal } from './file-list-modal';
import * as fs from 'fs';
import * as path from 'path';

// Definition für die interne Obsidian API, damit TypeScript nicht meckert
interface InternalMetadataCache {
	getBacklinksForFile(file: TFile): { data: Map<string, LinkCache[]> } | null;
}

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
				this.deleteLinkedNotes(activeFile).catch((err) => console.error(err));;
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

		for (const linkedFile of filesToDelete) {
			await this.app.fileManager.trashFile(linkedFile).catch(err => console.error(err));
		};

		if (this.settings.removeBacklinks) {
			await this.removeBacklinks(filesToDelete);
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
				console.debug(`No links found or links is not an array in cache for file: ${file.path}`);
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
				console.debug(`No embeds found or embeds is not an array in cache for file: ${file.path}`);
			}
		} else {
			console.debug(`No cache found or file already visited: ${file.path}`);
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
			const adapter = this.app.vault.adapter as unknown as { basePath: string };
			const filePath = path.join(adapter.basePath, file.path);
			const backupPath = path.join(this.settings.backupLocation, file.path);
			const backupDir = path.dirname(backupPath);

			if (!fs.existsSync(backupDir)) {
				fs.mkdirSync(backupDir, { recursive: true });
			}

			fs.copyFileSync(filePath, backupPath);
		});

		new Notice('Files backed up successfully.');
	}

	async removeBacklinks(files: TFile[]) {
		const filePaths = files.map(file => file.path);
		// Regex Escape Fix ist hier drin
		const fileNames = files.map(file => file.name.replace(/\.md$/, '')); 
		
		console.debug('Recursive Deleter: Files to clean backlinks for:', filePaths);
	
		if (filePaths.length === 0) return;
	
		for (const filePath of filePaths) {
			const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
			if (!(abstractFile instanceof TFile)) {
				continue;
			}
	
			// FIX: Wir casten den Cache auf unseren internen Typ.
			// Damit weiß TS: "Aha, cache hat die Methode getBacklinksForFile".
			// Der 'unsafe call' Fehler verschwindet, weil die Methode jetzt typisiert ist.
			const cache = this.app.metadataCache as unknown as InternalMetadataCache;
			const backlinks = cache.getBacklinksForFile(abstractFile);
	
			if (!backlinks || !backlinks.data || backlinks.data.size === 0) {
				continue;
			}
	
			// for...of Schleife um 'await' nutzen zu können
			for (const [backlinkPath] of backlinks.data) { // [backlinkPath, backlinkData] möglich
				
				const backlinkFile = this.app.vault.getAbstractFileByPath(backlinkPath);
	
				if (!(backlinkFile instanceof TFile)) {
					console.error(`No file found for path: ${backlinkPath}`);
					continue;
				}
	
				try {
					const data = await this.app.vault.read(backlinkFile);
					if (data === null) {
						continue;
					}
	
					let changed = false;
					const lines = data.split('\n');
					const newLines = [];
	
					for (let i = 0; i < lines.length; i++) {
						let line = lines[i];
						const trimmedLine = line.trim();
						const isListItem = /^\s*[-*+]\s/.test(trimmedLine);
						const isStandaloneLink = /^\s*\[{2}.*?\]{2}\s*$/.test(trimmedLine) || (this.settings.considerListItemsAsStandalone && isListItem && /^\s*[-*+]\s\[{2}.*?\]{2}\s*$/.test(trimmedLine));
	
						if (isStandaloneLink) {
							// Prüfen ob es unser File betrifft
							const hitsDeletedFile = fileNames.some(name => line.includes(name));
							if (hitsDeletedFile) {
								changed = true;
								console.debug(`Recursive Deleter: Removed standalone link in ${backlinkPath}`);
								continue; 
							}
						}
	
						fileNames.forEach(name => {
							const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
							const linkPattern = new RegExp(`\\[\\[.*?${escapedName}(?:\\.md)?(?:#.*)?\\]\\]|!\\[\\[.*?${escapedName}(?:\\.md)?(?:#.*)?\\]\\]`, 'gi');
	
							if (linkPattern.test(line)) {
								changed = true;
								console.debug(`Recursive Deleter: Found inline match for ${name} in ${backlinkPath}`);
								line = line.replace(linkPattern, (match) => {
									switch (this.settings.inlineLinkBehavior) {
										case 'remove-link':
											return '';
										case 'keep-name':
											return match.replace(/[[\]]/g, '');
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
						console.debug(`Recursive Deleter: Saving changes to ${backlinkPath}`);
						await this.app.vault.modify(backlinkFile, newLines.join('\n'));
					}
				} catch (error) {
					console.error(`Error processing file: ${backlinkPath}`, error);
				}
			}
		}
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as RecursiveNoteDeleterSettings;
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

		new Setting(containerEl)
			.setName('Backup location')
			.setDesc('Absolute path to the backup folder (e.g., /Users/Name/Documents/Backup). Please create the folder manually.')
			.addText(text => text
				.setPlaceholder('/path/to/folder')
				.setValue(this.plugin.settings.backupLocation)
				.onChange(async (value) => {
					this.plugin.settings.backupLocation = value;
					await this.plugin.saveSettings();
					
					// Prüfen ob Pfad existiert (optionales UX Feature)
					// Wir nutzen fs nur, wenn wir sicher am Desktop sind, 
					// aber für den Linter ist das hier sauberer als require.
					if (value.trim() !== '') {
						// enableBackupSetting unten aktivieren/deaktivieren
						// Da wir hier keinen direkten Zugriff auf die Variable 'enableBackupSetting' haben 
						// (außer wir strukturieren um), lassen wir es simpel.
						// Der User merkt beim Backup-Versuch, ob der Pfad stimmt.
					}
				}));
		
		new Setting(containerEl)
			.setName('Enable backup')
			.setDesc('Enable backing up files to the specified location before deletion.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBackup)
				.onChange(async (value) => {
					if (value && !this.plugin.settings.backupLocation) {
						new Notice('Please set a backup location first.');
						// Reset toggle visual state if needed, or just allow it and fail later
						toggle.setValue(false);
						return;
					}
					this.plugin.settings.enableBackup = value;
					await this.plugin.saveSettings();
				}));
	}
}
