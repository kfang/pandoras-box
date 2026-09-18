import { Context, Effect, Layer } from "effect";
import { DatabaseService, type JobTable } from "./Database.ts";
import type { Insertable, Selectable } from "kysely";

interface JobBase {
  readonly id: number;
  readonly created_at: Date;

  readonly taken_at?: string;
  readonly completed_at?: string;
  readonly result?: "failure" | "success",
  readonly error?: string;
}

interface ScanImportJob extends JobBase {
  readonly job_key: "scan_import"
  readonly job_kind: "SCAN_IMPORT";
  readonly payload: {};
}

interface CalculateFilehashJob extends JobBase {
  readonly job_key: `calculate_file_hash:${string}`
  readonly job_kind: "CALCULATE_FILE_HASH";
  readonly payload: {};
}

type Job = ScanImportJob | CalculateFilehashJob;

type AddJobPayload = Insertable<JobTable>;

export class JobRepository extends Context.Service<
  JobRepository,
  {
    readonly addJob: (job: AddJobPayload) => Effect.Effect<void>;
    readonly deleteJob: (id: number) => Effect.Effect<void>;
    readonly takeJob: () => Effect.Effect<Selectable<JobTable> | undefined>;
  }
>()("JobRepository") { }

export const JobRepositoryLive = Layer.effect(
  JobRepository,
  Effect.gen(function*() {
    const { db } = yield* DatabaseService;

    const addJob = (job: AddJobPayload): Effect.Effect<void> => Effect.promise(async () => {
      await db
        .insertInto("job")
        .values(job)
        .execute();
    });

    const takeJob = (): Effect.Effect<Selectable<JobTable> | undefined> => Effect.gen(function*() {
      const cutoff = Temporal.Now.instant().subtract({ minutes: 5 }).toString();
      return yield* Effect.promise(() => db.updateTable("job")
        .set({ taken_at: new Date().toISOString() })
        .where((eb) =>
          eb("id", "=", eb
            .selectFrom("job")
            .select("id")
            .where((eb2) =>
              eb2.or([
                eb2("taken_at", "is", null),
                eb2("taken_at", "<", cutoff),
              ])
            )
            .orderBy("created_at", "asc")
            .limit(1)
          )
        )
        .returningAll()
        .executeTakeFirst()
      );
    });

    const deleteJob = (id: number) => Effect.promise(async () => {
      const r = await db
        .deleteFrom("job")
        .where("id", "=", id)
        .execute();

      console.log(r);
    });

    return {
      addJob,
      deleteJob,
      takeJob,
    };
  }),
)
