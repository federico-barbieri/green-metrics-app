//app/components/SustainableMaterialsMetafieldEditor.jsx
import { useState, useEffect } from "react";
import {
  InlineStack,
  Button,
  Spinner,
  Toast,
  TextField,
} from "@shopify/polaris";

export default function SustainableMaterialsMetafieldEditor({
  productId,
  initial_sustainable_materials,
}) {
  // Log props received when component mounts
  useEffect(() => {
    console.warn(`Component mounted for ${productId} with:`, {
      productId,
      initial_sustainable_materials,
    });
  }, [productId, initial_sustainable_materials]);

  // Initialize state with provided values or 0
  const [sustainablePercent, setSustainablePercent] = useState(
    initial_sustainable_materials !== undefined &&
      initial_sustainable_materials !== null
      ? initial_sustainable_materials
      : 0,
  );

  const [loading, setLoading] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Update state if props change
  useEffect(() => {
    if (
      initial_sustainable_materials !== undefined &&
      initial_sustainable_materials !== null
    ) {
      setSustainablePercent(initial_sustainable_materials);
    }
  }, [initial_sustainable_materials]);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Validate before saving
      if (sustainablePercent < 0 || sustainablePercent > 100) {
        console.error("Invalid sustainable materials percentage");
        setToastError(true);
        setToastMessage("Percentage must be between 0 and 100");
        setToastActive(true);
        setLoading(false);
        return;
      }

      // Convert percentage to decimal (0.8 for 80%)
      const decimalValue = sustainablePercent / 100;

      const res = await fetch("/api/update-sustainable-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          sustainable_materials: decimalValue,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error("Failed to save metafield:", data);
        setToastError(true);
        setToastMessage(data.error || "Failed to save metafield");
        setToastActive(true);
      } else {
        setToastError(false);
        setToastMessage("Metafield saved successfully");
        setToastActive(true);
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

  return (
    <>
      <InlineStack gap="1000" nowrap>
        <TextField
          label="Edit % of sustainable materials"
          type="number"
          value={String(sustainablePercent)}
          onChange={(v) => setSustainablePercent(parseFloat(v))}
          autoComplete="off"
          max={100}
          min={0}
          step={1}
        />
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Spinner size="small" /> : "Save"}
          </Button>
        </div>
      </InlineStack>

      {toastActive && (
        <Toast
          content={
            toastMessage ||
            (toastError ? "Failed to save metafield" : "Metafield saved")
          }
          error={toastError}
          onDismiss={toggleToast}
        />
      )}
    </>
  );
}
