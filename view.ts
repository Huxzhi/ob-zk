import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import type ZettelkastenPlugin from './main'
import { RenameModal } from './modal'
import {
  compareZettelIds,
  getMaxChild,
  getNextLetterSequence,
  isDigitPart,
  joinParts,
  parseZettelId,
} from './utils'

export const VIEW_TYPE_ZETTELKASTEN = 'zettelkasten-navigator-view'

export interface ZettelNode {
  file: TFile // 允许为 null，表示占位节点
  id: string // 完整ID字符串
  parts: string[] // 使用字符串数组表示 ID 的各个部分
  level: number
}

export class ZettelkastenView extends ItemView {
  plugin: ZettelkastenPlugin
  recentFiles: string[] = [] // 存储最近打开的3个文件路径
  collapsedIds: Set<string> // 存储折叠的条目ID
  private zettelCache: ZettelNode[] | null = null // 缓存显示条目

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

    // 更新笔记计数
    const countEl = this.contentEl.querySelector('.zk-count')
    if (countEl) {
      countEl.textContent = `笔记: ${this.getAllZettels().length}`
    }

    // 渲染列表（将嵌套结构展开）
    this.renderZettelList(listContainer as HTMLElement, this.getAllZettels())
  }

  renderZettelList(container: HTMLElement, zettels: ZettelNode[]) {
    const ul = container.createEl('ul', { cls: 'zk-list' })
    const activeFile = this.app.workspace.getActiveFile()

    for (let i = 0; i < zettels.length; i++) {
      const zettel = zettels[i]
      const zettelId = zettel.id
      const level = zettel.level

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
      if (activeFile && zettel.file?.path === activeFile.path) {
        li.addClass('zk-item-active')
      } else if (this.recentFiles.includes(zettel.file.path)) {
        // 如果是最近打开的文件，添加最近文件样式
        li.addClass('zk-item-recent')
      }

      // 根据层级设置缩进（基础 padding 4px + 层级缩进）
      li.style.paddingLeft = `${10 + level * 10}px`

      // 创建项目容器
      const itemContent = li.createDiv({ cls: 'zk-item-content' })

      const hasChildren = zettels.some(
        (z) => z.id.startsWith(zettelId) && z.id !== zettelId,
      )

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

      // 显示标题（使用 - 分隔符）
      const basename = zettel.file.basename
      let title = ''
      const dashIndex = basename.indexOf('-')
      if (dashIndex > 0) {
        title = basename.substring(dashIndex + 1).trim()
      } else {
        title = basename.replace(zettel.id, '').trim()
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
        await this.createChildNote(zettel)
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

  async createChildNote(parent: ZettelNode) {
    const allZettels = this.getAllZettels()
    const nextId = this.generateChildId(allZettels, parent)

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

  /**
   * 生成指定父节点的下一个子节点 ID
   */
  private generateChildId(
    allZettels: ZettelNode[],
    parent: ZettelNode,
  ): string | null {
    // 特殊处理虚拟顶层节点
    if (parent.parts.length === 0) {
      // 找到所有顶层节点(level 0)中的最大节点
      const topLevelNodes = allZettels.filter((z) => z.level === 0)

      if (topLevelNodes.length > 0) {
        // 有顶层节点，基于最大的生成下一个
        const maxTopLevel = topLevelNodes[topLevelNodes.length - 1]
        const lastPart = maxTopLevel.parts[0]
        let nextPart: string
        if (isDigitPart(lastPart)) {
          nextPart = (parseInt(lastPart) + 1).toString()
        } else {
          const nextLetters = getNextLetterSequence(lastPart)
          if (!nextLetters) {
            return null
          }
          nextPart = nextLetters
        }
        return nextPart
      } else {
        // 没有任何顶层节点，第一个默认为 'a'
        return 'a'
      }
    }

    // 非顶层节点的正常逻辑
    const maxChild = getMaxChild(allZettels, parent)

    let newParts: string[]
    if (maxChild) {
      // 有子节点，基于最大子节点生成下一个
      const lastPart = maxChild.parts[maxChild.parts.length - 1]
      let nextPart: string
      if (isDigitPart(lastPart)) {
        nextPart = (parseInt(lastPart) + 1).toString()
      } else {
        const nextLetters = getNextLetterSequence(lastPart)
        if (!nextLetters) {
          return null
        }
        nextPart = nextLetters
      }
      newParts = [...parent.parts, nextPart]
    } else {
      // 没有子节点，生成第一个子节点
      const lastPart = parent.parts[parent.parts.length - 1]
      const firstChildPart = isDigitPart(lastPart) ? 'a' : '1'
      newParts = [...parent.parts, firstChildPart]
    }

    return joinParts(newParts)
  }

  /**
   * 获取当前节点的上一个兄弟节点
   */
  private getPrevSibling(
    sortedZettels: ZettelNode[],
    currentNode: ZettelNode,
  ): ZettelNode | null {
    const parentId = joinParts(currentNode.parts.slice(0, -1))
    const currentIndex = sortedZettels.findIndex(
      (node) => node.id === currentNode.id,
    )

    if (currentIndex === -1) {
      return null
    }

    // 从当前节点之前倒序查找第一个同父同级的兄弟节点
    for (let i = currentIndex - 1; i >= 0; i--) {
      const candidate = sortedZettels[i]

      // 只考虑同层级节点
      if (candidate.level !== currentNode.level) {
        continue
      }

      // 检查是否有相同的父节点
      const candidateParentId = joinParts(candidate.parts.slice(0, -1))
      if (candidateParentId === parentId) {
        return candidate
      }
    }

    return null
  }

  async indentNote(zettel: ZettelNode) {
    try {
      const allZettels = this.getAllZettels()

      // 找到上一个兄弟节点
      const prevSibling = this.getPrevSibling(allZettels, zettel)
      if (!prevSibling) {
        new Notice('没有上一个兄弟节点')
        return
      }

      // 生成作为上一个兄弟节点的子节点 ID
      const newId = this.generateChildId(allZettels, prevSibling)
      if (!newId) {
        new Notice('❌ 无法生成新ID，缩进失败')
        return
      }

      this.renameId(zettel, newId)
    } catch (error) {
      console.error('缩进失败:', error)
    }
  }

  async outdentNote(zettel: ZettelNode) {
    try {
      // 检查是否可以反向缩进（必须至少有一个层级）
      if (zettel.level === 0) {
        new Notice('已经是顶层，无法反向缩进')
        return
      }

      const allZettels = this.getAllZettels()

      // 构造祖父节点（父节点的父节点）
      const grandparentParts = zettel.parts.slice(0, -2)
      let grandparent: ZettelNode | null = null

      if (grandparentParts.length > 0) {
        // 找到实际的祖父节点
        const grandparentId = joinParts(grandparentParts)
        grandparent = allZettels.find((z) => z.id === grandparentId) || null
      } else {
        // 父节点是顶层，构造虚拟顶层节点
        grandparent = {
          file: null as any,
          id: '',
          parts: [],
          level: -1,
        }
      }

      if (!grandparent) {
        new Notice('❌ 找不到父级节点')
        return
      }

      // 生成祖父节点的下一个子节点 ID（即父节点的下一个兄弟）
      const newId = this.generateChildId(allZettels, grandparent)
      if (!newId) {
        new Notice('❌ 无法生成新ID，反向缩进失败')
        return
      }

      this.renameId(zettel, newId)
    } catch (error) {
      console.error('反向缩进失败:', error)
    }
  }

  async renameId(zettel: ZettelNode, newId: string) {
    const currentFile = zettel.file
    // 提取原文件名中的标题部分
    const basename = currentFile.basename
    let title = ''
    const dashIndex = basename.indexOf('-')
    if (dashIndex > 0) {
      title = basename.substring(dashIndex + 1).trim()
    } else {
      title = basename.replace(zettel.id, '').trim()
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

    console.log(`重命名成功: ${currentFile.name} -> ${newBasename}.md`)
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
      const allZettels = this.getAllZettels()
      const newId = this.generateChildId(allZettels, targetZettel)

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

  /**
   * 获取所有已解析的卢曼笔记
   */
  private getAllZettels(): Array<ZettelNode> {
    if (!this.zettelCache) {
      const files = this.app.vault.getMarkdownFiles()
      this.zettelCache = files
        .map((file) => {
          const parsed = parseZettelId(file.basename)
          return {
            file,
            id: parsed?.id || '',
            parts: parsed?.parts || [],
            level: parsed ? parsed.level : 0,
          }
        })
        .filter((z) => z.parts.length > 0)
        .sort((a, b) => {
          return compareZettelIds(a.parts, b.parts)
        })
    }
    return this.zettelCache
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
