import type { Appointment, PlanServiceBenefit, Subscriber, SubscriptionPlan } from '@/data/store';

export function planServiceBenefits(plan: SubscriptionPlan | undefined): PlanServiceBenefit[] {
  if (!plan) return [];

  return plan.services.flatMap(service => {
    if (typeof service === 'string') return [];
    const uses = Number(service.usesPerCycle);
    if (!service.serviceId || !service.serviceName || !Number.isInteger(uses) || uses < 1) return [];
    return [{
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      usesPerCycle: uses,
    }];
  });
}

export function totalPlanIncludedUses(plan: SubscriptionPlan | undefined): number {
  return planServiceBenefits(plan).reduce((total, service) => total + service.usesPerCycle, 0);
}

export function planValuePerUse(plan: SubscriptionPlan | undefined): number {
  const uses = totalPlanIncludedUses(plan);
  if (!plan || uses === 0) return 0;
  return plan.price / uses;
}

export function subscriberServiceUses(
  appointments: Appointment[],
  subscriber: Subscriber,
  serviceId: string,
): number {
  const cycleStart = subscriber.usageStartedAt
    ? Date.parse(subscriber.usageStartedAt)
    : Date.parse(`${subscriber.startDate}T00:00:00-03:00`);

  return appointments.filter(appointment => {
    if (
      appointment.planSubscriberId !== subscriber.id
      || appointment.serviceId !== serviceId
      || !appointment.attendanceRecordedAt
      || (appointment.status !== 'confirmed' && appointment.status !== 'completed')
    ) return false;

    const recordedAt = Date.parse(appointment.attendanceRecordedAt);
    return Number.isFinite(recordedAt) && Number.isFinite(cycleStart) && recordedAt >= cycleStart;
  }).length;
}

export function subscriberServiceUsesRemaining(
  appointments: Appointment[],
  subscriber: Subscriber,
  benefit: PlanServiceBenefit,
): number {
  return Math.max(0, benefit.usesPerCycle - subscriberServiceUses(appointments, subscriber, benefit.serviceId));
}

export function planServiceLabel(service: string | PlanServiceBenefit): string {
  return typeof service === 'string'
    ? service
    : `${service.serviceName} · ${service.usesPerCycle} ${service.usesPerCycle === 1 ? 'uso' : 'usos'} por ciclo`;
}
