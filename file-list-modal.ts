import { App, Modal, TFile, ButtonComponent } from 'obsidian';

export class FileListModal extends Modal {
	files: TFile[];
	onConfirm: (result: boolean) => void;

	constructor(app: App, files: TFile[], onConfirm: (result: boolean) => void) {
		super(app);
		this.files = files;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		const fileCount = this.files.length;

		this.setTitle(PLUGIN_NAME);

		modalEl.addClass('recursive-delete-modal');

		contentEl.createEl('p', {
			text: `Files to be deleted: ${fileCount}`,
			cls: 'delete-warning-text'
		});

		const fileListEl = contentEl.createEl('div', { cls: 'file-list' });

		this.files.forEach(file => {
			// Pfad formatieren
			const filePath = file.path.split('/').join(' › ');
			
			const fileEl = fileListEl.createEl('div', { cls: 'file-item' });
			
			fileEl.createEl('span', { text: filePath, cls: 'file-path' });

			if (file.extension && file.extension !== 'md') {
				fileEl.createEl('span', { text: file.extension.toUpperCase(), cls: 'file-tag' });
			}
		});

		// Button Container
		const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });

		// Cancel Button
		new ButtonComponent(buttonContainer)
			.setButtonText('Cancel')
			.onClick(() => {
				this.onConfirm(false);
				this.close();
			});

		// Delete Button
		new ButtonComponent(buttonContainer)
			.setButtonText(`DELETE ${fileCount} FILES`)
			.setWarning()
			.onClick(() => {
				this.onConfirm(true);
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
