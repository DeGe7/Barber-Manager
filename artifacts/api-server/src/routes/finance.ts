import { Router } from "express";
import { db, expenses, incomes } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

// ─── Expenses ─────────────────────────────────────────────────────────────────

router.get("/expenses", async (_req, res, next) => {
  try {
    if (isOperational(getAccess(_req).role)) { res.status(403).json({ error: "Financeiro disponível apenas para gestão" }); return; }
    const rows = await db.select().from(expenses).orderBy(expenses.date);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/expenses", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Financeiro disponível apenas para gestão" }); return; }
    const [row] = await db.insert(expenses).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/expenses/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Financeiro disponível apenas para gestão" }); return; }
    await db.delete(expenses).where(eq(expenses.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Incomes ──────────────────────────────────────────────────────────────────

router.get("/incomes", async (_req, res, next) => {
  try {
    if (isOperational(getAccess(_req).role)) { res.status(403).json({ error: "Financeiro disponível apenas para gestão" }); return; }
    const rows = await db.select().from(incomes).orderBy(incomes.date);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/incomes", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Financeiro disponível apenas para gestão" }); return; }
    const [row] = await db.insert(incomes).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/incomes/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Financeiro disponível apenas para gestão" }); return; }
    await db.delete(incomes).where(eq(incomes.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
