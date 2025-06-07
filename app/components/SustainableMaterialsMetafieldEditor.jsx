//app/components/SustainableMaterialsMetafieldEditor.jsx - STRICT DECIMAL VERSION
import { useState, useEffect } from "react";
import {
  InlineStack,
  Button,
  Spinner,
  Toast,
  TextField,
  Text,
} from "@shopify/polaris";

export default function SustainableMaterialsMetafieldEditor({
  productId,
  initial_sustainable_materials,
}) {
  // 🎯 STRICT VALIDATION FUNCTION
  const validateAndClamp = (value) => {
    let num = parseFloat(value);
    
    // Handle invalid input
    if (isNaN(num)) return 0.01;
    
    // 🔒 STRICT LIMITS: 0.01 to 1.00
    if (num > 1.00) num = 1.00;
    if (num < 0.01) num = 0.01;
    
    // Round to 2 decimal places for precision
    return Math.round(num * 100) / 100;
  };

  // Initialize with validated value
  const [sustainableDecimal, setSustainableDecimal] = useState(() => {
    const initial = initial_sustainable_materials !== undefined &&
                   initial_sustainable_materials !== null
                   ? initial_sustainable_materials / 100  // Convert percentage to decimal if needed
                   : 0.01;
    return validateAndClamp(initial);
  });

  const [inputValue, setInputValue] = useState(sustainableDecimal.toString());
  const [loading, setLoading] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Log initial values for debugging
  useEffect(() => {
    console.log(`🔍 Component initialized for ${productId}:`);
  }, [productId]);

  // Handle input changes with real-time validation
  const handleInputChange = (value) => {
    setInputValue(value);
    
    // Real-time validation and clamping
    const validated = validateAndClamp(value);
    setSustainableDecimal(validated);
    
    console.log(`📝 Input: "${value}" → Validated: ${validated}`);
  };

  // Handle blur (when user finishes editing)
  const handleInputBlur = () => {
    // Sync the input field with the validated value
    setInputValue(sustainableDecimal.toString());
  };

  const handleSave = async () => {
    setLoading(true);
    
    try {
      // Final validation before saving
      const finalValue = validateAndClamp(sustainableDecimal);
      
      console.log(`💾 Saving: ${finalValue} (clamped between 0.01-1.00)`);

      const res = await fetch("/api/update-sustainable-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          sustainable_materials: finalValue,  // Always between 0.01-1.00
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error("Failed to save metafield:", data);
        setToastError(true);
        setToastMessage(data.error || "Failed to save metafield");
        setToastActive(true);
      } else {
        // Update state with server response
        const savedValue = parseFloat(data.sustainable_materials);
        setSustainableDecimal(savedValue);
        setInputValue(savedValue.toString());
        
        setToastError(false);
        setToastMessage(`Saved: ${(savedValue * 100).toFixed(0)}% sustainable materials`);
        setToastActive(true);
        
        console.log(`✅ Successfully saved: ${savedValue} (${(savedValue * 100).toFixed(1)}%)`);
      }
    } catch (err) {
      console.error("Error saving:", err);
      setToastError(true);
      setToastMessage("Error saving metafield: " + err.message);
      setToastActive(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleToast = () => setToastActive(false);

  // Calculate percentage for display
  const percentageDisplay = (sustainableDecimal * 100).toFixed(1);

  return (
    <>
      <InlineStack gap="1000" nowrap>
        <div style={{ minWidth: '200px' }}>
          <TextField
            label="Sustainable materials (decimal)"
            type="number"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            autoComplete="off"
            min="0.01"
            max="1.00"
            step="0.01"
            helpText={`Range: 0.01 to 1.00 (currently ${percentageDisplay}%)`}
          />
          
          {/* Visual feedback for out-of-range values */}
          {(parseFloat(inputValue) > 1.00 || parseFloat(inputValue) < 0.01) && (
            <Text variant="bodySm" tone="critical">
              Value will be clamped to 0.01-1.00 range
            </Text>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
          <Button onClick={handleSave} disabled={loading} primary>
            {loading ? <Spinner size="small" /> : "Save"}
          </Button>
        </div>
      </InlineStack>

      {/* Quick preset buttons for common values */}
      <div style={{ marginTop: '0.5rem' }}>
        <InlineStack gap="200">
          <Text variant="bodySm" color="subdued">Quick presets:</Text>
          {[0.25, 0.50, 0.75, 1.00].map(preset => (
            <Button 
              key={preset}
              size="micro" 
              onClick={() => {
                setSustainableDecimal(preset);
                setInputValue(preset.toString());
              }}
            >
              {preset} ({(preset * 100).toFixed(0)}%)
            </Button>
          ))}
        </InlineStack>
      </div>

      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={toggleToast}
        />
      )}
    </>
  );
}
