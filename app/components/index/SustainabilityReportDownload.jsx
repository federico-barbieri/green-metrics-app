// app/components/index/SustainabilityReportDownload.jsx
import { useState } from "react";
import { Card, BlockStack, Text, Banner, Box, Button } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function SustainabilityReportDownload() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const shopify = useAppBridge();

  const handleDownloadReport = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }
      
      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sustainability-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      shopify.toast.show("Sustainability report downloaded successfully!");
      
    } catch (err) {
      console.error('Error downloading report:', err);
      setError(err.message);
      shopify.toast.show("Failed to generate report", { isError: true });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card gap="400">
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd" color="red">
            📊 Sustainability Report
          </Text>
          <Text variant="bodyMd" as="p" color="subdued">
            Generate a comprehensive PDF report with your store's sustainability metrics, 
            trends, and actionable recommendations.
          </Text>
        </BlockStack>
        
        {error && (
          <Banner status="critical" title="Error generating report">
            <p>{error}</p>
          </Banner>
        )}
        
        <Box>
          <Button
            primary
            loading={isGenerating}
            disabled={isGenerating}
            onClick={handleDownloadReport}
          >
            {isGenerating ? 'Generating Report...' : 'Download Sustainability Report'}
          </Button>
        </Box>
        
        <Text variant="bodySm" as="p" color="subdued">
          Report includes: Sustainability score, material analysis, packaging efficiency, 
          delivery distance metrics, and personalized recommendations.
        </Text>
      </BlockStack>
    </Card>
  );
}