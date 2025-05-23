//app/components/LocallyProducedMetafieldEditor.jsx
import { useState } from "react";
import {
  Checkbox,
  InlineStack,
  Button,
  Spinner,
  Toast,
} from "@shopify/polaris";

export default function LocallyProducedMetafieldEditor({
  productId,
  locally_produced,
}) {
  const [isLocal, setIsLocal] = useState(Boolean(locally_produced));
  const [loading, setLoading] = useState(false);
  const [toastActive, setToastActive] = useState(false);
  const [toastError, setToastError] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Send the updated value to the server
      const res = await fetch("/api/update-locally-produced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          locally_produced: isLocal,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        console.error("Failed to save metafield:", data);
        setToastError(true);
        setToastActive(true);
      } else {
        console.log("Metafield updated");
        setToastError(false);
        setToastActive(true);
      }
    } catch (err) {
      console.error("Error saving:", err);
      setToastError(true);
      setToastActive(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleToast = () => setToastActive(false);

  return (
    <>
      <InlineStack gap="500" wrap>
        <Checkbox
          label="This product is locally produced"
          checked={isLocal}
          onChange={setIsLocal}
        />
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Spinner size="small" /> : "Save"}
        </Button>
      </InlineStack>

      {toastActive && (
        <Toast
          content={toastError ? "Failed to save metafield" : "Metafield saved"}
          error={toastError}
          onDismiss={toggleToast}
        />
      )}
    </>
  );
}
