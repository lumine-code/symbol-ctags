const { BufferedProcess, CompositeDisposable, watchFile, Point } = require("lumine");

const TagReader = require("./tag-reader");
const getTagsFile = require("./get-tags-file");
const fs = require("@lumine-code/fs-plus");
const path = require("path");
const promises = require("node:fs/promises");
const os = require("node:os");

class CtagsProvider {
  constructor(getIPythonSource) {
    this.getIPythonSource = getIPythonSource;
    this.symbolProcesses = new Set();
    this.destroyed = false;
    this.watchTagsFiles();
    this.loadSymbols();
    this.packageName = "symbol-ctags";
    this.name = "ctags";
    this.isExclusive = true;
  }

  destroy() {
    this.destroyed = true;
    for (const process of this.symbolProcesses) process.kill();
    this.symbolProcesses.clear();
    this.loadTask?.terminate?.();
    this.unwatchTagsFiles();
  }

  canProvideSymbols(meta) {
    let { editor } = meta;
    // Can't provide symbols unless a file is saved.
    if (editor.getPath() === undefined) return 0;
    if (editor.getGrammar().scopeName === "source.python.ipy" && !this.getIPythonSource?.())
      return 0;

    // We start off with a score less than 1 because `ctags` should always lose
    // out when it's competing against the Tree-sitter provider.
    let score = 0.99;

    // If the file isn't saved on disk, this provider's results may be
    // inaccurate, so it's a less attractive candidate.
    if (editor.getFileState() !== "unmodified") score -= 0.1;

    return score;
  }

  getEditor() {
    return lumine.workspace.getActiveTextEditor();
  }

  getPath() {
    if (this.getEditor()) {
      return this.getEditor().getPath();
    }
    return undefined;
  }

  getScopeName() {
    if (this.getEditor() && this.getEditor().getGrammar()) {
      return this.getEditor().getGrammar().scopeName;
    }
    return undefined;
  }

  getPackageRoot() {
    const resourcePath = lumine.application.getResourcePath();
    const currentFileWasRequiredFromSnapshot = !fs.isAbsolute(__dirname);
    const packageRoot = currentFileWasRequiredFromSnapshot
      ? path.join(resourcePath, "node_modules", "symbol-ctags")
      : path.resolve(__dirname, "..");

    if (path.extname(resourcePath) === ".asar" && packageRoot.indexOf(resourcePath) === 0) {
      return path.join(`${resourcePath}.unpacked`, "node_modules", "symbol-ctags");
    } else {
      return packageRoot;
    }
  }

  parseTagLine(line) {
    let sections = line.split("\t");
    if (sections.length > 3) {
      return {
        position: new Point(parseInt(sections[2], 10) - 1),
        name: sections[0],
        tag: sections[3]?.trim() || undefined,
      };
    }
    return null;
  }

  validateTags(tags) {
    let symbols = [];
    for (let tag of tags) {
      let tagFilePath = path.join(tag.directory, tag.file);
      if (!fs.existsSync(tagFilePath)) {
        continue;
      }
      symbols.push(this.interpretTag(tag));
    }
    return symbols;
  }

  interpretTag(tag) {
    return {
      directory: tag.directory,
      file: tag.file,
      name: tag.name,
      position: this.getTagPosition(tag),
      tag: tag.kind?.trim() || undefined,
    };
  }

  getTagPosition(tag) {
    if (!tag) {
      return undefined;
    }

    if (tag.lineNumber) {
      return new Point(tag.lineNumber - 1, 0);
    }

    // Remove leading /^ and trailing $/
    if (!tag.pattern) {
      return undefined;
    }
    const pattern = tag.pattern.replace(/(^\/\^)|(\$\/$)/g, "").trim();

    if (!pattern) {
      return undefined;
    }
    const file = path.join(tag.directory, tag.file);
    if (!fs.isFileSync(file)) {
      return undefined;
    }
    const iterable = fs.readFileSync(file, "utf8").split("\n");
    for (let index = 0; index < iterable.length; index++) {
      let line = iterable[index];
      if (pattern === line.trim()) {
        return new Point(index, 0);
      }
    }

    return undefined;
  }

  watchTagsFiles() {
    this.unwatchTagsFiles();
    this.tagsFileSubscriptions = new CompositeDisposable();
    let reloadTags = () => {
      this.reloadTags = true;
      this.watchTagsFiles();
    };

    for (let projectPath of lumine.project.getPaths()) {
      let tagsFilePath = getTagsFile(projectPath);
      if (!tagsFilePath) continue;
      let tagsFile = watchFile(tagsFilePath);

      this.tagsFileSubscriptions.add(
        tagsFile,
        tagsFile.onDidChange(reloadTags),
        tagsFile.onDidInvalidate(reloadTags),
        tagsFile.onDidError((error) => console.error("Unable to watch tags", error)),
      );
    }
  }

  unwatchTagsFiles() {
    this.tagsFileSubscriptions?.dispose();
  }

  getLanguage(editor) {
    if ([".cson", ".gyp"].includes(path.extname(this.getPath()))) {
      return "Cson";
    }

    let scopeName = this.getScopeName(editor);

    switch (scopeName) {
      case "source.c":
        return "C";
      case "source.cpp":
        return "C++";
      case "source.clojure":
        return "Lisp";
      case "source.capnp":
        return "Capnp";
      case "source.cfscript":
        return "ColdFusion";
      case "source.cfscript.embedded":
        return "ColdFusion";
      case "source.coffee":
        return "CoffeeScript";
      case "source.css":
        return "Css";
      case "source.css.less":
        return "Css";
      case "source.css.scss":
        return "Css";
      case "source.elixir":
        return "Elixir";
      case "source.fountain":
        return "Fountain";
      case "source.gfm":
        return "Markdown";
      case "source.go":
        return "Go";
      case "source.java":
        return "Java";
      case "source.js":
        return "JavaScript";
      case "source.js.jsx":
        return "JavaScript";
      case "source.jsx":
        return "JavaScript";
      case "source.json":
        return "Json";
      case "source.julia":
        return "Julia";
      case "source.makefile":
        return "Make";
      case "source.objc":
        return "C";
      case "source.objcpp":
        return "C++";
      case "source.python":
      case "source.python.ipy":
        return "Python";
      case "source.ruby":
        return "Ruby";
      case "source.sass":
        return "Sass";
      case "source.ts":
        return "TypeScript";
      case "source.ts.tsx":
        return "TypeScript";
      case "source.yaml":
        return "Yaml";
      case "text.html":
        return "Html";
      case "text.html.php":
        return "Php";
      case "text.tex.latex":
        return "Latex";
      case "text.html.cfml":
        return "ColdFusion";
    }

    // TODO: Fall back to a grammar registry lookup?
    return undefined;
  }

  loadSymbols() {
    return new Promise((resolve) => {
      this.loadTask = TagReader.getAllTags(resolve);
    });
  }

  getSymbols(meta) {
    if (meta.type === "project") {
      return this.getSymbolsInProject(meta);
    } else if (meta.type === "project-find") {
      return this.findDefinitionsInProject(meta);
    }
    let { editor } = meta;
    if (editor.getGrammar().scopeName === "source.python.ipy")
      return this.getIPythonSymbols(editor);
    return this.getFileSymbols(editor, editor.getPath());
  }

  async getIPythonSymbols(editor) {
    const service = this.getIPythonSource?.();
    if (!service || this.destroyed || editor.isDestroyed()) return [];
    const projection = await service.project(editor);
    if (!projection || !projection.isCurrent() || this.destroyed || editor.isDestroyed()) return [];
    return this.getProjectionSymbols(projection, editor);
  }

  async getProjectionSymbols(projection, editor = null) {
    const current = () => projection.isCurrent() && !this.destroyed && !editor?.isDestroyed();
    if (!current()) return [];
    const directory = await promises.mkdtemp(path.join(os.tmpdir(), "lumine-ipy-ctags-"));
    const filename = path.join(directory, "source.py");
    try {
      if (!current()) return [];
      await promises.writeFile(filename, projection.text, "utf8");
      if (!current()) return [];
      const symbols = await this.getFileSymbols(editor, filename, "Python");
      if (!current()) return [];
      return symbols.filter((symbol) => projection.isPythonPosition(symbol.position));
    } finally {
      await promises.rm(filename, { force: true });
      await promises.rmdir(directory);
    }
  }

  getFileSymbols(editor, filename, forcedLanguage) {
    let tags = {};
    let packageRoot = this.getPackageRoot();

    let command = path.join(packageRoot, "vendor", `ctags-${process.platform}`);
    let defaultCtagsFile = path.join(packageRoot, "lib", "ctags-config");

    const args = [`--options=${defaultCtagsFile}`, `--fields=+KS`];

    if (forcedLanguage || lumine.config.get("symbol-ctags.useEditorGrammarAsCtagsLanguage")) {
      let language = forcedLanguage || this.getLanguage(editor);
      if (language) {
        args.push(`--language-force=${language}`);
      }
    }

    args.push("-nf", "-", filename);

    return new Promise((resolve) => {
      let result, tag;
      let job;
      let completed = false;
      job = new BufferedProcess({
        command,
        args,
        stdout: (lines) => {
          result = [];
          for (let line of lines.split("\n")) {
            let item;
            tag = this.parseTagLine(line);
            if (tag) {
              item = tags[tag.position.row]
                ? tags[tag.position.row]
                : (tags[tag.position.row] = tag);
            }
            result.push(item);
          }
          return result;
        },
        stderr: () => {},
        exit: () => {
          completed = true;
          this.symbolProcesses.delete(job);
          return resolve(Object.values(tags));
        },
      });
      if (!completed) this.symbolProcesses.add(job);
    });
  }

  async getSymbolsInProject() {
    const tags = await TagReader.getAllTags();
    const symbols = tags
      .filter((tag) => path.extname(tag.file || "").toLowerCase() !== ".ipy")
      .map((tag) => this.interpretTag(tag));
    for (const filename of new Set(
      tags
        .filter((tag) => path.extname(tag.file || "").toLowerCase() === ".ipy")
        .map((tag) => path.resolve(tag.directory, tag.file)),
    )) {
      symbols.push(...(await this.getProjectedFileSymbols(filename)));
    }
    return symbols;
  }

  async findDefinitionsInProject(meta) {
    let tags = await TagReader.find(meta.editor);
    const symbols = this.validateTags(
      tags.filter((tag) => path.extname(tag.file || "").toLowerCase() !== ".ipy"),
    );
    const word = meta.word ?? meta.editor.getWordUnderCursor();
    for (const filename of new Set(
      tags
        .filter((tag) => path.extname(tag.file || "").toLowerCase() === ".ipy")
        .map((tag) => path.resolve(tag.directory, tag.file)),
    )) {
      symbols.push(
        ...(await this.getProjectedFileSymbols(filename)).filter((symbol) => symbol.name === word),
      );
    }
    return symbols;
  }

  async getProjectedFileSymbols(filename) {
    const service = this.getIPythonSource?.();
    if (!service || this.destroyed) return [];
    const existing = lumine.workspace
      .getTextEditors()
      .find(
        (editor) =>
          editor.getPath() &&
          path.resolve(editor.getPath()) === filename &&
          editor.getGrammar().scopeName === "source.python.ipy",
      );
    let symbols;
    if (existing) symbols = await this.getIPythonSymbols(existing);
    else {
      let snapshot;
      try {
        const before = await promises.stat(filename);
        snapshot = await service.projectText(await promises.readFile(filename, "utf8"), {
          filePath: filename,
        });
        if (!snapshot) return [];
        symbols = await this.getProjectionSymbols(snapshot);
        const after = await promises.stat(filename);
        if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) return [];
      } catch (error) {
        if (error.code === "ENOENT" || error.name === "AbortError") return [];
        throw error;
      } finally {
        snapshot?.dispose();
      }
    }
    return symbols.map((symbol) => ({
      ...symbol,
      directory: path.dirname(filename),
      file: path.basename(filename),
    }));
  }
}

module.exports = CtagsProvider;
