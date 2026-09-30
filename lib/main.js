let CtagsProvider = null;

module.exports = {
  consumeIPythonSource(service) {
    const { Disposable } = require("lumine");
    const registration = { service };
    this.ipythonSourceRegistration = registration;
    return new Disposable(() => {
      if (this.ipythonSourceRegistration === registration) this.ipythonSourceRegistration = null;
    });
  },
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
    this.ipythonSourceRegistration = null;
  },

  provideSymbol() {
    return this.provider;
  },

  getProvider() {
    if (this.ctagsProvider == null) {
      if (CtagsProvider == null) CtagsProvider = require("./ctags-provider");
      this.ctagsProvider = new CtagsProvider(() => this.ipythonSourceRegistration?.service);
    }
    return this.ctagsProvider;
  },
};
