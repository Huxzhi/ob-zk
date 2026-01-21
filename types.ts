import { TFile } from 'obsidian'

export const VIEW_TYPE_ZETTELKASTEN = 'zettelkasten-navigator-view'

// ID format constants if needed later, or just keep them in utils/view logic
// For now, these are the shared types.

export type ZettelLinkType = 'mutual' | 'backlink' | 'outgoing'

export interface ZettelNode {
    file: TFile // 允许为 null，表示占位节点
    id: string // 自动编号ID
    mutuals: ZettelNode[] // 双向引用
    backlinks: ZettelNode[] // 反向引用
    outgoings: ZettelNode[] // 正向引用 (不递归)
    linkType?: ZettelLinkType
    level: number
    taskStatus: 'none' | 'incomplete' | 'complete' | 'mixed' // 任务状态
}

export interface ZettelkastenSettings {
    collapsedIds: string[]
    rootFile: string
    sortBy: string
    sortField: string
    sortOrder: 'asc' | 'desc'
}
