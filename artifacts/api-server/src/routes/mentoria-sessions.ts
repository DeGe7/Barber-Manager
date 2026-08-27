import { Router } from "express";
import { db, mentoriaSessions } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const rows = await db.select().from(mentoriaSessions).orderBy(mentoriaSessions.date);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const [row] = await db.insert(mentoriaSessions).values(req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const [row] = await db.update(mentoriaSessions).set(req.body).where(eq(mentoriaSessions.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await db.delete(mentoriaSessions).where(eq(mentoriaSessions.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
