import type { SeriesMetadata, StaffMember } from "../types";
import type { MetadataProvider, SearchOptions } from "./types";

const RANOBEDB_API = "https://ranobedb.org/api/v0";
const RANOBEDB_IMAGE = "https://images.ranobedb.org/";
const USER_AGENT = "thoth/0.1.0 (manga/LN metadata tagger)";

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

function titleCase(s: string): string {
  return s.replace(/\b(\w)(\w*)/g, (_, a, b) => a.toUpperCase() + b.toLowerCase());
}

// RanobeDB dates are integers of the form YYYYMMDD (and sometimes YYYY or YYYYMM).
function parseRdbDate(
  n?: number | null
): { year?: number; month?: number; day?: number } | undefined {
  if (!n) return undefined;
  let d = n;
  if (d < 9999) d = d * 10000 + 101;
  else if (d < 999999) d = d * 100 + 1;
  const year = Math.floor(d / 10000);
  const month = Math.floor(d / 100) % 100;
  const day = d % 100;
  if (year < 1) return undefined;
  return { year, month, day };
}

function mapRole(roleType: string): string {
  const r = (roleType ?? "").toLowerCase();
  if (r === "author") return "Story";
  if (r === "artist" || r === "illustrator") return "Art";
  return roleType || "Unknown";
}

function mapStaff(staff: any[]): StaffMember[] {
  return (staff ?? [])
    .filter((s) =>
      ["author", "artist", "illustrator"].includes(
        (s.role_type ?? "").toLowerCase()
      )
    )
    .map((s) => ({
      name: s.romaji ?? s.name ?? "Unknown",
      role: mapRole(s.role_type ?? ""),
    }));
}

// RanobeDB lists publishers/imprints for every language edition; prefer the
// English publisher (imprint entries like "Seven Seas Siren" are noisier than
// the parent publisher) since thoth tags English-language releases.
function pickPublisher(publishers: any[]): string | undefined {
  const list = publishers ?? [];
  const english = list.filter((p) => p.lang === "en" && p.publisher_type === "publisher");
  if (english.length > 0) return english[0].name;
  const anyPublisher = list.find((p) => p.publisher_type === "publisher");
  return anyPublisher?.name ?? list[0]?.name;
}

function mapTags(tags: any[]): { genres: string[]; tags: string[] } {
  const genres: string[] = [];
  const other: string[] = [];
  for (const t of tags ?? []) {
    const type = t.ttype ?? t.type;
    if (type === "genre") genres.push(titleCase(t.name));
    else if (t.name) other.push(t.name);
  }
  return { genres, tags: other.slice(0, 10) };
}

// A RanobeDB "series" object (from /series search or /series/<id> detail).
function mapSeries(s: any): SeriesMetadata {
  const { genres, tags } = mapTags(s.tags ?? []);
  return {
    id: s.id,
    title: {
      english: s.title ?? undefined,
      romaji: s.romaji_orig ?? s.romaji ?? undefined,
      native: s.title_orig ?? undefined,
    },
    description: stripHtml(s.description ?? s.book_description ?? ""),
    genres,
    tags,
    startDate: parseRdbDate(s.c_start_date ?? s.start_date),
    staff: mapStaff(s.staff ?? []),
    coverImage: s.book?.image?.filename
      ? RANOBEDB_IMAGE + s.book.image.filename
      : undefined,
    siteUrl: `https://ranobedb.org/series/${s.id}`,
    format: "NOVEL",
    // A series id is not a book id; ranobedbId is set per-volume from the book.
    publisher: pickPublisher(s.publishers),
    provider: "ranobedb",
  };
}

// A RanobeDB "book" entry (a single volume), enriched with series-level fields.
function mapBook(book: any, series: any): SeriesMetadata {
  const { genres, tags } = mapTags(series.tags ?? []);
  return {
    id: book.id,
    // Use the series-level title (without a volume suffix); the writers append
    // "Vol. N" themselves. The book title already ends in "Vol. N", which would
    // otherwise double up.
    title: {
      english: series.title ?? undefined,
      romaji: series.romaji_orig ?? series.romaji ?? undefined,
      native: series.title_orig ?? undefined,
    },
    description: stripHtml(
      book.description ?? series.description ?? series.book_description ?? ""
    ),
    genres,
    tags,
    startDate: parseRdbDate(book.c_release_dates?.en ?? book.c_release_date),
    staff: mapStaff(series.staff ?? []),
    coverImage: book.image?.filename
      ? RANOBEDB_IMAGE + book.image.filename
      : undefined,
    siteUrl: `https://ranobedb.org/book/${book.id}`,
    format: "NOVEL",
    ranobedbId: String(book.id),
    publisher: pickPublisher(series.publishers),
    provider: "ranobedb",
  };
}

let lastRequestTime = 0;

async function rdbFetch(pathAndQuery: string): Promise<any> {
  // RanobeDB allows ~60 requests/minute; keep >1s between requests.
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastRequestTime = Date.now();

  const res = await fetch(`${RANOBEDB_API}${pathAndQuery}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
      console.warn(`RanobeDB rate limited. Waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return rdbFetch(pathAndQuery);
    }
    throw new Error(`RanobeDB API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export class RanobeDbProvider implements MetadataProvider {
  // Per-run cache of /series/<id> responses so per-volume resolution doesn't
  // refetch the same series once for every volume.
  private seriesDetailCache = new Map<string, any>();

  async searchSeries(
    query: string,
    _opts?: SearchOptions
  ): Promise<SeriesMetadata[]> {
    const data = await rdbFetch(
      `/series?q=${encodeURIComponent(query)}&limit=10`
    );
    return (data.series ?? []).map(mapSeries);
  }

  async getSeriesById(id: string | number): Promise<SeriesMetadata | null> {
    const s = await this.getSeriesDetail(id);
    return s ? mapSeries(s) : null;
  }

  async getVolume(
    seriesId: string | number,
    volumeNumber: number
  ): Promise<SeriesMetadata | null> {
    const series = await this.getSeriesDetail(seriesId);
    if (!series) return null;

    const books: any[] = Array.isArray(series.books) ? series.books : [];
    // Prefer main-line volumes; fall back to all if none are typed.
    const mains = books.filter((b) => (b.book_type ?? "main") === "main");
    const pool = mains.length > 0 ? mains : books;

    const pick =
      pool.find((b) => b.sort_order === volumeNumber) ?? pool[volumeNumber - 1];
    return pick ? mapBook(pick, series) : null;
  }

  private async getSeriesDetail(id: string | number): Promise<any | null> {
    const key = String(id);
    if (this.seriesDetailCache.has(key)) return this.seriesDetailCache.get(key);
    const data = await rdbFetch(`/series/${id}`);
    const series = data.series ?? null;
    if (series) this.seriesDetailCache.set(key, series);
    return series;
  }
}
