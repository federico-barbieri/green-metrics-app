// app/utils/pdf-generator.js
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';

export async function generateSustainabilityReportPDF(reportData) {
  try {
    const { storeName, metrics, sustainabilityScore, generatedAt } = reportData;
    const { current } = metrics;
    
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });
      const chunks = [];
      
      // Collect the PDF data
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Enhanced color scheme
      const colors = {
        primary: '#1B5E20',      // Deep forest green
        secondary: '#2E7D32',    // Medium forest green
        accent: '#4CAF50',       // Bright green
        light: '#E8F5E8',        // Very light green
        success: '#4CAF50',      // Green
        warning: '#FF8F00',      // Amber
        danger: '#D32F2F',       // Red
        text: '#212121',         // Almost black
        textSecondary: '#616161', // Medium gray
        textLight: '#9E9E9E',    // Light gray
        white: '#FFFFFF',
        border: '#E0E0E0',       // Light border
        cardBg: '#FAFAFA'        // Card background
      };
      
      // Font configuration - using only standard PDFKit fonts
      const fonts = {
        regular: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        boldItalic: 'Helvetica-BoldOblique'
      };
      
      const pageWidth = doc.page.width - 80; 
      const pageHeight = doc.page.height - 80;
      let currentY = 40;
      
      // Fixed utility function to check if we need a new page
      function checkPageBreak(requiredHeight, forceNewPage = false) {
        const availableSpace = pageHeight + 40 - currentY; 
        if (forceNewPage || requiredHeight > availableSpace - 20) { 
          doc.addPage();
          currentY = 40;
          return true;
        }
        return false;
      }
      
      // Header Section with modern gradient design
      function createHeader() {
        // Main header background with gradient effect
        const headerHeight = 120; 
        
        // Primary background
        doc.rect(0, 0, doc.page.width, headerHeight)
           .fill(colors.primary);
        
        // Simplified gradient overlay effect
        for (let i = 0; i < 10; i++) { 
          const opacity = 0.05 - (i * 0.005);
          if (opacity > 0) {
            doc.rect(0, headerHeight - 40 + (i * 2), doc.page.width, 2)
               .fillOpacity(opacity)
               .fill(colors.white)
               .fillOpacity(1);
          }
        }
        
        // Single decorative element
        doc.circle(doc.page.width - 60, 30, 20) 
           .fillOpacity(0.1)
           .fill(colors.white)
           .fillOpacity(1);
        
        // Header text with proper font handling
        doc.fontSize(28) 
           .fillColor(colors.white)
           .font(fonts.bold)
           .text('SUSTAINABILITY', 40, 30, { 
             width: pageWidth, 
             align: 'left' 
           });
        
        doc.fontSize(28) 
           .fillColor(colors.accent)
           .font(fonts.bold)
           .text('REPORT', 40, 60, { 
             width: pageWidth, 
             align: 'left' 
           });
        
        // Store name with elegant styling
        const cleanStoreName = storeName.replace('.myshopify.com', '').toUpperCase();
        doc.fontSize(14)
           .fillColor(colors.white)
           .font(fonts.regular)
           .text(cleanStoreName, 40, 95, { 
             width: pageWidth - 100, 
             align: 'left' 
           });
        
        // Date with styling
        doc.fontSize(10)
           .fillColor(colors.white)
           .fillOpacity(0.9)
           .font(fonts.regular)
           .text(`Generated ${format(generatedAt, 'MMMM dd, yyyy')}`, 40, 110)
           .fillOpacity(1);
        
        currentY = headerHeight + 20; 
      }
      
      // Optimized Score Card
      function createScoreCard() {
        const cardHeight = 100; 
        checkPageBreak(cardHeight + 15);
        
        // Single shadow effect
        doc.roundedRect(41, currentY + 1, pageWidth, cardHeight, 10)
           .fillOpacity(0.05)
           .fill(colors.text)
           .fillOpacity(1);
        
        doc.roundedRect(40, currentY, pageWidth, cardHeight, 10)
           .fill(colors.white)
           .stroke(colors.border)
           .lineWidth(1);
        
        // Score circle with simplified design
        const circleX = 120; 
        const circleY = currentY + 50;
        const circleRadius = 35; 
        const scoreColor = getScoreColor(sustainabilityScore, colors);
        
        // Single outer glow
        doc.circle(circleX, circleY, circleRadius + 3)
           .fillOpacity(0.1)
           .fill(scoreColor)
           .fillOpacity(1);
        
        // Main circle
        doc.circle(circleX, circleY, circleRadius)
           .fill(scoreColor);
        
        // Inner highlight
        doc.circle(circleX - 6, circleY - 6, 6)
           .fillOpacity(0.3)
           .fill(colors.white)
           .fillOpacity(1);
        
        // Score text with better positioning
        const scoreText = sustainabilityScore.toString();
        doc.fontSize(24) 
           .fillColor(colors.white)
           .font(fonts.bold);
        
        const scoreWidth = doc.widthOfString(scoreText);
        doc.text(scoreText, circleX - scoreWidth/2, circleY - 8);
        
        // Score description with proper typography
        doc.fontSize(22) 
           .fillColor(colors.text)
           .font(fonts.regular)
           .text('Sustainability Score', 180, currentY + 25);
        
        doc.fontSize(14)
           .fillColor(scoreColor)
           .font(fonts.bold)
           .text(getScoreDescription(sustainabilityScore).toUpperCase(), 180, currentY + 48);
        
        doc.fontSize(11)
           .fillColor(colors.textSecondary)
           .font(fonts.regular)
           .text('Based on materials, packaging, delivery & local sourcing', 180, currentY + 68, { 
             width: pageWidth - 160 
           });
        
        currentY += cardHeight + 25; 
      }
      
      // Optimized Metrics Section
      function createMetricsSection() {
        checkPageBreak(50); 
        
        // Section header with underline
        doc.fontSize(18) 
           .fillColor(colors.text)
           .font(fonts.bold)
           .text('Performance Metrics', 40, currentY);
        
        // Decorative underline
        doc.rect(40, currentY + 22, 160, 2)
           .fill(colors.accent);
        
        currentY += 35; 
        
        const metricsData = [
          { 
            label: 'Sustainable Materials', 
            value: `${current.sustainableMaterialsPercent.toFixed(1)}%`,
            target: '70%+',
            status: current.sustainableMaterialsPercent >= 70 ? 'good' : 
                   current.sustainableMaterialsPercent >= 40 ? 'warning' : 'poor',
            icon: 'M'
          },
          { 
            label: 'Local Products', 
            value: `${current.localProductsPercent.toFixed(1)}%`,
            target: '40%+',
            status: current.localProductsPercent >= 40 ? 'good' : 
                   current.localProductsPercent >= 20 ? 'warning' : 'poor',
            icon: 'L'
          },
          { 
            label: 'Packaging Efficiency', 
            value: `${current.avgPackagingRatio.toFixed(2)}:1`,
            target: '<1.2:1',
            status: current.avgPackagingRatio <= 1.2 ? 'good' : 
                   current.avgPackagingRatio <= 1.5 ? 'warning' : 'poor',
            icon: 'P'
          },
          { 
            label: 'Delivery Distance', 
            value: `${current.avgDeliveryDistanceKm.toFixed(1)} km`,
            target: '<40 km',
            status: current.avgDeliveryDistanceKm <= 40 ? 'good' : 
                   current.avgDeliveryDistanceKm <= 60 ? 'warning' : 'poor',
            icon: 'D'
          }
        ];
        
        const cardWidth = (pageWidth - 15) / 2;
        const cardHeight = 85; 
        
        for (let i = 0; i < metricsData.length; i += 2) {
          checkPageBreak(cardHeight + 15);
          
          // Draw two cards per row
          for (let j = 0; j < 2 && i + j < metricsData.length; j++) {
            const metric = metricsData[i + j];
            const x = 40 + j * (cardWidth + 15);
            const y = currentY;
            
            // Single card shadow
            doc.roundedRect(x + 1, y + 1, cardWidth, cardHeight, 6)
               .fillOpacity(0.03)
               .fill(colors.text)
               .fillOpacity(1);
            
            // Card background and border
            doc.roundedRect(x, y, cardWidth, cardHeight, 6)
               .fill(colors.white)
               .stroke(colors.border)
               .lineWidth(1);
            
            // Status indicator bar
            const statusColor = metric.status === 'good' ? colors.success : 
                               metric.status === 'warning' ? colors.warning : colors.danger;
            
            doc.roundedRect(x, y, cardWidth, 4, 2) 
               .fill(statusColor);
            
            // Metric value
            doc.fontSize(20) 
               .fillColor(statusColor)
               .font(fonts.bold)
               .text(metric.value, x + 12, y + 15);
            
            // Icon using colored letter
            doc.fontSize(10)
               .fillColor(colors.white)
               .font(fonts.bold);
            
            // Create circular background for icon
            doc.circle(x + cardWidth - 20, y + 20, 8)
               .fill(statusColor);
            
            const iconWidth = doc.widthOfString(metric.icon);
            doc.text(metric.icon, x + cardWidth - 20 - iconWidth/2, y + 16);
            
            // Label
            doc.fontSize(11) 
               .fillColor(colors.text)
               .font(fonts.bold)
               .text(metric.label, x + 12, y + 45);
            
            // Target
            doc.fontSize(9) 
               .fillColor(colors.textSecondary)
               .font(fonts.regular)
               .text(`Target: ${metric.target}`, x + 12, y + 62);
            
            // Status indicator dot
            doc.circle(x + cardWidth - 12, y + 65, 3)
               .fill(statusColor);
          }
          
          currentY += cardHeight + 15; 
        }
        
        currentY += 15; 
      }
            
      
      // Fixed Footer
      function createFooter() {
        const footerHeight = 50; 
        
        // Always go to a new page for footer if we're too close to bottom
        if (currentY > pageHeight - footerHeight - 20) {
          doc.addPage();
        }
        
        const footerY = doc.page.height - footerHeight;
        
        // Footer background
        doc.rect(0, footerY, doc.page.width, footerHeight)
           .fill(colors.primary);
        
        // Single decorative element
        doc.circle(60, footerY + 25, 15)
           .fillOpacity(0.1)
           .fill(colors.white)
           .fillOpacity(1);
        
        // Footer content
        doc.fontSize(12)
           .fillColor(colors.white)
           .font(fonts.bold)
           .text('Green Metrics', 40, footerY + 12, { 
             width: pageWidth, 
             align: 'center' 
           });
        
        doc.fontSize(10)
           .fillColor(colors.white)
           .font(fonts.regular)
           .text('Empowering Sustainable Commerce - Insights for Environmental Impact', 
                 40, footerY + 28, { 
                   width: pageWidth, 
                   align: 'center' 
                 });
      }
      
      // Generate the complete report
      try {
        createHeader();
        createScoreCard();
        createMetricsSection();
        createFooter();
        
        
        
        doc.end();
      } catch (error) {
        console.error('Error in PDF generation sections:', error);
        reject(error);
      }
    });
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
}

function getScoreColor(score, colors) {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.accent;
  if (score >= 40) return colors.warning;
  return colors.danger;
}

function getScoreDescription(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}
