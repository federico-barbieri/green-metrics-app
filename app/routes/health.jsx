// app/routes/health.jsx
import { json } from "@remix-run/node";

export async function loader() {
  try {
    // Check database connection
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    // Simple query to test DB connection
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    
    return json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        app: "running"
      }
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message
      },
      { status: 503 }
    );
  }
}