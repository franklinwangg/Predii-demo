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
  ["Vehicle", "#168b82", "A vehicle or vehicle type."],
  ["Automotive Part / System", "#5273d1", "An automotive component, part, or system."],
  ["Organization", "#527e45", "A manufacturer, dealership, repair facility, agency, or other organization."],
  ["Problem", "#c24f62", "A symptom, failure mode, warning indicator, or safety event."],
  ["Repair / Diagnosis", "#7458bd", "A diagnostic finding, repair action, or repair status."],
  ["Component", "#5273d1", "A vehicle component or system."],
  ["Manufacturer", "#527e45", "A vehicle or component manufacturer."],
  ["Symptom", "#c24f62", "An observed symptom or warning."],
  ["Failure Mode", "#bd782a", "A specific failure mechanism."],
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

  for (const [sortOrder, [name, color, description]] of categories.entries()) {
    await prisma.label.upsert({
      where: { schemaId_name: { schemaId: schema.id, name } },
      update: { color, description, sortOrder },
      create: { schemaId: schema.id, name, color, description, sortOrder },
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
