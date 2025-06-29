function expandAccess(access) {
  if (!access) return {};

const allAccess = {
  isAdmin: true,
  isManager: true,
  isCashier: true,
  canViewOrders: true,
  canDeleteOrders: true,
  canAssignAccount: true,
  canViewEmployees: true,
  canAddEmployee: true,
  canDeleteEmployees: true,
  canEditRoles: true,
  canGenReport: true,
  canViewReport: true,
  canViewExpenses: true,
  canAddExpenses: true,
  canEditExpenses: true,
  canDeleteExpenses: true,
  canEditProducts: true,
  canAddProducts: true
};

  if (access.isAdmin) {
    return {  ...access, ...allAccess };
  }

  return access;
}


module.exports = { expandAccess };