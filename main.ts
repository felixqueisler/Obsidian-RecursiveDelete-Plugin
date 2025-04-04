import { App, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface RecursiveNoteDeleterSettings {
  confirmDeletion: boolean;
}

const DEFAULT_SETTINGS: RecursiveNoteDeleterSettings = {
  confirmDeletion: true
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
	const linkedFiles = this.getLinkedFiles(file);
	if (linkedFiles.length === 0) {
	  new Notice('No linked notes or attachments found.');
	  return;
	}

	if (this.settings.confirmDeletion) {
	  const confirm = await this.confirmDeletion(linkedFiles);
	  if (!confirm) {
		return;
	  }
	}

	linkedFiles.forEach(linkedFile => {
	  this.app.vault.delete(linkedFile);
	});
	new Notice('Linked notes and attachments deleted.');
  }

  getLinkedFiles(file: TFile): TFile[] {
	const linkedFiles: TFile[] = [];
	const cache = this.app.metadataCache.getFileCache(file);
	if (cache) {
	  const links = cache.links;
	  links.forEach(link => {
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (linkedFile) {
		  linkedFiles.push(linkedFile);
		  linkedFiles.push(...this.getLinkedFiles(linkedFile)); // Recursive call
		}
	  });
	}
	return linkedFiles;
  }

  async confirmDeletion(files: TFile[]): Promise<boolean> {
	const fileList = files.map(file => file.path).join('\n');
	return new Promise((resolve) => {
	  new Notice(`Are you sure you want to delete the following files?\n${fileList}`, 5000);
	  const confirmButton = document.createElement('button');
	  confirmButton.textContent = 'Confirm';
	  confirmButton.onclick = () => {
		resolve(true);
	  };
	  document.body.appendChild(confirmButton);

	  const cancelButton = document.createElement('button');
	  cancelButton.textContent = 'Cancel';
	  cancelButton.onclick = () => {
		resolve(false);
	  };
	  document.body.appendChild(cancelButton);
	});
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
  }
}
