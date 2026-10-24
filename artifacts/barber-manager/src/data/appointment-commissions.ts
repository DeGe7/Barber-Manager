export interface AppointmentCommissionAttribution {
  professionalId: string;
  sellerProfessionalId?: string;
  sellerIsCompany?: boolean;
  service: string;
  serviceId?: string;
  value: number;
  planUsageValue?: number;
  serviceCommissionRateSnapshot?: number;
  professionalCommissions?: Array<{ professionalId: string; amount: number }>;
}

export const PROFESSIONAL_SERVICE_COMMISSION_RATE = 0.5;

export const PROFESSIONAL_SALES_COMMISSION_FIELDS = [
  { key: 'protese', label: 'Prótese capilar' },
  { key: 'mentoria', label: 'Mentoria' },
] as const;

export function professionalCommissionPool(serviceValue: number): number {
  const safeValue = Number.isFinite(serviceValue) ? Math.max(0, serviceValue) : 0;
  return Math.round((safeValue * PROFESSIONAL_SERVICE_COMMISSION_RATE + Number.EPSILON) * 100) / 100;
}

export function manualCommissionAmountLimit(
  professionalPool: number,
  otherAmounts: number[],
): number {
  const safePool = Number.isFinite(professionalPool) ? Math.max(0, professionalPool) : 0;
  const poolCents = Math.round((safePool + Number.EPSILON) * 100);
  const assignedCents = otherAmounts.reduce((total, amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return total;
    return total + Math.round((amount + Number.EPSILON) * 100);
  }, 0);
  return Math.max(0, poolCents - assignedCents) / 100;
}

export function clampManualCommissionAmount(
  professionalPool: number,
  otherAmounts: number[],
  proposedAmount: number,
): number {
  const requested = Number.isFinite(proposedAmount) ? Math.max(0, proposedAmount) : 0;
  const requestedCents = Math.round((requested + Number.EPSILON) * 100);
  const availableCents = Math.round((
    manualCommissionAmountLimit(professionalPool, otherAmounts) + Number.EPSILON
  ) * 100);
  return Math.min(requestedCents, availableCents) / 100;
}

export function manualCommissionAllocationMatches(
  serviceValue: number,
  assignments: Array<{ professionalId: string; amount: number }>,
): boolean {
  const totalCents = assignments.reduce((sum, assignment) => {
    if (!Number.isFinite(assignment.amount) || assignment.amount < 0) return Number.NaN;
    return sum + Math.round((assignment.amount + Number.EPSILON) * 100);
  }, 0);
  return totalCents === Math.round((professionalCommissionPool(serviceValue) + Number.EPSILON) * 100);
}

/**
 * A person assigned both to perform and sell a service earns both configured
 * role commissions. Company sales never add a seller commission.
 */
export function appointmentCommissionForProfessional(
  appointment: AppointmentCommissionAttribution,
  professionalId: string,
  rateForService: (serviceName: string, serviceId?: string) => number,
): number {
  let commission = 0;
  const commissionBase = appointment.planUsageValue ?? appointment.value;
  const manualAssignments = appointment.professionalCommissions ?? [];
  if (manualAssignments.length > 1) {
    commission += manualAssignments
      .filter(assignment => assignment.professionalId === professionalId)
      .reduce((total, assignment) => total + assignment.amount, 0);
  } else if (appointment.professionalId === professionalId) {
    const rate = appointment.serviceCommissionRateSnapshot
      ?? rateForService(appointment.service, appointment.serviceId);
    commission += Math.round((commissionBase * rate + Number.EPSILON) * 100) / 100;
  }
  if (!appointment.sellerIsCompany && appointment.sellerProfessionalId === professionalId) {
    commission += Math.round((
      commissionBase * rateForService(appointment.service, appointment.serviceId) + Number.EPSILON
    ) * 100) / 100;
  }
  return commission;
}
