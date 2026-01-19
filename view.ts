import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import type ZettelkastenPlugin from './main'
import { NoteInputModal } from './modal'
import { getLetterSequenceFromIndex } from './utils'

export const VIEW_TYPE_ZETTELKASTEN = 'zettelkasten-navigator-view'

export interface ZettelNode {
  file: TFile // 允许为 null，表示占位节点
  id: string // 自动编号ID
  children: ZettelNode[] // 子节点
  level: number
}

export class ZettelkastenView extends ItemView {
  plugin: ZettelkastenPlugin
  recentFiles: string[] = [] // 存储最近打开的3个文件路径
  collapsedIds: Set<string> // 存储折叠的条目ID
  private zettelCache: ZettelNode[] | null = null // 缓存显示条目
  private activeItemPath: string | null = null // 当前激活的条目路径
  private refreshTimeout: NodeJS.Timeout | null = null // 防抖定时器
  private lastRefreshTime: number = 0 // 最后刷新时间戳
  private isRefreshing: boolean = false // 是否正在刷新

  constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenPlugin) {
    super(leaf)
    this.plugin = plugin
    // 从设置中加载折叠状态
    this.collapsedIds = new Set(this.plugin.settings.collapsedIds || [])
  }

  getViewType(): string {
    return VIEW_TYPE_ZETTELKASTEN
  }

  getDisplayText(): string {
    return '卢曼笔记导航'
  }

  getIcon(): string {
    return 'list-tree'
  }

  async onOpen() {
    this.contentEl = this.containerEl.children[1] as HTMLElement
    this.contentEl.empty()
    this.contentEl.addClass('zettelkasten-view')

    // 添加刷新按钮和计数显示
    const headerEl = this.contentEl.createDiv({ cls: 'zk-header' })

    // 右边控制区域
    const controlsEl = headerEl.createDiv({ cls: 'zk-controls' })

    // 笔记计数显示
    const countEl = controlsEl.createDiv({ cls: 'zk-count' })
    countEl.textContent = '笔记: 0'

    // 全部展开/折叠按钮
    const toggleBtn = controlsEl.createEl('button', {
      text: '展开全部',
      cls: 'zk-toggle-btn',
      attr: { 'aria-label': '展开/折叠全部条目' },
    })
    toggleBtn.onclick = () => {
      this.toggleAllCollapse()
    }

    // 创建笔记列表容器
    const listContainer = this.contentEl.createDiv({ cls: 'zk-list-container' })

    // 初始渲染
    await this.refresh()

    // 监听文件变化 - 只在笔记变化时刷新
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.refresh()
        }
      }),
    )
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.refresh()
        }
      }),
    )
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        // 检查新旧文件名是否有一个是 md 文件
        if (file instanceof TFile && file.extension === 'md') {
          this.refresh()
        }
      }),
    )

    // 监听文件打开事件 - 只更新高亮样式，不刷新列表
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) {
          this.activeItemPath = file.path
          this.updateHighlight()
        }
      }),
    )
  }

  async refresh() {
    // 防抖：避免频繁刷新
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
    }

    // 如果正在刷新，跳过
    if (this.isRefreshing) {
      return
    }

    this.refreshTimeout = setTimeout(async () => {
      await this.performRefresh()
    }, 100) // 100ms 防抖
  }

  private async performRefresh() {
    if (this.isRefreshing) return

    this.isRefreshing = true
    const startTime = Date.now()

    try {
      const listContainer = this.contentEl.querySelector('.zk-list-container')
      if (!listContainer) return

      listContainer.empty()

      // 清除缓存并重新构建
      this.zettelCache = null

      // 更新笔记计数
      const countEl = this.contentEl.querySelector('.zk-count')
      if (countEl) {
        countEl.textContent = `笔记: ${this.getAllZettels().length}`
      }

      // 渲染列表（将嵌套结构展开）
      this.renderZettelList(listContainer as HTMLElement, this.getAllZettels())

      // 性能监控
      const endTime = Date.now()
      const duration = endTime - startTime
      console.log(`ZK view refresh completed in ${duration}ms`)

      // 如果刷新时间过长，显示警告
      if (duration > 1000) {
        console.warn(`ZK view refresh took ${duration}ms - consider optimizing`)
      }
    } catch (error) {
      console.error('ZK view refresh failed:', error)
    } finally {
      // 重置刷新状态
      this.isRefreshing = false
      // 更新按钮文本
      this.updateToggleButtonText()
    }
  }

  renderZettelList(container: HTMLElement, zettels: ZettelNode[]) {
    const ul = container.createEl('ul', { cls: 'zk-list' })

    for (let i = 0; i < zettels.length; i++) {
      const zettel = zettels[i]
      const zettelId = zettel.id
      const level = zettel.level

      // 检查是否应该隐藏（父节点被折叠）
      let shouldHide = false
      if (level > 0) {
        // 检查所有可能的父节点是否被折叠
        for (const collapsedId of this.collapsedIds) {
          if (
            zettelId.startsWith(collapsedId) &&
            zettelId.length > collapsedId.length &&
            zettelId !== collapsedId
          ) {
            shouldHide = true
            break
          }
        }
      }

      if (shouldHide) {
        continue // 跳过被折叠的条目
      }

      const li = ul.createEl('li', { cls: 'zk-item' })
      // 存储文件路径以便后续更新高亮
      li.setAttribute('data-file-path', zettel.file.path)

      // 如果是当前激活的条目，添加高亮样式
      if (this.activeItemPath && zettel.file?.path === this.activeItemPath) {
        li.addClass('zk-item-active')
      }
      // 如果是最近打开的文件，添加最近文件样式
      if (this.recentFiles.includes(zettel.file.path)) {
        li.addClass('zk-item-recent')
      }

      // 根据层级设置缩进
      li.style.paddingLeft = `${level * 10}px`

      // 创建项目容器
      const itemContent = li.createDiv({ cls: 'zk-item-content' })

      const hasChildren = zettel.children && zettel.children.length > 0

      if (hasChildren) {
        // 添加折叠/展开按钮
        const isCollapsed = this.collapsedIds.has(zettelId)
        const toggleBtn = itemContent.createDiv({
          cls: isCollapsed
            ? 'zk-collapse-icon is-collapsed'
            : 'zk-collapse-icon',
        })

        // 添加SVG图标
        toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle"><path d="M3 8L12 17L21 8"></path></svg>`

        toggleBtn.onclick = (e) => {
          e.stopPropagation()
          if (this.collapsedIds.has(zettelId)) {
            this.collapsedIds.delete(zettelId)
          } else {
            this.collapsedIds.add(zettelId)
          }
          this.saveCollapsedState()
          this.refresh()
        }
      }

      // 显示ID
      const idSpan = itemContent.createSpan({
        cls: 'zk-id',
        text: zettel.id,
      })

      // 显示标题（直接使用basename，如果有-则去掉前缀）
      const basename = zettel.file.basename

      const titleSpan = itemContent.createSpan({
        cls: 'zk-title',
        text: basename,
      })

      // 点击打开文件
      itemContent.onclick = async (e) => {
        e.preventDefault()

        // 如果该条目被折叠，先展开它
        if (this.collapsedIds.has(zettelId)) {
          this.collapsedIds.delete(zettelId)
          this.saveCollapsedState()
          await this.refresh()
          return
        }

        // 立即设置高亮
        this.setActiveItem(li)
        this.activeItemPath = zettel.file.path

        // 立即保存到最近文件列表
        this.updateRecentFiles(zettel.file.path)

        // 更新所有高亮样式
        this.updateHighlight()

        // 获取最近使用的主编辑区leaf，而不是当前侧边栏的leaf
        const leaf = this.app.workspace.getMostRecentLeaf()
        if (leaf) {
          await leaf.openFile(zettel.file)
          // 文件打开后不需要刷新，file-open事件会自动更新高亮
        }
      }

      // 右键菜单
      itemContent.oncontextmenu = (e) => {
        e.preventDefault()
        this.showContextMenu(e, zettel.file)
      }

      // 拖放功能：设置为可拖动
      li.setAttribute('draggable', 'true')

      // dragstart: 开始拖动时，记录被拖动的文件路径和双链格式
      li.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'copyMove'

          // 生成双链文本 [[文件名]] - 去掉.md扩展名
          const fileName = zettel.file.basename.replace(/\.md$/, '')
          const wikiLink = `[[${fileName}]]`

          // 设置文本格式（拖到编辑器时使用）
          e.dataTransfer.setData('text/plain', wikiLink)

          // 设置Obsidian内部格式（拖到列表中重排序时使用）
          e.dataTransfer.setData(
            'application/x-obsidian-file-path',
            zettel.file.path,
          )

          li.addClass('zk-item-dragging')
        }
      })

      li.addEventListener('dragend', (e) => {
        li.removeClass('zk-item-dragging')
      })

      // 添加操作按钮
      const actions = li.createDiv({ cls: 'zk-actions' })

      // 添加子笔记按钮
      const addBtn = actions.createEl('button', {
        text: '➕',
        cls: 'zk-action-btn',
        attr: {
          'aria-label': '添加子笔记',
          title: '添加子笔记',
        },
      })
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        await this.createChildNote(zettel)
      }

      // 重命名按钮
      const renameBtn = actions.createEl('button', {
        text: '✏️',
        cls: 'zk-action-btn',
        attr: {
          'aria-label': '重命名',
          title: '重命名笔记',
        },
      })
      renameBtn.onclick = (e) => {
        e.stopPropagation()
        this.renameNote(zettel.file)
      }
    }
  }

  showContextMenu(e: MouseEvent, file: TFile) {
    const menu = new Menu()

    menu.addItem((item) =>
      item
        .setTitle('打开')
        .setIcon('file')
        .onClick(async () => {
          const leaf = this.app.workspace.getMostRecentLeaf()
          if (leaf) {
            await leaf.openFile(file)
          }
        }),
    )

    menu.addItem((item) =>
      item
        .setTitle('在新标签页打开')
        .setIcon('file-plus')
        .onClick(async () => {
          const leaf = this.app.workspace.getLeaf('tab')
          await leaf.openFile(file)
        }),
    )

    menu.addSeparator()

    menu.addItem((item) =>
      item
        .setTitle('重命名')
        .setIcon('pencil')
        .onClick(() => {
          this.renameNote(file)
        }),
    )

    menu.addItem((item) =>
      item
        .setTitle('删除')
        .setIcon('trash')
        .onClick(async () => {
          await this.app.vault.delete(file)
        }),
    )

    menu.showAtMouseEvent(e)
  }

  toggleAllCollapse() {
    const allZettels = this.getAllZettels()
    const hasCollapsedItems = this.collapsedIds.size > 0

    if (hasCollapsedItems) {
      // 如果有折叠的项目，则全部展开
      this.collapsedIds.clear()
    } else {
      // 如果全部展开，则全部折叠（除了根级别的项目）
      for (const zettel of allZettels) {
        if (zettel.level > 0 && zettel.children && zettel.children.length > 0) {
          this.collapsedIds.add(zettel.id)
        }
      }
    }

    // 保存折叠状态
    this.saveCollapsedState()

    // 刷新视图
    this.refresh()

    // 更新按钮文本
    this.updateToggleButtonText()
  }

  updateToggleButtonText() {
    const toggleBtn = this.contentEl.querySelector(
      '.zk-toggle-btn',
    ) as HTMLButtonElement
    if (toggleBtn) {
      const hasCollapsedItems = this.collapsedIds.size > 0
      toggleBtn.textContent = hasCollapsedItems ? '展开全部' : '折叠全部'
    }
  }

  async createChildNote(parent: ZettelNode) {
    const modal = new NoteInputModal(
      this.app,
      '',
      '新建子笔记',
      async (newName) => {
        if (!newName.trim()) {
          new Notice('文件名不能为空')
          return
        }

        try {
          // 获取父条目的目录路径
          const parentPath = parent.file.path
          const parentDir = parentPath.substring(0, parentPath.lastIndexOf('/'))
          const newFilePath = parentDir
            ? `${parentDir}/${newName}.md`
            : `${newName}.md`

          // 在子条目文件中添加父条目的引用
          const parentLink = `[[${parent.file.basename}]]`
          const initialContent = `${parentLink}\n\n`

          // 创建新文件在父条目相同的目录中
          const newFile = await this.app.vault.create(
            newFilePath,
            initialContent,
          )

          // 在父文件中添加引用到新文件
          const parentContent = await this.app.vault.read(parent.file)
          const childLink = `[[${newName}]]`
          const newParentContent = parentContent + '\n' + childLink
          await this.app.vault.modify(parent.file, newParentContent)

          // 打开新文件
          const leaf = this.app.workspace.getMostRecentLeaf()
          if (leaf) {
            await leaf.openFile(newFile)
          }

          // 刷新视图
          await this.refresh()
        } catch (error) {
          console.error('创建子笔记失败:', error)
          new Notice('创建子笔记失败')
        }
      },
    )

    modal.open()
  }

  async renameNote(file: TFile) {
    const currentName = file.basename

    // 提示用户输入新的文件名
    const modal = new NoteInputModal(
      this.app,
      currentName,
      `重命名笔记: ${currentName}`,
      async (newName: string) => {
        if (newName && newName !== currentName) {
          try {
            const newPath = file.path.replace(file.name, `${newName}.md`)
            // 自动链接更新
            await this.app.fileManager.renameFile(file, newPath)
            await this.refresh()
          } catch (error) {
            console.error('重命名失败:', error)
          }
        }
      },
    )
    modal.open()
  }

  /**
   * 立即设置指定条目的活跃高亮
   */
  private setActiveItem(activeLi: HTMLElement) {
    const listContainer = this.contentEl.querySelector('.zk-list-container')
    if (!listContainer) return

    const allItems = listContainer.querySelectorAll('.zk-item')

    allItems.forEach((item) => {
      const li = item as HTMLElement
      // 移除活跃高亮，但保留最近文件高亮
      li.removeClass('zk-item-active')
    })

    // 给指定条目添加活跃高亮
    activeLi.addClass('zk-item-active')
  }

  /**
   * 更新列表项的高亮状态（不刷新整个列表）
   */
  private updateHighlight() {
    const listContainer = this.contentEl.querySelector('.zk-list-container')
    if (!listContainer) return

    const allItems = listContainer.querySelectorAll('.zk-item')

    allItems.forEach((item) => {
      const li = item as HTMLElement
      const filePath = li.getAttribute('data-file-path')

      // 移除所有高亮样式
      li.removeClass('zk-item-active')
      li.removeClass('zk-item-recent')

      // 添加对应的高亮样式
      if (this.activeItemPath && filePath === this.activeItemPath) {
        li.addClass('zk-item-active')
      }
      if (filePath && this.recentFiles.includes(filePath)) {
        li.addClass('zk-item-recent')
      }
    })
  }

  saveCollapsedState() {
    this.plugin.settings.collapsedIds = Array.from(this.collapsedIds)
    this.plugin.saveSettings()
  }

  /**
   */
  private getAllZettels(): Array<ZettelNode> {
    if (!this.zettelCache) {
      let zettelFiles = this.app.vault.getMarkdownFiles()

      // 根据设置进行排序
      zettelFiles = this.sortFiles(zettelFiles)

      // 找到根文件
      let rootFile: TFile | null = null
      if (this.plugin.settings.rootFile) {
        rootFile =
          zettelFiles.find(
            (f) => f.basename === this.plugin.settings.rootFile,
          ) || null
      }
      if (!rootFile && zettelFiles.length > 0) {
        // 如果没有指定根文件，使用排序后的第一个文件作为根
        rootFile = zettelFiles[0]
      }

      if (!rootFile) {
        this.zettelCache = []
        return this.zettelCache
      }

      // 构建正向引用映射：file -> 引用的文件列表
      const forwardLinks = new Map<TFile, TFile[]>()
      for (const file of zettelFiles) {
        const links = this.app.metadataCache.getFileCache(file)?.links || []
        const referencedFiles: TFile[] = []
        for (const link of links) {
          const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
            link.link,
            file.path,
          )
          if (
            linkedFile &&
            linkedFile instanceof TFile &&
            linkedFile.extension === 'md'
          ) {
            referencedFiles.push(linkedFile)
          }
        }
        forwardLinks.set(file, referencedFiles)
      }

      // 获取反向链接的辅助函数
      const getBacklinks = (file: TFile): Record<string, number> => {
        const backlinks: Record<string, number> = {}
        const resolvedLinks = this.app.metadataCache.resolvedLinks

        for (const sourcePath in resolvedLinks) {
          const links = resolvedLinks[sourcePath]
          if (links[file.path]) {
            backlinks[sourcePath] = links[file.path]
          }
        }

        return backlinks
      }

      // 构建树
      const buildTree = (
        file: TFile,
        level: number,
        currentId: string, // 完整的节点ID
        useLetters: boolean, // 当前层级是否使用字母
        ancestors: Set<TFile> = new Set(), // 当前分支的祖先节点
      ): ZettelNode => {
        // 检查是否与当前分支的祖先节点重合，避免循环引用
        if (ancestors.has(file)) {
          // 避免循环引用，返回一个占位节点
          return {
            file,
            id: `${currentId}${useLetters ? 'a' : '1'}`,
            children: [],
            level,
          }
        }

        // 创建新的祖先集合，包含当前文件
        const newAncestors = new Set(ancestors)
        newAncestors.add(file)

        // 注意：currentId 现在作为参数传入，不再在这里生成

        // 使用反向链接获取子节点
        const backlinks = getBacklinks(file)

        // 分别收集双向引用和单向引用
        const mutualChildren: TFile[] = [] // 双向引用文件（放在前面）
        const singleChildren: TFile[] = [] // 单向引用文件

        for (const path in backlinks) {
          const backlinkFile = this.app.vault.getAbstractFileByPath(path)
          if (
            backlinkFile instanceof TFile &&
            backlinkFile.extension === 'md' &&
            !newAncestors.has(backlinkFile) // 过滤掉已在祖先中的文件
          ) {
            // 检查是否为双向引用
            const isMutual = getBacklinks(backlinkFile)[file.path] !== undefined

            if (isMutual) {
              mutualChildren.push(backlinkFile)
            } else {
              singleChildren.push(backlinkFile)
            }
          }
        }

        // 合并子节点：双向引用在前，单向引用在后
        const children: ZettelNode[] = []

        // 为双向引用分配ID并构建节点（小数点 + 字母编号）
        mutualChildren.forEach((backlinkFile, index) => {
          const suffix = useLetters
            ? (index + 1).toString() // 1, 2, 3, ...
            : getLetterSequenceFromIndex(index)
          const childId = `${currentId}.${suffix}`
          // 根据当前ID末尾决定子节点是否使用字母
          const nextUseLetters = /\d$/.test(childId) // 如果以数字结尾，下一个用字母
          const childNode = buildTree(
            backlinkFile,
            level + 1,
            childId,
            nextUseLetters,
            newAncestors,
          )
          children.push(childNode)
        })

        // 为单向引用分配ID并构建节点（字母数字交替）
        singleChildren.forEach((backlinkFile, index) => {
          const suffix = useLetters
            ? getLetterSequenceFromIndex(index)
            : (index + 1).toString() // 1, 2, 3, ...
          const childId = `${currentId}${suffix}`
          // 根据当前ID末尾决定子节点是否使用字母
          const nextUseLetters = /\d$/.test(childId) // 如果以数字结尾，下一个用字母
          const childNode = buildTree(
            backlinkFile,
            level + 1,
            childId,
            nextUseLetters,
            newAncestors,
          )
          children.push(childNode)
        })

        return {
          file,
          id: currentId,
          children,
          level,
        }
      }

      const rootNode = buildTree(rootFile, 0, '', true, new Set()) // 根节点不显示，第一层使用字母

      // 展平树为列表，用于渲染
      const flattenTree = (node: ZettelNode): ZettelNode[] => {
        const result = [node]
        for (const child of node.children) {
          result.push(...flattenTree(child))
        }
        return result
      }

      // 不展示根节点，直接展示并展平其子节点，调整level让第一层从0开始
      this.zettelCache = []
      for (const child of rootNode.children) {
        const flattened = flattenTree(child)
        // 调整level，让第一层从0开始显示
        flattened.forEach((node: ZettelNode) => (node.level -= 1))
        this.zettelCache.push(...flattened)
      }
    }
    return this.zettelCache
  }

  private sortFiles(files: TFile[]): TFile[] {
    const { sortBy, sortField, sortOrder } = this.plugin.settings

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
            this.app.metadataCache.getFileCache(a)?.frontmatter
          const frontmatterB =
            this.app.metadataCache.getFileCache(b)?.frontmatter

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

  updateRecentFiles(filePath: string) {
    // 移除当前文件（如果已存在）
    this.recentFiles = this.recentFiles.filter((path) => path !== filePath)

    // 将当前文件添加到开头
    this.recentFiles.unshift(filePath)

    // 只保留最近的5个文件
    if (this.recentFiles.length > 5) {
      this.recentFiles = this.recentFiles.slice(0, 5)
    }
  }

  async onClose() {
    // 清理工作
  }
}
