export interface AppointmentCommissionAttribution {
  professionalId: string;
  sellerProfessionalId?: string;
  sellerIsCompany?: boolean;
  service: string;
  serviceId?: string;
  value: number;
  planUsageValue?: number;
  professionalCommissions?: Array<{ professionalId: string; amount: number }>;
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
    commission += commissionBase * rateForService(appointment.service, appointment.serviceId);
  }
  if (!appointment.sellerIsCompany && appointment.sellerProfessionalId === professionalId) {
    commission += commissionBase * rateForService(appointment.service, appointment.serviceId);
  }
  return commission;
}
