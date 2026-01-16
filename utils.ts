export interface ZettelId {
  id: string // 完整ID，如 "1a2" 或 "1a2.1"
  parts: string[] // ID的各个部分，如 ["1", "a", "2"] 或 ["1", "a", "2", ".", "1"]
  level: number // 层级深度
  numeric: number[] // 数字部分用于排序
  alpha: string[] // 字母部分用于排序
}

/**
 * 解析卢曼笔记ID
 * 支持格式：
 * - a, b, c (顶层)
 * - a1, a2, a3 (第一层子笔记)
 * - a1a, a1b, a1c (第二层子笔记)
 * - a1b2, a1b3 (继续分支)
 * - a1b.1, a1b.2 (使用点号的深层笔记)
 * - a1b2.34-我的笔记 (使用-分隔ID和标题)
 */
export function parseZettelId(filename: string): ZettelId | null {
  // 移除文件扩展名
  const name = filename.replace(/\.md$/, '')

  // 匹配卢曼编号模式（支持用-分隔ID和标题）
  // 支持: a, a1, a1b, a1b2, a1b.1, a1b.1a, a1b2.34-标题 等
  const pattern = /^([a-z](?:\d+(?:\.\d+)?[a-z]*)*(?:\.\d+)?)(?:-.*)?$/
  const match = name.match(pattern)

  if (!match || !match[1]) {
    return null
  }

  const id = match[1]

  // 分解ID为各个组成部分
  const parts: string[] = []
  const numeric: number[] = []
  const alpha: string[] = []

  // 处理点号分隔的部分
  const segments = id.split('.')

  for (const segment of segments) {
    // 使用正则分解每个段
    // 例如 "a1b2" 分解为 ["a", "1", "b", "2"]
    const segmentPattern = /([a-z]|\d+)/g
    let segmentMatch

    while ((segmentMatch = segmentPattern.exec(segment)) !== null) {
      const part = segmentMatch[1]
      parts.push(part)

      if (/\d+/.test(part)) {
        numeric.push(parseInt(part))
        alpha.push('')
      } else {
        alpha.push(part)
      }
    }

    // 如果不是最后一个段，添加点号
    if (segments.indexOf(segment) < segments.length - 1) {
      parts.push('.')
    }
  }

  // 计算层级：
  // - 顶层 (a, b): level = 0
  // - 第一层 (a1, a2): level = 1 (字母→数字，切换1次)
  // - a1.1: level = 2 (字母→数字→小数点，2次切换)
  // - a1a: level = 2 (字母→数字→字母，2次切换)
  // - a1a2: level = 3 (字母→数字→字母→数字，3次切换)
  // 规则: 数字和字母切换增加层级，小数点也增加层级
  let level = 0
  let lastType = 'letter' // 'letter' 或 'digit'

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part === '.') {
      // 遇到小数点，层级+1
      level++
      continue
    }

    if (/\d+/.test(part)) {
      // 数字部分
      if (lastType === 'letter') {
        // 从字母切换到数字，层级+1
        level++
      }
      lastType = 'digit'
    } else {
      // 字母部分
      if (i > 0 && lastType === 'digit') {
        // 从数字切换到字母，层级+1
        level++
      }
      lastType = 'letter'
    }
  }

  return {
    id,
    parts,
    level: Math.max(0, level),
    numeric,
    alpha,
  }
}

/**
 * 比较两个卢曼ID
 * 返回: -1 如果 a < b, 0 如果 a == b, 1 如果 a > b
 */
export function compareZettelIds(a: ZettelId, b: ZettelId): number {
  const minLength = Math.min(a.parts.length, b.parts.length)

  for (let i = 0; i < minLength; i++) {
    const partA = a.parts[i]
    const partB = b.parts[i]

    // 点号处理：点号优先（排在前面）
    if (partA === '.' && partB === '.') continue
    if (partA === '.') return -1 // A是点号，排在前面
    if (partB === '.') return 1 // B是点号，排在前面

    // 数字比较
    if (/^\d+$/.test(partA) && /^\d+$/.test(partB)) {
      const numA = parseInt(partA)
      const numB = parseInt(partB)
      if (numA !== numB) {
        return numA - numB
      }
      continue
    }

    // 字母比较
    if (/^[a-z]$/.test(partA) && /^[a-z]$/.test(partB)) {
      if (partA !== partB) {
        return partA.localeCompare(partB)
      }
      continue
    }

    // 混合类型：数字优先于字母
    if (/^\d+$/.test(partA) && /^[a-z]$/.test(partB)) {
      return -1
    }
    if (/^[a-z]$/.test(partA) && /^\d+$/.test(partB)) {
      return 1
    }
  }

  // 如果所有部分都相同，较短的排在前面
  return a.parts.length - b.parts.length
}

/**
 * 对卢曼笔记进行排序
 */
export function sortZettels(
  zettels: Array<{ file: any; parsed: ZettelId }>,
  order: 'asc' | 'desc' = 'asc',
): Array<{ file: any; parsed: ZettelId }> {
  const sorted = [...zettels].sort((a, b) => {
    return compareZettelIds(a.parsed, b.parsed)
  })

  return order === 'desc' ? sorted.reverse() : sorted
}

/**
 * 获取父笔记ID
 */
export function getParentId(id: string): string | null {
  const parsed = parseZettelId(id)
  if (!parsed || parsed.parts.length <= 1) {
    return null
  }

  // 移除最后一个字母或数字
  const parentParts = [...parsed.parts]
  parentParts.pop()

  // 如果最后是点号，也移除
  if (parentParts[parentParts.length - 1] === '.') {
    parentParts.pop()
  }

  return parentParts.join('')
}

/**
 * 检查是否为有效的卢曼ID
 */
export function isValidZettelId(id: string): boolean {
  return parseZettelId(id) !== null
}

/**
 * 生成下一个兄弟笔记ID
 */
export function getNextSiblingId(id: string): string | null {
  const parsed = parseZettelId(id)
  if (!parsed || parsed.parts.length === 0) {
    return null
  }

  const lastPart = parsed.parts[parsed.parts.length - 1]

  // 如果最后是数字
  if (/^\d+$/.test(lastPart)) {
    const num = parseInt(lastPart)
    const newParts = [...parsed.parts]
    newParts[newParts.length - 1] = (num + 1).toString()
    return newParts.join('')
  }

  // 如果最后是字母
  if (/^[a-z]$/.test(lastPart)) {
    const nextChar = String.fromCharCode(lastPart.charCodeAt(0) + 1)
    if (nextChar <= 'z') {
      const newParts = [...parsed.parts]
      newParts[newParts.length - 1] = nextChar
      return newParts.join('')
    }
  }

  return null
}
