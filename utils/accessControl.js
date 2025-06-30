function expandAccess(access) {
  if (!access) return {};

const allAccess = {
  isAdmin: true,
  isManager: true,
  isCashier: true,
    canViewOrders: true,
    canDeleteOrders: true,
    canAssignAccount: true ,
    canViewEmployees: true ,
    canAddEmployee: true ,
    canDeleteEmployees: true ,
    canEditRoles: true,
    canGenReport:true,
    canManageExpenses:true,
    canManageProducts: true
};

const managerAccess = {
    canViewOrders: true,
    canDeleteOrders: true,
    canAssignAccount: true ,
    canViewEmployees: true ,
    canAddEmployee: true ,
    canDeleteEmployees: true ,
    canEditRoles: true,
    canGenReport:true,
    canManageExpenses:true,
    canManageProducts: true
}

  if (access.isAdmin) {
    return {  ...access, ...allAccess };
  }
  if (access.isManager) {
    return { ...access, ...managerAccess };
  } 
  return access;
}


module.exports = { expandAccess };