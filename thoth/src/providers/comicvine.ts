import type { SeriesMetadata, StaffMember } from "../types";
import type { MetadataProvider, SearchOptions } from "./types";

const COMICVINE_API = "https://comicvine.gamespot.com/api";
// ComicVine resource-type ids. A ComicVine "volume" (4050-) is a whole
// series/run; an "issue" (4000-) is a single volume within it. thoth matches
// the series to a ComicVine volume, then tags each parsed volume with the id of
// its corresponding issue.
const VOLUME_TYPE = "4050";
const ISSUE_TYPE = "4000";
const USER_AGENT = "thoth/0.1.0 (manga/LN metadata tagger)";

// Fields available on the search endpoint (people is only reliable on volume detail).
const SEARCH_FIELDS =
  "id,name,deck,description,start_year,publisher,image,site_detail_url";
const VOLUME_FIELDS = `${SEARCH_FIELDS},people`;
const ISSUE_FIELDS =
  "id,name,issue_number,cover_date,store_date,description,image,person_credits,site_detail_url,volume";

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

// Map ComicVine's free-form role strings (e.g. "writer", "artist, penciler") onto
// the role vocabulary the ComicInfo/OPF writers understand for author/artist.
function mapRole(role: string): string {
  const r = role.toLowerCase();
  const isWriter = r.includes("writer");
  const isArtist =
    r.includes("artist") || r.includes("penciler") || r.includes("penciller");
  if (isWriter && isArtist) return "Story & Art";
  if (isWriter) return "Story";
  if (isArtist) return "Art";
  return role;
}

function mapVolume(v: any): SeriesMetadata {
  const id = typeof v.id === "number" ? v.id : parseInt(String(v.id), 10);
  const year =
    v.start_year != null ? parseInt(String(v.start_year), 10) : undefined;

  const staff: StaffMember[] = Array.isArray(v.people)
    ? v.people.map((p: any) => ({
        name: p.name ?? "Unknown",
        role: mapRole(p.role ?? ""),
      }))
    : [];

  return {
    id,
    title: { english: v.name ?? undefined },
    description: stripHtml(v.description ?? v.deck ?? ""),
    genres: [],
    tags: [],
    startDate: year && !isNaN(year) ? { year } : undefined,
    staff,
    coverImage: v.image?.medium_url ?? v.image?.original_url ?? undefined,
    siteUrl: v.site_detail_url ?? undefined,
    format: "MANGA",
    comicvineId: `${VOLUME_TYPE}-${id}`,
    publisher: v.publisher?.name ?? undefined,
    provider: "comicvine",
  };
}

function parseCvDate(
  date?: string | null
): { year?: number; month?: number; day?: number } | undefined {
  if (!date) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return undefined;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

function mapIssue(iss: any): SeriesMetadata {
  const id = typeof iss.id === "number" ? iss.id : parseInt(String(iss.id), 10);
  const staff: StaffMember[] = Array.isArray(iss.person_credits)
    ? iss.person_credits.map((p: any) => ({
        name: p.name ?? "Unknown",
        role: mapRole(p.role ?? ""),
      }))
    : [];

  return {
    id,
    // Issue names are usually blank for manga; keep the parent series title.
    title: { english: iss.volume?.name ?? iss.name ?? undefined },
    description: stripHtml(iss.description ?? ""),
    genres: [],
    tags: [],
    startDate: parseCvDate(iss.store_date ?? iss.cover_date),
    staff,
    coverImage: iss.image?.medium_url ?? iss.image?.original_url ?? undefined,
    siteUrl: iss.site_detail_url ?? undefined,
    format: "MANGA",
    comicvineId: `${ISSUE_TYPE}-${id}`,
    publisher: iss.publisher?.name ?? undefined,
    provider: "comicvine",
  };
}

let lastRequestTime = 0;

async function cvFetch(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string
): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
  lastRequestTime = Date.now();

  const url = new URL(`${COMICVINE_API}/${endpoint}/`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!res.ok) {
    // 420 is ComicVine's legacy rate-limit status; 429 is standard.
    if (res.status === 429 || res.status === 420) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
      console.warn(`ComicVine rate limited. Waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return cvFetch(endpoint, params, apiKey);
    }
    throw new Error(`ComicVine API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  // ComicVine returns HTTP 200 with an error field; "OK" means success.
  if (json.error && json.error !== "OK") {
    // status_code 107 = rate limit exceeded.
    if (json.status_code === 107) {
      console.warn("ComicVine rate limit exceeded. Waiting 60s...");
      await new Promise((r) => setTimeout(r, 60000));
      return cvFetch(endpoint, params, apiKey);
    }
    throw new Error(`ComicVine query error: ${json.error}`);
  }
  return json;
}

export class ComicVineProvider implements MetadataProvider {
  constructor(private apiKey: string) {}

  async searchSeries(
    query: string,
    _opts?: SearchOptions
  ): Promise<SeriesMetadata[]> {
    // ComicVine has no manga/novel distinction; search the "volume" resource.
    const json = await cvFetch(
      "search",
      {
        query,
        resources: "volume",
        limit: "10",
        field_list: SEARCH_FIELDS,
      },
      this.apiKey
    );
    return (json.results ?? []).map(mapVolume);
  }

  async getSeriesById(id: string | number): Promise<SeriesMetadata | null> {
    const json = await cvFetch(
      `volume/${VOLUME_TYPE}-${id}`,
      { field_list: VOLUME_FIELDS },
      this.apiKey
    );
    return json.results ? mapVolume(json.results) : null;
  }

  // Resolve a single volume to its ComicVine issue within the matched series
  // (volume id), matching on issue_number.
  async getVolume(
    seriesId: string | number,
    volumeNumber: number
  ): Promise<SeriesMetadata | null> {
    const json = await cvFetch(
      "issues",
      {
        filter: `volume:${seriesId},issue_number:${volumeNumber}`,
        field_list: ISSUE_FIELDS,
        limit: "1",
      },
      this.apiKey
    );
    const results = json.results ?? [];
    return results.length > 0 ? mapIssue(results[0]) : null;
  }
}
