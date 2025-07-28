function expandAccess(access) {
  if (!access) return {};

const allAccess = {
  isAdmin: true,
  isManager: true,
  isCashier: false,
    canViewOrders: true,
    canViewAllRegisters: true,
    canGenReport:true,
    canDeleteOrder: true,
    canAddExpense:true
};

const managerAccess = {
    isCashier: false,
    canDeleteOrder: true,
    canAddExpense:true
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