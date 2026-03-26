/** Command IDs — must match package.json contributes.commands */
export const Commands = {
  OPEN_FILE: 'sflog.openFile',
  OPEN_ACTIVE_EDITOR: 'sflog.openActiveEditor',
  EXPORT_SUMMARY: 'sflog.exportSummary',
  TOGGLE_OUTLINE: 'sflog.toggleOutline',
  CLEAR_PANEL: 'sflog.clearPanel',
  COPY_EVENT_DETAIL: 'sflog.copyEventDetail',
} as const;

/** VS Code context keys used for when-clause conditions */
export const ContextKeys = {
  PANEL_ACTIVE: 'sflog.panelActive',
  HAS_ERRORS: 'sflog.hasErrors',
  LOG_LOADED: 'sflog.logLoaded',
} as const;

/** View IDs — must match package.json contributes.views */
export const ViewIds = {
  OUTLINE: 'sflog.outline',
} as const;

/** Extension-wide constants */
export const MAX_FILE_SIZE_BYTES_DEFAULT = 50 * 1024 * 1024; // 50 MB
export const EXTENSION_ID = 'sflog';
export const OUTPUT_CHANNEL_NAME = 'Salesforce Log Viewer';
export const LANGUAGE_ID = 'apexdebuglog';
