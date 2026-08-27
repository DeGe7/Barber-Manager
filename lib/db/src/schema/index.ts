import { pgTable, text, integer, real, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

// ─── Professionals ────────────────────────────────────────────────────────────

export const professionals = pgTable("professionals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("barbeiro"),
  initials: text("initials").notNull().default(""),
  color: text("color").notNull().default("#3b82f6"),
  isActive: boolean("is_active").notNull().default(true),
  commissions: jsonb("commissions").notNull().default({}),
});

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  client: text("client").notNull(),
  clientPhone: text("client_phone"),
  professionalId: text("professional_id").notNull(),
  service: text("service").notNull(),
  duration: integer("duration").notNull().default(30),
  status: text("status").notNull().default("pending"),
  checkedInAt: text("checked_in_at"),
  completedAt: text("completed_at"),
  value: real("value").notNull().default(0),
  tip: real("tip").notNull().default(0),
  products: jsonb("products").notNull().default([]),
  payMethod: text("pay_method").notNull().default("pix"),
  paymentSplits: jsonb("payment_splits").notNull().default([]),
  notes: text("notes"),
});

// ─── Blocks ───────────────────────────────────────────────────────────────────

export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  professionalId: text("professional_id").notNull(),
  slots: jsonb("slots").notNull().default([]),
  reason: text("reason").notNull().default(""),
  notes: text("notes"),
});

// ─── Clients ──────────────────────────────────────────────────────────────────

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  birthday: text("birthday"),
  source: text("source"),
  sourceOther: text("source_other"),
  interest: text("interest").notNull().default("barbearia"),
  createdAt: text("created_at").notNull(),
  visits: jsonb("visits").notNull().default([]),
});

// ─── Products ─────────────────────────────────────────────────────────────────

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  price: real("price").notNull().default(0),
  cost: real("cost").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull().default(0),
  category: text("category").notNull().default("Outros"),
});

// ─── Incomes ──────────────────────────────────────────────────────────────────

export const incomes = pgTable("incomes", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull().default(0),
});

// ─── Prothesis Sales ──────────────────────────────────────────────────────────

export const prothesisSales = pgTable("prothesis_sales", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  client: text("client").notNull(),
  whatsapp: text("whatsapp"),
  value: real("value").notNull().default(0),
  sellerId: text("seller_id").notNull(),
  installments: integer("installments").notNull().default(1),
  installmentsPaid: integer("installments_paid").notNull().default(0),
  payMethod1: text("pay_method1").notNull().default("pix"),
  payAmount1: real("pay_amount1").notNull().default(0),
  payMethod2: text("pay_method2"),
  payAmount2: real("pay_amount2"),
  lastMaintenance: text("last_maintenance"),
  notes: text("notes"),
});

// ─── Mentoria Sessions ────────────────────────────────────────────────────────

export const mentoriaSessions = pgTable("mentoria_sessions", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  client: text("client").notNull(),
  sellerId: text("seller_id").notNull(),
  value: real("value").notNull().default(0),
  durationHours: integer("duration_hours").notNull().default(2),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
});

// ─── Subscription Plans ───────────────────────────────────────────────────────

export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  price: real("price").notNull().default(0),
  services: jsonb("services").notNull().default([]),
  duration: text("duration").notNull().default("Mensal"),
});

// ─── Subscribers ─────────────────────────────────────────────────────────────

export const subscribers = pgTable("subscribers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  planId: text("plan_id").notNull(),
  professionalId: text("professional_id").notNull(),
  startDate: text("start_date").notNull(),
  nextPayment: text("next_payment").notNull(),
  status: text("status").notNull().default("ativo"),
});

// ─── Config ───────────────────────────────────────────────────────────────────

export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
