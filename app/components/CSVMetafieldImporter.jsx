// app/components/CSVMetafieldImporter.jsx 
import { useState, useCallback } from "react";
import {
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  ProgressBar,
  DataTable,
  Badge,
  InlineStack,
  Box,
  Divider,
  Icon
} from "@shopify/polaris";
import { AlertTriangleIcon, CheckCircleIcon, XCircleIcon, UploadIcon } from "@shopify/polaris-icons";
import Papa from "papaparse";

export default function CSVMetafieldImporter() {
  const [csvData, setCsvData] = useState([]);
  const [validationResults, setValidationResults] = useState({ errors: [], warnings: [] });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ success: 0, errors: 0, total: 0 });
  const [currentStep, setCurrentStep] = useState('upload'); // upload, preview, processing, complete

  // VALIDATION FUNCTION
  const validateCSVData = useCallback((data) => {
    const errors = [];
    const warnings = [];
    const validatedData = [];

    console.log("Starting CSV validation for", data.length, "rows");

    data.forEach((row, index) => {
      const rowNum = index + 1;
      const validatedRow = { ...row, _rowNumber: rowNum, _status: 'pending' };

      // Check required fields
      if (!row.product_id) {
        errors.push(`Row ${rowNum}: Missing product_id`);
        validatedRow._status = 'error';
      }

      // Validate sustainable_materials
      if (row.sustainable_materials !== undefined && row.sustainable_materials !== null) {
        const sustainableValue = parseFloat(row.sustainable_materials);
        if (isNaN(sustainableValue)) {
          errors.push(`Row ${rowNum}: sustainable_materials must be a number`);
          validatedRow._status = 'error';
        } else if (sustainableValue < 0.01 || sustainableValue > 1.00) {
          warnings.push(`Row ${rowNum}: sustainable_materials ${sustainableValue} will be clamped to 0.01-1.00`);
          validatedRow.sustainable_materials = Math.max(0.01, Math.min(1.00, sustainableValue));
        }
      }

      // Validate locally_produced
      if (row.locally_produced !== undefined && row.locally_produced !== null) {
        const localValue = row.locally_produced.toString().toLowerCase();
        if (!['true', 'false', '1', '0'].includes(localValue)) {
          warnings.push(`Row ${rowNum}: locally_produced "${row.locally_produced}" will be treated as false`);
          validatedRow.locally_produced = false;
        } else {
          validatedRow.locally_produced = ['true', '1'].includes(localValue);
        }
      }

      // Validate weight fields
      ['packaging_weight', 'product_weight'].forEach(field => {
        if (row[field] !== undefined && row[field] !== null) {
          const weight = parseFloat(row[field]);
          if (isNaN(weight)) {
            errors.push(`Row ${rowNum}: ${field} must be a number`);
            validatedRow._status = 'error';
          } else if (weight < 0.01) {
            warnings.push(`Row ${rowNum}: ${field} ${weight} will be set to minimum 0.01kg`);
            validatedRow[field] = 0.01;
          }
        }
      });

      validatedData.push(validatedRow);
    });

    console.log("Validation complete:", { errors: errors.length, warnings: warnings.length });
    return { errors, warnings, validatedData };
  }, []);

  // FILE UPLOAD HANDLER
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("Processing file:", file.name);
    setCurrentStep('preview');

    Papa.parse(file, {
      header: true,
      dynamicTyping: false, // Keep as strings for better validation
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (results) => {
        console.log("CSV parsed:", results.data.length, "rows");
        
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
        }

        const validation = validateCSVData(results.data);
        setCsvData(validation.validatedData);
        setValidationResults({ errors: validation.errors, warnings: validation.warnings });
      },
      error: (error) => {
        console.error("CSV parsing failed:", error);
        setValidationResults({ 
          errors: [`Failed to parse CSV: ${error.message}`], 
          warnings: [] 
        });
      }
    });

    // Clear the file input
    event.target.value = '';
  }, [validateCSVData]);

  // BATCH PROCESSING BEAST
  const processCSVData = async () => {
    if (validationResults.errors.length > 0) {
      console.error("Cannot process CSV with validation errors");
      return;
    }

    setIsProcessing(true);
    setCurrentStep('processing');
    setProgress(0);
    setResults({ success: 0, errors: 0, total: csvData.length });

    console.log("Starting CSV processing for", csvData.length, "products");

    const BATCH_SIZE = 5;
    const batches = [];
    
    // Create batches
    for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
      batches.push(csvData.slice(i, i + BATCH_SIZE));
    }

    // FIX: Move counters outside to avoid ESLint issues
    const processResults = {
      successCount: 0,
      errorCount: 0,
      allResults: []
    };

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);

      // Process batch in parallel
      const batchPromises = batch.map(async (row) => {
        try {
          const response = await fetch('/api/import-metafields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(row)
          });

          const result = await response.json();
          
          if (result.success) {
            return { ...row, _status: 'success', _result: result };
          } else {
            return { ...row, _status: 'error', _error: result.error };
          }
        } catch (error) {
          console.error(`Error processing row ${row._rowNumber}:`, error);
          return { ...row, _status: 'error', _error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // FIX: Count results after batch completion
      batchResults.forEach(result => {
        if (result._status === 'success') {
          processResults.successCount++;
        } else {
          processResults.errorCount++;
        }
      });

      processResults.allResults.push(...batchResults);

      // Update progress
      const processedCount = (batchIndex + 1) * BATCH_SIZE;
      const progressPercent = Math.min((processedCount / csvData.length) * 100, 100);
      setProgress(progressPercent);
      setResults({ 
        success: processResults.successCount, 
        errors: processResults.errorCount, 
        total: csvData.length 
      });

      // Rate limiting delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsProcessing(false);
    setCurrentStep('complete');
    console.log("CSV processing complete!", { 
      success: processResults.successCount, 
      errors: processResults.errorCount 
    });
  };

  // RESET FUNCTION
  const resetImporter = () => {
    setCsvData([]);
    setValidationResults({ errors: [], warnings: [] });
    setIsProcessing(false);
    setProgress(0);
    setResults({ success: 0, errors: 0, total: 0 });
    setCurrentStep('upload');
  };

  // CSV TEMPLATE GENERATOR
  const downloadTemplate = () => {
    const template = [
      {
        product_id: "15043117351238",
        product_title: "Example Product (optional)",
        sustainable_materials: "0.75",
        locally_produced: "true",
        packaging_weight: "0.05",
        product_weight: "0.25"
      }
    ];

    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metafield_import_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // RENDER UPLOAD STEP
  const renderUploadStep = () => (
    <Card sectioned>
      <BlockStack gap="400">
        <Text variant="headingLg">CSV Metafield Import</Text>
        
        <Banner title="Ready to bulk update your sustainability data?" tone="info">
          <p>Upload a CSV file to update metafields for multiple products at once. We'll validate everything before processing.</p>
        </Banner>

        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="300" align="center">
            <Icon source={UploadIcon} tone="subdued" />
            <Text variant="headingMd" alignment="center">Choose Your CSV File</Text>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{
                padding: '12px',
                border: '2px dashed #ddd',
                borderRadius: '8px',
                backgroundColor: '#fafafa',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'center'
              }}
            />
          </BlockStack>
        </Box>

        <Divider />

        <BlockStack gap="300">
          <Text variant="headingMd">Expected CSV Format</Text>
          <DataTable
            columnContentTypes={['text', 'text', 'text']}
            headings={['Column name', 'Required/Optional', 'Description']}
            rows={[
              ['product_id', 'Required', 'Shopify product ID (numbers only)'],
              ['sustainable_materials', 'Optional', 'Decimal 0.01-1.00 (e.g., 0.75 = 75%)'],
              ['locally_produced', 'Optional', 'true/false'],
              ['packaging_weight', 'Optional', 'Weight in kg (minimum 0.01)'],
              ['product_weight', 'Optional', 'Weight in kg (minimum 0.01)'],
            ]}
          />
        </BlockStack>

        <InlineStack gap="300">
          <Button onClick={downloadTemplate} variant="secondary">
            📥 Download Template
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  // RENDER PREVIEW STEP
  const renderPreviewStep = () => (
    <Card sectioned>
      <BlockStack gap="400">
        <InlineStack justify="space-between" align="center">
          <Text variant="headingLg">📊 CSV Preview & Validation</Text>
          <Button onClick={resetImporter} variant="tertiary">← Start Over</Button>
        </InlineStack>

        {/* Validation Summary */}
        <InlineStack gap="300">
          <Badge tone="success">
            <InlineStack gap="100" align="center">
              <Icon source={CheckCircleIcon} />
              <Text>{csvData.length} products found</Text>
            </InlineStack>
          </Badge>
          
          {validationResults.warnings.length > 0 && (
            <Badge tone="warning">
              <InlineStack gap="100" align="center">
                <Icon source={AlertTriangleIcon} />
                <Text>{validationResults.warnings.length} warnings</Text>
              </InlineStack>
            </Badge>
          )}
          
          {validationResults.errors.length > 0 && (
            <Badge tone="critical">
              <InlineStack gap="100" align="center">
                <Icon source={XCircleIcon} />
                <Text>{validationResults.errors.length} errors</Text>
              </InlineStack>
            </Badge>
          )}
        </InlineStack>

        {/* Validation Messages */}
        {validationResults.errors.length > 0 && (
          <Banner title="❌ Validation Errors (Must Fix)" tone="critical">
            <BlockStack gap="100">
              {validationResults.errors.slice(0, 10).map((error, index) => (
                <Text key={index} variant="bodySm">{error}</Text>
              ))}
              {validationResults.errors.length > 10 && (
                <Text variant="bodySm">... and {validationResults.errors.length - 10} more errors</Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {validationResults.warnings.length > 0 && (
          <Banner title="⚠️ Validation Warnings (Will Auto-Fix)" tone="warning">
            <BlockStack gap="100">
              {validationResults.warnings.slice(0, 5).map((warning, index) => (
                <Text key={index} variant="bodySm">{warning}</Text>
              ))}
              {validationResults.warnings.length > 5 && (
                <Text variant="bodySm">... and {validationResults.warnings.length - 5} more warnings</Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Data Preview */}
        {csvData.length > 0 && (
          <Box>
            <Text variant="headingMd">📋 Data Preview (First 10 rows)</Text>
            <Box paddingBlockStart="300">
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Row', 'Product ID', 'Sustainable %', 'Local', 'Pkg Weight', 'Product Weight']}
                rows={csvData.slice(0, 10).map(row => [
                  row._rowNumber.toString(),
                  row.product_id || '—',
                  row.sustainable_materials ? `${(parseFloat(row.sustainable_materials) * 100).toFixed(1)}%` : '—',
                  row.locally_produced !== undefined ? (row.locally_produced ? '✅' : '❌') : '—',
                  row.packaging_weight ? `${row.packaging_weight}kg` : '—',
                  row.product_weight ? `${row.product_weight}kg` : '—',
                ])}
              />
            </Box>
          </Box>
        )}

        {/* Action Buttons */}
        <InlineStack gap="300">
          <Button 
            primary 
            onClick={processCSVData}
            disabled={validationResults.errors.length > 0 || csvData.length === 0}
          >
            🚀 Start Import ({csvData.length} products)
          </Button>
          <Button onClick={resetImporter}>Cancel</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  // 🔥 RENDER PROCESSING STEP
  const renderProcessingStep = () => (
    <Card sectioned>
      <BlockStack gap="400">
        <Text variant="headingLg">⚡ Processing CSV Import...</Text>
        
        <ProgressBar progress={progress} />
        
        <InlineStack gap="400">
          <Badge tone="success">✅ {results.success} success</Badge>
          <Badge tone="critical">❌ {results.errors} errors</Badge>
          <Badge>📊 {results.success + results.errors}/{results.total} processed</Badge>
        </InlineStack>

        <Text variant="bodyMd" alignment="center">
          {isProcessing ? 'Processing products...' : 'Almost done!'}
        </Text>
      </BlockStack>
    </Card>
  );

  // 🔥 RENDER COMPLETE STEP
  const renderCompleteStep = () => (
    <Card sectioned>
      <BlockStack gap="400">
        <Text variant="headingLg">🎉 Import Complete!</Text>
        
        <InlineStack gap="400" wrap={false}>
          <Badge tone="success" size="large">✅ {results.success} successful</Badge>
          <Badge tone="critical" size="large">❌ {results.errors} failed</Badge>
        </InlineStack>

        {results.errors > 0 && (
          <Banner title="Some imports failed" tone="warning">
            <p>Check the results below for details. You can fix the issues and re-import those rows.</p>
          </Banner>
        )}

        <InlineStack gap="300">
          <Button primary onClick={resetImporter}>🔥 Import Another CSV</Button>
          <Button onClick={() => setCurrentStep('preview')}>📊 View Results</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  // 🔥 MAIN RENDER
  return (
    <BlockStack gap="500">
      {currentStep === 'upload' && renderUploadStep()}
      {currentStep === 'preview' && renderPreviewStep()}
      {currentStep === 'processing' && renderProcessingStep()}
      {currentStep === 'complete' && renderCompleteStep()}
    </BlockStack>
  );
}