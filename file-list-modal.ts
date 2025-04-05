import { App, Modal, TFile } from 'obsidian';

export class FileListModal extends Modal {
  files: TFile[];
  onConfirm: (result: boolean) => void;

  constructor(app: App, files: TFile[], onConfirm: (result: boolean) => void) {
	super(app);
	this.files = files;
	this.onConfirm = onConfirm;
  }

  onOpen() {
	const { contentEl } = this;
	const fileCount = this.files.length;
	contentEl.createEl('h3', { text: `Files to be deleted: ${fileCount}` });

	// Set up the modal content with flex layout
	contentEl.style.display = 'flex';
	contentEl.style.flexDirection = 'column';
	contentEl.style.height = '100%';

	const fileListEl = contentEl.createEl('div', { cls: 'file-list' });
	fileListEl.style.flex = '1'; // Allow the file list to take up remaining space
	fileListEl.style.overflowY = 'auto';
	fileListEl.style.border = '1px solid var(--background-modifier-border)'; // Use theme border color
	fileListEl.style.padding = '10px';
	fileListEl.style.marginBottom = '20px';
	fileListEl.style.fontFamily = 'var(--font-regular)'; // Use the same font family as the sidebar
	fileListEl.style.fontSize = 'var(--font-small)'; // Match sidebar font size
	fileListEl.style.lineHeight = '1.4'; // Adjust line height for better readability

	this.files.forEach(file => {
	  const filePath = file.path.split('/').join(' › '); // Format path with separators
	  const fileEl = fileListEl.createEl('p', { text: filePath, cls: 'file-path nav-file-title' });

	  // Add file type tag for attachments
	  if (file.extension && file.extension !== 'md') {
		const tagEl = fileEl.createEl('span', { cls: 'nav-file-tag' });
		tagEl.textContent = file.extension.toUpperCase();
	  }
	});

	// Style file paths
	fileListEl.querySelectorAll('.file-path').forEach(pathEl => {
	  pathEl.style.margin = '2px 0'; // Match sidebar margin
	  pathEl.style.borderRadius = '4px'; // Rounded corners for better visual appeal
	  pathEl.style.display = 'flex'; // Use flexbox to align tag and text
	  pathEl.style.alignItems = 'center'; // Align items vertically centered
	  pathEl.style.justifyContent = 'space-between'; // Space between text and tag
	});

	const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });
	buttonContainer.style.display = 'flex';
	buttonContainer.style.justifyContent = 'space-between';
	buttonContainer.style.marginTop = '20px';

	const confirmButton = buttonContainer.createEl('button', { text: 'Confirm' });
	confirmButton.addClass('mod-warning'); // Apply warning/delete color from the theme
	confirmButton.style.padding = '10px 20px'; // Add padding to the button
	confirmButton.addEventListener('click', () => {
	  this.onConfirm(true);
	  this.close();
	});

	const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
	cancelButton.style.padding = '10px 20px'; // Add padding to the button
	cancelButton.addEventListener('click', () => {
	  this.onConfirm(false);
	  this.close();
	});

	// Ensure the modal content area is centered and constrained
	this.modalEl.style.maxWidth = 'var(--modal-max-width)';
	this.modalEl.style.height = 'auto';
	this.modalEl.style.maxHeight = 'var(--modal-height)';
	this.modalEl.style.padding = '20px';
	this.modalEl.style.boxSizing = 'border-box';
	this.contentEl.style.display = 'flex';
	this.contentEl.style.flexDirection = 'column';
	this.contentEl.style.flexShrink = '1';
	this.contentEl.style.flexGrow = '1';
	this.contentEl.style.overflow = 'hidden';

	// Add custom CSS for file type tags and fixed header/footer
	const style = document.createElement('style');
	style.innerHTML = `
	  .modal-header, .button-container {
		flex-shrink: 0;
	  }
	  .file-list {
		overflow-y: auto;
		background-color: var(--background-secondary);
	  }
	  .file-list .file-path {
		background-color: var(--nav-item-background-active);
		color: var(--text-normal);
		font-weight: var(--font-regular); // Match sidebar font weight
		padding-left: 8px;
	  }
	  .file-list .nav-file-tag {
		margin-left: 4px;
		color: var(--text-accent);
		background-color: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
	  }
	`;
	contentEl.appendChild(style);
  }

  onClose() {
	const { contentEl } = this;
	contentEl.empty();
  }
}
