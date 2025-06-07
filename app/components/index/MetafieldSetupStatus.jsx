// app/components/index/MetafieldSetupStatus.jsx
import { useEffect } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Banner, Button } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function MetafieldSetupStatus() {
  const { needsMetafieldSetup } = useLoaderData();
  const metafieldFetcher = useFetcher();
  const shopify = useAppBridge();

  const isCreatingMetafields =
    ["loading", "submitting"].includes(metafieldFetcher.state) &&
    metafieldFetcher.formMethod === "POST";

  // Auto-create metafield definitions if needed
  useEffect(() => {
    if (needsMetafieldSetup && !isCreatingMetafields && !metafieldFetcher.data) {
      metafieldFetcher.submit(
        { action: "create_metafield_definitions" },
        { method: "POST" }
      );
    }
  }, [needsMetafieldSetup, isCreatingMetafields, metafieldFetcher]);

  // Success toast effect
  useEffect(() => {
    if (metafieldFetcher.data?.success) {
      shopify.toast.show("Sustainability metrics initialized");
    }
  }, [metafieldFetcher.data, shopify]);

  if (isCreatingMetafields) {
    return (
      <Banner title="Setting Up Sustainability Metrics" tone="info">
        <p>
          We're setting up the necessary fields to track
          sustainability metrics for your products...
        </p>
      </Banner>
    );
  }

  if (metafieldFetcher.data?.success) {
    return (
      <Banner title="Metrics Setup Complete" tone="success">
        <p>
          Successfully set up sustainability metrics tracking for
          your store.
        </p>
      </Banner>
    );
  }

  if (metafieldFetcher.data?.success === false) {
    return (
      <Banner title="Setup Failed" tone="critical">
        <p>
          Failed to set up sustainability metrics:{" "}
          {metafieldFetcher.data.error}
        </p>
        <Button
          onClick={() =>
            metafieldFetcher.submit(
              { action: "create_metafield_definitions" },
              { method: "POST" }
            )
          }
        >
          Try Again
        </Button>
      </Banner>
    );
  }

  return null;
}