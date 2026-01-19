// 通用输入模态框
import { Modal, TextComponent } from 'obsidian'

export class NoteInputModal extends Modal {
  currentName: string
  title: string
  onSubmit: (newName: string) => void
  textComponent: TextComponent

  constructor(
    app: any,
    currentName: string,
    title: string,
    onSubmit: (newName: string) => void,
  ) {
    super(app)
    this.currentName = currentName
    this.title = title
    this.onSubmit = onSubmit
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()

    // 标题
    contentEl.createEl('h3', { text: this.title })

    // 输入框容器
    const inputContainer = contentEl.createDiv()
    this.textComponent = new TextComponent(inputContainer)
    this.textComponent.setValue(this.currentName)

    // 根据是否有当前名称来设置占位符和行为
    const isCreateMode = !this.currentName.trim()
    this.textComponent.setPlaceholder(
      isCreateMode ? '输入笔记名称' : '输入新的笔记名称',
    )
    this.textComponent.inputEl.style.width = '100%'

    // 如果是新建模式，自动聚焦；否则选中现有文本
    if (isCreateMode) {
      this.textComponent.inputEl.focus()
    } else {
      this.textComponent.inputEl.select()
    }

    // 按钮容器
    const buttonContainer = contentEl.createDiv({
      cls: 'modal-button-container',
    })

    const submitBtn = buttonContainer.createEl('button', {
      text: isCreateMode ? '创建' : '重命名',
      cls: 'mod-cta',
    })
    submitBtn.onclick = () => {
      const value = this.textComponent.getValue().trim()
      if (value) {
        this.onSubmit(value)
        this.close()
      }
    }

    const cancelBtn = buttonContainer.createEl('button', { text: '取消' })
    cancelBtn.onclick = () => {
      this.close()
    }

    // 按回车提交
    this.textComponent.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const value = this.textComponent.getValue().trim()
        if (value) {
          this.onSubmit(value)
          this.close()
        }
      }
    })
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
