/**
 * Minimal VS Code API mock for Jest unit tests.
 * Only stubs out what the parser/utils actually import.
 */
export const workspace = {
  getConfiguration: () => ({
    get: (_key: string) => undefined,
  }),
};

export const window = {
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  })),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
  joinPath: (...parts: { fsPath?: string; path?: string }[]) => ({ fsPath: parts.map((p) => p.fsPath ?? '').join('/') }),
};
