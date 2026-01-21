/**
 * 从索引生成字母序列
 * 0 -> a, 1 -> b, ..., 25 -> z, 26 -> aa, 27 -> ab, ...
 */
export function getLetterSequenceFromIndex(index: number): string {
  if (index < 0) {
    return 'a'
  }

  let result = ''
  let remaining = index

  do {
    const remainder = remaining % 26
    result = String.fromCharCode(97 + remainder) + result
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)

  return result
}
