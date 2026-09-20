import { Context, Effect, Layer } from "effect";
import { DatabaseService, type FilesTable } from "./Database.ts";
import type { Insertable } from "kysely";

type AddFilePayload = Insertable<FilesTable>;

export class FileRepository extends Context.Service<FileRepository>()("FileRepository", {
  make: Effect.gen(function*() {
    const { db } = yield* DatabaseService;

    const addFile = (file: AddFilePayload) => Effect.gen(function*() {
      const result = yield* Effect.promise(async () => {
        return await db
          .insertInto("file")
          .values(file)
          .onConflict(
            (oc) => oc
              .column("path")
              .doUpdateSet(file)
          )
          .returningAll()
          .executeTakeFirst();
      });

      return yield* result
        ? Effect.succeed(result)
        : Effect.fail(new Error());
    })

    return {
      addFile,
    } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

