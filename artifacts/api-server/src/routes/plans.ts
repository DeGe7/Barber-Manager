import { Router } from "express";
import { db, subscriptionPlans, subscribers } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// ─── Plans ────────────────────────────────────────────────────────────────────

router.get("/plans", async (_req, res, next) => {
  try {
    const rows = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.name);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/plans", async (req, res, next) => {
  try {
    const [row] = await db.insert(subscriptionPlans).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/plans/:id", async (req, res, next) => {
  try {
    const [row] = await db.update(subscriptionPlans).set(req.body).where(eq(subscriptionPlans.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/plans/:id", async (req, res, next) => {
  try {
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Subscribers ──────────────────────────────────────────────────────────────

router.get("/subscribers", async (_req, res, next) => {
  try {
    const rows = await db.select().from(subscribers).orderBy(subscribers.name);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/subscribers", async (req, res, next) => {
  try {
    const [row] = await db.insert(subscribers).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/subscribers/:id", async (req, res, next) => {
  try {
    const [row] = await db.update(subscribers).set(req.body).where(eq(subscribers.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/subscribers/:id", async (req, res, next) => {
  try {
    await db.delete(subscribers).where(eq(subscribers.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
