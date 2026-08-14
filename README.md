# symbol-ctags

Provides symbols via universal-ctags.

## Features

- **File symbols**: scans the current file with ctags to list its symbols, without needing a tags file.
- **Project symbols**: reads a project tags file to list symbols across the whole project.
- **Go to declaration**: resolves the word under the cursor to its declaration using the project tags file.
- **Broad language support**: works with any language present in its ctags config file.

## Installation

To install `symbol-ctags` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/symbol-ctags`.

## Services

- `symbol.provider`: provided to supply symbols for a given file or project.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
