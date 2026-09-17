import { Context, Effect, Layer, Option } from "effect";
import { DatabaseService } from "./Database.ts";

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
type AddJobPayload = Pick<Job, "job_key" | "job_kind" | "payload">;

export class JobRepository extends Context.Service<
  JobRepository,
  {
    readonly addJob: (job: AddJobPayload) => Effect.Effect<void>;
    readonly takeJob: () => Effect.Effect<Option.Option<Job>>;
  }
>()("JobRepository") { }

export const JobRepositoryLive = Layer.effect(
  JobRepository,
  Effect.gen(function* () {
    const { db } = yield* DatabaseService;

    const addJob = (job: AddJobPayload) => Effect.promise(() => {
      return db
        .insertInto("job")
        .values({
          job_key: job.job_key,
          job_kind: job.job_kind,
          payload: JSON.stringify(job.payload),
          created_at: new Date().toISOString(),
        })
        .execute();
    });

    const takeJob = (): Effect.Effect<Option.Option<Job>> => Effect.gen(function* () {
      const cutoff = Temporal.Now.instant().subtract({ minutes: 15 }).toString();
      const job = yield* Effect.promise(() => db.updateTable("job")
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
      return job ? Option.some<Job>({
        id: job.id,
        job_key: job.job_key as any,
        job_kind: job.job_kind as any,
        payload: JSON.parse(job.payload) as any,
        created_at: new Date(job.created_at),
        taken_at: job.taken_at,
        completed_at: job.completed_at,
        result: job.result,
        error: job.error,
      }) : Option.none<Job>();
    });

    return {
      addJob,
      takeJob,
    };
  }),
)
