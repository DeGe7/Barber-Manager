import { Router } from "express";
import { db, professionals } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const access = getAccess(req);
    const rows = await db.select().from(professionals).where(
      isOperational(access.role) && access.professionalId ? eq(professionals.id, access.professionalId) : undefined,
    ).orderBy(professionals.name);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Equipe disponível apenas para gestão" }); return; }
    const [row] = await db.insert(professionals).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Equipe disponível apenas para gestão" }); return; }
    const [row] = await db.update(professionals).set(req.body).where(eq(professionals.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Equipe disponível apenas para gestão" }); return; }
    await db.delete(professionals).where(eq(professionals.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
