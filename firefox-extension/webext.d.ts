/**
 * 补充 Firefox WebExtension API 缺失的类型定义
 */
declare namespace browser.tabs {
    interface GroupOptions {
        tabIds: number | number[];
        groupId?: number;
    }

    /**
     * 将标签页分组。
     * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/group
     */
    function group(options: GroupOptions): Promise<number>;

    /**
     * 取消标签页分组。
     * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/ungroup
     */
    function ungroup(tabIds: number | number[]): Promise<void>;
}

declare namespace browser.tabGroups {
    interface UpdateUpdateInfo {
        collapsed?: boolean;
        color?: string;
        title?: string;
    }

    interface TabGroup {
        id: number;
        collapsed: boolean;
        color: string;
        title?: string;
        windowId: number;
    }

    /**
     * 更新标签组属性。
     * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups/update
     */
    function update(groupId: number, updateProperties: UpdateUpdateInfo): Promise<TabGroup>;

    /**
     * 查询标签组。
     * @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups/query
     */
    function query(queryInfo: object): Promise<TabGroup[]>;
}
