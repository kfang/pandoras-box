import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import type { SongService } from "../services/song-service.ts"
import type { SongCreate, SongUpdate } from "@synago/common/src/types.ts"

export class SongController {
  constructor(private svc: SongService) {}

  register(app: FastifyInstance): void {
    app.get("/api/songs", this.list.bind(this))
    app.get("/api/songs/:id", this.get.bind(this))
    app.post("/api/songs", this.create.bind(this))
    app.put("/api/songs/:id", this.update.bind(this))
    app.delete("/api/songs/:id", this.delete.bind(this))
  }

  private async list(_req: FastifyRequest, reply: FastifyReply) {
    const songs = await this.svc.list()
    return reply.send(songs)
  }

  private async get(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const song = await this.svc.get(req.params.id)
    if (!song) return reply.code(404).send({ error: "Not found" })
    return reply.send(song)
  }

  private async create(req: FastifyRequest<{ Body: SongCreate }>, reply: FastifyReply) {
    try {
      const song = await this.svc.create(req.body)
      return await reply.code(201).send(song)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  }

  private async update(
    req: FastifyRequest<{ Params: { id: string }; Body: SongUpdate }>,
    reply: FastifyReply,
  ) {
    const song = await this.svc.update(req.params.id, req.body)
    if (!song) return reply.code(404).send({ error: "Not found" })
    return reply.send(song)
  }

  private async delete(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const deleted = await this.svc.delete(req.params.id)
    if (!deleted) return reply.code(404).send({ error: "Not found" })
    return reply.code(204).send()
  }
}
