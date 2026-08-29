import { Router, type IRouter } from "express";
import healthRouter from "./health";

const router: IRouter = Router();

// Business data is now accessed by the web client through Supabase Auth + RLS.
// Keep this server limited to health/diagnostic routes so the old Drizzle
// handlers cannot bypass tenant isolation.
router.use(healthRouter);

export default router;
