const path = require("path");
const fs = require("@lumine-code/fs-plus");
const temp = require("@lumine-code/temp");
const CTagsProvider = require("../lib/ctags-provider");

function getEditor() {
  return lumine.workspace.getActiveTextEditor();
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getProjectSymbols(provider, editor) {
  let symbols = await provider.getSymbols({
    type: "project",
    editor,
    paths: lumine.project.getPaths(),
  });
  return symbols;
}

async function findDeclarationInProject(provider, editor) {
  let symbols = await provider.getSymbols({
    type: "project-find",
    editor,
    paths: lumine.project.getPaths(),
    word: editor.getWordUnderCursor(),
  });
  return symbols;
}

describe("CTagsProvider", () => {
  let provider, directory, editor;

  beforeEach(() => {
    jasmine.unspy(global, "setTimeout");
    jasmine.unspy(Date, "now");

    provider = new CTagsProvider();

    lumine.project.setPaths([temp.mkdirSync("other-dir-"), temp.mkdirSync("symbol-ctags-spec-")]);

    directory = lumine.project.getDirectories()[1];
    fs.copySync(path.join(__dirname, "fixtures", "js"), lumine.project.getPaths()[1]);
  });

  afterEach(() => provider.destroy());

  it("reads IPython file symbols from the current Python projection and removes the temporary file", async () => {
    editor = await lumine.workspace.open(directory.resolve("sample.js"));
    spyOn(editor, "getGrammar").and.returnValue({ scopeName: "source.python.ipy" });
    const projection = {
      text: "\n\ndef real_function(): pass\n",
      isCurrent: () => true,
      isPythonPosition: (position) => position.row === 2,
    };
    provider.getIPythonSource = () => ({ project: async () => projection });
    let temporaryFile;
    spyOn(provider, "getFileSymbols").and.callFake(async (actualEditor, filename, language) => {
      expect(actualEditor).toBe(editor);
      expect(language).toBe("Python");
      temporaryFile = filename;
      expect(fs.readFileSync(filename, "utf8")).toBe(projection.text);
      return [
        { name: "masked", position: { row: 0, column: 0 } },
        { name: "real_function", position: { row: 2, column: 0 } },
      ];
    });
    const symbols = await provider.getSymbols({ type: "file", editor });
    expect(symbols.map((symbol) => symbol.name)).toEqual(["real_function"]);
    expect(fs.existsSync(temporaryFile)).toBe(false);
    expect(fs.existsSync(path.dirname(temporaryFile))).toBe(false);
  });

  it("does not read an unprojected IPython file when the source provider is unavailable", async () => {
    editor = await lumine.workspace.open(directory.resolve("sample.js"));
    spyOn(editor, "getGrammar").and.returnValue({ scopeName: "source.python.ipy" });
    const read = spyOn(provider, "getFileSymbols");
    expect(provider.canProvideSymbols({ type: "file", editor })).toBe(0);
    expect(await provider.getSymbols({ type: "file", editor })).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("projects a closed IPython project source and releases its temporary buffer", async () => {
    const filename = directory.resolve("closed.ipy");
    fs.writeFileSync(filename, "# %% [raw]\nnot_python\n# %% Code\ndef actual(): pass\n");
    const dispose = jasmine.createSpy("dispose");
    const snapshot = { text: "\n\n\ndef actual(): pass\n", isCurrent: () => true, dispose };
    const projectText = jasmine.createSpy("projectText").and.resolveTo(snapshot);
    provider.getIPythonSource = () => ({ projectText });
    spyOn(provider, "getProjectionSymbols").and.resolveTo([
      { name: "actual", position: { row: 3, column: 0 }, tag: "function" },
    ]);
    const symbols = await provider.getProjectedFileSymbols(filename);
    expect(projectText).toHaveBeenCalledWith(fs.readFileSync(filename, "utf8"), {
      filePath: filename,
    });
    expect(symbols[0].name).toBe("actual");
    expect(symbols[0].file).toBe("closed.ipy");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("identifies its project root correctly", () => {
    let root = provider.getPackageRoot();
    expect(root).toContain("symbol-ctags");
    expect(fs.existsSync(path.join(root, "vendor", "ctags-darwin"))).toBe(true);
  });

  describe("when tags can be generated for a file", () => {
    beforeEach(async () => {
      await lumine.workspace.open(directory.resolve("sample.js"));
      editor = getEditor();
    });

    it("provides all JavaScript functions", async () => {
      let symbols = await provider.getSymbols({
        type: "file",
        editor,
      });

      expect(symbols[0].name).toBe("quicksort");
      expect(symbols[0].position.row).toEqual(0);
      expect(symbols[0].tag).toBe("function");

      expect(symbols[1].name).toBe("quicksort.sort");
      expect(symbols[1].position.row).toEqual(1);
      expect(symbols[1].tag).toBe("function");
    });

    it("trims the long ctags kind from generated tag lines", () => {
      const symbol = provider.parseTagLine('work\tsample.js\t3;"\tmethod\r');
      expect(symbol.name).toBe("work");
      expect(symbol.position.row).toBe(2);
      expect(symbol.tag).toBe("method");
    });
  });

  describe("when the buffer is new and unsaved", () => {
    beforeEach(async () => {
      await lumine.workspace.open();
      editor = getEditor();
    });

    it("does not try to provide symbols", () => {
      let meta = { type: "file", editor };
      expect(provider.canProvideSymbols(meta)).toBe(0);
    });
  });

  describe("when the buffer is modified", () => {
    beforeEach(async () => {
      await lumine.workspace.open(directory.resolve("sample.js"));
      editor = getEditor();
    });

    it("returns a lower match score", () => {
      editor.insertText("\n");
      let meta = { type: "file", editor };
      expect(provider.canProvideSymbols(meta)).toBe(0.89);
    });
  });

  describe("when no tags can be generated for a file", () => {
    beforeEach(async () => {
      await lumine.workspace.open(directory.resolve("no-symbols.js"));
      editor = getEditor();
    });

    it("returns an empty array", async () => {
      let symbols = await provider.getSymbols({ type: "file", editor });
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBe(0);
    });
  });

  describe("go to declaration", () => {
    it("returns nothing when no declaration is found", async () => {
      await lumine.workspace.open(directory.resolve("tagged.js"));
      editor = getEditor();
      editor.setCursorBufferPosition([0, 2]);

      let symbols = await provider.getSymbols({
        type: "project-find",
        editor,
        paths: lumine.project.getPaths(),
        word: editor.getWordUnderCursor(),
      });

      expect(symbols.length).toBe(0);
    });

    it("returns one result when there is a single matching declaration", async () => {
      await lumine.workspace.open(directory.resolve("tagged.js"));
      editor = getEditor();

      editor.setCursorBufferPosition([6, 24]);
      let symbols = await provider.getSymbols({
        type: "project-find",
        editor,
        paths: lumine.project.getPaths(),
        word: editor.getWordUnderCursor(),
      });

      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([2, 0]);
    });

    it("correctly identifies the tag for a C preprocessor macro", async () => {
      lumine.project.setPaths([temp.mkdirSync("symbol-ctags-spec-c-")]);
      fs.copySync(path.join(__dirname, "fixtures", "c"), lumine.project.getPaths()[0]);

      await lumine.packages.activatePackage("language-c");
      await lumine.workspace.open("sample.c");

      editor = getEditor();
      editor.setCursorBufferPosition([4, 4]);

      let symbols = await findDeclarationInProject(provider, editor);

      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([0, 0]);
    });

    it("ignores results that reference nonexistent files", async () => {
      await lumine.workspace.open(directory.resolve("tagged.js"));
      editor = getEditor();
      editor.setCursorBufferPosition([8, 14]);

      let symbols = await findDeclarationInProject(provider, editor);

      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([8, 0]);
    });

    it("includes ? and ! characters in ruby symbols", async () => {
      lumine.project.setPaths([temp.mkdirSync("symbol-ctags-spec-ruby-")]);
      fs.copySync(path.join(__dirname, "fixtures", "ruby"), lumine.project.getPaths()[0]);

      await lumine.packages.activatePackage(
        path.dirname(require.resolve("language-ruby/package.json")),
      );
      await lumine.workspace.open("file1.rb");
      let symbols;

      editor = getEditor();

      editor.setCursorBufferPosition([18, 4]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([7, 0]);

      editor.setCursorBufferPosition([19, 2]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([11, 0]);

      editor.setCursorBufferPosition([20, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([3, 0]);

      editor.setCursorBufferPosition([21, 7]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([3, 0]);
    });

    it("understands assignment ruby method definitions", async () => {
      lumine.project.setPaths([temp.mkdirSync("symbol-ctags-spec-ruby-")]);
      fs.copySync(path.join(__dirname, "fixtures", "ruby"), lumine.project.getPaths()[0]);

      await lumine.packages.activatePackage(
        path.dirname(require.resolve("language-ruby/package.json")),
      );
      await lumine.workspace.open("file1.rb");
      let symbols;

      editor = getEditor();

      editor.setCursorBufferPosition([22, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([14, 0]);

      editor.setCursorBufferPosition([23, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(2);
      expect(symbols[0].position).toEqual([14, 0]);

      editor.setCursorBufferPosition([24, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([0, 0]);

      editor.setCursorBufferPosition([25, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([11, 0]);
    });

    it("understands fully qualified ruby constant definitions", async () => {
      lumine.project.setPaths([temp.mkdirSync("symbol-ctags-spec-ruby-")]);
      fs.copySync(path.join(__dirname, "fixtures", "ruby"), lumine.project.getPaths()[0]);

      await lumine.packages.activatePackage(
        path.dirname(require.resolve("language-ruby/package.json")),
      );
      await lumine.workspace.open("file1.rb");
      let symbols;

      editor = getEditor();

      editor.setCursorBufferPosition([26, 10]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(2);
      expect(symbols[0].position).toEqual([1, 0]);

      editor.setCursorBufferPosition([27, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([0, 0]);

      editor.setCursorBufferPosition([28, 5]);
      symbols = await findDeclarationInProject(provider, editor);
      expect(symbols.length).toBe(2);
      expect(symbols[0].position).toEqual([31, 0]);
    });
  });

  describe("project symbols", () => {
    it("displays all tags", async () => {
      await lumine.workspace.open(directory.resolve("tagged.js"));
      editor = getEditor();

      let symbols = await getProjectSymbols(provider, editor);

      expect(symbols.length).toBe(4);

      expect(symbols[0].name).toBe("callMeMaybe");
      expect(symbols[0].directory).toBe(directory.getPath());
      expect(symbols[0].file).toBe("tagged.js");

      expect(symbols[3].name).toBe("thisIsCrazy");
      expect(symbols[3].directory).toBe(directory.getPath());
      expect(symbols[3].file).toBe("tagged.js");

      fs.removeSync(directory.resolve("tags"));
      await wait(50);

      symbols = await getProjectSymbols(provider, editor);
      expect(symbols.length).toBe(0);
    });
  });
});
