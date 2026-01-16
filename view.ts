import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import type ZettelkastenPlugin from './main'
import {
  compareZettelIds,
  getNextLetterSequence,
  isDigitPart,
  joinParts,
  parseZettelId,
  type ZettelId,
} from './utils'

export const VIEW_TYPE_ZETTELKASTEN = 'zettelkasten-navigator-view'

interface ZettelNode {
  file: TFile | null // 允许为 null，表示占位节点
  parsed: ZettelId
}

interface ZettelNested {
  pre: string
  children: ZettelNested[]
}

export class ZettelkastenView extends ItemView {
  plugin: ZettelkastenPlugin
  recentFiles: string[] = [] // 存储最近打开的3个文件路径
  collapsedIds: Set<string> // 存储折叠的条目ID
  private zettelCache: ZettelNode[] | null = null // 缓存显示条目
  private ZettelNestedCache: ZettelNested[] | null = null // 缓存嵌套结构
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

    // 笔记计数显示
    const countEl = headerEl.createDiv({ cls: 'zk-count' })
    countEl.textContent = '笔记: 0'

    // 创建笔记列表容器
    const listContainer = this.contentEl.createDiv({ cls: 'zk-list-container' })

    // 初始渲染
    await this.refresh()

    // 监听文件变化
    this.registerEvent(this.app.vault.on('create', () => this.refresh()))
    this.registerEvent(this.app.vault.on('delete', () => this.refresh()))
    this.registerEvent(this.app.vault.on('rename', () => this.refresh()))

    // 监听文件打开事件以更新高亮和最近文件列表
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) {
          this.updateRecentFiles(file.path)
        }
        this.refresh()
      }),
    )
  }

  async refresh() {
    const listContainer = this.contentEl.querySelector('.zk-list-container')
    if (!listContainer) return

    listContainer.empty()

    // 清除缓存并重新构建
    this.zettelCache = null

    this.ZettelNestedCache = null

    // 更新笔记计数
    const countEl = this.contentEl.querySelector('.zk-count')
    if (countEl) {
      countEl.textContent = `笔记: ${this.getAllZettels().length}`
    }

    // 渲染列表（将嵌套结构展开）
    this.renderZettelList(listContainer as HTMLElement, this.getAllZettels())
  }

  renderZettelList(container: HTMLElement, zettels: any[]) {
    const ul = container.createEl('ul', { cls: 'zk-list' })
    const activeFile = this.app.workspace.getActiveFile()

    for (let i = 0; i < zettels.length; i++) {
      const zettel = zettels[i]
      const zettelId = zettel.parsed.id
      const level = zettel.parsed.level

      // 检查是否应该隐藏（父节点被折叠）
      let shouldHide = false
      if (level > 0) {
        // 检查所有可能的父节点是否被折叠
        for (const collapsedId of this.collapsedIds) {
          if (zettelId.startsWith(collapsedId) && zettelId !== collapsedId) {
            shouldHide = true
            break
          }
        }
      }

      if (shouldHide) {
        continue // 跳过被折叠的条目
      }

      const li = ul.createEl('li', { cls: 'zk-item' })

      // 如果是当前打开的文件，添加高亮样式
      if (activeFile && zettel.file.path === activeFile.path) {
        li.addClass('zk-item-active')
      } else if (this.recentFiles.includes(zettel.file.path)) {
        // 如果是最近打开的文件，添加最近文件样式
        li.addClass('zk-item-recent')
      }

      // 根据层级设置缩进
      li.style.paddingLeft = `${level * 10}px`

      // 创建项目容器
      const itemContent = li.createDiv({ cls: 'zk-item-content' })

      // 检查是否有子条目（非顶层）
      const hasChildren = level > 0 && this.hasChildren(zettelId, zettels)

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
        text: zettel.parsed.id,
      })

      // 显示标题（使用 - 分隔符）
      const basename = zettel.file.basename
      let title = ''
      const dashIndex = basename.indexOf('-')
      if (dashIndex > 0) {
        title = basename.substring(dashIndex + 1).trim()
      } else {
        title = basename.replace(zettel.parsed.id, '').trim()
      }
      const titleSpan = itemContent.createSpan({
        cls: 'zk-title',
        text: title || '(无标题)',
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

        // 更新最近文件列表
        this.updateRecentFiles(zettel.file.path)

        // 获取最近使用的主编辑区leaf，而不是当前侧边栏的leaf
        const leaf = this.app.workspace.getMostRecentLeaf()
        if (leaf) {
          await leaf.openFile(zettel.file)
          // 文件打开后刷新视图以更新所有样式
          await this.refresh()
        }
      }

      // 右键菜单
      itemContent.oncontextmenu = (e) => {
        e.preventDefault()
        this.showContextMenu(e, zettel.file)
      }

      // 拖放功能：设置为可拖动
      li.setAttribute('draggable', 'true')

      // dragstart: 开始拖动时，记录被拖动的文件路径
      li.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', zettel.file.path)
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

      // 监听拖放事件
      li.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'
        li.addClass('zk-item-dragover')
      })

      li.addEventListener('dragleave', (e) => {
        e.preventDefault()
        li.removeClass('zk-item-dragover')
      })

      li.addEventListener('drop', async (e) => {
        e.preventDefault()
        e.stopPropagation()
        li.removeClass('zk-item-dragover')

        await this.handleFileDrop(e, zettel)
      })

      // 添加操作按钮
      const actions = li.createDiv({ cls: 'zk-actions' })

      // 反向缩进按钮（提升一个层级）
      const outdentBtn = actions.createEl('button', {
        text: '←',
        cls: 'zk-action-btn',
        attr: { 'aria-label': '反向缩进' },
      })
      outdentBtn.onclick = async (e) => {
        e.stopPropagation()
        await this.outdentNote(zettel)
      }

      // 缩进按钮（变为上一个兄弟节点的子节点）
      const indentBtn = actions.createEl('button', {
        text: '→',
        cls: 'zk-action-btn',
        attr: { 'aria-label': '缩进' },
      })
      indentBtn.onclick = async (e) => {
        e.stopPropagation()
        await this.indentNote(zettel)
      }

      // 添加子笔记按钮
      const addBtn = actions.createEl('button', {
        text: '+',
        cls: 'zk-action-btn',
        attr: { 'aria-label': '添加子笔记' },
      })
      addBtn.onclick = async (e) => {
        e.stopPropagation()
        await this.createChildNote(zettel.parsed.id)
      }

      // 重命名按钮
      const renameBtn = actions.createEl('button', {
        text: '✎',
        cls: 'zk-action-btn',
        attr: { 'aria-label': '重命名' },
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

  async createChildNote(parentId: string) {
    // 获取下一个子ID
    const nextId = this.getNextChildId(parentId)
    if (!nextId) {
      new Notice('❌ 无法生成新的子笔记ID')
      return
    }
    const newNoteName = `${nextId}-.md`

    try {
      // 创建新文件
      const newFile = await this.app.vault.create(newNoteName, '')

      // 打开新文件
      const leaf = this.app.workspace.getMostRecentLeaf()
      if (leaf) {
        await leaf.openFile(newFile)
      }

      // 刷新视图
      await this.refresh()
    } catch (error) {
      console.error('创建子笔记失败:', error)
    }
  }

  async indentNote(zettel: any) {
    try {
      const currentFile = zettel.file
      const currentId = zettel.parsed.id
      const currentParsed = zettel.parsed

      const nestedZettels = this.getNestedZettels()

      // 获取父节点的 parts
      const parentParts = currentParsed.parts.slice(0, -1)

      // 获取兄弟节点列表
      let siblings: ZettelNested[]
      if (parentParts.length === 0) {
        // 顶层节点
        siblings = nestedZettels
      } else {
        const parentNode = this.findNodeByParts(nestedZettels, parentParts)
        siblings = parentNode ? parentNode.children : []
      }

      // 找到当前节点在兄弟节点中的位置
      const currentLastPart =
        currentParsed.parts[currentParsed.parts.length - 1]
      const currentIndex = siblings.findIndex((n) => n.pre === currentLastPart)

      if (currentIndex <= 0) {
        new Notice('没有兄弟节点')
        return
      }

      // 获取上一个兄弟节点
      const prevSibling = siblings[currentIndex - 1]

      // 构建上一个兄弟节点的完整 ID
      const prevSiblingParts = [...parentParts, prevSibling.pre]
      const prevSiblingId = joinParts(prevSiblingParts)

      // 生成新ID：作为上一个兄弟节点的子节点
      const newId = this.getNextChildId(prevSiblingId, currentId)
      if (!newId) {
        new Notice('❌ 无法生成新ID，缩进失败')
        return
      }

      // 提取原文件名中的标题部分
      const basename = currentFile.basename
      let title = ''
      const dashIndex = basename.indexOf('-')
      if (dashIndex > 0) {
        title = basename.substring(dashIndex + 1).trim()
      } else {
        title = basename.replace(currentId, '').trim()
      }

      // 构建新文件名
      const newBasename = title ? `${newId}-${title}` : `${newId}-`
      const newPath = currentFile.path.replace(
        currentFile.name,
        `${newBasename}.md`,
      )

      // 重命名文件
      await this.app.vault.rename(currentFile, newPath)

      // 刷新视图
      await this.refresh()

      console.log(`缩进成功: ${currentFile.name} -> ${newBasename}.md`)
    } catch (error) {
      console.error('缩进失败:', error)
    }
  }

  async outdentNote(zettel: any) {
    try {
      const currentFile = zettel.file
      const currentId = zettel.parsed.id
      const currentParsed = zettel.parsed

      // 检查是否可以反向缩进（必须至少有一个层级）
      if (currentParsed.level === 0) {
        new Notice('已经是顶层，无法反向缩进')
        return
      }

      const nestedZettels = this.getNestedZettels()

      // 获取父节点的 parts（去掉当前节点的最后一个 part）
      const parentParts = currentParsed.parts.slice(0, -1)

      // 构建父节点的完整 ID
      const parentId = joinParts(parentParts)

      // 生成新ID：作为父节点的下一个兄弟节点
      const newId = this.getNextSiblingId(parentId, currentId)

      if (!newId) {
        new Notice('❌ 无法生成新ID，反向缩进失败')
        return
      }

      // 提取原文件名中的标题部分
      const basename = currentFile.basename
      let title = ''
      const dashIndex = basename.indexOf('-')
      if (dashIndex > 0) {
        title = basename.substring(dashIndex + 1).trim()
      } else {
        title = basename.replace(currentId, '').trim()
      }

      // 构建新文件名
      const newBasename = title ? `${newId}-${title}` : `${newId}-`
      const newPath = currentFile.path.replace(
        currentFile.name,
        `${newBasename}.md`,
      )

      // 重命名文件
      await this.app.vault.rename(currentFile, newPath)

      // 刷新视图
      await this.refresh()

      console.log(`反向缩进成功: ${currentFile.name} -> ${newBasename}.md`)
    } catch (error) {
      console.error('反向缩进失败:', error)
    }
  }

  async renameNote(file: TFile) {
    const currentName = file.basename
    const parsed = parseZettelId(currentName)

    if (!parsed) return

    // 提示用户输入新的ID
    const modal = new RenameModal(
      this.app,
      currentName,
      async (newName: string) => {
        if (newName && newName !== currentName) {
          try {
            const newPath = file.path.replace(file.name, `${newName}.md`)
            await this.app.vault.rename(file, newPath)
            await this.refresh()
          } catch (error) {
            console.error('重命名失败:', error)
          }
        }
      },
    )
    modal.open()
  }

  async handleFileDrop(e: DragEvent, targetZettel: any) {
    try {
      // 从dataTransfer中获取文件路径
      let draggedFile: TFile | null = null

      // 1. 先尝试从自定义数据类型获取（条目拖动）
      const customPath = e.dataTransfer?.getData(
        'application/x-obsidian-file-path',
      )
      if (customPath) {
        draggedFile = this.app.vault.getAbstractFileByPath(customPath) as TFile
      }

      // 2. 如果没有，尝试从Obsidian URI获取（文件浏览器拖动）
      if (!draggedFile) {
        const uriData = e.dataTransfer?.getData('text/plain')

        if (uriData && uriData.startsWith('obsidian://')) {
          // 解析Obsidian URI: obsidian://open?vault=xxx&file=path
          try {
            const url = new URL(uriData)
            const filePath = url.searchParams.get('file')

            if (filePath) {
              // URL解码文件路径
              const decodedPath = decodeURIComponent(filePath)

              // 获取TFile对象
              draggedFile = this.app.vault.getAbstractFileByPath(
                decodedPath + '.md',
              ) as TFile

              // 如果加.md找不到，尝试不加.md
              if (!draggedFile) {
                draggedFile = this.app.vault.getAbstractFileByPath(
                  decodedPath,
                ) as TFile
              }
            }
          } catch (error) {
            console.error('解析URI失败:', error)
          }
        }
      }

      if (!draggedFile) {
        return
      }

      // 防止拖到自己身上
      if (draggedFile.path === targetZettel.file.path) {
        return
      }

      // 生成新的ID（作为目标笔记的子笔记）
      const newId = this.getNextChildId(
        targetZettel.parsed.id,
        parseZettelId(draggedFile.basename)?.id,
      )
      if (!newId) {
        new Notice('❌ 无法生成新ID，拖放失败')
        return
      }

      // 提取原文件名中的标题部分
      const basename = draggedFile.basename
      let title = ''
      const dashIndex = basename.indexOf('-')
      if (dashIndex > 0) {
        // 如果原文件名有-分隔符，提取标题
        title = basename.substring(dashIndex + 1).trim()
      } else {
        // 检查是否符合卢曼格式
        const parsed = parseZettelId(basename)
        if (parsed) {
          // 符合格式，提取ID后的部分作为标题
          title = basename.replace(parsed.id, '').trim()
        } else {
          // 不符合格式，整个文件名作为标题
          title = basename
        }
      }

      // 构建新文件名
      const newBasename = title ? `${newId}-${title}` : `${newId}-`

      // 获取目标文件所在的文件夹
      const targetFolder = targetZettel.file.parent.path

      // 构建新路径（移动到目标文件所在文件夹）
      const newPath = targetFolder
        ? `${targetFolder}/${newBasename}.md`
        : `${newBasename}.md`

      // 重命名并移动文件
      await this.app.vault.rename(draggedFile, newPath)

      // 刷新视图
      await this.refresh()

      console.log(`文件已移动并重命名: ${draggedFile.path} -> ${newPath}`)
    } catch (error) {
      console.error('拖放处理失败:', error)
    }
  }

  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  saveCollapsedState() {
    this.plugin.settings.collapsedIds = Array.from(this.collapsedIds)
    this.plugin.saveSettings()
  }

  hasChildren(parentId: string, zettels: any[]): boolean {
    // 检查是否有任何条目以这个ID开头（且不是自己）
    return zettels.some(
      (z) => z.parsed.id.startsWith(parentId) && z.parsed.id !== parentId,
    )
  }

  /**
   * 获取所有已解析的卢曼笔记
   */
  private getAllZettels(): Array<ZettelNode> {
    if (!this.zettelCache) {
      const files = this.app.vault.getMarkdownFiles()
      this.zettelCache = files
        .map((file) => ({
          file,
          parsed: parseZettelId(file.basename),
        }))
        .filter(
          (z): z is { file: TFile; parsed: ZettelId } => z.parsed !== null,
        )
        .sort((a, b) => {
          return compareZettelIds(a.parsed, b.parsed)
        })
    }
    return this.zettelCache
  }

  /**
   * 获取嵌套的树结构（带缓存）
   * 使用 parts 数组逐层构建树
   */
  private getNestedZettels(): ZettelNested[] {
    if (this.ZettelNestedCache) {
      return this.ZettelNestedCache
    }

    const allZettels = this.getAllZettels()
    const rootNodes: ZettelNested[] = []

    for (const zettel of allZettels) {
      const parts = zettel.parsed.parts
      this.insertIntoTree(rootNodes, parts)
    }
    this.ZettelNestedCache = rootNodes
    return rootNodes
  }

  /**
   * 将 parts 数组逐层插入到树中
   * parts[0] = 第一层级（根节点）
   * parts[1] = 第二层级（第一级子节点）
   * parts[2] = 第三层级（第二级子节点）
   * 例如：["a", "1", "a"] 表示 root -> a -> a1 -> a1a
   */
  private insertIntoTree(rootNodes: ZettelNested[], parts: string[]): void {
    let currentLevel = rootNodes

    // 逐层遍历 parts 数组
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      // 在当前层级查找是否已存在该 part
      let existingNode = currentLevel.find((node) => node.pre === part)

      if (!existingNode) {
        // 不存在则创建新节点
        existingNode = {
          pre: part,
          children: [],
        }
        currentLevel.push(existingNode)
      }

      // 进入下一层级（该节点的 children）
      currentLevel = existingNode.children
    }
  }

  /**
   * 从 parts 数组获取父节点ID
   */
  private getParentIdFromParts(parts: string[]): string | null {
    if (parts.length <= 1) {
      return null
    }
    const parentParts = parts.slice(0, -1)
    return joinParts(parentParts)
  }

  /**
   * 在树中根据 parts 路径找到对应节点
   */
  private findNodeByParts(
    rootNodes: ZettelNested[],
    parts: string[],
  ): ZettelNested | null {
    if (parts.length === 0) return null

    let currentLevel = rootNodes
    let node: ZettelNested | null = null

    for (const part of parts) {
      node = currentLevel.find((n) => n.pre === part) || null
      if (!node) return null
      currentLevel = node.children
    }

    return node
  }

  /**
   * 生成下一个兄弟笔记ID
   * @param id 当前节点ID
   * @param excludeId 需要排除的ID（当前文件的ID）
   */
  getNextSiblingId(id: string, excludeId: string): string | null {
    const parsed = parseZettelId(id)
    if (!parsed || parsed.parts.length === 0) {
      return null
    }

    const nestedZettels = this.getNestedZettels()

    // 获取父节点的 parts
    const parentParts = parsed.parts.slice(0, -1)

    let siblings: ZettelNested[]
    if (parentParts.length === 0) {
      // 顶层节点，siblings 就是 rootNodes
      siblings = nestedZettels
    } else {
      // 找到父节点
      const parentNode = this.findNodeByParts(nestedZettels, parentParts)
      siblings = parentNode ? parentNode.children : []
    }

    if (siblings.length === 0) {
      // 没有兄弟节点，返回当前 ID
      return id
    }

    // 找到最后一个兄弟节点（排除 excludeId 对应的节点）
    const excludeParsed = parseZettelId(excludeId)
    const excludeLastPart = excludeParsed?.parts[excludeParsed.parts.length - 1]

    const filteredSiblings = siblings.filter((n) => n.pre !== excludeLastPart)

    if (filteredSiblings.length === 0) {
      // 所有兄弟节点都被排除了，返回当前 ID
      return id
    }

    const lastSibling = filteredSiblings[filteredSiblings.length - 1]
    const lastPart = lastSibling.pre

    // 递增最后一个 part
    let nextPart: string
    if (isDigitPart(lastPart)) {
      const num = parseInt(lastPart)
      nextPart = (num + 1).toString()
    } else {
      const nextLetters = getNextLetterSequence(lastPart)
      if (!nextLetters) return null
      nextPart = nextLetters
    }

    // 构建新 ID
    const newParts = [...parentParts, nextPart]
    return joinParts(newParts)
  }

  getNextChildId(parentId: string, excludeId?: string): string | null {
    const parsed = parseZettelId(parentId)
    if (!parsed) {
      return null
    }

    const nestedZettels = this.getNestedZettels()

    // 找到父节点
    const parentNode = this.findNodeByParts(nestedZettels, parsed.parts)
    let children = parentNode ? parentNode.children : []

    // 如果提供了 excludeId，过滤掉对应的子节点
    if (excludeId) {
      const excludeParsed = parseZettelId(excludeId)
      const excludeLastPart =
        excludeParsed?.parts[excludeParsed.parts.length - 1]
      if (excludeLastPart) {
        children = children.filter((n) => n.pre !== excludeLastPart)
      }
    }

    // 如果没有子节点（或全被排除），根据父节点最后一个 part 的类型决定
    if (children.length === 0) {
      const lastPart = parsed.parts[parsed.parts.length - 1]
      const firstChild = isDigitPart(lastPart) ? 'a' : '1'
      return joinParts([...parsed.parts, firstChild])
    }

    // 有子节点，递增最后一个子节点
    const lastChildPart = children[children.length - 1].pre
    let nextPart: string
    if (isDigitPart(lastChildPart)) {
      nextPart = (parseInt(lastChildPart) + 1).toString()
    } else {
      const nextLetters = getNextLetterSequence(lastChildPart)
      if (!nextLetters) return null
      nextPart = nextLetters
    }

    return joinParts([...parsed.parts, nextPart])
  }

  updateRecentFiles(filePath: string) {
    // 移除当前文件（如果已存在）
    this.recentFiles = this.recentFiles.filter((path) => path !== filePath)

    // 将当前文件添加到开头
    this.recentFiles.unshift(filePath)

    // 只保留最近的3个文件
    if (this.recentFiles.length > 3) {
      this.recentFiles = this.recentFiles.slice(0, 3)
    }
  }

  async onClose() {
    // 清理工作
  }
}

// 重命名模态框
import { Modal, TextComponent } from 'obsidian'

class RenameModal extends Modal {
  currentName: string
  onSubmit: (newName: string) => void
  textComponent: TextComponent

  constructor(
    app: any,
    currentName: string,
    onSubmit: (newName: string) => void,
  ) {
    super(app)
    this.currentName = currentName
    this.onSubmit = onSubmit
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    contentEl.createEl('h3', { text: '重命名笔记' })

    const inputContainer = contentEl.createDiv()
    this.textComponent = new TextComponent(inputContainer)
    this.textComponent.setValue(this.currentName)
    this.textComponent.inputEl.style.width = '100%'
    this.textComponent.inputEl.select()

    const buttonContainer = contentEl.createDiv({
      cls: 'modal-button-container',
    })

    const submitBtn = buttonContainer.createEl('button', {
      text: '确定',
      cls: 'mod-cta',
    })
    submitBtn.onclick = () => {
      this.onSubmit(this.textComponent.getValue())
      this.close()
    }

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' })
    cancelBtn.onclick = () => {
      this.close()
    }

    // 按回车提交
    this.textComponent.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.onSubmit(this.textComponent.getValue())
        this.close()
      }
    })
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
