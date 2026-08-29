/**
 * Central data store — API-backed.
 * All state is fetched from the backend on mount and kept in memory.
 * Mutations use optimistic updates: state changes immediately, then the API
 * call fires in the background. On failure a toast appears and the state rolls back.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { formatDateKey } from './date';
import { useAuth } from '@/auth/auth';
import { DEFAULT_ROLE_PERMISSIONS } from '@/auth/roles';

// ─── Entity types ──────────────────────────────────────────────────────────────

export type Role = string;
export type ClientSource = 'Indicação' | 'Instagram' | 'Google' | 'Facebook' | 'Site' | 'Passou na rua' | 'Outro' | string;
export type ClientInterest = 'barbearia' | 'salao' | 'protese';
export type PayMethod = 'debito' | 'credito' | 'pix' | 'dinheiro';
export type ApptStatus =
  | 'confirmed'
  | 'pending'
  | 'checked_in'
  | 'completed'
  | 'no_show'
  | 'cancelled';
export type ExpenseCategory =
  | 'Aluguel'
  | 'Produtos'
  | 'Marketing'
  | 'Folha de pagamento'
  | 'Manutenção'
  | 'Outros';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Aluguel', 'Produtos', 'Marketing', 'Folha de pagamento', 'Manutenção', 'Outros',
];

export const PAY_LABELS: Record<PayMethod, string> = {
  debito: 'Débito',
  credito: 'Crédito',
  pix: 'PIX',
  dinheiro: 'Dinheiro',
};

export interface ProfessionalCommissions {
  barbearia: number;
  manutencao: number;
  manicure: number;
  protese: number;
  mentoria: number;
}

export interface Professional {
  id: string;
  name: string;
  role: Role;
  initials: string;
  color: string;
  isActive: boolean;
  commissions: ProfessionalCommissions;
}

export interface AppointmentProduct {
  productId: string;
  quantity: number;
}

export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  client: string;
  clientPhone?: string;
  professionalId: string;
  service: string;
  duration: number; // minutes
  status: ApptStatus;
  checkedInAt?: string;
  completedAt?: string;
  notes?: string;
  value: number;
  tip: number;
  products: AppointmentProduct[];
  payMethod: PayMethod;
  paymentSplits?: PaymentSplit[];
}

export interface PaymentSplit {
  method: PayMethod;
  amount: number;
}

export interface Block {
  id: string;
  date: string;
  professionalId: string;
  slots: string[]; // [] = full day
  reason: string;
  notes?: string;
}

export interface ClientVisit {
  id: string;
  date: string;
  type: 'servico' | 'produto';
  description: string;
  professional?: string;
  amount: number;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  birthday?: string;
  source?: ClientSource;
  sourceOther?: string;
  interest: ClientInterest;
  createdAt: string;
  visits: ClientVisit[];
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  isActive: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: number;
  commissionKey: string;
  isActive: boolean;
  sortOrder: number;
}

export interface RoleItem {
  id: string;
  key: string;
  label: string;
  description: string;
  isActive: boolean;
  permissions: string[];
}

export interface ProthesisSale {
  id: string;
  date: string;
  client: string;
  whatsapp?: string;
  value: number;
  sellerId: string;
  installments: number;
  installmentsPaid: number;
  payMethod1: PayMethod;
  payAmount1: number;
  payMethod2?: PayMethod;
  payAmount2?: number;
  lastMaintenance?: string;
  notes?: string;
}

export interface MentoriaSession {
  id: string;
  date: string;
  client: string;
  sellerId: string;
  value: number;
  durationHours: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
}

export interface Income {
  id: string;
  date: string;
  description: string;
  amount: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  services: string[];
  duration: 'Mensal' | 'Trimestral' | 'Semestral' | 'Anual';
}

export interface Subscriber {
  id: string;
  name: string;
  phone: string;
  planId: string;
  professionalId: string;
  startDate: string;
  nextPayment: string;
  status: 'ativo' | 'vencido' | 'pendente';
}

export interface BarbeariaConfig {
  name: string;
  cnpj: string;
  address: string;
  logo?: string;
  logoPath?: string;
  services: ServiceItem[];
  roles: RoleItem[];
  paymentMethods: { key: PayMethod; label: string; isActive: boolean }[];
  clientSources: string[];
  clientSegments: { key: ClientInterest; label: string }[];
  defaultServiceDuration: number;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

export const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const productStatus = (p: Product): 'critical' | 'low' | 'ok' => {
  if (p.stock <= Math.max(2, Math.floor(p.minStock * 0.2))) return 'critical';
  if (p.stock <= p.minStock) return 'low';
  return 'ok';
};

const uid = (): string => crypto.randomUUID();

// Cast API response to typed entity
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cast = <T,>(x: unknown): T => x as T;

// ─── Store interface ───────────────────────────────────────────────────────────

export interface AppStoreValue {
  isLoading: boolean;

  // Professionals
  professionals: Professional[];
  addProfessional: (p: Omit<Professional, 'id'>) => void;
  updateProfessional: (id: string, p: Partial<Professional>) => void;
  removeProfessional: (id: string) => void;
  getProfessional: (id: string) => Professional | undefined;

  // Appointments
  appointments: Appointment[];
  addAppointment: (a: Omit<Appointment, 'id'>) => void;
  updateAppointment: (id: string, a: Partial<Appointment>) => void;
  removeAppointment: (id: string) => void;

  // Blocks
  blocks: Block[];
  addBlock: (b: Omit<Block, 'id'>) => void;
  removeBlock: (id: string) => void;

  // Clients
  clients: Client[];
  addClient: (c: Omit<Client, 'id' | 'createdAt' | 'visits'>) => void;
  updateClient: (id: string, c: Partial<Omit<Client, 'id' | 'createdAt' | 'visits'>>) => void;
  removeClient: (id: string) => void;
  addVisit: (clientId: string, visit: Omit<ClientVisit, 'id'>) => void;
  removeVisit: (clientId: string, visitId: string) => void;

  // Products
  products: Product[];
  addProduct: (p: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, p: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  sellProduct: (id: string, qty: number) => boolean;
  restock: (id: string, qty: number) => void;

  // Prothesis Sales
  prothesisSales: ProthesisSale[];
  addProthesisSale: (s: Omit<ProthesisSale, 'id'>) => void;
  updateProthesisSale: (id: string, s: Partial<ProthesisSale>) => void;
  removeProthesisSale: (id: string) => void;

  // Mentoria
  mentoriaSessions: MentoriaSession[];
  addMentoriaSession: (m: Omit<MentoriaSession, 'id'>) => void;
  updateMentoriaSession: (id: string, m: Partial<MentoriaSession>) => void;
  removeMentoriaSession: (id: string) => void;

  // Finance
  expenses: Expense[];
  addExpense: (e: Omit<Expense, 'id'>) => void;
  removeExpense: (id: string) => void;
  incomes: Income[];
  addIncome: (i: Omit<Income, 'id'>) => void;
  removeIncome: (id: string) => void;

  // Plans
  plans: SubscriptionPlan[];
  addPlan: (p: Omit<SubscriptionPlan, 'id'>) => void;
  updatePlan: (id: string, p: Partial<SubscriptionPlan>) => void;
  removePlan: (id: string) => void;

  // Subscribers
  subscribers: Subscriber[];
  addSubscriber: (s: Omit<Subscriber, 'id'>) => void;
  updateSubscriber: (id: string, s: Partial<Subscriber>) => void;
  removeSubscriber: (id: string) => void;

  // Config
  config: BarbeariaConfig;
  updateConfig: (c: Partial<BarbeariaConfig>) => void;
}

// ─── Context & Provider ───────────────────────────────────────────────────────

const StoreContext = createContext<AppStoreValue | null>(null);

export const DEFAULT_SERVICES: ServiceItem[] = [
  { id: 'service-barbearia', name: 'Barbearia', category: 'Barbearia', price: 0, duration: 30, commissionKey: 'barbearia', isActive: true, sortOrder: 1 },
  { id: 'service-manutencao', name: 'Manutenção', category: 'Barbearia', price: 0, duration: 30, commissionKey: 'manutencao', isActive: true, sortOrder: 2 },
  { id: 'service-manicure', name: 'Manicure', category: 'Salão de Beleza', price: 0, duration: 60, commissionKey: 'manicure', isActive: true, sortOrder: 3 },
  { id: 'service-protese', name: 'Prótese Capilar', category: 'Prótese', price: 0, duration: 120, commissionKey: 'protese', isActive: true, sortOrder: 4 },
  { id: 'service-mentoria', name: 'Mentoria', category: 'Prótese', price: 0, duration: 120, commissionKey: 'mentoria', isActive: true, sortOrder: 5 },
];

export const DEFAULT_ROLES: RoleItem[] = [
  { id: 'role-gestor', key: 'gestor', label: 'Gestor / Proprietário', description: 'Acesso completo ao sistema.', isActive: true, permissions: DEFAULT_ROLE_PERMISSIONS.gestor },
  { id: 'role-barbeiro', key: 'barbeiro', label: 'Barbeiro', description: 'Agenda e controle diário próprios.', isActive: true, permissions: DEFAULT_ROLE_PERMISSIONS.barbeiro },
  { id: 'role-manicure', key: 'manicure', label: 'Manicure', description: 'Agenda e controle diário próprios.', isActive: true, permissions: DEFAULT_ROLE_PERMISSIONS.manicure },
  { id: 'role-vendedor', key: 'vendedor', label: 'Vendedor de Prótese', description: 'Agenda de prótese, vendas e clientes.', isActive: true, permissions: DEFAULT_ROLE_PERMISSIONS.vendedor },
];

export const DEFAULT_CONFIG: BarbeariaConfig = {
  name: 'Barber Manager', cnpj: '', address: '',
  services: DEFAULT_SERVICES, roles: DEFAULT_ROLES,
  paymentMethods: [
    { key: 'pix', label: 'PIX', isActive: true },
    { key: 'dinheiro', label: 'Dinheiro', isActive: true },
    { key: 'debito', label: 'Débito', isActive: true },
    { key: 'credito', label: 'Crédito', isActive: true },
  ],
  clientSources: ['Indicação', 'Instagram', 'Google', 'Facebook', 'Site', 'Passou na rua', 'Outro'],
  clientSegments: [
    { key: 'barbearia', label: 'Barbearia' },
    { key: 'salao', label: 'Salão de Beleza' },
    { key: 'protese', label: 'Prótese Capilar' },
  ],
  defaultServiceDuration: 30,
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prothesisSales, setProthesisSales] = useState<ProthesisSale[]>([]);
  const [mentoriaSessions, setMentoriaSessions] = useState<MentoriaSession[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [config, setConfig] = useState<BarbeariaConfig>(DEFAULT_CONFIG);

  // Keep a stable ref to products for sellProduct (avoids stale closure)
  const productsRef = useRef(products);
  useEffect(() => { productsRef.current = products; }, [products]);

  // ── Load all data after AuthProvider has resolved the active organization ──
  useEffect(() => {
    let cancelled = false;
    if (!user || !profile?.organizationId) {
      setProfessionals([]);
      setAppointments([]);
      setBlocks([]);
      setClients([]);
      setProducts([]);
      setProthesisSales([]);
      setMentoriaSessions([]);
      setExpenses([]);
      setIncomes([]);
      setPlans([]);
      setSubscribers([]);
      setConfig(DEFAULT_CONFIG);
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    setIsLoading(true);

    Promise.all([
      api.professionals.list(),
      api.appointments.list(),
      api.blocks.list(),
      api.clients.list(),
      api.products.list(),
      api.prothesisSales.list(),
      api.mentoriaSessions.list(),
      api.expenses.list(),
      api.incomes.list(),
      api.plans.list(),
      api.subscribers.list(),
      api.config.get(),
    ])
      .then(([profs, appts, blks, cls, prods, psales, msessions, exps, incs, pls, subs, cfg]) => {
        if (cancelled) return;
        setProfessionals((profs as unknown[]).map(cast<Professional>));
        setAppointments((appts as unknown[]).map(cast<Appointment>));
        setBlocks((blks as unknown[]).map(cast<Block>));
        setClients((cls as unknown[]).map(x => {
          const c = cast<Client>(x);
          // Ensure visits is always an array
          return { ...c, visits: Array.isArray(c.visits) ? c.visits : [] };
        }));
        setProducts((prods as unknown[]).map(x => {
          const product = cast<Partial<Product>>(x);
          return { ...product, isActive: product.isActive ?? true } as Product;
        }));
        setProthesisSales((psales as unknown[]).map(cast<ProthesisSale>));
        setMentoriaSessions((msessions as unknown[]).map(cast<MentoriaSession>));
        setExpenses((exps as unknown[]).map(cast<Expense>));
        setIncomes((incs as unknown[]).map(cast<Income>));
        setPlans((pls as unknown[]).map(cast<SubscriptionPlan>));
        setSubscribers((subs as unknown[]).map(cast<Subscriber>));
        const remoteConfig = cast<Partial<BarbeariaConfig>>(cfg) ?? {};
        setConfig({
          ...DEFAULT_CONFIG,
          ...remoteConfig,
          services: remoteConfig.services?.length ? remoteConfig.services : DEFAULT_SERVICES,
           roles: remoteConfig.roles?.length
             ? remoteConfig.roles.map(role => ({
               ...role,
               permissions: Array.isArray(role.permissions)
                 ? role.permissions
                 : (DEFAULT_ROLE_PERMISSIONS[role.key] || ['dashboard']),
             }))
             : DEFAULT_ROLES,
          paymentMethods: remoteConfig.paymentMethods?.length ? remoteConfig.paymentMethods : DEFAULT_CONFIG.paymentMethods,
          clientSources: remoteConfig.clientSources?.length ? remoteConfig.clientSources : DEFAULT_CONFIG.clientSources,
          clientSegments: remoteConfig.clientSegments?.length ? remoteConfig.clientSegments : DEFAULT_CONFIG.clientSegments,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load data from API:', err);
        toast.error('Erro ao carregar dados. Verifique a conexão.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user, profile?.organizationId]);

  // ─── Optimistic mutation helper ─────────────────────────────────────────────

  function optimistic<T>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    prev: T[],
    next: T[],
    apiFn: () => Promise<unknown>,
    errMsg: string,
  ) {
    setter(next);
    apiFn().catch((err) => {
      console.error(errMsg, err);
      toast.error(errMsg);
      setter(prev); // rollback
    });
  }

  // ── Professionals ──
  const addProfessional = useCallback((p: Omit<Professional, 'id'>) => {
    const newP: Professional = { ...p, id: uid() };
    setProfessionals(prev => {
      const next = [...prev, newP];
      api.professionals.create(newP as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar profissional', err);
        toast.error('Erro ao salvar profissional');
        setProfessionals(prev2 => prev2.filter(x => x.id !== newP.id));
      });
      return next;
    });
  }, []);

  const updateProfessional = useCallback((id: string, p: Partial<Professional>) => {
    setProfessionals(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...p } : x);
      api.professionals.update(id, p).catch(err => {
        console.error('Erro ao atualizar profissional', err);
        toast.error('Erro ao atualizar profissional');
        setProfessionals(prev);
      });
      return next;
    });
  }, []);

  const removeProfessional = useCallback((id: string) => {
    setProfessionals(prev => {
      const next = prev.filter(x => x.id !== id);
      api.professionals.remove(id).catch(err => {
        console.error('Erro ao remover profissional', err);
        toast.error('Erro ao remover profissional');
        setProfessionals(prev);
      });
      return next;
    });
  }, []);

  const getProfessional = useCallback((id: string) => professionals.find(p => p.id === id), [professionals]);

  // ── Appointments ──
  const addAppointment = useCallback((a: Omit<Appointment, 'id'>) => {
    const newA: Appointment = { ...a, id: uid() };
    setAppointments(prev => {
      const next = [...prev, newA];
      api.appointments.create(newA as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar agendamento', err);
        toast.error('Erro ao salvar agendamento');
        setAppointments(prev2 => prev2.filter(x => x.id !== newA.id));
      });
      return next;
    });
  }, []);

  const updateAppointment = useCallback((id: string, a: Partial<Appointment>) => {
    setAppointments(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...a } : x);
      api.appointments.update(id, a).catch(err => {
        console.error('Erro ao atualizar agendamento', err);
        toast.error('Erro ao atualizar agendamento');
        setAppointments(prev);
      });
      return next;
    });
  }, []);

  const removeAppointment = useCallback((id: string) => {
    setAppointments(prev => {
      const next = prev.filter(x => x.id !== id);
      api.appointments.remove(id).catch(err => {
        console.error('Erro ao remover agendamento', err);
        toast.error('Erro ao remover agendamento');
        setAppointments(prev);
      });
      return next;
    });
  }, []);

  // ── Blocks ──
  const addBlock = useCallback((b: Omit<Block, 'id'>) => {
    const newB: Block = { ...b, id: uid() };
    setBlocks(prev => {
      const next = [...prev, newB];
      api.blocks.create(newB as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao criar bloqueio', err);
        toast.error('Erro ao criar bloqueio');
        setBlocks(prev2 => prev2.filter(x => x.id !== newB.id));
      });
      return next;
    });
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = prev.filter(x => x.id !== id);
      api.blocks.remove(id).catch(err => {
        console.error('Erro ao remover bloqueio', err);
        toast.error('Erro ao remover bloqueio');
        setBlocks(prev);
      });
      return next;
    });
  }, []);

  // ── Clients ──
  const addClient = useCallback((c: Omit<Client, 'id' | 'createdAt' | 'visits'>) => {
    const newC: Client = { ...c, id: uid(), createdAt: formatDateKey(), visits: [] };
    setClients(prev => {
      const next = [...prev, newC];
      api.clients.create(newC as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar cliente', err);
        toast.error('Erro ao salvar cliente');
        setClients(prev2 => prev2.filter(x => x.id !== newC.id));
      });
      return next;
    });
  }, []);

  const updateClient = useCallback((id: string, c: Partial<Omit<Client, 'id' | 'createdAt' | 'visits'>>) => {
    setClients(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...c } : x);
      api.clients.update(id, c).catch(err => {
        console.error('Erro ao atualizar cliente', err);
        toast.error('Erro ao atualizar cliente');
        setClients(prev);
      });
      return next;
    });
  }, []);

  const removeClient = useCallback((id: string) => {
    setClients(prev => {
      const next = prev.filter(x => x.id !== id);
      api.clients.remove(id).catch(err => {
        console.error('Erro ao remover cliente', err);
        toast.error('Erro ao remover cliente');
        setClients(prev);
      });
      return next;
    });
  }, []);

  const addVisit = useCallback((clientId: string, visit: Omit<ClientVisit, 'id'>) => {
    const newVisit: ClientVisit = { ...visit, id: uid() };
    setClients(prev => {
      const next = prev.map(x => x.id === clientId
        ? { ...x, visits: [...x.visits, newVisit] }
        : x
      );
      const updated = next.find(x => x.id === clientId);
      if (updated) {
        api.clients.update(clientId, { visits: updated.visits }).catch(err => {
          console.error('Erro ao salvar visita', err);
          toast.error('Erro ao salvar visita');
          setClients(prev);
        });
      }
      return next;
    });
  }, []);

  const removeVisit = useCallback((clientId: string, visitId: string) => {
    setClients(prev => {
      const next = prev.map(x => x.id === clientId
        ? { ...x, visits: x.visits.filter(v => v.id !== visitId) }
        : x
      );
      const updated = next.find(x => x.id === clientId);
      if (updated) {
        api.clients.update(clientId, { visits: updated.visits }).catch(err => {
          console.error('Erro ao remover visita', err);
          toast.error('Erro ao remover visita');
          setClients(prev);
        });
      }
      return next;
    });
  }, []);

  // ── Products ──
  const addProduct = useCallback((p: Omit<Product, 'id'>) => {
    const newP: Product = { ...p, id: uid() };
    setProducts(prev => {
      const next = [...prev, newP];
      api.products.create(newP as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar produto', err);
        toast.error('Erro ao salvar produto');
        setProducts(prev2 => prev2.filter(x => x.id !== newP.id));
      });
      return next;
    });
  }, []);

  const updateProduct = useCallback((id: string, p: Partial<Product>) => {
    setProducts(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...p } : x);
      api.products.update(id, p).catch(err => {
        console.error('Erro ao atualizar produto', err);
        toast.error('Erro ao atualizar produto');
        setProducts(prev);
      });
      return next;
    });
  }, []);

  const removeProduct = useCallback((id: string) => {
    setProducts(prev => {
      const next = prev.filter(x => x.id !== id);
      api.products.remove(id).catch(err => {
        console.error('Erro ao remover produto', err);
        toast.error('Erro ao remover produto');
        setProducts(prev);
      });
      return next;
    });
  }, []);

  const sellProduct = useCallback((id: string, qty: number): boolean => {
    const prod = productsRef.current.find(p => p.id === id);
    if (!prod) return false;
    if (prod.stock < qty) {
      toast.error(`Estoque insuficiente: ${prod.name} tem apenas ${prod.stock} un.`);
      return false;
    }
    const newStock = prod.stock - qty;
    setProducts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, stock: newStock } : p);
      api.products.adjustStock(id, -qty).catch(err => {
        console.error('Erro ao atualizar estoque', err);
        toast.error('Erro ao atualizar estoque');
        setProducts(prev);
      });
      return next;
    });
    if (newStock <= prod.minStock) toast.warning(`Estoque baixo: ${prod.name} — ${newStock} un restantes`);
    return true;
  }, []);

  const restock = useCallback((id: string, qty: number) => {
    setProducts(prev => {
      const prod = prev.find(p => p.id === id);
      if (!prod) return prev;
      const newStock = prod.stock + qty;
      const next = prev.map(p => p.id === id ? { ...p, stock: newStock } : p);
      api.products.adjustStock(id, qty).catch(err => {
        console.error('Erro ao repor estoque', err);
        toast.error('Erro ao repor estoque');
        setProducts(prev);
      });
      return next;
    });
  }, []);

  // ── Prothesis Sales ──
  const addProthesisSale = useCallback((s: Omit<ProthesisSale, 'id'>) => {
    const newS: ProthesisSale = { ...s, id: uid() };
    setProthesisSales(prev => {
      const next = [...prev, newS];
      api.prothesisSales.create(newS as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar venda de prótese', err);
        toast.error('Erro ao salvar venda de prótese');
        setProthesisSales(prev2 => prev2.filter(x => x.id !== newS.id));
      });
      return next;
    });
  }, []);

  const updateProthesisSale = useCallback((id: string, s: Partial<ProthesisSale>) => {
    setProthesisSales(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...s } : x);
      api.prothesisSales.update(id, s).catch(err => {
        console.error('Erro ao atualizar venda de prótese', err);
        toast.error('Erro ao atualizar venda de prótese');
        setProthesisSales(prev);
      });
      return next;
    });
  }, []);

  const removeProthesisSale = useCallback((id: string) => {
    setProthesisSales(prev => {
      const next = prev.filter(x => x.id !== id);
      api.prothesisSales.remove(id).catch(err => {
        console.error('Erro ao remover venda de prótese', err);
        toast.error('Erro ao remover venda de prótese');
        setProthesisSales(prev);
      });
      return next;
    });
  }, []);

  // ── Mentoria ──
  const addMentoriaSession = useCallback((m: Omit<MentoriaSession, 'id'>) => {
    const newM: MentoriaSession = { ...m, id: uid() };
    setMentoriaSessions(prev => {
      const next = [...prev, newM];
      api.mentoriaSessions.create(newM as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar mentoria', err);
        toast.error('Erro ao salvar mentoria');
        setMentoriaSessions(prev2 => prev2.filter(x => x.id !== newM.id));
      });
      return next;
    });
  }, []);

  const updateMentoriaSession = useCallback((id: string, m: Partial<MentoriaSession>) => {
    setMentoriaSessions(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...m } : x);
      api.mentoriaSessions.update(id, m).catch(err => {
        console.error('Erro ao atualizar mentoria', err);
        toast.error('Erro ao atualizar mentoria');
        setMentoriaSessions(prev);
      });
      return next;
    });
  }, []);

  const removeMentoriaSession = useCallback((id: string) => {
    setMentoriaSessions(prev => {
      const next = prev.filter(x => x.id !== id);
      api.mentoriaSessions.remove(id).catch(err => {
        console.error('Erro ao remover mentoria', err);
        toast.error('Erro ao remover mentoria');
        setMentoriaSessions(prev);
      });
      return next;
    });
  }, []);

  // ── Finance ──
  const addExpense = useCallback((e: Omit<Expense, 'id'>) => {
    const newE: Expense = { ...e, id: uid() };
    setExpenses(prev => {
      const next = [...prev, newE];
      api.expenses.create(newE as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar despesa', err);
        toast.error('Erro ao salvar despesa');
        setExpenses(prev2 => prev2.filter(x => x.id !== newE.id));
      });
      return next;
    });
  }, []);

  const removeExpense = useCallback((id: string) => {
    setExpenses(prev => {
      const next = prev.filter(x => x.id !== id);
      api.expenses.remove(id).catch(err => {
        console.error('Erro ao remover despesa', err);
        toast.error('Erro ao remover despesa');
        setExpenses(prev);
      });
      return next;
    });
  }, []);

  const addIncome = useCallback((i: Omit<Income, 'id'>) => {
    const newI: Income = { ...i, id: uid() };
    setIncomes(prev => {
      const next = [...prev, newI];
      api.incomes.create(newI as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar receita', err);
        toast.error('Erro ao salvar receita');
        setIncomes(prev2 => prev2.filter(x => x.id !== newI.id));
      });
      return next;
    });
  }, []);

  const removeIncome = useCallback((id: string) => {
    setIncomes(prev => {
      const next = prev.filter(x => x.id !== id);
      api.incomes.remove(id).catch(err => {
        console.error('Erro ao remover receita', err);
        toast.error('Erro ao remover receita');
        setIncomes(prev);
      });
      return next;
    });
  }, []);

  // ── Plans ──
  const addPlan = useCallback((p: Omit<SubscriptionPlan, 'id'>) => {
    const newP: SubscriptionPlan = { ...p, id: uid() };
    setPlans(prev => {
      const next = [...prev, newP];
      api.plans.create(newP as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar plano', err);
        toast.error('Erro ao salvar plano');
        setPlans(prev2 => prev2.filter(x => x.id !== newP.id));
      });
      return next;
    });
  }, []);

  const updatePlan = useCallback((id: string, p: Partial<SubscriptionPlan>) => {
    setPlans(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...p } : x);
      api.plans.update(id, p).catch(err => {
        console.error('Erro ao atualizar plano', err);
        toast.error('Erro ao atualizar plano');
        setPlans(prev);
      });
      return next;
    });
  }, []);

  const removePlan = useCallback((id: string) => {
    setPlans(prev => {
      const next = prev.filter(x => x.id !== id);
      api.plans.remove(id).catch(err => {
        console.error('Erro ao remover plano', err);
        toast.error('Erro ao remover plano');
        setPlans(prev);
      });
      return next;
    });
  }, []);

  // ── Subscribers ──
  const addSubscriber = useCallback((s: Omit<Subscriber, 'id'>) => {
    const newS: Subscriber = { ...s, id: uid() };
    setSubscribers(prev => {
      const next = [...prev, newS];
      api.subscribers.create(newS as unknown as Record<string, unknown>).catch(err => {
        console.error('Erro ao salvar assinante', err);
        toast.error('Erro ao salvar assinante');
        setSubscribers(prev2 => prev2.filter(x => x.id !== newS.id));
      });
      return next;
    });
  }, []);

  const updateSubscriber = useCallback((id: string, s: Partial<Subscriber>) => {
    setSubscribers(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...s } : x);
      api.subscribers.update(id, s).catch(err => {
        console.error('Erro ao atualizar assinante', err);
        toast.error('Erro ao atualizar assinante');
        setSubscribers(prev);
      });
      return next;
    });
  }, []);

  const removeSubscriber = useCallback((id: string) => {
    setSubscribers(prev => {
      const next = prev.filter(x => x.id !== id);
      api.subscribers.remove(id).catch(err => {
        console.error('Erro ao remover assinante', err);
        toast.error('Erro ao remover assinante');
        setSubscribers(prev);
      });
      return next;
    });
  }, []);

  // ── Config ──
  const updateConfig = useCallback((c: Partial<BarbeariaConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...c };
      api.config.update(next).catch(err => {
        console.error('Erro ao salvar configuração', err);
        toast.error('Erro ao salvar configuração');
        setConfig(prev);
      });
      return next;
    });
  }, []);

  // Suppress unused warning for optimistic helper (only used inline above)
  void optimistic;

  const value: AppStoreValue = {
    isLoading,
    professionals, addProfessional, updateProfessional, removeProfessional, getProfessional,
    appointments, addAppointment, updateAppointment, removeAppointment,
    blocks, addBlock, removeBlock,
    clients, addClient, updateClient, removeClient, addVisit, removeVisit,
    products, addProduct, updateProduct, removeProduct, sellProduct, restock,
    prothesisSales, addProthesisSale, updateProthesisSale, removeProthesisSale,
    mentoriaSessions, addMentoriaSession, updateMentoriaSession, removeMentoriaSession,
    expenses, addExpense, removeExpense,
    incomes, addIncome, removeIncome,
    plans, addPlan, updatePlan, removePlan,
    subscribers, addSubscriber, updateSubscriber, removeSubscriber,
    config, updateConfig,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): AppStoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider');
  return ctx;
}

// ─── Backward-compat hooks ────────────────────────────────────────────────────

export function useClients() {
  const store = useStore();
  return {
    clients: store.clients,
    addClient: store.addClient,
    updateClient: store.updateClient,
    removeClient: store.removeClient,
    addVisit: store.addVisit,
    removeVisit: store.removeVisit,
  };
}

export function useProducts() {
  const store = useStore();
  return {
    products: store.products,
    addProduct: store.addProduct,
    updateProduct: store.updateProduct,
    removeProduct: store.removeProduct,
    sellProduct: store.sellProduct,
    restock: store.restock,
  };
}

export function useFinance() {
  const store = useStore();
  return {
    expenses: store.expenses,
    incomes: store.incomes,
    addExpense: store.addExpense,
    removeExpense: store.removeExpense,
    addIncome: store.addIncome,
  };
}
