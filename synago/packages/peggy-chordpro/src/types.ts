export interface Directive {
  key: string
  value: string
}

export interface InlinePart {
  chord: string | null
  text: string
}

export interface Line {
  parts: InlinePart[]
}

export interface Paragraph {
  type: string
  lines: Line[]
}

export interface Song {
  type: "song"
  directives: Directive[]
  body: Paragraph[]
}
