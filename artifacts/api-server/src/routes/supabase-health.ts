import { Router } from "express";
import { supabaseProxy } from "../lib/supabase";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    const response = await supabaseProxy(
      "/rest/v1/usuarios?select=id&limit=1",
      { method: "GET" },
    );
    const body = await response.text();

    if (!response.ok) {
      res.status(502).json({
        ok: false,
        providerStatus: response.status,
        error: body.slice(0, 500),
      });
      return;
    }

    res.json({ ok: true, providerStatus: response.status });
  } catch {
    res.status(503).json({
      ok: false,
      error: "Não foi possível acessar o Supabase pelo conector.",
    });
  }
});

export default router;