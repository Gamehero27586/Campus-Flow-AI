import "./load-env";
import { seedBase } from "@/server/auth/seed-base";

async function main() {
  const result = await seedBase();
  console.log(
    `Seeded ${result.roles} roles and ${result.permissions} permission keys; added ${result.grantsAdded} default grants.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
