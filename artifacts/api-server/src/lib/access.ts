import type { Request } from "express";

export type AccessRole = "gestor" | "barbeiro" | "manicure" | "vendedor";

export function getAccess(req: Request): { role: AccessRole; professionalId?: string } {
  const rawRole = String(req.header("x-user-role") || "gestor");
  const role: AccessRole = ["gestor", "barbeiro", "manicure", "vendedor"].includes(rawRole)
    ? rawRole as AccessRole
    : "gestor";
  return { role, professionalId: req.header("x-professional-id") || undefined };
}

export function isOperational(role: AccessRole): boolean {
  return role !== "gestor";
}

export function canManageCatalog(role: AccessRole): boolean {
  return role === "gestor";
}