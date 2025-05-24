// app/utils/pdf-generator.js
import puppeteer from 'puppeteer';
import { format } from 'date-fns';

export async function generateSustainabilityReportPDF(reportData) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    const htmlContent = generateReportHTML(reportData);
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
          Sustainability Report - ${reportData.storeName}
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
          Generated on ${format(reportData.generatedAt, 'PPP')} | Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `
    });
    
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

function generateReportHTML(data) {
  const { storeName, metrics, sustainabilityScore, generatedAt } = data;
  const { current, trends } = metrics;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Sustainability Report - ${storeName}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
          line-height: 1.6;
        }
        
        .header {
          text-align: center;
          border-bottom: 3px solid #00A86B;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        
        .header h1 {
          color: #00A86B;
          margin: 0;
          font-size: 2.5em;
        }
        
        .header p {
          color: #666;
          margin: 10px 0;
          font-size: 1.2em;
        }
        
        .sustainability-score {
          background: linear-gradient(135deg, #00A86B, #28a745);
          color: white;
          text-align: center;
          padding: 30px;
          border-radius: 10px;
          margin: 20px 0;
        }
        
        .score-number {
          font-size: 4em;
          font-weight: bold;
          margin: 0;
        }
        
        .score-label {
          font-size: 1.2em;
        }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin: 30px 0;
        }
        
        .metric-card {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #00A86B;
        }
        
        .metric-value {
          font-size: 2.5em;
          font-weight: bold;
          color: #00A86B;
          margin: 10px 0;
        }
        
        .metric-label {
          font-size: 1.1em;
          color: #666;
          margin: 0;
        }
        
        .chart-container {
          margin: 30px 0;
          page-break-inside: avoid;
        }
        
        .chart-title {
          font-size: 1.4em;
          color: #333;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .canvas-container {
          position: relative;
          height: 300px;
          margin: 20px 0;
        }
        
        .recommendations {
          background: #e3f2fd;
          padding: 25px;
          border-radius: 8px;
          margin: 30px 0;
          border-left: 4px solid #2196f3;
        }
        
        .recommendations h3 {
          color: #1976d2;
          margin-top: 0;
        }
        
        .recommendation-item {
          background: white;
          padding: 15px;
          margin: 10px 0;
          border-radius: 5px;
          border-left: 3px solid #4caf50;
        }
        
        .page-break {
          page-break-before: always;
        }
        
        .summary-section {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        
        @media print {
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🌱 Sustainability Report</h1>
        <p><strong>${storeName}</strong></p>
        <p>Generated on ${format(generatedAt, 'PPP')}</p>
      </div>
      
      <div class="sustainability-score">
        <div class="score-number">${sustainabilityScore}</div>
        <div class="score-label">Overall Sustainability Score</div>
      </div>
      
      <div class="summary-section">
        <h2>Executive Summary</h2>
        <p>Your store achieved a sustainability score of <strong>${sustainabilityScore}/100</strong>, indicating ${getScoreDescription(sustainabilityScore)} performance in sustainable practices.</p>
        <p><strong>Key Highlights:</strong></p>
        <ul>
          <li>${current.sustainableMaterialsPercent.toFixed(1)}% of your products use sustainable materials</li>
          <li>${current.localProductsPercent.toFixed(1)}% of products are locally produced</li>
          <li>Average packaging ratio: ${current.avgPackagingRatio.toFixed(2)}:1</li>
          <li>Average delivery distance: ${current.avgDeliveryDistanceKm.toFixed(1)} km</li>
        </ul>
      </div>
      
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${current.sustainableMaterialsPercent.toFixed(1)}%</div>
          <div class="metric-label">Sustainable Materials</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${current.localProductsPercent.toFixed(1)}%</div>
          <div class="metric-label">Local Products</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${current.avgPackagingRatio.toFixed(2)}:1</div>
          <div class="metric-label">Packaging Ratio</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${current.avgDeliveryDistanceKm.toFixed(1)} km</div>
          <div class="metric-label">Avg Delivery Distance</div>
        </div>
      </div>
      
      <div class="page-break"></div>
      
      <div class="chart-container">
        <div class="chart-title">Sustainability Trends (Last 24 Hours)</div>
        <div class="canvas-container">
          <canvas id="trendsChart"></canvas>
        </div>
      </div>
      
      <div class="recommendations">
        <h3>🎯 Actionable Recommendations</h3>
        ${generateRecommendations(current)}
      </div>
      
      <script>
        // Initialize Chart.js
        const ctx = document.getElementById('trendsChart').getContext('2d');
        
        const trendsData = {
          datasets: [
            {
              label: 'Sustainable Materials %',
              data: ${JSON.stringify(trends.sustainableMaterials.map(d => ({ x: d.timestamp, y: d.value })))},
              borderColor: '#00A86B',
              backgroundColor: 'rgba(0, 168, 107, 0.1)',
              tension: 0.4
            },
            {
              label: 'Local Products %',
              data: ${JSON.stringify(trends.localProducts.map(d => ({ x: d.timestamp, y: d.value })))},
              borderColor: '#2196F3',
              backgroundColor: 'rgba(33, 150, 243, 0.1)',
              tension: 0.4
            }
          ]
        };
        
        new Chart(ctx, {
          type: 'line',
          data: trendsData,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                type: 'time',
                time: {
                  displayFormats: {
                    hour: 'HH:mm'
                  }
                }
              },
              y: {
                beginAtZero: true,
                max: 100
              }
            },
            plugins: {
              legend: {
                position: 'top'
              }
            }
          }
        });
      </script>
    </body>
    </html>
  `;
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
    recommendations.push(`
      <div class="recommendation-item">
        <strong>🌱 Increase Sustainable Materials</strong><br>
        Current: ${metrics.sustainableMaterialsPercent.toFixed(1)}%. Target: 60%+<br>
        <em>Partner with suppliers offering recycled or organic materials to boost your sustainability score.</em>
      </div>
    `);
  }
  
  if (metrics.localProductsPercent < 30) {
    recommendations.push(`
      <div class="recommendation-item">
        <strong>🏘️ Source More Locally</strong><br>
        Current: ${metrics.localProductsPercent.toFixed(1)}%. Target: 40%+<br>
        <em>Identify local manufacturers to reduce carbon footprint and support local economy.</em>
      </div>
    `);
  }
  
  if (metrics.avgPackagingRatio > 1.5) {
    recommendations.push(`
      <div class="recommendation-item">
        <strong>📦 Optimize Packaging</strong><br>
        Current ratio: ${metrics.avgPackagingRatio.toFixed(2)}:1. Target: <1.2:1<br>
        <em>Use minimal, lightweight packaging and consider compostable materials.</em>
      </div>
    `);
  }
  
  if (metrics.avgDeliveryDistanceKm > 50) {
    recommendations.push(`
      <div class="recommendation-item">
        <strong>🚚 Reduce Delivery Distance</strong><br>
        Current: ${metrics.avgDeliveryDistanceKm.toFixed(1)} km. Target: <40 km<br>
        <em>Consider regional fulfillment centers or local pickup options.</em>
      </div>
    `);
  }
  
  if (recommendations.length === 0) {
    recommendations.push(`
      <div class="recommendation-item">
        <strong>🎉 Excellent Performance!</strong><br>
        <em>Your store is performing well across all sustainability metrics. Keep up the great work!</em>
      </div>
    `);
  }
  
  return recommendations.join('');
}