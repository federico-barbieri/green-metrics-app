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
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      const chunks = [];
      
      // Collect the PDF data
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Color scheme
      const colors = {
        primary: '#00A86B',
        secondary: '#4CAF50',
        accent: '#81C784',
        text: '#2E2E2E',
        lightGray: '#F5F5F5',
        mediumGray: '#BDBDBD',
        darkGray: '#757575'
      };
      
      const pageWidth = doc.page.width - 100; // Account for margins
      
      // Header with gradient effect
      doc.rect(0, 0, doc.page.width, 120)
         .fill(colors.primary);
      
      // White overlay for gradient effect
      doc.rect(0, 80, doc.page.width, 40)
         .fillOpacity(0.1)
         .fill('white')
         .fillOpacity(1);
      
      // Header content
      doc.fontSize(28)
         .fillColor('white')
         .font('Helvetica-Bold')
         .text('🌱 SUSTAINABILITY REPORT', 50, 30, { 
           width: pageWidth, 
           align: 'center' 
         });
      
      doc.fontSize(14)
         .fillColor('white')
         .font('Helvetica')
         .text(storeName.toUpperCase(), 50, 65, { 
           width: pageWidth, 
           align: 'center' 
         });
      
      doc.fontSize(10)
         .fillColor('white')
         .text(`Generated on ${format(generatedAt, 'MMMM dd, yyyy')}`, 50, 85, { 
           width: pageWidth, 
           align: 'center' 
         });
      
      // Reset Y position after header
      doc.y = 140;
      
      // Sustainability Score Card
      const scoreCardY = doc.y;
      const scoreCardHeight = 100;
      
      // Background card
      doc.roundedRect(50, scoreCardY, pageWidth, scoreCardHeight, 8)
         .fill(colors.lightGray);
      
      // Score circle background
      const circleX = 150;
      const circleY = scoreCardY + 50;
      const circleRadius = 35;
      
      doc.circle(circleX, circleY, circleRadius)
         .fill(getScoreColor(sustainabilityScore, colors));
      
      // Score text
      doc.fontSize(24)
         .fillColor('white')
         .font('Helvetica-Bold')
         .text(sustainabilityScore.toString(), circleX - 15, circleY - 8);
      
      // Score description
      doc.fontSize(18)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Overall Sustainability Score', 220, scoreCardY + 25);
      
      doc.fontSize(12)
         .fillColor(colors.darkGray)
         .font('Helvetica')
         .text(`Your store shows ${getScoreDescription(sustainabilityScore)} performance`, 220, scoreCardY + 50);
      
      doc.fontSize(10)
         .fillColor(colors.darkGray)
         .text('Based on materials, packaging, delivery & local sourcing', 220, scoreCardY + 70);
      
      doc.y = scoreCardY + scoreCardHeight + 30;
      
      // Key Metrics Section
      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('📊 Key Performance Metrics');
      
      doc.y += 20;
      
      const metricsData = [
        { 
          label: 'Sustainable Materials', 
          value: `${current.sustainableMaterialsPercent.toFixed(1)}%`,
          icon: '🌿',
          target: '70%+',
          status: current.sustainableMaterialsPercent >= 70 ? 'good' : current.sustainableMaterialsPercent >= 40 ? 'warning' : 'poor'
        },
        { 
          label: 'Local Products', 
          value: `${current.localProductsPercent.toFixed(1)}%`,
          icon: '📍',
          target: '40%+',
          status: current.localProductsPercent >= 40 ? 'good' : current.localProductsPercent >= 20 ? 'warning' : 'poor'
        },
        { 
          label: 'Packaging Efficiency', 
          value: `${current.avgPackagingRatio.toFixed(2)}:1`,
          icon: '📦',
          target: '<1.2:1',
          status: current.avgPackagingRatio <= 1.2 ? 'good' : current.avgPackagingRatio <= 1.5 ? 'warning' : 'poor'
        },
        { 
          label: 'Delivery Distance', 
          value: `${current.avgDeliveryDistanceKm.toFixed(1)} km`,
          icon: '🚚',
          target: '<40 km',
          status: current.avgDeliveryDistanceKm <= 40 ? 'good' : current.avgDeliveryDistanceKm <= 60 ? 'warning' : 'poor'
        }
      ];
      
      const cardWidth = (pageWidth - 30) / 2;
      const cardHeight = 80;
      
      metricsData.forEach((metric, index) => {
        const x = 50 + (index % 2) * (cardWidth + 15);
        const y = doc.y + Math.floor(index / 2) * (cardHeight + 15);
        
        // Card background
        doc.roundedRect(x, y, cardWidth, cardHeight, 6)
           .fill('white')
           .stroke(colors.mediumGray)
           .lineWidth(1);
        
        // Status indicator
        const statusColor = metric.status === 'good' ? colors.secondary : 
                           metric.status === 'warning' ? '#FF9800' : '#F44336';
        
        doc.rect(x, y, cardWidth, 4)
           .fill(statusColor);
        
        // Icon and value
        doc.fontSize(16)
           .fillColor(colors.text)
           .font('Helvetica')
           .text(metric.icon, x + 15, y + 15);
        
        doc.fontSize(20)
           .fillColor(statusColor)
           .font('Helvetica-Bold')
           .text(metric.value, x + 45, y + 12);
        
        // Label and target
        doc.fontSize(11)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text(metric.label, x + 15, y + 40);
        
        doc.fontSize(9)
           .fillColor(colors.darkGray)
           .font('Helvetica')
           .text(`Target: ${metric.target}`, x + 15, y + 55);
      });
      
      doc.y += Math.ceil(metricsData.length / 2) * (cardHeight + 15) + 20;
      
      // Recommendations Section
      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('💡 Recommendations for Improvement');
      
      doc.y += 15;
      
      const recommendations = generateRecommendations(current);
      
      recommendations.forEach((rec, index) => {
        const recY = doc.y;
        
        // Recommendation card
        doc.roundedRect(50, recY, pageWidth, 60, 6)
           .fill(index % 2 === 0 ? colors.lightGray : 'white')
           .stroke(colors.mediumGray)
           .lineWidth(0.5);
        
        // Priority indicator
        const priorityColor = rec.priority === 'high' ? '#F44336' : 
                             rec.priority === 'medium' ? '#FF9800' : colors.secondary;
        
        doc.circle(70, recY + 20, 6)
           .fill(priorityColor);
        
        // Recommendation content
        doc.fontSize(12)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text(rec.title, 90, recY + 15, { width: pageWidth - 60 });
        
        doc.fontSize(10)
           .fillColor(colors.darkGray)
           .font('Helvetica')
           .text(rec.description, 90, recY + 32, { width: pageWidth - 60 });
        
        doc.y = recY + 75;
      });
      
      // Add new page if needed for footer
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }
      
      // Footer
      const footerY = doc.page.height - 80;
      doc.rect(0, footerY, doc.page.width, 80)
         .fill(colors.primary);
      
      doc.fontSize(10)
         .fillColor('white')
         .font('Helvetica')
         .text('Generated by Green Metrics App - Empowering Sustainable Commerce', 
               50, footerY + 20, { width: pageWidth, align: 'center' });
      
      doc.fontSize(8)
         .fillColor('white')
         .text('This report provides insights to help improve your store\'s environmental impact', 
               50, footerY + 40, { width: pageWidth, align: 'center' });
      
      doc.end();
    });
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
}

function getScoreColor(score, colors) {
  if (score >= 80) return colors.secondary;
  if (score >= 60) return '#4CAF50';
  if (score >= 40) return '#FF9800';
  return '#F44336';
}

function getScoreDescription(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'moderate';
  return 'needs improvement';
}

function generateRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.sustainableMaterialsPercent < 50) {
    recommendations.push({
      title: 'Increase Sustainable Materials Usage',
      description: `Current: ${metrics.sustainableMaterialsPercent.toFixed(1)}%. Partner with certified sustainable suppliers and consider recycled or organic alternatives.`,
      priority: 'high'
    });
  }
  
  if (metrics.localProductsPercent < 30) {
    recommendations.push({
      title: 'Expand Local Sourcing Network',
      description: `Current: ${metrics.localProductsPercent.toFixed(1)}%. Identify local manufacturers and suppliers to reduce carbon footprint and support local economy.`,
      priority: 'medium'
    });
  }
  
  if (metrics.avgPackagingRatio > 1.5) {
    recommendations.push({
      title: 'Optimize Packaging Design',
      description: `Current ratio: ${metrics.avgPackagingRatio.toFixed(2)}:1. Implement minimal packaging strategies and lightweight materials to improve efficiency.`,
      priority: 'high'
    });
  }
  
  if (metrics.avgDeliveryDistanceKm > 50) {
    recommendations.push({
      title: 'Reduce Delivery Distances',
      description: `Current: ${metrics.avgDeliveryDistanceKm.toFixed(1)} km. Consider regional fulfillment centers or local distribution partnerships.`,
      priority: 'medium'
    });
  }
  
  // Always add improvement suggestions
  if (metrics.sustainableMaterialsPercent >= 70) {
    recommendations.push({
      title: 'Maintain Sustainable Materials Excellence',
      description: 'Continue working with current sustainable suppliers and explore innovative eco-friendly materials.',
      priority: 'low'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      title: 'Outstanding Sustainability Performance!',
      description: 'Your store excels across all sustainability metrics. Consider sharing your best practices with other merchants.',
      priority: 'low'
    });
  }
  
  return recommendations.slice(0, 4); // Limit to 4 recommendations for better layout
}