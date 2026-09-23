import express, { type Express } from "express";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { Store, store } from "./dvy/store";
import { createAuthRouter, setEmailDelivery } from "./dvy/auth";
import { createCoreRouter } from "./dvy/core";
import {
  createAutomationRouter,
  createAutomationPublicRouter,
} from "./dvy/automation";
import { emailConfigured, sendAccountEmail } from "./dvy/email";

export function createApp(database: Store = store): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(), geolocation=()",
    );
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  setEmailDelivery(emailConfigured() ? sendAccountEmail : null);
  app.use("/api", router);
  app.use("/api", createAuthRouter(database));
  app.use("/api", createAutomationPublicRouter(database));
  app.use("/api", createCoreRouter(database));
  app.use("/api", createAutomationRouter(database));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "No se encontró esta operación." });
  });
  if (process.env.DVY_SERVE_STATIC !== "false") {
    const webRoot = fileURLToPath(
      new URL("../../mockup-sandbox/dist/", import.meta.url),
    );
    app.use(express.static(webRoot, { index: false }));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(webRoot, "index.html"));
    });
  }
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status < 600
          ? error.status
          : 500;
      if (status >= 500)
        logger.error(
          { errorType: error.name, code: error.code },
          "Request failed",
        );
      res
        .status(status)
        .json({
          error:
            status === 413
              ? "El archivo o texto supera el tamaño permitido."
              : status >= 500
                ? "No se pudo completar la operación. Vuelve a intentarlo."
                : error.message || "Revisa los datos e inténtalo de nuevo.",
        });
    },
  );
  return app;
}
export default createApp();
