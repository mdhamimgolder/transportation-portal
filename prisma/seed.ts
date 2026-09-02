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
    department: "Logistics",
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

  const testHomeAddress = await prisma.address.upsert({
    where: { addressText: "123 Test Street, Dhaka" },
    update: { latitude: 23.7806, longitude: 90.407 },
    create: {
      addressText: "123 Test Street, Dhaka",
      latitude: 23.7806,
      longitude: 90.407,
    },
  });
  const testPickupAddress = await prisma.address.upsert({
    where: { addressText: "Mail Road, Dhaka" },
    update: { latitude: 23.7123, longitude: 90.3456 },
    create: {
      addressText: "Mail Road, Dhaka",
      latitude: 23.7123,
      longitude: 90.3456,
    },
  });

  for (const testUser of TEST_USERS) {
    const employeeCode = "employeeCode" in testUser ? testUser.employeeCode : null;
    const department = "department" in testUser ? testUser.department : null;
    await prisma.user.upsert({
      where: { email: testUser.email },
      update: {
        fullName: testUser.fullName,
        role: testUser.role,
        employeeCode,
        department,
      },
      create: {
        email: testUser.email,
        fullName: testUser.fullName,
        role: testUser.role,
        employeeCode,
        department,
        passwordHash,
        mustChangePassword: false,
        isBulkCreated: false,
        contactNumber: "01700000000",
        address: "123 Test Street, Dhaka",
        ...(testUser.email === "employee@example.com"
          ? {
              homeAddressId: testHomeAddress.id,
              pickupAddressId: testPickupAddress.id,
              pickupPoint: "Mail Road, Dhaka",
            }
          : {}),
      },
    });
    if (testUser.email === "employee@example.com") {
      await prisma.user.update({
        where: { email: testUser.email },
        data: {
          homeAddressId: testHomeAddress.id,
          pickupAddressId: testPickupAddress.id,
          pickupPoint: "Mail Road, Dhaka",
        },
      });
    }
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
