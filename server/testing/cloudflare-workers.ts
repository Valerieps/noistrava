// Stand-in for the `cloudflare:workers` module under Node, so tests build the real Group Durable
// Object. vite.config.ts aliases the module to this file in tests only.
export class DurableObject<Env = unknown> {
  constructor(
    protected readonly ctx: DurableObjectState,
    protected readonly env: Env,
  ) {}
}
