// MongoDB Playground
use("SAMPLE_POS");

// Step 1: Find all managers and build a map
const managers = db.employees.find({ role: 'manager' }).toArray();
print(`Found ${managers.length} managers`);

const managerMap = {};
managers.forEach(manager => {
  if (typeof manager.name === 'string') {
    managerMap[manager.name.toLowerCase()] = manager._id;
  }
});
print(`Manager map created with ${Object.keys(managerMap).length} entries`);

// Step 2: Get a default cashier
const defaultCashier = db.employees.findOne({ role: 'cashier' });
if (!defaultCashier) {
  throw new Error("❌ No cashier found in the accounts collection");
}
print(`Using cashier: ${defaultCashier.username || defaultCashier._id}`);

// Step 3: Fetch and update all register documents
const registers = db.registers.find({}).toArray();
print(`Found ${registers.length} registers`);

registers.forEach(register => {
  if (typeof register.manager !== 'string') {
    print(`⚠️ Skipping register ${register.sessionId || register._id} — manager field missing or not a string`);
    return;
  }

  const managerName = register.manager.toLowerCase();
  const managerId = managerMap[managerName];

  if (!managerId) {
    print(`❌ Skipping register ${register.sessionId || register._id} — no matching manager found for: "${register.manager}"`);
    return;
  }

  const update = {
    $set: {
      managerRef: managerId,
      cashier: defaultCashier._id
    }
  };

  const result = db.registers.updateOne({ _id: register._id }, update);
  print(`${result.matchedCount} document(s) matched, ${result.modifiedCount} document(s) updated`);

  if (result.modifiedCount === 1) {
    print(`✅ Updated register: ${register.sessionId || register._id}`);
  } else {
    print(`⚠️  No changes for register: ${register.sessionId || register._id}`);
  }
});

print("🏁 Migration complete.");
