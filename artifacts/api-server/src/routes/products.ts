import { Router } from "express";
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const access = getAccess(req);
    const rows = await db.select().from(products).where(
      isOperational(access.role) ? eq(products.isActive, true) : undefined,
    ).orderBy(products.name);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Produtos disponíveis apenas para gestão" }); return; }
    const [row] = await db.insert(products).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Produtos disponíveis apenas para gestão" }); return; }
    const [row] = await db.update(products).set(req.body).where(eq(products.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Produtos disponíveis apenas para gestão" }); return; }
    await db.delete(products).where(eq(products.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
