export type { BeadColor, Palette } from './types'
export { mard221Palette } from './mard221'
export { mard291Palette } from './mard291'

import { mard221Palette } from './mard221'
import { mard291Palette } from './mard291'
import type { Palette } from './types'

export const allPalettes: Palette[] = [mard221Palette, mard291Palette]

export function getPalette(id: string): Palette | undefined {
  return allPalettes.find((p) => p.id === id)
}
