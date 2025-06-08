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

  // SECURITY: Validate file before processing
  const validateFile = (file) => {
    const errors = [];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push('File size too large. Maximum 5MB allowed.');
    }
    
    // Check file type
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
      errors.push('Invalid file type. Please upload a CSV file.');
    }
    
    // Check filename for suspicious patterns
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
      errors.push('Invalid filename. Please use a simple filename without special characters.');
    }
    
    return errors;
  };

  // SECURITY: Sanitize CSV cell content to prevent formula injection
  const sanitizeCell = (value) => {
    if (typeof value !== 'string') return value;
    
    // Remove potential formula injection patterns
    const dangerousChars = ['=', '@', '+', '-', '\t', '\r'];
    if (dangerousChars.some(char => value.startsWith(char))) {
      return `'${value}`; // Prefix with single quote to make it literal
    }
    
    return value;
  };

  // VALIDATION FUNCTION (Enhanced)
  const validateCSVData = useCallback((data) => {
    const errors = [];
    const warnings = [];
    const validatedData = [];

    console.log("Starting CSV validation for", data.length, "rows");

    // Check for reasonable data size
    if (data.length > 1000) {
      warnings.push(`Large dataset detected (${data.length} rows). Processing may take several minutes.`);
    }

    data.forEach((row, index) => {
      const rowNum = index + 1;
      
      // Sanitize all row data
      const sanitizedRow = {};
      Object.keys(row).forEach(key => {
        sanitizedRow[key] = sanitizeCell(row[key]);
      });
      
      const validatedRow = { ...sanitizedRow, _rowNumber: rowNum, _status: 'pending' };

      // Check required fields
      if (!row.product_id) {
        errors.push(`Row ${rowNum}: Missing product_id`);
        validatedRow._status = 'error';
      } else {
        // Validate product_id is numeric
        const productId = row.product_id.toString();
        if (!/^\d+$/.test(productId)) {
          errors.push(`Row ${rowNum}: product_id must be numeric only`);
          validatedRow._status = 'error';
        }
      }

      // Validate sustainable_materials
      if (row.sustainable_materials !== undefined && row.sustainable_materials !== null && row.sustainable_materials !== '') {
        const sustainableValue = parseFloat(row.sustainable_materials);
        if (isNaN(sustainableValue)) {
          errors.push(`Row ${rowNum}: sustainable_materials must be a number`);
          validatedRow._status = 'error';
        } else if (sustainableValue < 0 || sustainableValue > 1.00) {
          if (sustainableValue < 0) {
            warnings.push(`Row ${rowNum}: sustainable_materials ${sustainableValue} will be set to 0`);
            validatedRow.sustainable_materials = 0;
          } else {
            warnings.push(`Row ${rowNum}: sustainable_materials ${sustainableValue} will be clamped to 1.00`);
            validatedRow.sustainable_materials = 1.00;
          }
        } else if (sustainableValue > 0 && sustainableValue < 0.01) {
          warnings.push(`Row ${rowNum}: sustainable_materials ${sustainableValue} will be set to minimum 0.01`);
          validatedRow.sustainable_materials = 0.01;
        }
      }

      // Validate locally_produced
      if (row.locally_produced !== undefined && row.locally_produced !== null && row.locally_produced !== '') {
        const localValue = row.locally_produced.toString().toLowerCase().trim();
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(localValue)) {
          warnings.push(`Row ${rowNum}: locally_produced "${row.locally_produced}" will be treated as false`);
          validatedRow.locally_produced = false;
        } else {
          validatedRow.locally_produced = ['true', '1', 'yes'].includes(localValue);
        }
      }

      // Validate weight fields
      ['packaging_weight', 'product_weight'].forEach(field => {
        if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
          const weight = parseFloat(row[field]);
          if (isNaN(weight)) {
            errors.push(`Row ${rowNum}: ${field} must be a number`);
            validatedRow._status = 'error';
          } else if (weight < 0) {
            errors.push(`Row ${rowNum}: ${field} cannot be negative`);
            validatedRow._status = 'error';
          } else if (weight > 0 && weight < 0.01) {
            warnings.push(`Row ${rowNum}: ${field} ${weight} will be set to minimum 0.01kg`);
            validatedRow[field] = 0.01;
          } else if (weight > 1000) {
            warnings.push(`Row ${rowNum}: ${field} ${weight}kg seems unusually high`);
          }
        }
      });

      validatedData.push(validatedRow);
    });

    console.log("Validation complete:", { errors: errors.length, warnings: warnings.length });
    return { errors, warnings, validatedData };
  }, []);

  // FILE UPLOAD HANDLER (Enhanced with Security)
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("Processing file:", file.name, "Size:", file.size, "Type:", file.type);
    
    // Security validation
    const fileErrors = validateFile(file);
    if (fileErrors.length > 0) {
      setValidationResults({ 
        errors: fileErrors, 
        warnings: [] 
      });
      setCurrentStep('upload');
      event.target.value = ''; // Clear file input
      return;
    }

    setCurrentStep('preview');

    Papa.parse(file, {
      header: true,
      dynamicTyping: false, // Keep as strings for better validation
      skipEmptyLines: true,
      transformHeader: (header) => {
        // Sanitize and normalize header names
        return header.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      },
      complete: (results) => {
        console.log("CSV parsed:", results.data.length, "rows");
        
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          const parseErrors = results.errors.map(err => `Parse error: ${err.message}`);
          setValidationResults({ 
            errors: parseErrors, 
            warnings: [] 
          });
          return;
        }

        // Additional security check: limit number of rows
        if (results.data.length > 2000) {
          setValidationResults({ 
            errors: [`Too many rows (${results.data.length}). Maximum 2000 rows allowed per import.`], 
            warnings: [] 
          });
          return;
        }

        const validation = validateCSVData(results.data);
        setCsvData(validation.validatedData);
        setValidationResults({ errors: validation.errors, warnings: validation.warnings });
      },
      error: (error) => {
        console.error("CSV parsing failed:", error);
        setValidationResults({ 
          errors: [`Failed to parse CSV: ${error.message}. Please ensure your file is a valid CSV format.`], 
          warnings: [] 
        });
      }
    });

    // Clear the file input
    event.target.value = '';
  }, [validateCSVData]);

  // BATCH PROCESSING (Enhanced)
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
          // Remove internal fields before sending
          const cleanRow = { ...row };
          delete cleanRow._rowNumber;
          delete cleanRow._status;
          delete cleanRow._result;
          delete cleanRow._error;

          const response = await fetch('/api/import-metafields', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(cleanRow)
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          
          if (result.success) {
            return { ...row, _status: 'success', _result: result };
          } else {
            return { ...row, _status: 'error', _error: result.error || 'Unknown error' };
          }
        } catch (error) {
          console.error(`Error processing row ${row._rowNumber}:`, error);
          return { ...row, _status: 'error', _error: error.message };
        }
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        
        // Count results after batch completion
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
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (batchError) {
        console.error(`Batch ${batchIndex + 1} failed:`, batchError);
        // Continue with next batch even if one fails
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

  // CSV TEMPLATE GENERATOR (Enhanced)
  const downloadTemplate = () => {
    const template = [
      {
        product_id: "15043117351238",
        product_title: "Example Product (optional - for reference only)",
        sustainable_materials: "0.75",
        locally_produced: "true",
        packaging_weight: "0.05",
        product_weight: "0.25"
      },
      {
        product_id: "15043117351239",
        product_title: "Another Example",
        sustainable_materials: "0.60",
        locally_produced: "false",
        packaging_weight: "0.08",
        product_weight: "0.40"
      }
    ];

    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metafield_import_template_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // RENDER UPLOAD STEP (Enhanced)
  const renderUploadStep = () => (
    <Card sectioned>
      <BlockStack gap="400">
        <Text variant="headingLg">CSV Metafield Import</Text>
        
        <Banner title="Ready to bulk update your sustainability data?" tone="info">
          <p>Upload a CSV file to update metafields for multiple products at once. We'll validate everything before processing.</p>
        </Banner>

        {/* Security Notice */}
        <Banner title="File Requirements" tone="warning">
          <BlockStack gap="100">
            <Text variant="bodySm">• Maximum file size: 5MB</Text>
            <Text variant="bodySm">• Maximum rows: 2,000 products</Text>
            <Text variant="bodySm">• Accepted formats: .csv files only</Text>
            <Text variant="bodySm">• Data is validated before processing</Text>
          </BlockStack>
        </Banner>

        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="300" align="center">
            <Icon source={UploadIcon} tone="subdued" />
            <Text variant="headingMd" alignment="center">Choose Your CSV File</Text>
            <input
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
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
              ['locally_produced', 'Optional', 'true/false, yes/no, or 1/0'],
              ['packaging_weight', 'Optional', 'Weight in kg (minimum 0.01)'],
              ['product_weight', 'Optional', 'Weight in kg (minimum 0.01)'],
            ]}
          />
          
          <Banner title="💡 Pro Tips" tone="info">
            <BlockStack gap="100">
              <Text variant="bodySm">• Use the template below to ensure proper formatting</Text>
              <Text variant="bodySm">• Include product_title for reference (won't be imported)</Text>
              <Text variant="bodySm">• Empty cells are ignored - only provided values are updated</Text>
              <Text variant="bodySm">• Values are automatically validated and corrected when possible</Text>
            </BlockStack>
          </Banner>
        </BlockStack>

        <InlineStack gap="300">
          <Button onClick={downloadTemplate} variant="secondary">
            Download Template
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  // RENDER PREVIEW STEP (Enhanced)
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
            <Text variant="headingMd">Data Preview (First 10 rows)</Text>
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
            Start Import ({csvData.length} products)
          </Button>
          <Button onClick={resetImporter}>Cancel</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  // RENDER PROCESSING STEP
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

        <Banner title="Please wait..." tone="info">
          <Text variant="bodySm">Don't close this page while processing. Large imports may take several minutes.</Text>
        </Banner>
      </BlockStack>
    </Card>
  );

  // RENDER COMPLETE STEP
  const renderCompleteStep = () => (
    <Card sectioned>
      <BlockStack gap="400">
        <Text variant="headingLg">🎉 Import Complete!</Text>
        
        <InlineStack gap="400" wrap={false}>
          <Badge tone="success" size="large">✅ {results.success} successful</Badge>
          <Badge tone="critical" size="large">❌ {results.errors} failed</Badge>
        </InlineStack>

        {results.success > 0 && (
          <Banner title="Success!" tone="success">
            <Text variant="bodySm">{results.success} products were successfully updated with sustainability data.</Text>
          </Banner>
        )}

        {results.errors > 0 && (
          <Banner title="Some imports failed" tone="warning">
            <Text variant="bodySm">Check the server logs for details. You can fix the issues and re-import those rows.</Text>
          </Banner>
        )}

        <InlineStack gap="300">
          <Button primary onClick={resetImporter}>Import Another CSV</Button>
          <Button onClick={() => setCurrentStep('preview')}>View Results</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  // MAIN RENDER
  return (
    <BlockStack gap="500">
      {currentStep === 'upload' && renderUploadStep()}
      {currentStep === 'preview' && renderPreviewStep()}
      {currentStep === 'processing' && renderProcessingStep()}
      {currentStep === 'complete' && renderCompleteStep()}
    </BlockStack>
  );
}