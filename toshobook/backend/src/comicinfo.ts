import { XMLParser } from "fast-xml-parser";
import { Effect, Schema, Struct } from "effect";
import { extractFileFromArchive } from "./utils.ts";

const ComicInfoSchema = Schema.Struct({
  ComicInfo: Schema.Struct({
    Title: Schema.String,
    Series: Schema.String,
  }).mapFields(Struct.map(Schema.optional)),
});

const parser = new XMLParser();

export const extractComicInfoFromArchive = (archivePath: string) => Effect.gen(function* () {
  const raw = yield* extractFileFromArchive(archivePath, "ComicInfo.xml");
  const obj = parser.parse(raw);
  return yield* Schema.decodeEffect(ComicInfoSchema)(obj);
});

