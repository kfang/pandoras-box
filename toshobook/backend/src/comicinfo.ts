import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const parser = new XMLParser();

const stringOrArrayOptional = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      return val.split(",").map((str) => str.trim()).filter(Boolean);
    }
    return val;
  },
  z.array(z.string()).default([]),
);

const CreatorRole = z.enum([
  "Writer",
  "Penciller",
  "Inker",
  "Colorist",
  "Letterer",
  "CoverArtist",
  "Editor",
  "Translator",
]);

export const PageType = z.enum([
  "FrontCover",
  "InnerCover",
  "Roundup",
  "Story",
  "Advertisement",
  "Editorial",
  "Letters",
  "Preview",
  "BackCover",
  "Other",
  "Delete",
]);

export const PageSchema = z.object({
  Image: z.string().optional(),
  Type: PageType.optional(),
  DoublePage: z.boolean().optional(),
  ImageSize: z.number().int().optional(),
  Key: z.string().optional(),
  Bookmark: z.string().optional(),
  ImageWidth: z.number().int().optional(),
  ImageHeight: z.number().int().optional(),
});

export const ComicInfoSchema = z.object({
  ComicInfo: z
    .object({
      Title: z.string().optional(),
      Series: z.string().optional(),
      Number: z.coerce.string().optional(),
      Count: z.string().optional(),
      Volume: z.string().optional(),
      AlternateSeries: z.string().optional(),
      AlternateNumber: z.string().optional(),
      AlternateCount: z.string().optional(),
      Summary: z.string().optional(),
      Notes: z.string().optional(),
      Year: z.coerce.string().optional(),
      Month: z.string().optional(),
      Day: z.string().optional(),
      Publisher: z.string().optional(),
      Imprint: z.string().optional(),
      Genre: stringOrArrayOptional,
      Tags: stringOrArrayOptional,
      Web: z.string().optional(),
      PageCount: z.string().optional(),
      LanguageISO: z.string().optional(),
      Format: z.string().optional(),
      BlackAndWhite: z.string().optional(),
      Manga: z.string().optional(),
      Characters: z.string().optional(),
      Teams: z.string().optional(),
      Locations: z.string().optional(),
      MainCharacterOrTeam: z.string().optional(),
      ScanInformation: z.string().optional(),
      StoryArc: z.string().optional(),
      StoryArcNumber: z.string().optional(),
      SeriesGroup: z.string().optional(),
      AgeRating: z.string().optional(),
      CommunityRating: z.string().optional(),
      Review: z.string().optional(),
      GTIN: z.string().optional(),
      Creators: z
        .array(
          z.object({
            Creator: z.object({
              _attr: z
                .object({ Role: CreatorRole })
                .optional()
                .or(z.string().optional()),
              $: z.string(),
            }),
          })
        )
        .optional(),
      Pages: z.array(PageSchema).optional(),
    })
    .loose(),
});

type ComicInfoObj = z.infer<typeof ComicInfoSchema>;

export class ComicInfo {
  public static parse(rawXml: string): ComicInfo | undefined {
    const parsed = parser.parse(rawXml);
    const result = ComicInfoSchema.safeParse(parsed);

    if (!result.success) {
      console.log(parsed);
      console.error("Validation failed:", result.error.issues);
      return undefined;
    }

    return new ComicInfo(result.data);
  }

  readonly #obj: ComicInfoObj;

  private constructor(obj: ComicInfoObj) {
    this.#obj = obj;
  }
}
