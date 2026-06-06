import { describe, it, expect } from "vitest"
import { parse } from "../src/index.ts"


describe("OpenSong parser", () => {
  it("parses a header", () => {
    const result = parse("[TITLE]Amazing Grace\n")
    expect(result.header).toContainEqual({ key: "title", value: "Amazing Grace" })
  })

  it("parses a verse with chord lines", () => {
    const input = "[TITLE]Test\n\n[V1]\n[G]Amazing [C]grace\n"
    const result = parse(input)
    expect(result.body).toHaveLength(1)
    expect(result.body[0]?.type).toBe("v1")
  })

  it("parses empty input gracefully", () => {
    const result = parse("")
    expect(result).toBeDefined()
  })
})
