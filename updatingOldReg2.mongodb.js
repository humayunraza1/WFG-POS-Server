// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use("SAMPLE_POS");

const result = db.registers.updateMany(
  { manager: { $exists: true }, managerRef: { $exists: true } },
  { $unset: { manager: "" } }
);

print(`✅ Safely removed 'manager' field from ${result.modifiedCount} registers (where managerRef existed)`);
