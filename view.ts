import { ItemView, Menu, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import type ZettelkastenPlugin from './main'
import { parseZettelId, sortZettels, type ZettelId } from './utils'

export const VIEW_TYPE_ZETTELKASTEN = 'zettelkasten-navigator-view'

export class ZettelkastenView extends ItemView {
  plugin: ZettelkastenPlugin
  recentFiles: string[] = [] // 存储最近打开的3个文件路径
  collapsedIds: Set<string> // 存储折叠的条目ID

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

    // 获取所有markdown文件
    const files = this.app.vault.getMarkdownFiles()

    // 解析并排序
    const zettels = files
      .map((file) => ({
        file,
        parsed: parseZettelId(file.basename),
      }))
      .filter((z): z is { file: TFile; parsed: ZettelId } => z.parsed !== null)

    const sorted = sortZettels(zettels, this.plugin.settings.sortOrder)

    // 更新笔记计数
    const countEl = this.contentEl.querySelector('.zk-count')
    if (countEl) {
      countEl.textContent = `笔记: ${sorted.length}`
    }

    // 渲染列表
    this.renderZettelList(listContainer as HTMLElement, sorted)
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

  getNextChildId(parentId: string, excludeFile?: TFile): string {
    // 确定父节点以什么结尾
    const lastChar = parentId[parentId.length - 1]
    let baseChildId: string

    if (/[a-z]/.test(lastChar)) {
      // 父节点以字母结尾，子节点以数字开头
      baseChildId = parentId + '1'
    } else {
      // 父节点以数字结尾，子节点以字母开头
      baseChildId = parentId + 'a'
    }

    // 使用 getNextSiblingId 来找到实际的ID，排除指定文件
    return this.getNextSiblingId(baseChildId, excludeFile) || baseChildId
  }

  getNextLetterSequence(current: string): string {
    // 处理字母序列：a -> b -> ... -> z -> aa -> ab -> ... -> az -> ba -> ...
    let result = current
    let carry = true

    for (let i = result.length - 1; i >= 0 && carry; i--) {
      if (result[i] === 'z') {
        result = result.substring(0, i) + 'a' + result.substring(i + 1)
      } else {
        result =
          result.substring(0, i) +
          String.fromCharCode(result.charCodeAt(i) + 1) +
          result.substring(i + 1)
        carry = false
      }
    }

    if (carry) {
      result = 'a' + result
    }

    return result
  }

  async indentNote(zettel: any) {
    try {
      const currentFile = zettel.file
      const currentId = zettel.parsed.id

      // 获取所有笔记
      const files = this.app.vault.getMarkdownFiles()
      const zettels = files
        .map((file) => ({
          file,
          parsed: parseZettelId(file.basename),
        }))
        .filter(
          (z): z is { file: TFile; parsed: ZettelId } => z.parsed !== null,
        )

      // 排序
      const sorted = sortZettels(zettels, this.plugin.settings.sortOrder)

      // 找到当前笔记的位置
      const currentIndex = sorted.findIndex(
        (z) => z.file.path === currentFile.path,
      )
      if (currentIndex <= 0) {
        console.log('没有上一个兄弟节点')
        return
      }

      // 获取上一个同级节点
      const prevZettel = sorted[currentIndex - 1]

      // 检查上一个节点是否是同级（层级相同）
      if (prevZettel.parsed.level !== zettel.parsed.level) {
        console.log('上一个节点不是同级')
        return
      }

      // 生成新ID：作为上一个节点的子节点
      const newId = this.getNextChildId(prevZettel.parsed.id, currentFile)
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
        console.log('已经是顶层，无法反向缩进')
        return
      }

      // 获取父ID（去掉最后一个组件）
      let parentId = ''
      const parts = [...currentParsed.parts]

      // 移除最后一个非点号的部分
      while (parts.length > 0) {
        const last = parts.pop()
        if (last !== '.') {
          break
        }
      }
      parentId = parts.join('')

      if (!parentId) {
        console.log('无法获取父ID')
        return
      }

      // 生成新ID：作为父节点的下一个兄弟节点
      const newId = this.getNextSiblingId(parentId, currentFile)

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
      const newId = this.getNextChildId(targetZettel.parsed.id, draggedFile)
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

  getNextSiblingId(baseId: string, excludeFile?: TFile): string | null {
    const parsed = parseZettelId(baseId)
    if (!parsed) return null

    const files = this.app.vault.getMarkdownFiles()

    // 获取父ID（去掉最后一个组件）
    let parentId = ''
    const parts = [...parsed.parts]

    // 移除最后一个非点号的部分
    while (parts.length > 0) {
      const last = parts.pop()
      if (last !== '.') {
        break
      }
    }
    parentId = parts.join('')

    // 获取最后一个组件的类型
    const lastPart = parsed.parts[parsed.parts.length - 1]
    const isNumber = /^\d+$/.test(lastPart)

    if (isNumber) {
      // 如果最后是数字，找到所有同级文件中最大的数字序号
      const pattern = new RegExp(`^${this.escapeRegex(parentId)}(\\d+)`)

      let maxNum = 0
      files.forEach((file) => {
        // 排除指定的文件
        if (excludeFile && file.path === excludeFile.path) return

        const fileParsed = parseZettelId(file.basename)
        if (fileParsed) {
          const match = fileParsed.id.match(pattern)
          if (match) {
            const num = parseInt(match[1])
            if (num > maxNum) {
              maxNum = num
            }
          }
        }
      })

      return parentId + (maxNum + 1)
    } else {
      // 如果最后是字母，找到所有同级文件中最大的字母
      const pattern = new RegExp(
        `^${this.escapeRegex(parentId)}([a-z])(?:[\\d.]|$)`,
      )

      let maxChar = ''
      files.forEach((file) => {
        // 排除指定的文件
        if (excludeFile && file.path === excludeFile.path) return

        const fileParsed = parseZettelId(file.basename)
        if (fileParsed) {
          const match = fileParsed.id.match(pattern)
          if (match && match[1]) {
            if (!maxChar || match[1] > maxChar) {
              maxChar = match[1]
            }
          }
        }
      })

      if (!maxChar) {
        // 没有找到同级的，返回下一个字母
        const nextChar = String.fromCharCode(lastPart.charCodeAt(0) + 1)
        if (nextChar <= 'z') {
          return parentId + nextChar
        }
        return null
      }

      const nextChar = String.fromCharCode(maxChar.charCodeAt(0) + 1)
      if (nextChar <= 'z') {
        return parentId + nextChar
      }
      return null
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
