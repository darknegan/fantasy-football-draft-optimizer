/**
 * DraftLab UI Worker — Angular SPA via static assets; /api/* proxied to draftlab-api.
 * Invoked only for /api/* (see assets.run_worker_first in wrangler.jsonc).
 */
export default {
  async fetch(request, env): Promise<Response> {
    return env.API.fetch(request);
  },
} satisfies ExportedHandler<Env>;
