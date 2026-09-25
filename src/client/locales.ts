/** `settings.skin` 命名空间的文案（皮肤设置行的所有可见字符串）。 */

/** 简体中文（键集的真相源）。 */
export const zh = {
  'skin.title': '皮肤',
  'skin.deepseek': 'DeepSeek',
  'skin.codex': 'Codex',
  'skin.claudeCode': 'Claude Code',
  'skin.assetsDirLabel': '图片素材目录',
  'skin.assetsDirPlaceholder': '留空 = 使用默认目录',
  'skin.assetsDirReset': '用默认',
  'skin.assetsDirNow': '当前读取：',
  'skin.assetsDirIsDefault': '（默认）',
  'skin.assetsMissing': '该目录里没有：',
  'skin.assetsError': '读不到素材清单，标记已退回内置矢量版。',
  'skin.assetsHint': '把 deepseek-mascot.png / codex-icon.png / claude-icon.png 放进该目录即可显示位图；缺哪张，哪张卡就用内置矢量标记。',
} satisfies Record<string, string>

/** 该命名空间的键联合。 */
export type SkinKey = keyof typeof zh

/** 英文词典，按 zh 的键集校验完整性。 */
export const en = {
  'skin.title': 'Skin',
  'skin.deepseek': 'DeepSeek',
  'skin.codex': 'Codex',
  'skin.claudeCode': 'Claude Code',
  'skin.assetsDirLabel': 'Image assets directory',
  'skin.assetsDirPlaceholder': 'Leave empty for the default directory',
  'skin.assetsDirReset': 'Use default',
  'skin.assetsDirNow': 'Reading from: ',
  'skin.assetsDirIsDefault': ' (default)',
  'skin.assetsMissing': 'Not found in that directory: ',
  'skin.assetsError': 'Could not read the assets manifest; marks fall back to the built-in vector art.',
  'skin.assetsHint': 'Drop deepseek-mascot.png / codex-icon.png / claude-icon.png in that directory to show the bitmaps; a missing file falls back to the built-in vector mark.',
} satisfies Record<SkinKey, string>
