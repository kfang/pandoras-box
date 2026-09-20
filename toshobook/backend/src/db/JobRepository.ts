import { Context, Effect, Layer } from "effect";
import { DatabaseService, type JobTable } from "./Database.ts";
import type { Insertable, Selectable } from "kysely";

type AddJobPayload = Insertable<JobTable>;

export class JobRepository extends Context.Service<JobRepository>()("JobRepository", {
  make: Effect.gen(function*() {
    const { db } = yield* DatabaseService;

    const addJob = (job: AddJobPayload): Effect.Effect<void> => Effect.promise(async () => {
      await db
        .insertInto("job")
        .values(job)
        .execute();
    });

    const finishJob = (id: number) => Effect.promise(async () => {
      await db.updateTable("job")
        .set({
          completed_at: Temporal.Now.instant().toString(),
          result: "success",
        })
        .where("id", "=", id)
        .execute();
    });

    const takeJob = (): Effect.Effect<Selectable<JobTable> | undefined> => Effect.gen(function*() {
      const now = Temporal.Now.instant();
      const timeout = { minutes: 5 };

      return yield* Effect.promise(() => db.updateTable("job")
        .set({ taken_at: now.toString() })
        .where((eb) =>
          eb("id", "=", eb
            .selectFrom("job")
            .select("id")
            .where("result", "is", null)
            .where((eb2) =>
              eb2.or([
                eb2("taken_at", "is", null),
                eb2("taken_at", "<", now.subtract(timeout).toString()),
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

    return {
      addJob,
      finishJob,
      takeJob,
    } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

