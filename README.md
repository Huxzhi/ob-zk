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
   - `a` → level 1
   - `a1` → level 2
   - `a1a` → level 3
   - `a1.1` → level 3
   - `a1.1a` → level 4

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
- 负左边距：-10px，避免影响内容位置

#### 悬浮按钮

- 绝对定位在右侧
- 鼠标悬浮时显示（`display: none` → `display: flex`）
- 按钮尺寸：padding: 1px 4px, font-size: 10px
