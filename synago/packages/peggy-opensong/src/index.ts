import type { Song } from "./types.ts"

// @ts-expect-error - generated CJS module
import parser from "./generated.js"

export const parse = parser.parse as (input: string, options?: Record<string, unknown>) => Song
export const SyntaxError = parser.SyntaxError as new (message: string, expected: unknown[], found: unknown, location: unknown) => Error

export type { Song, HeaderEntry, InlineChord, ContentLine, SongSection } from "./types.ts"
