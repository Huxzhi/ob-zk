import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian'
import { VIEW_TYPE_ZETTELKASTEN, ZettelkastenView } from './view'

interface ZettelkastenSettings {
  sortOrder: 'asc' | 'desc'
  collapsedIds: string[]
}

const DEFAULT_SETTINGS: ZettelkastenSettings = {
  sortOrder: 'asc',
  collapsedIds: [],
}

export default class ZettelkastenPlugin extends Plugin {
  settings: ZettelkastenSettings

  async onload() {
    await this.loadSettings()

    // 注册侧边栏视图
    this.registerView(
      VIEW_TYPE_ZETTELKASTEN,
      (leaf) => new ZettelkastenView(leaf, this),
    )

    // 添加命令：打开卢曼笔记视图
    this.addCommand({
      id: 'open-zettelkasten-view',
      name: '打开卢曼笔记导航器',
      callback: () => {
        this.activateView()
      },
    })

    // 添加命令：创建新的子笔记
    this.addCommand({
      id: 'create-child-note',
      name: '创建子笔记',
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile()
        if (activeFile) {
          await this.createChildNote(activeFile.basename)
        }
      },
    })

    // 添加命令：重命名笔记编号
    this.addCommand({
      id: 'rename-note-id',
      name: '重命名笔记编号',
      callback: () => {
        // 这个功能将在视图中实现
        this.activateView()
      },
    })

    // 添加设置面板
    this.addSettingTab(new ZettelkastenSettingTab(this.app, this))

    // 在启动时自动打开视图
    this.app.workspace.onLayoutReady(() => {
      this.activateView()
    })
  }

  async activateView() {
    const { workspace } = this.app

    let leaf: WorkspaceLeaf | null = null
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_ZETTELKASTEN)

    if (leaves.length > 0) {
      // 视图已存在，激活它
      leaf = leaves[0]
    } else {
      // 创建新视图
      leaf = workspace.getRightLeaf(false)
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_ZETTELKASTEN,
          active: true,
        })
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf)
    }
  }

  async createChildNote(parentBasename: string) {
    const nextId = this.getNextChildId(parentBasename)
    const newNoteName = `${nextId}.md`

    // 创建新文件
    const newFile = await this.app.vault.create(newNoteName, '')

    // 打开新文件
    const leaf = this.app.workspace.getLeaf()
    await leaf.openFile(newFile)
  }

  getNextChildId(parentId: string): string {
    // 获取所有文件
    const files = this.app.vault.getMarkdownFiles()
    const childPattern = new RegExp(`^${this.escapeRegex(parentId)}[a-z]\\d*`)

    const children = files
      .map((f) => f.basename)
      .filter((name) => childPattern.test(name))

    if (children.length === 0) {
      return `${parentId}a`
    }

    // 找到最后一个字母
    const lastChild = children.sort().pop()
    if (!lastChild) return `${parentId}a`

    const match = lastChild.match(
      new RegExp(`^${this.escapeRegex(parentId)}([a-z])(\\d*)$`),
    )
    if (match) {
      const letter = match[1]
      const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1)
      return `${parentId}${nextLetter}`
    }

    return `${parentId}a`
  }

  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  onunload() {
    // 清理工作
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}

class ZettelkastenSettingTab extends PluginSettingTab {
  plugin: ZettelkastenPlugin

  constructor(app: App, plugin: ZettelkastenPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: '卢曼笔记导航器设置' })

    new Setting(containerEl)
      .setName('排序顺序')
      .setDesc('选择笔记的排序顺序')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('asc', '升序')
          .addOption('desc', '降序')
          .setValue(this.plugin.settings.sortOrder)
          .onChange(async (value) => {
            this.plugin.settings.sortOrder = value as 'asc' | 'desc'
            await this.plugin.saveSettings()
          }),
      )
  }
}
