import { Router } from "express";
import { db, appointments } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const access = getAccess(req);
    const rows = await db.select().from(appointments).where(
      isOperational(access.role) && access.professionalId ? eq(appointments.professionalId, access.professionalId) : undefined,
    ).orderBy(appointments.date, appointments.time);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const access = getAccess(req);
    if (isOperational(access.role) && !access.professionalId) { res.status(403).json({ error: "Perfil sem profissional vinculado" }); return; }
    const body = isOperational(access.role) ? { ...req.body, professionalId: access.professionalId } : req.body;
    const [row] = await db.insert(appointments).values(body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const access = getAccess(req);
    const existing = await db.select().from(appointments).where(eq(appointments.id, req.params.id)).limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Not found" }); return; }
    if (isOperational(access.role) && existing[0].professionalId !== access.professionalId) { res.status(403).json({ error: "Sem acesso a este agendamento" }); return; }
    const body = isOperational(access.role) ? { ...req.body, professionalId: access.professionalId } : req.body;
    const [row] = await db.update(appointments).set(body).where(eq(appointments.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const access = getAccess(req);
    if (!access.professionalId && isOperational(access.role)) { res.status(403).json({ error: "Perfil sem profissional vinculado" }); return; }
    const existing = await db.select().from(appointments).where(eq(appointments.id, req.params.id)).limit(1);
    if (isOperational(access.role) && existing[0]?.professionalId !== access.professionalId) { res.status(403).json({ error: "Sem acesso a este agendamento" }); return; }
    await db.delete(appointments).where(eq(appointments.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
