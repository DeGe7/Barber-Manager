import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const sendHealth = (_req: Request, res: Response) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
};

// The artifact preview and deployment probes request /api, while the
// production startup check uses /api/healthz. Keep both process-only so
// liveness checks never consume a Supabase/PostgreSQL connection.
router.get("/", sendHealth);
router.get("/healthz", sendHealth);

export default router;
