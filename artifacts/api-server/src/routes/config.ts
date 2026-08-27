import { Router } from "express";
import { db, config } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAccess, isOperational } from "../lib/access";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const row = await db.select().from(config).where(eq(config.key, "barbeariaConfig")).limit(1);
    if (row.length === 0) { res.json({ name: "Barber Manager", cnpj: "", address: "" }); return; }
    res.json(JSON.parse(row[0].value));
  } catch (err) { next(err); }
});

router.put("/", async (req, res, next) => {
  try {
    if (isOperational(getAccess(req).role)) { res.status(403).json({ error: "Configurações disponíveis apenas para gestão" }); return; }
    // Get current, merge, save
    const existing = await db.select().from(config).where(eq(config.key, "barbeariaConfig")).limit(1);
    const current = existing.length > 0 ? JSON.parse(existing[0].value) : {};
    const merged = { ...current, ...req.body };
    if (existing.length > 0) {
      await db.update(config).set({ value: JSON.stringify(merged) }).where(eq(config.key, "barbeariaConfig"));
    } else {
      await db.insert(config).values({ key: "barbeariaConfig", value: JSON.stringify(merged) });
    }
    res.json(merged);
  } catch (err) { next(err); }
});

export default router;
