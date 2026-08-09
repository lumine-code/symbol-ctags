let CtagsProvider = null;

module.exports = {
  activate() {
    this.provider = {
      packageName: "symbol-ctags",
      name: "ctags",
      isExclusive: true,
      canProvideSymbols: (meta) => this.getProvider().canProvideSymbols(meta),
      getSymbols: (meta) => this.getProvider().getSymbols(meta),
    };
  },

  deactivate() {
    this.ctagsProvider?.destroy?.();
    this.ctagsProvider = null;
    this.provider = null;
  },

  provideSymbol() {
    return this.provider;
  },

  getProvider() {
    if (this.ctagsProvider == null) {
      if (CtagsProvider == null) CtagsProvider = require("./ctags-provider");
      this.ctagsProvider = new CtagsProvider();
    }
    return this.ctagsProvider;
  },
};
