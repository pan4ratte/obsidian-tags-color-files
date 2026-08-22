# Tags Color Files plugin

English | [Русский](https://github.com/pan4ratte/obsidian-tags-color-files/blob/main/README_RU.md)

This plugin allows you to automatically highlight files in your Obsidian explorer with different colors based on the tags they contain. File colors are determined by rules that you create in the plugin settings by entering a tag and assigning a color to it. After adding a tag for which a rule has been created to a file, that file is colored accordingly in the Obsidian explorer.

![](media/plugin-demo-settings.png)


## Features

### 1. Automatic highlighting in the file explorer

Files are colored in the Obsidian file explorer according to the tag-color rules that you create. Just add a tag for which a rule was created to a note, and the plugin applies the color right away. By default rules color the notes that contain the specified tag, but negative highlighting of the files without that tag is available as well. Finally, apart from general rules you can set folder rules, to highlight notes only inside a chosen folder.

### 2. Six coloring methods

Both the basic "Text" and "Background" methods are available, as well as the more advanced "Dots before/after text" and "Dots before/after text + text". When you choose any of the methods with dots, up to three colored dots are displayed simultaneously in the file explorer if a single file contains several tags for which coloring rules have been created. Choice of the dots sizes is also available.

### 3. Tag prioritization

Rules are ordered in the plugin settings by dragging them or with the arrows. When a single file contains more than one tag for which a coloring rule was created, the plugin colors that file by the rule with the highest priority.

### 4. Coloring files in Bases

Coloring in Bases can optionally be enabled for the table and list views. Only the text of the file name is colored there, whichever coloring method is selected.

### 5. Backup and restore

All of your rules can be exported from and imported back into the plugin. Export is available on desktop only, because of mobile platform limitations.


## Plugin Use Case

Initially, the plugin was created for my personal needs. When reading literature, I tag certain quotes with such tags as `#key-idea` or `#disagree` to highlight relevant thoughts. It would be more convenient for me to see such quotes in the Obsidian explorer without having to filter notes by tags in the search bar or in the tag pane. — This plugin solves exactly that problem, but I can imagine that there could be much more creative use cases for it.


## Installation

### Option 1: Obsidian plugin store

1. In Obsidian settings open the tab "Community plugins" and click the "Browse" button.

2. In the search bar type `Tags Color Files`, click on the result, then "Install" and "Enable" buttons.

Alternatively, you can install the plugin by following the link to the community website: [https://community.obsidian.md/plugins/tags-color-files](https://community.obsidian.md/plugins/tags-color-files)

### Option 2: BRAT plugin

If you want to test beta-versions of the plugin or use previous versions, you can do that with `BRAT` plugin:

1. Install `BRAT` plugin from the official Obsidian plugin store.

2. In the `BRAT` settings, find the “Beta plugin list” section and click on the “Add beta plugin” button.

3. In the window that appears, paste the link to the `Tags Color Files` plugin repository: [https://github.com/pan4ratte/obsidian-tags-color-files](https://github.com/pan4ratte/obsidian-tags-color-files)

4. Under “Select a version” choose the desired version and click the “Add plugin” button. The plugin will be automatically installed and will be ready to use.


## About the Author

My name is Mark Ingrem and I am a Religious Studies scholar. Apart from my main area of study (Protestant Political Theology in Russia), I teach a university course called "Information Technologies in Scientific Research", which is based on my own unique program. This plugin helps me in my research and I use it in my teaching, along with the other plugins I develop, which you can find on [my GitHub profile](https://github.com/pan4ratte/).

Hello to every student who came across this page!
