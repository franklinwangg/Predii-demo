import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before seeding the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const categories = [
  ["Component", "#5273d1", "Automotive parts and systems."],
  ["Vehicle", "#168b82", "A vehicle or vehicle type."],
  ["Manufacturer", "#b66b27", "Vehicle or part manufacturer."],
  ["Vehicle Model", "#7458bd", "A named vehicle model."],
  ["Symptom", "#c24f62", "A driver-observed symptom."],
  ["Failure Mode", "#d18b24", "A described mechanical or electrical failure."],
  ["Vehicle Indicator", "#397eac", "A dashboard light or vehicle warning."],
  ["Other", "#737d8e", "A relevant automotive entity not covered above."],
] as const;

async function main() {
  const schema = await prisma.labelSchema.upsert({
    where: { name: "Automotive Entity Recognition" },
    update: {
      description: "Span labels for automotive entities in NHTSA complaints.",
    },
    create: {
      name: "Automotive Entity Recognition",
      description: "Span labels for automotive entities in NHTSA complaints.",
    },
  });

  for (const [name, color, description] of categories) {
    await prisma.label.upsert({
      where: { schemaId_name: { schemaId: schema.id, name } },
      update: { color, description },
      create: { schemaId: schema.id, name, color, description },
    });
  }

  await prisma.dataset.upsert({
    where: {
      name_vehicleMake_vehicleModel_vehicleYear: {
        name: "Toyota Prius 2005 Complaints",
        vehicleMake: "Toyota",
        vehicleModel: "Prius",
        vehicleYear: 2005,
      },
    },
    update: { labelSchemaId: schema.id },
    create: {
      name: "Toyota Prius 2005 Complaints",
      source: "NHTSA",
      vehicleMake: "Toyota",
      vehicleModel: "Prius",
      vehicleYear: 2005,
      labelSchemaId: schema.id,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
