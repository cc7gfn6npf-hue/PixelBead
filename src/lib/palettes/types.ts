export interface BeadColor {
  code: string
  name: string
  rgb: [number, number, number]
}

export interface Palette {
  id: string
  name: string
  description: string
  colors: BeadColor[]
}
