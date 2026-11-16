// Matrice des rôles et permissions de DENTAL LIGHT.
export const ALL = ['view_all_patients','view_assigned_patients','create_patients','edit_patients','view_medical_records','edit_medical_records','view_finances','manage_finances','view_salaries','manage_payroll','manage_inventory','approve_purchases','manage_exchange_rates','manage_users','manage_roles','view_audit_logs','export_reports','manage_appointments','manage_treatment_plans','manage_prostheses','manage_settings']
export const SENSITIVE = new Set(['view_medical_records','edit_medical_records','view_finances','manage_finances','view_salaries','manage_payroll','approve_purchases','manage_exchange_rates','manage_users','manage_roles','view_audit_logs','manage_settings'])
const ADMINISH = ALL.filter(p => p !== 'manage_exchange_rates')
export const ROLES = {
  OWNER: ALL, ADMIN: ADMINISH, ADMIN_MEDICAL: ['view_all_patients','create_patients','edit_patients','view_medical_records','edit_medical_records','manage_appointments','manage_treatment_plans','manage_prostheses'],
  ADMIN_FINANCIER: ['view_finances','manage_finances','view_salaries','export_reports'],
  DENTIST: ['view_assigned_patients','view_medical_records','edit_medical_records','manage_appointments','manage_treatment_plans','manage_prostheses'], DENTAL_ASSISTANT: ['view_assigned_patients'],
  SECRETARY: ['view_all_patients','create_patients','edit_patients','manage_appointments'], ACCOUNTANT: ['view_finances','manage_finances','view_salaries','export_reports'],
  STOCK_MANAGER: ['manage_inventory'], DENTAL_TECH: ['manage_prostheses'], STAFF: [] }

export const makePermissions = q => {
  const permsOf = async u => {
    if (u.role === 'OWNER') return new Set(ALL)
    const s = new Set(ROLES[u.role] || [])
    for (const r of (await q('select perm,granted from user_permissions where user_id=$1', [u.id])).rows) r.granted ? s.add(r.perm) : s.delete(r.perm)
    return s
  }
  const canDelegate = async (u, perm) => {
    if (u.role === 'OWNER') return true
    if (!(await permsOf(u)).has(perm)) return false
    if (!SENSITIVE.has(perm)) return true
    return (await q('select 1 from user_permissions where user_id=$1 and perm=$2 and granted and can_delegate', [u.id, perm])).rowCount > 0
  }
  return { permsOf, canDelegate }
}
