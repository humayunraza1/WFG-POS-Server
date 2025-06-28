function expandAccess(access) {
  if (!access) return {};

  const allAccess = {
    canAssignAccount:true,
    canGenReport:true,
    canEditRoles:true,
    canAddEmployee:true,
    canDeleteOrders:true,
    canDeleteEmployees:true,
    canAddExpenses:true,
    canViewOrders:true,
    canEditProducts:true
  };

  if (access.isAdmin) {
    return {  ...access, ...allAccess };
  }

  return access;
}


module.exports = { expandAccess };