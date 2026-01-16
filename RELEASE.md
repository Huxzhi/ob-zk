# 发布指南

## 📦 文件结构说明

### 提交到 Git 的文件

```
ob-zk/
├── .gitignore              # Git 忽略规则
├── README.md               # 项目说明文档
├── manifest.json           # 插件元数据（必需）
├── package.json            # npm 依赖
├── package-lock.json       # 依赖锁定
├── tsconfig.json           # TypeScript 配置
├── esbuild.config.mjs      # 构建配置
├── version-bump.mjs        # 版本管理脚本
├── versions.json           # 版本兼容性
├── main.ts                 # 插件入口源码
├── view.ts                 # 视图源码
├── utils.ts                # 工具函数源码
└── styles.css              # 样式文件（必需）
```

### 不提交的文件（已在 .gitignore 中）

- `node_modules/` - npm 依赖包
- `main.js` - 编译输出（发布时才需要）
- `data.json` - 用户数据

## 🚀 发布流程

### 1. 更新 manifest.json

```bash
# 修改以下字段：
# - author: 你的名字
# - authorUrl: 你的 GitHub 主页
```

### 2. 初始化 Git 仓库

```bash
git init
git add .
git commit -m "Initial commit: Zettelkasten Navigator v1.0.0"
```

### 3. 推送到 GitHub

```bash
# 在 GitHub 上创建新仓库后
git remote add origin https://github.com/你的用户名/obsidian-zettelkasten-navigator.git
git branch -M main
git push -u origin main
```

### 4. 创建 Release

```bash
# 1. 编译插件
npm run build

# 2. 在 GitHub 上创建 Release (Tag: 1.0.0)
# 3. 上传以下文件到 Release：
#    - main.js
#    - manifest.json
#    - styles.css
```

### 5. 提交到 Obsidian 社区

向 [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 提交 PR

需要编辑两个文件：

1. `community-plugins.json` - 添加插件信息
2. `community-plugin-stats.json` - 添加初始统计

## 📋 发布前检查清单

- [ ] 更新 `manifest.json` 中的作者信息
- [ ] 确认 `README.md` 内容完整
- [ ] 运行 `npm run build` 成功编译
- [ ] 在本地 Obsidian 中测试插件功能
- [ ] 创建 GitHub 仓库
- [ ] 推送代码到 GitHub
- [ ] 创建 GitHub Release 并上传 main.js, manifest.json, styles.css
- [ ] 向 obsidian-releases 提交 PR

## 🔄 后续版本更新

```bash
# 1. 更新版本号
# 修改 manifest.json 中的 version
# 更新 versions.json

# 2. 提交更改
git add .
git commit -m "Release v1.1.0: 更新说明"
git tag 1.1.0
git push origin main --tags

# 3. 创建新的 Release
# 重新编译并上传 main.js, manifest.json, styles.css
```

## 💡 提示

- Release 的 tag 必须与 manifest.json 中的 version 一致
- 每次发布必须包含编译后的 main.js 文件
- styles.css 如果有更改也要包含在 Release 中
- manifest.json 每个版本都要上传
