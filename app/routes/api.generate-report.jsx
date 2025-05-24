// app/routes/api.generate-report.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getSustainabilityMetrics, calculateSustainabilityScore } from "../utils/prometheus";
import { generateSustainabilityReportPDF } from "../utils/pdf-generator";

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    
    // Debug: Log the session info
    console.log('Session shop domain:', session.shop);
    
    // Get the actual store ID from your database
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop }
    });
    
    console.log('Store from database:', store);
    
    if (!store) {
      throw new Error(`Store not found in database for domain: ${session.shop}`);
    }
    
    // Use the actual store ID from your database
    const storeId = store.id;
    console.log('Using store ID for Prometheus:', storeId);
    
    // Fetch sustainability metrics from Prometheus
    const metrics = await getSustainabilityMetrics(storeId);
    const sustainabilityScore = calculateSustainabilityScore(metrics);
    
    console.log('Final metrics being sent to PDF:', {
      sustainabilityScore,
      metrics: metrics.current
    });
    
    // Generate PDF
    const pdfBuffer = await generateSustainabilityReportPDF({
      storeId: storeId,
      storeName: session.shop,
      metrics,
      sustainabilityScore,
      generatedAt: new Date()
    });
    
    // Return PDF as download
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sustainability-report-${storeId}-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('Error generating sustainability report:', error);
    return json(
      { error: 'Failed to generate sustainability report', details: error.message },
      { status: 500 }
    );
  }
}

export async function loader({ request }) {
  // For GET requests, show a simple preview or redirect
  return json({ message: "Use POST to generate sustainability report" });
}