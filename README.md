# Obsidian Recursive Note Deleter Plugin

This is a plugin with which you can recursively go through notes and linked notes of those notes to delete them all. **THIS PLUGIN IS PURPOSEFULLY HIGHLY DESTRUCTIVE.** I created this plugin to deal with stray trees of notes which came from old Notion database imports. This plugin is based on the obsidian sample plugin code and was adjusted to the desired functionality.

This plugin adds an extensive list of settings to further specify deletion behaviour. This plugins default behaviour asks before deleting notes. However, i advise you to **backup your vault** before using this plugin.

This plugin adds a 💀 ribbon icon which will open a dialog in which you can check what files would be removed if you proceed. (provided you didn't disable confirm deletion in the settings)

<img width="1377" height="654" alt="RecursiveNoteDelete-Screenshot" src="https://github.com/user-attachments/assets/fec875b5-e863-4a6c-9a4f-35cabf71c824" />

## Features
- Delete notes linked in the active note
- Delete notes linked in the active note and recursively delete all further linked notes to an unlimited depth
- Delete only linked attachments
- Delete only linked notes
- Delete linked notes and attachments
- Fully remove single line note links
- Fully remove single line note links in a list stile (completely removes list item)
- Remove inline links
- Remove backlinks (not fully tested)
- Backlinks: Remove inline links but keep note name in body text
- Backlinks: Remove inline link and replace with Placeholder
- Backup notes before deletion to a folder of choice

## Usage
1. Enable the plugin
2. Change settings of the plugin to your desired behaviour in the 
settings pane
3. A skull ribbon icon appears on the left side
4. Open the note from which you want to initiate the nuclear blast
5. Click the skull, a dialog will appear in which you can see what notes and attachments will get deleted (IF YOU DIDN'T DISABLE CONFIRM DELETION)
6. Proceed on your own risk

## Manually installing the plugin

- Copy over `main.js` (generate it with npm run dev), `styles.css`,  and `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## API Documentation

See https://github.com/obsidianmd/obsidian-api
