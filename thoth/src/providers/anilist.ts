import type { SeriesMetadata, StaffMember } from "../types";
import type { MetadataProvider, SearchOptions } from "./types";

const ANILIST_API = "https://graphql.anilist.co";

const SEARCH_QUERY = `
query ($search: String, $format: MediaFormat) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: MANGA, format: $format, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      description(asHtml: false)
      genres
      tags { name rank }
      startDate { year month day }
      staff { edges { node { name { full } } role } }
      coverImage { large }
      siteUrl
      format
    }
  }
}
`;

const GET_BY_ID_QUERY = `
query ($id: Int) {
  Media(id: $id) {
    id
    title { romaji english native }
    description(asHtml: false)
    genres
    tags { name rank }
    startDate { year month day }
    staff { edges { node { name { full } } role } }
    coverImage { large }
    siteUrl
    format
  }
}
`;

function mapMedia(media: any): SeriesMetadata {
  return {
    id: media.id,
    title: {
      romaji: media.title?.romaji ?? undefined,
      english: media.title?.english ?? undefined,
      native: media.title?.native ?? undefined,
    },
    description: stripHtml(media.description ?? ""),
    genres: media.genres ?? [],
    tags: (media.tags ?? [])
      .filter((t: any) => t.rank >= 60)
      .slice(0, 10)
      .map((t: any) => t.name),
    startDate: media.startDate ?? undefined,
    staff: (media.staff?.edges ?? []).map((e: any) => ({
      name: e.node?.name?.full ?? "Unknown",
      role: e.role ?? "Unknown",
    })),
    coverImage: media.coverImage?.large ?? undefined,
    siteUrl: media.siteUrl ?? undefined,
    format: media.format ?? undefined,
  };
}

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

let lastRequestTime = 0;

async function rateLimitedFetch(
  query: string,
  variables: Record<string, unknown>
): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 700) {
    await new Promise((r) => setTimeout(r, 700 - elapsed));
  }
  lastRequestTime = Date.now();

  const res = await fetch(ANILIST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
      console.warn(`Rate limited. Waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return rateLimitedFetch(query, variables);
    }
    throw new Error(`AniList API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(
      `AniList query error: ${json.errors.map((e: any) => e.message).join(", ")}`
    );
  }
  return json.data;
}

export class AniListProvider implements MetadataProvider {
  async searchSeries(
    query: string,
    opts?: SearchOptions
  ): Promise<SeriesMetadata[]> {
    const variables: Record<string, unknown> = { search: query };
    if (opts?.format === "NOVEL") {
      variables.format = "NOVEL";
    }
    // For MANGA, don't set format to allow all manga-type results

    const data = await rateLimitedFetch(SEARCH_QUERY, variables);
    return (data.Page?.media ?? []).map(mapMedia);
  }

  async getSeriesById(id: number): Promise<SeriesMetadata | null> {
    const data = await rateLimitedFetch(GET_BY_ID_QUERY, { id });
    return data.Media ? mapMedia(data.Media) : null;
  }
}
