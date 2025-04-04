import { App, Modal } from 'obsidian';

export class ConfirmationDialog extends Modal {
  message: string;
  onConfirm: (result: boolean) => void;

  constructor(app: App, message: string, onConfirm: (result: boolean) => void) {
	super(app);
	this.message = message;
	this.onConfirm = onConfirm;
  }

  onOpen() {
	const { contentEl } = this;
	contentEl.createEl('p', { text: this.message });

	const confirmButton = contentEl.createEl('button', { text: 'Confirm' });
	confirmButton.addEventListener('click', () => {
	  this.onConfirm(true);
	  this.close();
	});

	const cancelButton = contentEl.createEl('button', { text: 'Cancel' });
	cancelButton.addEventListener('click', () => {
	  this.onConfirm(false);
	  this.close();
	});
  }

  onClose() {
	const { contentEl } = this;
	contentEl.empty();
  }
}
