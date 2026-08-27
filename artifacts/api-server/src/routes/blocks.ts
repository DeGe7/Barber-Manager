import { Router } from "express";
import { db, blocks } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const access = getAccess(req);
    const rows = await db.select().from(blocks).where(
      isOperational(access.role) && access.professionalId ? eq(blocks.professionalId, access.professionalId) : undefined,
    ).orderBy(blocks.date);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const access = getAccess(req);
    if (isOperational(access.role) && !access.professionalId) { res.status(403).json({ error: "Perfil sem profissional vinculado" }); return; }
    const [row] = await db.insert(blocks).values(isOperational(access.role) ? { ...req.body, professionalId: access.professionalId } : req.body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const access = getAccess(req);
    const existing = await db.select().from(blocks).where(eq(blocks.id, req.params.id)).limit(1);
    if (isOperational(access.role) && existing[0]?.professionalId !== access.professionalId) { res.status(403).json({ error: "Sem acesso a este bloqueio" }); return; }
    await db.delete(blocks).where(eq(blocks.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
