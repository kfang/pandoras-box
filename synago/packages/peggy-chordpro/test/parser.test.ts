import { describe, it, expect } from "vitest"
import { parse } from "../src/index.ts"


describe("ChordPro parser", () => {
  it("parses a directive", () => {
    const result = parse("{title: Amazing Grace}\n")
    expect(result.directives).toContainEqual({ key: "title", value: "Amazing Grace" })
  })

  it("parses a verse with inline chords", () => {
    const input = "{title: Test}\n\n[G]Ama[C]zing grace\n"
    const result = parse(input)
    expect(result.body).toHaveLength(1)
  })

  it("parses empty input gracefully", () => {
    const result = parse("")
    expect(result).toBeDefined()
  })
})
