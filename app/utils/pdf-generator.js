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
      
      const pageWidth = doc.page.width - 80; // Account for margins
      const pageHeight = doc.page.height - 80;
      let currentY = 40;
      
      // Utility function to check if we need a new page
      function checkPageBreak(requiredHeight, forceNewPage = false) {
        const availableSpace = pageHeight - currentY + 40; // Add some buffer
        if (forceNewPage || requiredHeight > availableSpace) {
          doc.addPage();
          currentY = 40;
          return true;
        }
        return false;
      }
      
      // Header Section with modern gradient design
      function createHeader() {
        // Main header background with gradient effect
        const headerHeight = 140;
        
        // Primary background
        doc.rect(0, 0, doc.page.width, headerHeight)
           .fill(colors.primary);
        
        // Gradient overlay effect using multiple rectangles
        for (let i = 0; i < 20; i++) {
          const opacity = 0.05 - (i * 0.002);
          if (opacity > 0) {
            doc.rect(0, headerHeight - 60 + (i * 2), doc.page.width, 2)
               .fillOpacity(opacity)
               .fill(colors.white)
               .fillOpacity(1);
          }
        }
        
        // Decorative elements
        doc.circle(doc.page.width - 60, 30, 25)
           .fillOpacity(0.1)
           .fill(colors.white)
           .fillOpacity(1);
        
        doc.circle(50, headerHeight - 30, 15)
           .fillOpacity(0.15)
           .fill(colors.white)
           .fillOpacity(1);
        
        // Header text with proper font handling
        doc.fontSize(32)
           .fillColor(colors.white)
           .font(fonts.bold)
           .text('SUSTAINABILITY', 40, 35, { 
             width: pageWidth, 
             align: 'left' 
           });
        
        doc.fontSize(32)
           .fillColor(colors.accent)
           .font(fonts.bold)
           .text('REPORT', 40, 70, { 
             width: pageWidth, 
             align: 'left' 
           });
        
        // Store name with elegant styling
        const cleanStoreName = storeName.replace('.myshopify.com', '').toUpperCase();
        doc.fontSize(14)
           .fillColor(colors.white)
           .font(fonts.regular)
           .text(cleanStoreName, 40, 115, { 
             width: pageWidth - 100, 
             align: 'left' 
           });
        
        // Date with styling
        doc.fontSize(10)
           .fillColor(colors.white)
           .fillOpacity(0.9)
           .font(fonts.regular)
           .text(`Generated ${format(generatedAt, 'MMMM dd, yyyy')}`, 40, 130)
           .fillOpacity(1);
        
        currentY = headerHeight + 30;
      }
      
      // Enhanced Score Card
      function createScoreCard() {
        const cardHeight = 120;
        checkPageBreak(cardHeight + 20);
        
        // Card background with shadow effect
        doc.roundedRect(42, currentY + 2, pageWidth, cardHeight, 12)
           .fillOpacity(0.1)
           .fill(colors.text)
           .fillOpacity(1);
        
        doc.roundedRect(40, currentY, pageWidth, cardHeight, 12)
           .fill(colors.white)
           .stroke(colors.border)
           .lineWidth(1);
        
        // Score circle with enhanced design
        const circleX = 130;
        const circleY = currentY + 60;
        const circleRadius = 40;
        const scoreColor = getScoreColor(sustainabilityScore, colors);
        
        // Outer glow effect using multiple circles
        for (let i = 5; i > 0; i--) {
          doc.circle(circleX, circleY, circleRadius + i)
             .fillOpacity(0.05)
             .fill(scoreColor)
             .fillOpacity(1);
        }
        
        // Main circle
        doc.circle(circleX, circleY, circleRadius)
           .fill(scoreColor);
        
        // Inner highlight
        doc.circle(circleX - 8, circleY - 8, 8)
           .fillOpacity(0.3)
           .fill(colors.white)
           .fillOpacity(1);
        
        // Score text with better positioning
        const scoreText = sustainabilityScore.toString();
        doc.fontSize(28)
           .fillColor(colors.white)
           .font(fonts.bold);
        
        const scoreWidth = doc.widthOfString(scoreText);
        doc.text(scoreText, circleX - scoreWidth/2, circleY - 10);
        
        // Score description with proper typography
        doc.fontSize(24)
           .fillColor(colors.text)
           .font(fonts.regular)
           .text('Sustainability Score', 200, currentY + 30);
        
        doc.fontSize(14)
           .fillColor(scoreColor)
           .font(fonts.bold)
           .text(getScoreDescription(sustainabilityScore).toUpperCase(), 200, currentY + 58);
        
        doc.fontSize(11)
           .fillColor(colors.textSecondary)
           .font(fonts.regular)
           .text('Based on materials, packaging, delivery & local sourcing', 200, currentY + 80, { 
             width: pageWidth - 180 
           });
        
        currentY += cardHeight + 40;
      }
      
      // Enhanced Metrics Section
      function createMetricsSection() {
        checkPageBreak(60);
        
        // Section header with underline
        doc.fontSize(20)
           .fillColor(colors.text)
           .font(fonts.bold)
           .text('Performance Metrics', 40, currentY);
        
        // Decorative underline
        doc.rect(40, currentY + 25, 180, 2)
           .fill(colors.accent);
        
        currentY += 45;
        
        const metricsData = [
          { 
            label: 'Sustainable Materials', 
            value: `${current.sustainableMaterialsPercent.toFixed(1)}%`,
            target: '70%+',
            status: current.sustainableMaterialsPercent >= 70 ? 'good' : 
                   current.sustainableMaterialsPercent >= 40 ? 'warning' : 'poor',
            icon: 'M' // Using letter M for Materials
          },
          { 
            label: 'Local Products', 
            value: `${current.localProductsPercent.toFixed(1)}%`,
            target: '40%+',
            status: current.localProductsPercent >= 40 ? 'good' : 
                   current.localProductsPercent >= 20 ? 'warning' : 'poor',
            icon: 'L' // Using letter L for Local
          },
          { 
            label: 'Packaging Efficiency', 
            value: `${current.avgPackagingRatio.toFixed(2)}:1`,
            target: '<1.2:1',
            status: current.avgPackagingRatio <= 1.2 ? 'good' : 
                   current.avgPackagingRatio <= 1.5 ? 'warning' : 'poor',
            icon: 'P' // Using letter P for Packaging
          },
          { 
            label: 'Delivery Distance', 
            value: `${current.avgDeliveryDistanceKm.toFixed(1)} km`,
            target: '<40 km',
            status: current.avgDeliveryDistanceKm <= 40 ? 'good' : 
                   current.avgDeliveryDistanceKm <= 60 ? 'warning' : 'poor',
            icon: 'D' // Using letter D for Delivery
          }
        ];
        
        const cardWidth = (pageWidth - 20) / 2;
        const cardHeight = 100;
        
        for (let i = 0; i < metricsData.length; i += 2) {
          checkPageBreak(cardHeight + 20);
          
          // Draw two cards per row
          for (let j = 0; j < 2 && i + j < metricsData.length; j++) {
            const metric = metricsData[i + j];
            const x = 40 + j * (cardWidth + 20);
            const y = currentY;
            
            // Card shadow
            doc.roundedRect(x + 1, y + 1, cardWidth, cardHeight, 8)
               .fillOpacity(0.05)
               .fill(colors.text)
               .fillOpacity(1);
            
            // Card background and border
            doc.roundedRect(x, y, cardWidth, cardHeight, 8)
               .fill(colors.white)
               .stroke(colors.border)
               .lineWidth(1);
            
            // Status indicator bar
            const statusColor = metric.status === 'good' ? colors.success : 
                               metric.status === 'warning' ? colors.warning : colors.danger;
            
            doc.roundedRect(x, y, cardWidth, 6, 3)
               .fill(statusColor);
            
            // Metric value
            doc.fontSize(24)
               .fillColor(statusColor)
               .font(fonts.bold)
               .text(metric.value, x + 15, y + 20);
            
            // Icon using colored letter instead of bullet
            doc.fontSize(12)
               .fillColor(colors.white)
               .font(fonts.bold);
            
            // Create circular background for icon
            doc.circle(x + cardWidth - 25, y + 25, 10)
               .fill(statusColor);
            
            const iconWidth = doc.widthOfString(metric.icon);
            doc.text(metric.icon, x + cardWidth - 25 - iconWidth/2, y + 20);
            
            // Label
            doc.fontSize(12)
               .fillColor(colors.text)
               .font(fonts.bold)
               .text(metric.label, x + 15, y + 55);
            
            // Target
            doc.fontSize(10)
               .fillColor(colors.textSecondary)
               .font(fonts.regular)
               .text(`Target: ${metric.target}`, x + 15, y + 75);
            
            // Status indicator dot
            doc.circle(x + cardWidth - 15, y + 75, 4)
               .fill(statusColor);
          }
          
          currentY += cardHeight + 20;
        }
        
        currentY += 20;
      }
      
      // Enhanced Recommendations Section
      function createRecommendationsSection() {
        checkPageBreak(60);
        
        // Section header
        doc.fontSize(20)
           .fillColor(colors.text)
           .font(fonts.bold)
           .text('Recommendations', 40, currentY);
        
        // Decorative underline
        doc.rect(40, currentY + 25, 160, 2)
           .fill(colors.accent);
        
        currentY += 45;
        
        const recommendations = generateRecommendations(current);
        
        recommendations.forEach((rec, index) => {
          const recHeight = 90;
          checkPageBreak(recHeight + 15);
          
          // Card shadow
          doc.roundedRect(41, currentY + 1, pageWidth, recHeight, 10)
             .fillOpacity(0.05)
             .fill(colors.text)
             .fillOpacity(1);
          
          // Recommendation card
          doc.roundedRect(40, currentY, pageWidth, recHeight, 10)
             .fill(colors.white)
             .stroke(colors.border)
             .lineWidth(1);
          
          // Priority indicator
          const priorityColor = rec.priority === 'high' ? colors.danger : 
                               rec.priority === 'medium' ? colors.warning : colors.success;
          
          // Priority bar
          doc.rect(40, currentY, 6, recHeight)
             .fill(priorityColor);
          
          // Priority badge
          const priorityText = rec.priority.toUpperCase();
          doc.fontSize(8)
             .fillColor(colors.white)
             .font(fonts.bold);
          
          const badgeWidth = doc.widthOfString(priorityText) + 12;
          
          doc.roundedRect(pageWidth - badgeWidth + 25, currentY + 15, badgeWidth, 16, 8)
             .fill(priorityColor);
          
          doc.text(priorityText, pageWidth - badgeWidth + 31, currentY + 19);
          
          // Recommendation content
          doc.fontSize(14)
             .fillColor(colors.text)
             .font(fonts.bold)
             .text(rec.title, 60, currentY + 20, { width: pageWidth - 100 });
          
          doc.fontSize(11)
             .fillColor(colors.textSecondary)
             .font(fonts.regular)
             .text(rec.description, 60, currentY + 42, { 
               width: pageWidth - 100,
               lineGap: 2
             });
          
          currentY += recHeight + 15;
        });
        
        currentY += 20;
      }
      
      // Enhanced Footer (only add if there's enough space on current page)
      function createFooter() {
        const footerHeight = 60;
        const footerY = doc.page.height - footerHeight;
        
        // Only add footer if we have space on current page
        if (currentY <= footerY - 20) {
          // Footer background
          doc.rect(0, footerY, doc.page.width, footerHeight)
             .fill(colors.primary);
          
          // Decorative elements
          doc.circle(60, footerY + 30, 20)
             .fillOpacity(0.1)
             .fill(colors.white)
             .fillOpacity(1);
          
          // Footer content
          doc.fontSize(12)
             .fillColor(colors.white)
             .font(fonts.bold)
             .text('Green Metrics', 40, footerY + 15, { 
               width: pageWidth, 
               align: 'center' 
             });
          
          doc.fontSize(10)
             .fillColor(colors.white)
             .fillOpacity(0.8)
             .font(fonts.regular)
             .text('Empowering Sustainable Commerce - Insights for Environmental Impact', 
                   40, footerY + 32, { 
                     width: pageWidth, 
                     align: 'center' 
                   })
             .fillOpacity(1);
        }
      }
      
      // Generate the complete report
      try {
        createHeader();
        createScoreCard();
        createMetricsSection();
        createRecommendationsSection();
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

function generateRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.sustainableMaterialsPercent < 50) {
    recommendations.push({
      title: 'Increase Sustainable Materials Usage',
      description: `Currently at ${metrics.sustainableMaterialsPercent.toFixed(1)}%. Partner with certified sustainable suppliers and consider recycled or organic alternatives. This will significantly boost your environmental score.`,
      priority: 'high'
    });
  }
  
  if (metrics.localProductsPercent < 30) {
    recommendations.push({
      title: 'Expand Local Sourcing Network',
      description: `Currently at ${metrics.localProductsPercent.toFixed(1)}%. Build relationships with local manufacturers and suppliers to reduce carbon footprint while supporting your local economy.`,
      priority: 'medium'
    });
  }
  
  if (metrics.avgPackagingRatio > 1.5) {
    recommendations.push({
      title: 'Optimize Packaging Design',
      description: `Current ratio: ${metrics.avgPackagingRatio.toFixed(2)}:1. Implement minimal packaging strategies using lightweight, biodegradable materials to improve efficiency and reduce waste.`,
      priority: 'high'
    });
  }
  
  if (metrics.avgDeliveryDistanceKm > 50) {
    recommendations.push({
      title: 'Reduce Delivery Distances',
      description: `Current average: ${metrics.avgDeliveryDistanceKm.toFixed(1)} km. Consider regional fulfillment centers, local distribution partnerships, or consolidated shipping options.`,
      priority: 'medium'
    });
  }
  
  // Add positive reinforcement for good performance
  if (metrics.sustainableMaterialsPercent >= 70 && recommendations.length < 2) {
    recommendations.push({
      title: 'Maintain Materials Excellence',
      description: 'Your sustainable materials usage is exemplary. Continue working with current suppliers and explore innovative eco-friendly materials to stay ahead of the curve.',
      priority: 'low'
    });
  }
  
  if (metrics.localProductsPercent >= 40 && recommendations.length < 2) {
    recommendations.push({
      title: 'Local Sourcing Leadership',
      description: 'Your local sourcing strategy is strong. Consider mentoring other businesses or creating case studies to share your successful approach.',
      priority: 'low'
    });
  }
  
  // Ensure we always have at least one recommendation
  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Outstanding Sustainability Performance',
      description: 'Your store excels across all sustainability metrics. Consider obtaining sustainability certifications and using your success as a competitive advantage.',
      priority: 'low'
    });
  }
  
  return recommendations.slice(0, 6); // Allow up to 6 recommendations for comprehensive guidance
}