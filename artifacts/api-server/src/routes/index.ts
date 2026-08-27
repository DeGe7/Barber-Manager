import { Router, type IRouter } from "express";
import healthRouter from "./health";
import professionalsRouter from "./professionals";
import appointmentsRouter from "./appointments";
import blocksRouter from "./blocks";
import clientsRouter from "./clients";
import productsRouter from "./products";
import financeRouter from "./finance";
import prothesisSalesRouter from "./prothesis-sales";
import mentoriaSessionsRouter from "./mentoria-sessions";
import plansRouter from "./plans";
import configRouter from "./config";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/professionals", professionalsRouter);
router.use("/appointments", appointmentsRouter);
router.use("/blocks", blocksRouter);
router.use("/clients", clientsRouter);
router.use("/products", productsRouter);
router.use("/", financeRouter);
router.use("/prothesis-sales", prothesisSalesRouter);
router.use("/mentoria-sessions", mentoriaSessionsRouter);
router.use("/", plansRouter);
router.use("/config", configRouter);

export default router;
