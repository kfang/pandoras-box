import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "./Database.ts";

export class JobRepository extends Context.Service<
  JobRepository,
  {
    readonly addJob: (params: unknown) => Effect.Effect<unknown>;
  }
>()("JobRepository") { }

export const JobRepositoryLive = Layer.effect(
  JobRepository,
  Effect.gen(function* () {
    const { db } = yield* DatabaseService;

    const addJob = () => {
      return Effect.promise(() => {
        return db.selectFrom("job")
          .where("completed_at", "is", null)
          .where((eb) => {
            return eb.or([
              eb("taken_at", "is", null),
              eb("taken_at", "<", "")
            ])
          })
          .selectAll()
          .executeTakeFirst();
      });
    }

    return {
      addJob,
    };
  }),
)
