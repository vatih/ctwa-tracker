import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { env } from "./env";
import { type AppEnv, sessionMiddleware } from "./lib/context";
import { meRoutes } from "./routes/me";
import { capiLogRoutes } from "./routes/capi-logs";
import { eventSettingRoutes } from "./routes/event-settings";
import { eventRoutes } from "./routes/events";
import { leadRoutes } from "./routes/leads";
import { panelRoutes } from "./routes/panel";
import { pixelRoutes } from "./routes/pixels";
import { triggerRoutes } from "./routes/triggers";
import { waAccountRoutes } from "./routes/wa-accounts";
import { recoverStuckEvents } from "./services/capi";
import { startRealtime } from "./services/realtime";
import { registerTriggerRunner } from "./services/trigger-runner";

const api = new Hono<AppEnv>()
  .use(sessionMiddleware)
  .route("/me", meRoutes)
  .route("/wa-accounts", waAccountRoutes)
  .route("/leads", leadRoutes)
  .route("/events", eventRoutes)
  .route("/event-settings", eventSettingRoutes)
  .route("/pixels", pixelRoutes)
  .route("/capi-logs", capiLogRoutes)
  .route("/triggers", triggerRoutes)
  .route("/panel", panelRoutes);

export type ApiType = typeof api;

const app = new Hono<AppEnv>();
app.use(logger());
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// SPA statis hasil build Vite
app.use("/*", serveStatic({ root: env.WEB_DIST }));
app.get("*", serveStatic({ path: `${env.WEB_DIST}/index.html` }));

registerTriggerRunner();
await startRealtime();
await recoverStuckEvents();
setInterval(() => void recoverStuckEvents().catch(console.error), 5 * 60_000);

// idleTimeout tinggi agar stream SSE (QR, realtime) tidak diputus Bun
export default { port: env.PORT, fetch: app.fetch, idleTimeout: 255 };
