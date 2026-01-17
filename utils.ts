import { ZettelNode } from './view'

export interface ZettelId {
  id: string // 完整ID，如 "1a2" 或 "1a2.1"
  parts: string[] // ID的各个部分，如 ["1", "a", "2"] 或 ["1", "a", "2", "1"]
  level: number // 层级深度
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

  // 分解ID为各个组成部分（小数点只是分隔符，不作为独立部分）
  const parts: string[] = []

  // 使用正则分解整个ID，忽略点号
  // 连续字母作为一组，连续数字作为一组
  // 例如 "a1.1" 分解为 ["a", "1", "1"]
  // 例如 "aa1bb2" 分解为 ["aa", "1", "bb", "2"]
  const idPattern = /([a-z]+|\d+)/g
  let idMatch

  while ((idMatch = idPattern.exec(id)) !== null) {
    parts.push(idMatch[1])
  }

  // 计算层级：根据分解后的数组长度
  // - 顶层 (a, b): parts = [a], level = 0
  // - 第一层 (a1, a1.1): parts = [a, 1] 或 [a, 1, 1], level = 1 或 2
  // - 第二层 (a1a): parts = [a, 1, a], level = 2
  // - 第三层 (a1a2): parts = [a, 1, a, 2], level = 3
  // 规则: level = parts.length - 1
  const level = parts.length - 1

  return {
    id,
    parts,
    level: Math.max(0, level),
  }
}

/**
 * 判断 part 是否为数字（检查首字符，性能最优）
 */
export function isDigitPart(part: string): boolean {
  const firstChar = part.charCodeAt(0)
  return firstChar >= 48 && firstChar <= 57 // '0' = 48, '9' = 57
}

/**
 * 比较两个卢曼ID
 * 返回: -1 如果 a < b, 0 如果 a == b, 1 如果 a > b
 */
export function compareZettelIds(a: string[], b: string[]): number {
  const minLength = Math.min(a.length, b.length)

  for (let i = 0; i < minLength; i++) {
    const partA = a[i]
    const partB = b[i]

    const isDigitA = isDigitPart(partA)
    const isDigitB = isDigitPart(partB)

    // 数字比较
    if (isDigitA && isDigitB) {
      const numA = parseInt(partA)
      const numB = parseInt(partB)
      if (numA !== numB) {
        return numA - numB
      }
      continue
    }

    // 字母比较
    if (!isDigitA && !isDigitB) {
      if (partA !== partB) {
        return partA.localeCompare(partB)
      }
      continue
    }

    // 混合类型：数字优先于字母
    if (isDigitA && !isDigitB) {
      return -1
    }
    if (!isDigitA && isDigitB) {
      return 1
    }
  }

  // 如果所有部分都相同，较短的排在前面
  return a.length - b.length
}

/**
 * 获取下一个字母序列
 * a -> b, z -> aa, az -> ba, zz -> aaa
 */
export function getNextLetterSequence(letters: string): string | null {
  const chars = letters.split('')

  // 从最后一位开始递增
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] < 'z') {
      // 当前位可以递增
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
      return chars.join('')
    } else {
      // 当前位是 z，需要进位
      chars[i] = 'a'
    }
  }

  // 所有位都是 z，需要增加一位
  return 'a'.repeat(letters.length + 1)
}

/**
 * 智能拼接 parts 数组，相邻同类型元素间添加小数点
 * 使用数组 join 避免多次字符串拼接
 */
export function joinParts(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]

  const segments: string[] = [parts[0]]
  for (let i = 1; i < parts.length; i++) {
    const prevIsDigit = isDigitPart(parts[i - 1])
    const currIsDigit = isDigitPart(parts[i])

    // 如果相邻都是数字或都是字母，添加小数点
    if (prevIsDigit === currIsDigit) {
      segments.push('.')
    }
    segments.push(parts[i])
  }
  return segments.join('')
}

/**
 * 从排序后的节点数组中获取当前节点的最大直接子节点
 * @param sortedZettelNodes - 已排序的节点数组
 * @param currentNode - 当前节点
 * @returns 当前节点的最大子节点，如果没有则返回 null
 */
export function getMaxChild(
  sortedZettelNodes: ZettelNode[],
  currentNode: ZettelNode,
): ZettelNode | null {
  const targetLevel = currentNode.level + 1
  const currentId = joinParts(currentNode.parts)
  const currentLevel = currentNode.level
  let maxChild: ZettelNode | null = null

  // 找到当前节点在数组中的位置
  const currentIndex = sortedZettelNodes.findIndex(
    (node) => joinParts(node.parts) === currentId,
  )

  if (currentIndex === -1) {
    return null
  }

  // 从当前节点之后开始遍历
  for (let i = currentIndex + 1; i < sortedZettelNodes.length; i++) {
    const candidate = sortedZettelNodes[i]

    // 如果遇到层级小于等于当前节点的，说明已经离开当前节点的子树
    if (candidate.level <= currentLevel) {
      break
    }

    // 只考虑目标层级的节点
    if (candidate.level !== targetLevel) {
      continue
    }

    // 检查是否是当前节点的直接子节点
    const candidateParentId = joinParts(candidate.parts.slice(0, -1))
    if (candidateParentId === currentId) {
      // 因为数组已排序，后面的就是更大的
      maxChild = candidate
    }
  }

  return maxChild
}
