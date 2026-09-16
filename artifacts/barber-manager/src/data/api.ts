import { supabase } from '@/services/supabaseClient';
import { getStorageObjectPath } from '@/services/storage';
import { formatTimestampDateKey } from './date';
import type { ExpenseCategory, PayMethod, SubscriptionPayment, SubscriptionPaymentStatus, Subscriber } from './store';

type Row = Record<string, unknown>;

export interface OrganizationInvitation {
  id: string;
  email: string;
  professionalId: string;
  role: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface CreatedInvitation extends OrganizationInvitation {
  token: string;
}

export type CommunicationChannel = 'whatsapp' | 'email';
export type CommunicationKind = 'campaign' | 'invitation';
export type CommunicationStatus = 'initiated' | 'failed';

export interface CommunicationSend {
  id: string;
  channel: CommunicationChannel;
  kind: CommunicationKind;
  campaignId?: string;
  campaignLabel?: string;
  recipientId?: string;
  recipientName: string;
  recipientAddress: string;
  message: string;
  status: CommunicationStatus;
  failureReason?: string;
  consentedAt: string;
  createdAt: string;
}

export interface FinanceHistoryItem {
  id: string;
  entryType: 'income' | 'expense';
  entryId: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  previousValues: {
    date: string;
    description: string;
    amount: number;
    category?: ExpenseCategory;
    paymentMethod?: PayMethod;
  };
  newValues: {
    date: string;
    description: string;
    amount: number;
    category?: ExpenseCategory;
    paymentMethod?: PayMethod;
  };
}

function client() {
  if (!supabase) {
    throw new Error('Supabase não está configurado neste ambiente.');
  }
  return supabase;
}

async function organizationId(): Promise<string> {
  const db = client();
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) throw new Error('Faça login para acessar os dados.');

  const { data, error } = await db
    .from('profiles')
    .select('default_organization_id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar o estabelecimento: ${error.message}`);
  if (!data?.default_organization_id) {
    throw new Error('Conclua o cadastro do estabelecimento antes de continuar.');
  }
  return String(data.default_organization_id);
}

function defined(input: Row): Row {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function mapProfessional(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    role: String(row.role ?? 'barbeiro'),
    initials: String(row.initials ?? ''),
    color: String(row.color ?? '#3b82f6'),
    isActive: Boolean(row.is_active),
    commissions: (row.commissions ?? {}) as Row,
  };
}

function mapAppointment(row: Row) {
  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    time: String(row.time ?? '').slice(0, 5),
    client: String(row.client ?? ''),
    clientPhone: row.client_phone ? String(row.client_phone) : undefined,
    professionalId: String(row.professional_id ?? ''),
    service: String(row.service ?? ''),
    duration: Number(row.duration ?? 30),
    status: row.status,
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    value: Number(row.value ?? 0),
    tip: Number(row.tip ?? 0),
    products: arrayValue(row.products),
    payMethod: row.pay_method,
    paymentSplits: arrayValue(row.payment_splits),
  };
}

function mapBlock(row: Row) {
  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    professionalId: String(row.professional_id ?? ''),
    slots: arrayValue<string>(row.slots),
    reason: String(row.reason ?? ''),
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function mapClient(row: Row) {
  const createdAt = row.created_at ? formatTimestampDateKey(String(row.created_at)) : '';
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    whatsapp: String(row.whatsapp ?? ''),
    birthday: row.birthday ? String(row.birthday) : undefined,
    source: row.source ? String(row.source) : undefined,
    sourceOther: row.source_other ? String(row.source_other) : undefined,
    interest: row.interest,
    createdAt,
    visits: arrayValue(row.visits),
  };
}

function mapProduct(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    stock: Number(row.stock ?? 0),
    minStock: Number(row.min_stock ?? 0),
    isActive: Boolean(row.is_active),
  };
}

function mapExpense(row: Row) {
  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    description: String(row.description ?? ''),
    amount: Number(row.amount ?? 0),
    category: String(row.category ?? 'Outros') as ExpenseCategory,
    ...(row.payment_method ? { paymentMethod: row.payment_method as PayMethod } : {}),
  };
}

function mapIncome(row: Row) {
  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    description: String(row.description ?? ''),
    amount: Number(row.amount ?? 0),
  };
}

function mapFinanceHistory(row: Row): FinanceHistoryItem {
  const mapValues = (value: unknown): FinanceHistoryItem['previousValues'] => {
    const values = (value ?? {}) as Row;
    return {
      date: String(values.date ?? ''),
      description: String(values.description ?? ''),
      amount: Number(values.amount ?? 0),
      ...(values.category ? { category: String(values.category) as ExpenseCategory } : {}),
      ...(values.payment_method ? { paymentMethod: values.payment_method as PayMethod } : {}),
    };
  };
  return {
    id: String(row.id),
    entryType: row.entry_type as FinanceHistoryItem['entryType'],
    entryId: String(row.entry_id ?? ''),
    changedBy: String(row.changed_by ?? ''),
    changedByName: String(row.changed_by_name ?? 'Usuário'),
    changedAt: String(row.changed_at ?? ''),
    previousValues: mapValues(row.previous_values),
    newValues: mapValues(row.new_values),
  };
}

function mapProthesisSale(row: Row) {
  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    client: String(row.client ?? ''),
    whatsapp: row.whatsapp ? String(row.whatsapp) : undefined,
    value: Number(row.value ?? 0),
    sellerId: String(row.seller_id ?? ''),
    installments: Number(row.installments ?? 1),
    installmentsPaid: Number(row.installments_paid ?? 0),
    payMethod1: row.pay_method1,
    payAmount1: Number(row.pay_amount1 ?? 0),
    payMethod2: row.pay_method2,
    payAmount2: row.pay_amount2 == null ? undefined : Number(row.pay_amount2),
    lastMaintenance: row.last_maintenance ? String(row.last_maintenance) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function mapMentoria(row: Row) {
  return {
    id: String(row.id),
    date: String(row.date ?? ''),
    client: String(row.client ?? ''),
    sellerId: String(row.seller_id ?? ''),
    value: Number(row.value ?? 0),
    durationHours: Number(row.duration_hours ?? 2),
    status: row.status,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function mapPlan(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    price: Number(row.price ?? 0),
    services: arrayValue<string>(row.services),
    duration: row.duration,
  };
}

function mapSubscriber(row: Row): Subscriber {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    planId: String(row.plan_id ?? ''),
    professionalId: String(row.professional_id ?? ''),
    startDate: String(row.start_date ?? ''),
    nextPayment: String(row.next_payment ?? ''),
    status: row.status as Subscriber['status'],
  };
}

function mapSubscriptionPayment(row: Row): SubscriptionPayment {
  return {
    id: String(row.id),
    subscriberId: String(row.subscriber_id ?? ''),
    dueDate: String(row.due_date ?? ''),
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    amount: Number(row.amount ?? 0),
    paymentMethod: row.payment_method as SubscriptionPayment['paymentMethod'],
    status: row.status as SubscriptionPaymentStatus,
    note: row.note ? String(row.note) : undefined,
  };
}

function mapInvitation(row: Row): OrganizationInvitation {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    professionalId: String(row.professional_id ?? ''),
    role: row.role as OrganizationInvitation['role'],
    expiresAt: String(row.expires_at ?? ''),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : undefined,
    revokedAt: row.revoked_at ? String(row.revoked_at) : undefined,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapCommunicationSend(row: Row): CommunicationSend {
  return {
    id: String(row.id),
    channel: row.channel as CommunicationChannel,
    kind: row.kind as CommunicationKind,
    campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
    campaignLabel: row.campaign_label ? String(row.campaign_label) : undefined,
    recipientId: row.recipient_id ? String(row.recipient_id) : undefined,
    recipientName: String(row.recipient_name ?? ''),
    recipientAddress: String(row.recipient_address ?? ''),
    message: String(row.message ?? ''),
    status: row.status as CommunicationStatus,
    failureReason: row.failure_reason ? String(row.failure_reason) : undefined,
    consentedAt: String(row.consented_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

async function listRows(table: string, order = 'created_at'): Promise<Row[]> {
  await organizationId();
  const { data, error } = await client().from(table).select('*').order(order, { ascending: false });
  if (error) throw new Error(`Não foi possível carregar ${table}: ${error.message}`);
  return (data ?? []) as Row[];
}

async function insertRow(table: string, row: Row): Promise<Row> {
  await organizationId();
  const { data, error } = await client().from(table).insert(defined(row)).select('*').single();
  if (error) throw new Error(`Não foi possível salvar em ${table}: ${error.message}`);
  return data as Row;
}

async function updateRow(table: string, id: string, row: Row): Promise<Row> {
  await organizationId();
  const { data, error } = await client().from(table).update(defined(row)).eq('id', id).select('*').single();
  if (error) throw new Error(`Não foi possível atualizar ${table}: ${error.message}`);
  return data as Row;
}

async function removeRow(table: string, id: string): Promise<void> {
  await organizationId();
  const { error } = await client().from(table).delete().eq('id', id);
  if (error) throw new Error(`Não foi possível remover de ${table}: ${error.message}`);
}

export const api = {
  invitations: {
    list: async (): Promise<OrganizationInvitation[]> => {
      await organizationId();
      const { data, error } = await client()
        .from('organization_invitations')
        .select('id, email, professional_id, role, expires_at, accepted_at, revoked_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Não foi possível carregar os convites: ${error.message}`);
      return (data ?? []).map(mapInvitation);
    },
    create: async (professionalId: string, email: string, expiresInDays = 7): Promise<CreatedInvitation> => {
      await organizationId();
      const { data, error } = await client().rpc('create_organization_invitation', {
        p_professional_id: professionalId,
        p_email: email,
        p_expires_in_days: expiresInDays,
      });
      if (error) throw new Error(`Não foi possível criar o convite: ${error.message}`);
      return { ...mapInvitation(data as Row), token: String((data as Row).token ?? '') };
    },
    revoke: async (id: string): Promise<void> => {
      await organizationId();
      const { error } = await client().rpc('revoke_organization_invitation', { p_invitation_id: id });
      if (error) throw new Error(`Não foi possível revogar o convite: ${error.message}`);
    },
  },
  communication: {
    list: async (): Promise<CommunicationSend[]> => {
      await organizationId();
      const { data, error } = await client()
        .from('communication_sends')
        .select('id, channel, kind, campaign_id, campaign_label, recipient_id, recipient_name, recipient_address, message, status, failure_reason, consented_at, created_at')
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw new Error(`Não foi possível carregar o histórico de envios: ${error.message}`);
      return (data ?? []).map(mapCommunicationSend);
    },
    log: async (body: {
      channel: CommunicationChannel;
      kind: CommunicationKind;
      campaignId?: string;
      campaignLabel?: string;
      recipientId?: string;
      recipientName: string;
      recipientAddress: string;
      message: string;
      status: CommunicationStatus;
      failureReason?: string;
    }): Promise<CommunicationSend> => mapCommunicationSend(await insertRow('communication_sends', {
      channel: body.channel,
      kind: body.kind,
      campaign_id: body.campaignId,
      campaign_label: body.campaignLabel,
      recipient_id: body.recipientId,
      recipient_name: body.recipientName,
      recipient_address: body.recipientAddress,
      message: body.message,
      status: body.status,
      failure_reason: body.failureReason,
      consented_at: new Date().toISOString(),
    })),
    markFailed: async (id: string, failureReason: string): Promise<CommunicationSend> => mapCommunicationSend(await updateRow('communication_sends', id, {
      status: 'failed',
      failure_reason: failureReason,
    })),
  },
  auth: {
    acceptInvitation: async (token: string): Promise<{ organizationId: string; role: string; professionalId: string }> => {
      const { data, error } = await client().rpc('accept_organization_invitation', { p_token: token });
      if (error) throw new Error(error.message);
      const payload = data as Row;
      return {
        organizationId: String(payload.organization_id),
        role: String(payload.role),
        professionalId: String(payload.professional_id),
      };
    },
  },
  professionals: {
    list: async () => (await listRows('professionals')).map(mapProfessional),
    create: async (body: Row) => mapProfessional(await insertRow('professionals', {
      id: body.id,
      name: body.name,
      role: body.role,
      initials: body.initials,
      color: body.color,
      is_active: body.isActive,
      commissions: body.commissions,
    })),
    update: async (id: string, body: Row) => mapProfessional(await updateRow('professionals', id, {
      name: body.name,
      role: body.role,
      initials: body.initials,
      color: body.color,
      is_active: body.isActive,
      commissions: body.commissions,
    })),
    remove: (id: string) => removeRow('professionals', id),
  },
  appointments: {
    list: async () => (await listRows('appointments', 'date')).map(mapAppointment),
    create: async (body: Row) => mapAppointment(await insertRow('appointments', {
      id: body.id,
      date: body.date,
      time: body.time,
      client: body.client,
      client_phone: body.clientPhone,
      professional_id: body.professionalId,
      service: body.service,
      duration: body.duration,
      status: body.status,
      checked_in_at: body.checkedInAt,
      completed_at: body.completedAt,
      value: body.value,
      tip: body.tip,
      products: body.products,
      pay_method: body.payMethod,
      payment_splits: body.paymentSplits,
      notes: body.notes,
    })),
    update: async (id: string, body: Row) => mapAppointment(await updateRow('appointments', id, {
      date: body.date,
      time: body.time,
      client: body.client,
      client_phone: body.clientPhone,
      professional_id: body.professionalId,
      service: body.service,
      duration: body.duration,
      status: body.status,
      checked_in_at: body.checkedInAt,
      completed_at: body.completedAt,
      value: body.value,
      tip: body.tip,
      products: body.products,
      pay_method: body.payMethod,
      payment_splits: body.paymentSplits,
      notes: body.notes,
    })),
    remove: (id: string) => removeRow('appointments', id),
  },
  blocks: {
    list: async () => (await listRows('blocks', 'date')).map(mapBlock),
    create: async (body: Row) => mapBlock(await insertRow('blocks', {
      id: body.id, date: body.date, professional_id: body.professionalId,
      slots: body.slots, reason: body.reason, notes: body.notes,
    })),
    remove: (id: string) => removeRow('blocks', id),
  },
  clients: {
    list: async () => (await listRows('clients')).map(mapClient),
    create: async (body: Row) => mapClient(await insertRow('clients', {
      id: body.id, name: body.name, email: body.email, whatsapp: body.whatsapp,
      birthday: body.birthday, source: body.source, source_other: body.sourceOther,
      interest: body.interest, created_at: body.createdAt, visits: body.visits,
    })),
    update: async (id: string, body: Row) => mapClient(await updateRow('clients', id, {
      name: body.name, email: body.email, whatsapp: body.whatsapp, birthday: body.birthday,
      source: body.source, source_other: body.sourceOther, interest: body.interest, visits: body.visits,
    })),
    remove: (id: string) => removeRow('clients', id),
  },
  products: {
    list: async () => (await listRows('products')).map(mapProduct),
    create: async (body: Row) => mapProduct(await insertRow('products', {
      id: body.id, name: body.name, category: body.category, price: body.price, cost: body.cost,
      stock: body.stock, min_stock: body.minStock, is_active: body.isActive,
    })),
    update: async (id: string, body: Row) => mapProduct(await updateRow('products', id, {
      name: body.name, category: body.category, price: body.price, cost: body.cost,
      stock: body.stock, min_stock: body.minStock, is_active: body.isActive,
    })),
    adjustStock: async (id: string, delta: number) => {
      await organizationId();
      const { data, error } = await client().rpc('adjust_product_stock', {
        p_product_id: id,
        p_delta: delta,
      });
      if (error) throw new Error(`Não foi possível atualizar o estoque: ${error.message}`);
      return mapProduct(data as Row);
    },
    remove: (id: string) => removeRow('products', id),
  },
  expenses: {
    list: async () => (await listRows('expenses', 'date')).map(mapExpense),
    create: async (body: Row) => mapExpense(await insertRow('expenses', {
      id: body.id, date: body.date, description: body.description, amount: body.amount, category: body.category,
      payment_method: body.paymentMethod,
    })),
    update: async (id: string, body: Row) => mapExpense(await updateRow('expenses', id, {
      date: body.date, description: body.description, amount: body.amount, category: body.category,
      payment_method: body.paymentMethod,
    })),
    remove: (id: string) => removeRow('expenses', id),
  },
  incomes: {
    list: async () => (await listRows('incomes', 'date')).map(mapIncome),
    create: async (body: Row) => mapIncome(await insertRow('incomes', {
      id: body.id, date: body.date, description: body.description, amount: body.amount,
    })),
    update: async (id: string, body: Row) => mapIncome(await updateRow('incomes', id, {
      date: body.date, description: body.description, amount: body.amount,
    })),
    remove: (id: string) => removeRow('incomes', id),
  },
  financeHistory: {
    list: async (): Promise<FinanceHistoryItem[]> =>
      (await listRows('finance_entry_changes', 'changed_at')).map(mapFinanceHistory),
  },
  prothesisSales: {
    list: async () => (await listRows('prothesis_sales', 'date')).map(mapProthesisSale),
    create: async (body: Row) => mapProthesisSale(await insertRow('prothesis_sales', {
      id: body.id, date: body.date, client: body.client, whatsapp: body.whatsapp, value: body.value,
      seller_id: body.sellerId, installments: body.installments, installments_paid: body.installmentsPaid,
      pay_method1: body.payMethod1, pay_amount1: body.payAmount1, pay_method2: body.payMethod2,
      pay_amount2: body.payAmount2, last_maintenance: body.lastMaintenance, notes: body.notes,
    })),
    update: async (id: string, body: Row) => mapProthesisSale(await updateRow('prothesis_sales', id, {
      date: body.date, client: body.client, whatsapp: body.whatsapp, value: body.value,
      seller_id: body.sellerId, installments: body.installments, installments_paid: body.installmentsPaid,
      pay_method1: body.payMethod1, pay_amount1: body.payAmount1, pay_method2: body.payMethod2,
      pay_amount2: body.payAmount2, last_maintenance: body.lastMaintenance, notes: body.notes,
    })),
    remove: (id: string) => removeRow('prothesis_sales', id),
  },
  mentoriaSessions: {
    list: async () => (await listRows('mentoria_sessions', 'date')).map(mapMentoria),
    create: async (body: Row) => mapMentoria(await insertRow('mentoria_sessions', {
      id: body.id, date: body.date, client: body.client, seller_id: body.sellerId,
      value: body.value, duration_hours: body.durationHours, status: body.status, notes: body.notes,
    })),
    update: async (id: string, body: Row) => mapMentoria(await updateRow('mentoria_sessions', id, {
      date: body.date, client: body.client, seller_id: body.sellerId, value: body.value,
      duration_hours: body.durationHours, status: body.status, notes: body.notes,
    })),
    remove: (id: string) => removeRow('mentoria_sessions', id),
  },
  plans: {
    list: async () => (await listRows('subscription_plans')).map(mapPlan),
    create: async (body: Row) => mapPlan(await insertRow('subscription_plans', {
      id: body.id, name: body.name, price: body.price, services: body.services, duration: body.duration,
    })),
    update: async (id: string, body: Row) => mapPlan(await updateRow('subscription_plans', id, {
      name: body.name, price: body.price, services: body.services, duration: body.duration,
    })),
    remove: (id: string) => removeRow('subscription_plans', id),
  },
  subscribers: {
    list: async () => (await listRows('subscribers')).map(mapSubscriber),
    create: async (body: Row) => mapSubscriber(await insertRow('subscribers', {
      id: body.id, name: body.name, phone: body.phone, plan_id: body.planId,
      professional_id: body.professionalId, start_date: body.startDate, next_payment: body.nextPayment,
      status: body.status,
    })),
    update: async (id: string, body: Row) => mapSubscriber(await updateRow('subscribers', id, {
      name: body.name, phone: body.phone, plan_id: body.planId, professional_id: body.professionalId,
      start_date: body.startDate, next_payment: body.nextPayment, status: body.status,
    })),
    remove: (id: string) => removeRow('subscribers', id),
  },
  subscriptionPayments: {
    list: async () => (await listRows('subscription_payments', 'due_date')).map(mapSubscriptionPayment),
    setStatus: async (body: {
      subscriberId: string;
      dueDate: string;
      status: SubscriptionPaymentStatus;
      paidAt?: string;
      amount: number;
      paymentMethod?: string;
      note?: string;
    }): Promise<{ payment: SubscriptionPayment; subscriber: Subscriber; nextPayment?: SubscriptionPayment }> => {
      await organizationId();
      const { data, error } = await client().rpc('set_subscription_payment_status', {
        p_subscriber_id: body.subscriberId,
        p_due_date: body.dueDate,
        p_status: body.status,
        p_paid_at: body.paidAt ?? null,
        p_amount: body.amount,
        p_payment_method: body.paymentMethod ?? null,
        p_note: body.note ?? null,
      });
      if (error) throw new Error(`Não foi possível atualizar a mensalidade: ${error.message}`);
      const payload = data as Row;
      return {
        payment: mapSubscriptionPayment(payload.payment as Row),
        subscriber: mapSubscriber(payload.subscriber as Row),
        nextPayment: payload.next_payment ? mapSubscriptionPayment(payload.next_payment as Row) : undefined,
      };
    },
  },
  config: {
    get: async () => {
      const orgId = await organizationId();
      const db = client();
      const { data, error } = await db.from('organization_settings').select('payload').eq('organization_id', orgId).maybeSingle();
      if (error) throw new Error(`Não foi possível carregar as configurações: ${error.message}`);
      const payload = { ...((data?.payload ?? {}) as Row) };
      const logoPath = getStorageObjectPath(payload.logo, 'logos');
      if (!logoPath) return payload;

      const { data: userData, error: userError } = await db.auth.getUser();
      if (userError || !userData.user) return { ...payload, logo: undefined };
      const { data: membership, error: membershipError } = await db
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (membershipError) throw new Error(`Não foi possível carregar seu acesso: ${membershipError.message}`);
      if (!['gestor', 'dev-admin'].includes(String(membership?.role || ''))) {
        return { ...payload, logo: undefined };
      }

      const { data: logoData, error: logoError } = await db.storage.from('logos').createSignedUrl(logoPath, 3600);
      return {
        ...payload,
        logo: logoError || !logoData?.signedUrl ? undefined : logoData.signedUrl,
        logoPath,
      };
    },
    update: async (body: Row) => {
      const orgId = await organizationId();
      const logoPath = getStorageObjectPath(body.logoPath ?? body.logo, 'logos');
      const payload: Row = { ...body, logo: logoPath ?? null };
      delete payload.logoPath;
      const { error: organizationError } = await client().rpc('update_organization_details', {
        p_name: String(body.name ?? ''),
        p_cnpj: String(body.cnpj ?? ''),
        p_address: String(body.address ?? ''),
        p_logo_url: logoPath ?? null,
      });
      if (organizationError) throw new Error(`Não foi possível salvar os dados do estabelecimento: ${organizationError.message}`);
      const { data, error } = await client()
        .from('organization_settings')
        .upsert({ organization_id: orgId, payload }, { onConflict: 'organization_id' })
        .select('payload')
        .single();
      if (error) throw new Error(`Não foi possível salvar as configurações: ${error.message}`);
      return (data?.payload ?? {}) as Row;
    },
  },
};