import "./load-env";
import { promoteFirstAdmin } from "@/server/admin/promote-first-admin";

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npm run admin:promote -- <email>");
    return 1;
  }

  const result = await promoteFirstAdmin(email);

  if (!result.ok) {
    console.error(result.error.message);
    return 1;
  }

  console.log(`${result.data.email} is now the first Admin. Sign in again to see the Admin pages.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
