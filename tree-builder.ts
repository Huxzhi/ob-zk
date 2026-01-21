import { App, TFile, CachedMetadata } from 'obsidian'
import { ZettelkastenSettings, ZettelNode } from './types'
import { sortFiles } from './sorter'
import { getLetterSequenceFromIndex } from './utils'

export function buildZettelkastenTree(app: App, settings: ZettelkastenSettings): ZettelNode | null {
    let zettelFiles = app.vault.getMarkdownFiles()

    // 根据设置进行排序
    zettelFiles = sortFiles(app, zettelFiles, settings)

    // 找到根文件
    let rootFile: TFile | null = null
    if (settings.rootFile) {
        rootFile =
            zettelFiles.find(
                (f) => f.basename === settings.rootFile,
            ) || null
    }
    if (!rootFile && zettelFiles.length > 0) {
        rootFile = zettelFiles[0]
    }

    if (!rootFile) {
        return null
    }

    // Pre-calculate inverse resolved links for all files
    // Map: TargetPath -> SourcePaths[]
    const inverseResolvedLinks: Record<string, string[]> = {}
    const resolvedLinks = app.metadataCache.resolvedLinks

    for (const sourcePath in resolvedLinks) {
        const links = resolvedLinks[sourcePath]
        for (const targetPath in links) {
            if (!inverseResolvedLinks[targetPath]) {
                inverseResolvedLinks[targetPath] = []
            }
            inverseResolvedLinks[targetPath].push(sourcePath)
        }
    }

    // 构建树
    const buildTree = (
        file: TFile,
        level: number,
        currentId: string,
        ancestors: Set<TFile> = new Set(),
    ): ZettelNode => {
        const cache = app.metadataCache.getFileCache(file)
        const parentEndsWithDigit = /\d$/.test(currentId)
        if (ancestors.has(file)) {
            // Determine suffix for repeat node based on currentId tail
            // If ends in digit -> append 'a'. If ends in letter -> append '1'
            const endsWithDigit = /\d$/.test(currentId)
            const suffix = endsWithDigit ? 'a' : '1'

            return {
                file,
                id: `${currentId}${suffix}`,
                mutuals: [],
                backlinks: [],
                outgoings: [],
                level,
                taskStatus: 'none',
            }
        }

        const newAncestors = new Set(ancestors)
        newAncestors.add(file)

        // 1. Get raw Outgoing links (Using resolvedLinks directly)
        const outgoingPaths = Object.keys(resolvedLinks[file.path] || {})

        // 2. Get raw Backlinks (Using pre-calculated inverseResolvedLinks)
        const backlinkPaths = inverseResolvedLinks[file.path] || []

        // 3. Classify into Mutual, Backlink, Outgoing
        const mutualFiles: TFile[] = []
        const backlinkOnlyFiles: TFile[] = []
        const outgoingOnlyFiles: TFile[] = []

        const outgoingSet = new Set(outgoingPaths)
        const backlinkSet = new Set(backlinkPaths)

        // Check Backlinks: If also in Outgoing -> Mutual, else -> Backlink Only
        for (const path of backlinkPaths) {
            const f = app.vault.getAbstractFileByPath(path)
            if (f instanceof TFile && f.extension === 'md' && !newAncestors.has(f)) {
                if (outgoingSet.has(path)) {
                    mutualFiles.push(f)
                } else {
                    backlinkOnlyFiles.push(f)
                }
            }
        }

        // Check Outgoing: If not in Backlink -> Outgoing Only
        for (const path of outgoingPaths) {
            if (!backlinkSet.has(path)) {
                const f = app.vault.getAbstractFileByPath(path)
                if (f instanceof TFile && f.extension === 'md' && !newAncestors.has(f)) {
                    outgoingOnlyFiles.push(f)
                }
            }
        }

        const mutuals: ZettelNode[] = []
        const backlinks: ZettelNode[] = []
        const outgoings: ZettelNode[] = []

        // Sort children before processing
        const sortedMutualFiles = sortFiles(app, mutualFiles, settings)
        const sortedBacklinkFiles = sortFiles(app, backlinkOnlyFiles, settings)
        const sortedOutgoingFiles = sortFiles(app, outgoingOnlyFiles, settings)

        // Process Mutual Files (Use '.', keep digits)
        sortedMutualFiles.forEach((childFile, index) => {
            // If parent ends in digit, we switch to letters. If letter, switch to digits.
            const suffix = parentEndsWithDigit
                ? (index + 1).toString()
                : getLetterSequenceFromIndex(index)

            const childId = `${currentId}.${suffix}`

            const childNode = buildTree(
                childFile,
                level + 1,
                childId,
                newAncestors
            )
            childNode.linkType = 'mutual'
            mutuals.push(childNode)
        })

        // Process Backlink Files (Alternating logic based on parent ID)
        sortedBacklinkFiles.forEach((childFile, index) => {

            // If parent ends in digit, we switch to letters. If letter, switch to digits.
            const suffix = parentEndsWithDigit
                ? getLetterSequenceFromIndex(index)
                : (index + 1).toString()

            const childId = `${currentId}${suffix}`

            const childNode = buildTree(
                childFile,
                level + 1,
                childId,
                newAncestors
            )
            childNode.linkType = 'backlink'
            backlinks.push(childNode)
        })

        // Process Outgoing Files (Use '>', keep digits)
        // NOTE: NOT TRAVERSED (No recursion call to buildTree for children of outgoing)
        sortedOutgoingFiles.forEach((childFile, index) => {
            const suffix = parentEndsWithDigit
                ? (index + 1).toString()
                : getLetterSequenceFromIndex(index)
            const childId = `${currentId}>${suffix}`

            // Manually construct node without recursion
            // We do NOT add ancestors because we aren't recursing.
            const childNode: ZettelNode = {
                file: childFile,
                id: childId,
                mutuals: [],
                backlinks: [],
                outgoings: [],
                level: level + 1,
                linkType: 'outgoing',
                taskStatus: getTaskStatus(app.metadataCache.getFileCache(childFile))
            }
            outgoings.push(childNode)
        })

        return {
            file,
            id: currentId,
            mutuals,
            backlinks,
            outgoings,
            level,
            taskStatus: getTaskStatus(cache),
        }
    }

    const rootNode = buildTree(rootFile, 0, '', new Set())
    return rootNode
}

function getTaskStatus(
    cache: CachedMetadata | null,
): 'none' | 'incomplete' | 'complete' | 'mixed' {
    if (!cache?.listItems) return 'none'

    let hasIncomplete = false
    let hasComplete = false

    for (const item of cache.listItems) {
        if (item.task !== undefined) {
            if (item.task === ' ') {
                hasIncomplete = true
            } else {
                hasComplete = true
            }
        }
    }

    if (hasIncomplete && hasComplete) return 'mixed'
    if (hasIncomplete) return 'incomplete'
    if (hasComplete) return 'complete'
    return 'none'
}

/**
 * 获取指定文件的直接子节点（用于UI高亮等交互，无需构建完整树）
 * 不考虑递归循环，只返回其直接的一级连接关系
 */
export function getZettelChildren(app: App, file: TFile, settings: ZettelkastenSettings) {
    const resolvedLinks = app.metadataCache.resolvedLinks

    // 1. Get raw Outgoing links
    const outgoingPaths = Object.keys(resolvedLinks[file.path] || {})

    // 2. Get raw Backlinks (Iterate all to find who links to me - safe for single file lookup)
    const backlinkPaths: string[] = []
    for (const sourcePath in resolvedLinks) {
        if (resolvedLinks[sourcePath][file.path]) {
            backlinkPaths.push(sourcePath)
        }
    }

    // 3. Classify
    const mutualFiles: TFile[] = []
    const backlinkOnlyFiles: TFile[] = []
    const outgoingOnlyFiles: TFile[] = []

    const outgoingSet = new Set(outgoingPaths)
    const backlinkSet = new Set(backlinkPaths)

    // Check Backlinks: If also in Outgoing -> Mutual, else -> Backlink Only
    for (const path of backlinkPaths) {
        const f = app.vault.getAbstractFileByPath(path)
        if (f instanceof TFile && f.extension === 'md') {
            if (outgoingSet.has(path)) {
                mutualFiles.push(f)
            } else {
                backlinkOnlyFiles.push(f)
            }
        }
    }

    // Check Outgoing: If not in Backlink -> Outgoing Only
    for (const path of outgoingPaths) {
        if (!backlinkSet.has(path)) {
            const f = app.vault.getAbstractFileByPath(path)
            if (f instanceof TFile && f.extension === 'md') {
                outgoingOnlyFiles.push(f)
            }
        }
    }

    // Sort
    return {
        mutuals: sortFiles(app, mutualFiles, settings),
        backlinks: sortFiles(app, backlinkOnlyFiles, settings),
        outgoings: sortFiles(app, outgoingOnlyFiles, settings),
    }
}
