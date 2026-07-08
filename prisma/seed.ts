import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { Role } from "../lib/constants/enums";

const TEST_PASSWORD = "Password123!";

const TEST_USERS = [
  {
    email: "superadmin@example.com",
    fullName: "Sam Superadmin",
    role: Role.SUPER_ADMIN,
  },
  {
    email: "employee@example.com",
    fullName: "Erin Employee",
    role: Role.EMPLOYEE,
    employeeCode: "EMP0001",
  },
  {
    email: "operations@example.com",
    fullName: "Oscar Operations",
    role: Role.OPERATIONS,
  },
  {
    email: "facilities@example.com",
    fullName: "Fiona Facilities",
    role: Role.FACILITIES,
  },
] as const;

const VEHICLE_DRIVERS = [
  {
    driverName: "Karim Sheikh",
    contactNumber: "01711000001",
    vehicleNumber: "DHK-METRO-GA-1234",
    vendor: "Green Line Transport",
  },
  {
    driverName: "Rahim Molla",
    contactNumber: "01711000002",
    vehicleNumber: "DHK-METRO-GA-5678",
    vendor: "Green Line Transport",
  },
  {
    driverName: "Jashim Uddin",
    contactNumber: "01711000003",
    vehicleNumber: "DHK-METRO-GA-9012",
    vendor: "City Rides Ltd.",
  },
] as const;

async function main() {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  for (const testUser of TEST_USERS) {
    const employeeCode = "employeeCode" in testUser ? testUser.employeeCode : null;
    await prisma.user.upsert({
      where: { email: testUser.email },
      update: {
        fullName: testUser.fullName,
        role: testUser.role,
        employeeCode,
      },
      create: {
        email: testUser.email,
        fullName: testUser.fullName,
        role: testUser.role,
        employeeCode,
        passwordHash,
        mustChangePassword: false,
        isBulkCreated: false,
        contactNumber: "01700000000",
        address: "123 Test Street, Dhaka",
      },
    });
    console.log(`Seeded ${testUser.role} -> ${testUser.email}`);
  }

  for (const vehicleDriver of VEHICLE_DRIVERS) {
    await prisma.vehicleDriver.upsert({
      where: { vehicleNumber: vehicleDriver.vehicleNumber },
      update: vehicleDriver,
      create: vehicleDriver,
    });
    console.log(`Seeded vehicle & driver -> ${vehicleDriver.driverName} / ${vehicleDriver.vehicleNumber}`);
  }

  console.log("\nSeed complete. Test accounts (all use the same password):");
  console.log(`  Password: ${TEST_PASSWORD}\n`);
  for (const testUser of TEST_USERS) {
    console.log(`  ${testUser.role.padEnd(12)} ${testUser.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
