//app/components/PackagingWeightMetafieldEditor.jsx
import { useState, useEffect } from "react";
import {
  InlineStack,
  Button,
  Spinner,
  Toast,
  TextField,
  Text,
  Box,
} from "@shopify/polaris";

export default function PackagingWeightMetafieldEditor({ productId, product_weight, packaging_weight }) {
  // Log props received when component mounts
  useEffect(() => {
    console.log(`Component mounted for ${productId} with:`, { 
      product_weight, 
      packaging_weight 
    });
  }, [productId, product_weight, packaging_weight]);

  // Initialize with provided values or 0
  const [productWeight, setProductWeight] = useState(
    product_weight !== undefined && product_weight !== null ? product_weight : 0
  );
  const [packagingWeight, setPackagingWeight] = useState(
    packaging_weight !== undefined && packaging_weight !== null ? packaging_weight : 0
  );
  const [loading, setLoading] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  
  // Update state if props change
  useEffect(() => {
    if (product_weight !== undefined && product_weight !== null) {
      setProductWeight(product_weight);
    }
    if (packaging_weight !== undefined && packaging_weight !== null) {
      setPackagingWeight(packaging_weight);
    }
  }, [product_weight, packaging_weight]);
  
  // Calculate derived values
  const totalWeightInGrams = ((productWeight || 0) + (packagingWeight || 0)) * 1000;
  const pwRatio = productWeight > 0 ? (packagingWeight / productWeight).toFixed(2) : 0;

  // Validation function for the UI (separate from server validation)
  const validateWeight = (weight) => {
    if (weight < 0.001 && weight !== 0) {
      return "Weight must be at least 1g (0.001kg)";
    }
    if (weight > 10) {
      return "Weight cannot exceed 10kg";
    }
    return undefined;
  };

  const handleSave = async () => {
    // Validate before saving
    const productError = validateWeight(productWeight);
    const packagingError = validateWeight(packagingWeight);
    
    if (productError || packagingError) {
      setToastError(true);
      setToastMessage(productError || packagingError);
      setToastActive(true);
      return;
    }
    
    setLoading(true);
    try {
      console.log("Saving values:", { productWeight, packagingWeight });
      
      // Send the updated value to the server
      const res = await fetch("/api/update-packaging-weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          product_weight: productWeight,
          packaging_weight: packagingWeight,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error("Failed to save metafield:", data);
        setToastError(true);
        setToastMessage(data.error || "Failed to save metafields");
        setToastActive(true);
      } else {
        console.log("Metafield updated successfully:", data);
        setToastError(false);
        setToastMessage("Metafields saved successfully");
        setToastActive(true);
      }
    } catch (err) {
      console.error("Error saving:", err);
      setToastError(true);
      setToastMessage(err.message || "Error saving metafields");
      setToastActive(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleToast = () => setToastActive(false);

  return (
    <>
      <InlineStack gap="1000" wrap>
        <TextField
          label="Product Weight (kg)"
          type="number"
          value={String(productWeight)}
          onChange={(v) => {
            const value = v === '' ? 0 : parseFloat(v);
            setProductWeight(value);
          }}
          autoComplete="off"
          max={10}
          min={0.001}
          step={0.001}
          helpText="Enter weight in kg (e.g., 0.1 = 100g)"
          error={validateWeight(productWeight)}
        />
        <TextField
          label="Packaging Weight (kg)"
          type="number"
          value={String(packagingWeight)}
          onChange={(v) => {
            const value = v === '' ? 0 : parseFloat(v);
            setPackagingWeight(value);
          }}
          autoComplete="off"
          max={10}
          min={0.001}
          step={0.001}
          helpText="Enter weight in kg (e.g., 0.05 = 50g)"
          error={validateWeight(packagingWeight)}
        />
        <div style={{ marginTop: "24px" }}>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Spinner size="small" /> : "Save"}
          </Button>
        </div>
      </InlineStack>
      
      <Box paddingBlockStart="3">
        <Text variant="bodySm">
          Total Weight: {totalWeightInGrams.toFixed(0)}g | Packaging-to-Product Ratio: {pwRatio}
        </Text>
      </Box>

      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={toggleToast}
          duration={4000}
        />
      )}
    </>
  );
}