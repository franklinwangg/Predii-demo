import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request.", details: error.flatten() },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      { error: "A record with these values already exists." },
      { status: 409 },
    );
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "ECONNREFUSED" || error.code === "P1001" || error.code === "P1000") {
      return NextResponse.json(
        { error: "Cannot connect to PostgreSQL. Start the database and verify DATABASE_URL in .env." },
        { status: 503 },
      );
    }
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json(
        { error: "The database schema is not up to date. Run the Prisma migration and seed commands." },
        { status: 503 },
      );
    }
  }

  console.error("Request failed:", error);
  return NextResponse.json(
    { error: "The request could not be completed. Check the server logs and database configuration." },
    { status: 500 },
  );
}
