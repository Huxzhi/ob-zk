import { App, TFile } from 'obsidian'
import { ZettelkastenSettings } from './types'

export function sortFiles(app: App, files: TFile[], settings: ZettelkastenSettings): TFile[] {
    const { sortBy, sortField, sortOrder } = settings

    return files.sort((a, b) => {
        let valueA: any
        let valueB: any

        switch (sortBy) {
            case 'filename':
                valueA = a.basename.toLowerCase()
                valueB = b.basename.toLowerCase()
                break

            case 'created':
                valueA = a.stat.ctime
                valueB = b.stat.ctime
                break

            case 'modified':
                valueA = a.stat.mtime
                valueB = b.stat.mtime
                break

            case 'yaml':
                const frontmatterA =
                    app.metadataCache.getFileCache(a)?.frontmatter
                const frontmatterB =
                    app.metadataCache.getFileCache(b)?.frontmatter

                valueA = frontmatterA?.[sortField] || ''
                valueB = frontmatterB?.[sortField] || ''

                // 如果是字符串，转为小写进行比较
                if (typeof valueA === 'string') valueA = valueA.toLowerCase()
                if (typeof valueB === 'string') valueB = valueB.toLowerCase()
                break

            default:
                valueA = a.basename.toLowerCase()
                valueB = b.basename.toLowerCase()
        }

        // 比较值
        let result = 0
        if (valueA < valueB) result = -1
        else if (valueA > valueB) result = 1

        // 根据排序顺序调整
        return sortOrder === 'desc' ? -result : result
    })
}
