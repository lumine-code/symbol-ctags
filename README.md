# symbol-ctags

Provides symbols via ctags.

This repository is archived and is no longer part of the maintained Lumine ecosystem. Use symbol-tree-sitter for current-buffer symbols and ide-client with a language backend for workspace symbols and definitions. The remaining source and service documentation describe the final historical implementation.

## Features

- **File symbols**: scans the current file with ctags to list its symbols, without needing a tags file.
- **Project symbols**: reads a project tags file to list symbols across the whole project.
- **Go to declaration**: resolves the word under the cursor to its declaration using the project tags file.
- **Broad language support**: works with any language present in its ctags config file.

## Services

- `symbol.provider`: provided to supply symbols for a given file or project.
- `ipython.source`: consumed to generate file symbols from the Python portions of IPython buffers.

For an open `.ipy` file, ctags reads a temporary Python projection of the current buffer and omits Markdown, raw and foreign magic bodies. When a project tags file names an `.ipy` source, its symbols are regenerated from a Python projection instead of trusting tags generated from unprojected disk text. Closed sources are processed sequentially and temporary buffers and files are released afterwards.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
