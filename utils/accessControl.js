function expandAccess(access) {
  if (!access) return {};

const allAccess = {
  isAdmin: true,
  isManager: true,
  isCashier: false,
    canViewOrders: true,
    canDeleteOrders: true,
    canAssignAccount: true,
    canViewAllRegisters: true,
    canViewEmployees: true ,
    canAddEmployee: true ,
    canDeleteEmployees: true ,
    canEditRoles: true,
    canGenReport:true,
    canManageExpenses:true,
    canManageProducts: true
};

const managerAccess = {
    isCashier: false,
    canDeleteOrders: true,
    canAssignAccount: true ,
    canViewEmployees: true ,
    canAddEmployee: true ,
    canDeleteEmployees: true ,
    canEditRoles: true,
    canManageExpenses:true,
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