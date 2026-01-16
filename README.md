# 卢曼笔记导航器 (Zettelkasten Navigator)

一个为 Obsidian 设计的卢曼笔记法（Zettelkasten）导航插件，提供可视化的层级笔记管理和快速操作功能。

## 核心功能

### 1. 笔记编码系统

- **字母起始编码**：使用字母作为顶层标识符（a, b, c, ..., z, aa, ab, ...）
- **交替层级**：字母和数字交替表示层级关系
  - 顶层：`a`, `b`, `c`
  - 第二层：`a1`, `a2`, `b1`
  - 第三层：`a1a`, `a1b`, `a2a`
- **小数点支持**：使用小数点创建更接近主干的子节点
  - 例如：`a1.1` 在排序上位于 `a1a` 之前
- **标题分隔**：使用 `-` 分隔 ID 和标题
  - 格式：`a1b2.34-我的笔记.md`

### 2. 可视化导航

- **树形展示**：按层级缩进显示笔记结构（每层 10px）
- **折叠/展开**：非顶层节点可折叠子节点（使用 SVG 三角图标）
- **高亮显示**：
  - 当前打开文件：红色边框
  - 最近打开的 3 个文件：蓝色边框
- **笔记计数**：顶部显示笔记总数

### 3. 快捷操作

提供悬浮按钮（鼠标移到条目上显示）：

- **← 反向缩进**：提升笔记到父节点同级
- **→ 缩进**：将笔记降级为上一个兄弟节点的子节点
- **+ 添加子笔记**：创建当前笔记的子笔记
- **✎ 重命名**：修改笔记名称

### 4. 拖放功能

- **条目间拖放**：拖动条目到另一个条目上，自动成为其子节点
- **文件浏览器拖放**：从 Obsidian 文件浏览器拖放文件到条目上

### 5. 智能 ID 生成

- **自动排除自身**：在缩进、拖放操作时排除当前文件避免冲突
- **只查找直接子节点**：生成子 ID 时只考虑直接子节点，不包括孙子节点
- **字母序列递增**：a → b → z → aa → ab → az → ba

### 6. 状态持久化

- **折叠状态保存**：关闭 Obsidian 后重新打开，折叠状态保持不变
- **自动刷新**：文件创建、删除、重命名、打开时自动更新视图

## 编码规则详解

### ID 格式正则表达式

```regex
^([a-z](?:\d+(?:\.\d+)?[a-z]*)*(?:\.\d+)?)(?:-.*)?$
```

### 层级计算规则

1. **字母 ↔ 数字转换**：每次从字母切换到数字或从数字切换到字母，层级 +1
2. **小数点**：每个小数点也增加一个层级
3. **示例**：
   - `a` → level 0
   - `a1` → level 1
   - `a1a` → level 2
   - `a1.1` → level 2
   - `a1.1a` → level 3

### 排序规则

在同一层级中：

- **小数点优先**：`a1.1` < `a1.2` < `a1a` < `a1b`
- **数字递增**：`a1` < `a2` < `a3`
- **字母递增**：`a` < `b` < `c`

## 技术实现

### 文件结构

```
ob-zk/
├── main.ts           # 插件入口，设置管理
├── view.ts           # 主视图实现，UI 渲染和交互
├── utils.ts          # ID 解析、排序等工具函数
├── styles.css        # 样式定义
├── manifest.json     # 插件元数据
├── package.json      # 依赖管理
├── tsconfig.json     # TypeScript 配置
└── esbuild.config.mjs # 构建配置
```

### 核心类和方法

#### ZettelkastenView 类

```typescript
class ZettelkastenView extends ItemView {
  // 状态管理
  recentFiles: string[] // 最近打开的 3 个文件
  collapsedIds: Set<string> // 折叠的条目 ID

  // 核心方法
  refresh() // 刷新视图
  renderZettelList() // 渲染笔记列表
  getNextChildId(parentId, excludeFile?) // 生成下一个子 ID
  getNextSiblingId(baseId, excludeFile?) // 生成下一个兄弟 ID
  indentNote(zettel) // 缩进操作
  outdentNote(zettel) // 反向缩进操作
  handleFileDrop(e, target) // 处理拖放
  saveCollapsedState() // 保存折叠状态
}
```

#### 工具函数 (utils.ts)

```typescript
parseZettelId(basename: string): ZettelId | null
  // 解析笔记名称，提取 ID、层级、部分等信息

sortZettels(zettels: Array, order: 'asc' | 'desc'): Array
  // 按照卢曼编码规则排序笔记

compareZettelIds(a: ZettelId, b: ZettelId): number
  // 比较两个 ID 的大小
```

### CSS 设计要点

#### 使用 CSS 变量

```css
var(--font-ui-smaller)      // 字体大小，与原生文件目录一致
var(--text-normal)           // 普通文本颜色
var(--text-accent)           // 强调色
var(--background-modifier-hover)  // 悬浮背景色
```

#### 折叠图标

- 容器：10px × 10px
- SVG 图标：10px × 10px
- 旋转动画：折叠时向右旋转 -90deg
- 负左边距：-14px，避免影响内容位置

#### 悬浮按钮

- 绝对定位在右侧
- 鼠标悬浮时显示（`display: none` → `display: flex`）
- 按钮尺寸：padding: 1px 4px, font-size: 11px

## AI 复现提示词

如果要让 AI 复现这个插件，可以使用以下提示词：

---

**提示词：创建 Obsidian 卢曼笔记导航插件**

请创建一个 Obsidian 插件，实现以下功能：

### 1. 编码系统

- 笔记 ID 使用字母起始（a, b, c），字母和数字交替表示层级
- 支持小数点表示更细分的层级（如 a1.1 在 a1a 之前）
- 使用 `-` 分隔 ID 和标题
- ID 正则：`^([a-z](?:\d+(?:\.\d+)?[a-z]*)*(?:\.\d+)?)(?:-.*)?$`

### 2. 视图功能

- 在侧边栏注册一个树形视图
- 按层级缩进显示（10px/层）
- 非顶层节点支持折叠/展开（SVG 三角图标，10px）
- 当前文件红色边框高亮，最近 3 个文件蓝色边框
- 顶部显示笔记总数

### 3. 交互功能

- 点击条目打开文件，点击折叠的条目则展开它
- 右键菜单：打开、新标签页打开、重命名、删除
- 悬浮按钮（从左到右）：
  - ← 反向缩进（提升层级）
  - → 缩进（降低层级到上一个兄弟的子节点）
  - - 添加子笔记
  - ✎ 重命名
- 拖放支持：条目间拖放、从文件浏览器拖放

### 4. ID 生成逻辑

```typescript
// 生成子 ID：根据父 ID 末尾字符决定
// 字母结尾 → 加数字 1，数字结尾 → 加字母 a
// 然后查找同级兄弟节点，递增 ID
getNextChildId(parentId, excludeFile?) {
  // 生成基础 ID，调用 getNextSiblingId 找到实际 ID
}

// 生成兄弟 ID：查找同级最大值 +1
getNextSiblingId(baseId, excludeFile?) {
  // 解析 baseId，找出父 ID
  // 查找所有同级文件，排除 excludeFile
  // 数字结尾：找最大数字 +1
  // 字母结尾：找最大字母 +1（z 后面是 aa）
}
```

### 5. 排序规则

- 逐部分比较 ID
- 小数点部分优先排在字母之前
- 同类型按数值/字母顺序

### 6. 样式设计

- 字体：使用 `var(--font-ui-smaller)`
- 折叠按钮：负左边距 -14px，不占用内容空间
- 悬浮按钮：绝对定位右侧，hover 显示
- 高亮：`.zk-item-active` 红色边框，`.zk-item-recent` 蓝色边框

### 7. 状态管理

- 折叠状态保存到插件设置 `collapsedIds: string[]`
- 监听文件变化（create, delete, rename, open）自动刷新

### 8. 文件结构

- `main.ts`：插件入口，注册视图，设置管理
- `view.ts`：视图类，实现所有 UI 和交互逻辑
- `utils.ts`：ID 解析、排序工具函数
- `styles.css`：样式定义
- TypeScript + esbuild 构建

请按照上述规范实现完整的插件代码。

---

## 开发环境

### 依赖

```json
{
  "obsidian": "latest",
  "@types/node": "^16.11.6",
  "esbuild": "0.17.3",
  "typescript": "5.0.4"
}
```

### 构建命令

```bash
npm run build    # 生产构建
npm run dev      # 开发模式（监听文件变化）
```

### 安装方式

1. 将插件文件夹复制到 `.obsidian/plugins/` 目录
2. 在 Obsidian 设置中启用插件
3. 通过命令面板打开：`打开卢曼笔记导航器`

## 使用场景

### 典型工作流

1. 创建顶层笔记：`a-主题A.md`, `b-主题B.md`
2. 添加子笔记：点击 + 按钮创建 `a1-子主题.md`
3. 细化层级：继续添加 `a1a-细节.md` 或 `a1.1-插入内容.md`
4. 重组结构：通过拖放或缩进/反向缩进调整笔记位置
5. 折叠管理：折叠不需要关注的分支，专注当前工作

### 编码策略

- **顶层**：按主题分类（a-工作, b-学习, c-生活）
- **第二层**：主题下的项目或大类（a1-项目 X, a2-项目 Y）
- **小数点**：快速插入笔记而不打乱现有结构（a1.1 插在 a1 和 a1a 之间）
- **深层级**：具体笔记内容（a1a-会议记录, a1b-设计文档）

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
