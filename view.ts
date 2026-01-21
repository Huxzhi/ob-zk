import {
  ItemView,
  Menu,
  Notice,
  TFile,
  WorkspaceLeaf,
} from 'obsidian'
import type ZettelkastenPlugin from './main'
import { NoteInputModal } from './modal'
import { VIEW_TYPE_ZETTELKASTEN, ZettelNode } from './types'
import { buildZettelkastenTree, getZettelChildren } from './tree-builder'

export class ZettelkastenView extends ItemView {
  plugin: ZettelkastenPlugin
  collapsedIds: Set<string> // 存储折叠的条目ID
  private zettelCache: ZettelNode[] | null = null // 缓存显示条目
  private activeItemPath: string | null = null // 当前激活的条目路径
  private activeItemIndex: number | null = null // 当前激活的条目在列表中的索引
  private refreshTimeout: NodeJS.Timeout | null = null // 防抖定时器
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

    // 监听各类元数据变化
    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        this.refresh()
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

      // 1. 构建树
      const rootNode = buildZettelkastenTree(this.app, this.plugin.settings)

      if (!rootNode) {
        const countEl = this.contentEl.querySelector('.zk-count')
        if (countEl) countEl.textContent = '笔记: 0'
        this.zettelCache = []
        return
      }

      // 2. 展平树以便渲染和缓存
      const flattenTree = (node: ZettelNode): ZettelNode[] => {
        const result = [node]
        // Flatten Order: Mutual -> Backlink -> Outgoing
        for (const child of node.mutuals) {
          result.push(...flattenTree(child))
        }
        for (const child of node.backlinks) {
          result.push(...flattenTree(child))
        }
        for (const child of node.outgoings) {
          result.push(...flattenTree(child))
        }
        return result
      }

      const flatList: ZettelNode[] = []
      // 不展示根节点，展平其子节点
      for (const child of rootNode.mutuals) {
        flatList.push(...flattenTree(child))
      }
      for (const child of rootNode.backlinks) {
        flatList.push(...flattenTree(child))
      }
      for (const child of rootNode.outgoings) {
        flatList.push(...flattenTree(child))
      }

      // 调整level
      flatList.forEach((node) => (node.level -= 1))

      this.zettelCache = flatList

      // 更新笔记计数
      const countEl = this.contentEl.querySelector('.zk-count')
      if (countEl) {
        countEl.textContent = `${rootNode.file.basename} · 笔记: ${flatList.length}`
      }

      // 3. 渲染
      this.renderZettelList(listContainer as HTMLElement, flatList)

      // 性能监控
      const endTime = Date.now()
      const duration = endTime - startTime
      console.log(`ZK view refresh completed in ${duration}ms`)

      if (duration > 1000) {
        console.warn(`ZK view refresh took ${duration}ms - consider optimizing`)
      }
    } catch (error) {
      console.error('ZK view refresh failed:', error)
    } finally {
      this.isRefreshing = false
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
      li.setAttribute('data-level', level.toString())

      // 如果是当前激活的条目，添加高亮样式
      if (this.activeItemPath && zettel.file?.path === this.activeItemPath) {
        li.addClass('zk-item-active')
      }

      // 根据连接类型添加样式
      if (zettel.linkType) {
        li.addClass(`zk-item-${zettel.linkType}`)
      }

      // 根据层级设置缩进
      li.style.paddingLeft = `${level * 10}px`

      // 创建项目容器
      const itemContent = li.createDiv({ cls: 'zk-item-content' })

      const hasChildren =
        (zettel.mutuals?.length > 0) ||
        (zettel.backlinks?.length > 0) ||
        (zettel.outgoings?.length > 0)

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
      // 显示任务状态图标
      if (zettel.taskStatus !== 'none') {
        const taskIcon = itemContent.createSpan({ cls: 'zk-task-icon' })
        switch (zettel.taskStatus) {
          case 'incomplete':
            taskIcon.innerHTML = '☐' // 未完成任务图标
            taskIcon.addClass('zk-task-incomplete')
            break
          case 'complete':
            taskIcon.innerHTML = '☑' // 已完成任务图标
            taskIcon.addClass('zk-task-complete')
            break
          case 'mixed':
            taskIcon.innerHTML = '☒' // 混合状态任务图标
            taskIcon.addClass('zk-task-mixed')
            break
        }
      }

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
        this.activeItemPath = zettel.file.path
        this.activeItemIndex = i // 记录点击的索引，用于查找子节点

        // 更新所有高亮样式 (包括子节点高亮)
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

      // Hover Effect: Highlight all instances of the same file
      li.addEventListener('mouseenter', () => {
        const filePath = zettel.file.path
        const allInstances = container.querySelectorAll(
          `.zk-item[data-file-path="${filePath}"]`
        )
        allInstances.forEach((instance) => {
          instance.addClass('zk-item-hover')
        })
      })

      li.addEventListener('mouseleave', () => {
        const filePath = zettel.file.path
        const allInstances = container.querySelectorAll(
          `.zk-item[data-file-path="${filePath}"]`
        )
        allInstances.forEach((instance) => {
          instance.removeClass('zk-item-hover')
        })
      })

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
        if (zettel.level > 0 &&
          (zettel.mutuals?.length > 0 || zettel.backlinks?.length > 0 || zettel.outgoings?.length > 0)) {
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
   * 更新列表项的高亮状态（不刷新整个列表）
   */
  private updateHighlight() {
    const listContainer = this.contentEl.querySelector('.zk-list-container')
    if (!listContainer) return

    const allItems = listContainer.querySelectorAll('.zk-item')

    // 1. 清除所有高亮
    allItems.forEach((item) => {
      const li = item as HTMLElement
      li.removeClass('zk-item-active')
      // Remove child highlights
      for (let i = 0; i < 7; i++) {
        li.removeClass(`zk-child-highlight-${i}`)
      }
    })

    if (!this.activeItemPath) return

    // 2. 找到当前激活的节点
    // zettelCache 是展平的列表，可以用来查找节点
    if (!this.zettelCache) return

    // 注意：展平列表中可能有多个节点指向同一个文件（如果树结构允许重复）
    // 但通常我们只需要找到一个"主"节点来获取其子节点信息即可。
    // 在本实现中，所有节点包含完整的 children (mutuals/backlinks/outgoings) 信息，
    // 所以找到任意一个匹配 activeItemPath 的节点都可以。
    const activeNode = this.zettelCache.find(n => n.file.path === this.activeItemPath)

    // 3. 应用高亮
    if (activeNode) {
      // 高亮所有该文件的实例
      const activeInstances = listContainer.querySelectorAll(
        `.zk-item[data-file-path="${this.activeItemPath.replace(/"/g, '\\"')}"]`
      )
      activeInstances.forEach((li) => {
        li.addClass('zk-item-active')
      })

      // 高亮子节点
      let index = this.activeItemIndex

      // 如果没有点击记录（例如通过其他方式打开文件），则查找第一个匹配项
      if ((index === null || index === undefined) && this.zettelCache) {
        index = this.zettelCache.findIndex(n => n.file.path === this.activeItemPath)
      }

      if (typeof index === 'number' && index >= 0) {
        this.highlightActiveChildren(index, listContainer)
      }
    }
  }

  private highlightActiveChildren(index: number, container: Element) {
    if (!this.zettelCache || index < 0 || index >= this.zettelCache.length) return

    const startNode = this.zettelCache[index]
    const targetLevel = startNode.level + 1
    const childrenPaths: string[] = []

    // 向下查找直接子节点（通过缩进层级判断）
    for (let i = index + 1; i < this.zettelCache.length; i++) {
      const current = this.zettelCache[i]

      // 如果遇到同级或更高级的节点，说明当前分支结束
      if (current.level <= startNode.level) {
        break
      }

      // 只有层级正好+1的才是直接子节点
      if (current.level === targetLevel) {
        childrenPaths.push(current.file.path)
      }
    }

    // 应用颜色
    childrenPaths.forEach((path, colorIndex) => {
      const cssClass = `zk-child-highlight-${colorIndex % 7}`

      // 查找该文件的所有可视实例
      const instances = container.querySelectorAll(
        `.zk-item[data-file-path="${path}"]`
      )

      instances.forEach(li => {
        li.addClass(cssClass)
      })
    })
  }

  saveCollapsedState() {
    this.plugin.settings.collapsedIds = Array.from(this.collapsedIds)
    this.plugin.saveSettings()
  }

  /**
   */
  private getAllZettels(): ZettelNode[] {
    return this.zettelCache || []
  }

  async onClose() {
    // 清理工作
  }
}
