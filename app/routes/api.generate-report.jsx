// app/routes/api.generate-report.jsx
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getSustainabilityMetrics, calculateSustainabilityScore } from "../utils/prometheus";
import { generateSustainabilityReportPDF } from "../utils/pdf-generator";

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    
    // Get the actual store ID from your database
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const store = await prisma.store.findUnique({
      where: { shopifyDomain: session.shop }
    });
        
    if (!store) {
      throw new Error(`Store not found in database for domain: ${session.shop}`);
    }
    
    // Use the actual store ID from the database
    const storeId = store.id;

    // Fetch sustainability metrics from Prometheus
    let metrics = await getSustainabilityMetrics(storeId);

    // If we get empty data, wait for Prometheus to scrape fresh metrics
    if (metrics.current.totalProducts === 0) {
      await new Promise(resolve => setTimeout(resolve, 20000)); // Wait 20 seconds
      
      // Try again
      const retryMetrics = await getSustainabilityMetrics(storeId);
      
      if (retryMetrics.current.totalProducts > 0) {
        metrics = retryMetrics; // Use the retry metrics
      } 
    }

    // Calculate sustainability score using the final metrics
    const sustainabilityScore = calculateSustainabilityScore(metrics);
    
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