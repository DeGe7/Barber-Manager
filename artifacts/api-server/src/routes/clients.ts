import { Router } from "express";
import { db, clients } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Clientes disponíveis apenas para gestão" }); return; }
    const rows = await db.select().from(clients).orderBy(clients.name);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Clientes disponíveis apenas para gestão" }); return; }
    const allowedSources = ["Indicação", "Instagram", "Google", "Facebook", "Site", "Passou na rua", "Outro"];
    const body = { interest: "barbearia", ...req.body };
    if (!["barbearia", "salao", "protese"].includes(body.interest)) { res.status(400).json({ error: "Segmento de cliente inválido" }); return; }
    if (!allowedSources.includes(body.source)) { res.status(400).json({ error: "Origem de cliente inválida" }); return; }
    if (body.source === "Outro" && !String(body.sourceOther || "").trim()) { res.status(400).json({ error: "Descrição da origem é obrigatória" }); return; }
    const [row] = await db.insert(clients).values(body).returning();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Clientes disponíveis apenas para gestão" }); return; }
    const [row] = await db.update(clients).set(req.body).where(eq(clients.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Clientes disponíveis apenas para gestão" }); return; }
    await db.delete(clients).where(eq(clients.id, req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
