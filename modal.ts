// 重命名模态框
import { Modal, TextComponent } from 'obsidian'

export class RenameModal extends Modal {
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
