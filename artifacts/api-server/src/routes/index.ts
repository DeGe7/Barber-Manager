import { Router, type IRouter } from "express";
import healthRouter from "./health";
import googleCalendarRouter from "./google-calendar";
import invitationEmailRouter from "./invitation-email";
import devAdminProvisioningRouter from "./dev-admin-provisioning";

const router: IRouter = Router();

// Business data is now accessed by the web client through Supabase Auth + RLS.
// Keep this server limited to health/diagnostic routes so the old Drizzle
// handlers cannot bypass tenant isolation.
router.use(healthRouter);
router.use(googleCalendarRouter);
router.use(invitationEmailRouter);
router.use(devAdminProvisioningRouter);

export default router;
