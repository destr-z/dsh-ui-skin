/**
 * 皮肤偏好的常量与形状（宿主半边与浏览器半边共用）。
 *
 * 记号：皮肤 id 存在 **localStorage**（客户端表现偏好，且要跨标签页实时同步）；
 * 素材目录存在 **settings 的 `ui-skin` 命名空间**（宿主半边要读它来服务文件，
 * localStorage 宿主读不到）。
 */
/** 可选皮肤 id（DeepSeek 是产品默认）。 */
export declare const SKIN_IDS: readonly ["deepseek", "codex", "claude-code"];
/** 一个皮肤 id。 */
export type SkinId = typeof SKIN_IDS[number];
/**
 * 设置定位 id。**0.1.7 起设置按 profile 条目 id 定位**（不再有独立的命名空间名），
 * 所以这里必须与 `cordis.patch.yml` 里的行 id 完全一致。
 * ⚠️ 是 `external-ui-skin` 而不是 `ui-skin`：树内曾有同名条目，同 id 会让 loader
 * 报 `duplicate loader entry id` 并使整个界面起不来（实测踩过）。
 */
export declare const SKIN_ENTRY_ID = "external-ui-skin";
/** 旧版（0.1.5）的 settings 命名空间名；0.1.7 不再用于读写，仅用于识别历史 settings.yaml。 */
export declare const SKIN_SETTINGS_NAMESPACE = "dsh-ui-skin";
/** 设置里承载"素材目录"的字段名。 */
export declare const ASSETS_DIR_FIELD = "assetsDir";
/** 皮肤 id 字段名（树内形态用它写进设置；外部形态下皮肤走 localStorage，保留此常量供兼容）。 */
export declare const SKIN_FIELD = "skin";
/** 没有任何持久化时的默认皮肤。 */
export declare const DEFAULT_SKIN: SkinId;
/** 浏览器端持久化键。 */
export declare const SKIN_STORAGE_KEY = "dsh.dshUiSkin.skin";
/** 承载当前皮肤品牌面的 body 属性。 */
export declare const SKIN_ATTRIBUTE = "data-dsh-ui-skin";
/** 皮肤设置段的形状。 */
export interface SkinSettings {
    /** 选中的皮肤 id。 */
    skin: SkinId;
    /** 素材目录（绝对路径）；空 = 用默认目录。 */
    assetsDir?: string;
}
/**
 * 把一个值收窄成合法皮肤 id。
 * @param value - 跨存储边界的值。
 * @returns 是否是内置皮肤 id。
 */
export declare function isSkinId(value: unknown): value is SkinId;
