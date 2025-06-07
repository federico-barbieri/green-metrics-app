// app/components/index/ProductImportStatus.jsx
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Banner, Button, Box, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function ProductImportStatus({ loaderData }) {
  const { needsImport, needsMetafieldSetup, store } = loaderData;
  const importFetcher = useFetcher();
  const metafieldFetcher = useFetcher();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isImporting =
    ["loading", "submitting"].includes(importFetcher.state) &&
    importFetcher.formMethod === "POST";

  // Auto-trigger product import
  useEffect(() => {
    const metafieldsReady =
      !needsMetafieldSetup ||
      (metafieldFetcher.data && metafieldFetcher.data.success);

    if (needsImport && metafieldsReady && !isImporting && !importFetcher.data) {
      importFetcher.submit({ action: "import_products" }, { method: "POST" });
    }
  }, [
    needsImport,
    needsMetafieldSetup,
    isImporting,
    importFetcher,
    metafieldFetcher.data,
  ]);

  // Success toast effect
  useEffect(() => {
    if (importFetcher.data?.success) {
      shopify.toast.show(
        `${importFetcher.data.importCount} products imported and metrics initialized`
      );
    }

    const productId = fetcher.data?.product?.id.replace(
      "gid://shopify/Product/",
      ""
    );
    if (productId) {
      shopify.toast.show("Product created");
    }
  }, [importFetcher.data, fetcher.data, shopify]);

  const triggerImport = () => {
    importFetcher.submit({ action: "import_products" }, { method: "POST" });
  };

  if (isImporting) {
    return (
      <Banner title="Importing Products" tone="info">
        <p>
          We're importing your products from Shopify and
          initializing metrics. This may take a moment...
        </p>
      </Banner>
    );
  }

  if (importFetcher.data?.success) {
    return (
      <Banner title="Products Imported Successfully" tone="success">
        <p>{importFetcher.data.message}</p>
      </Banner>
    );
  }

  if (importFetcher.data?.success === false) {
    return (
      <Banner title="Import Failed" tone="critical">
        <p>Failed to import products: {importFetcher.data.error}</p>
        <Button onClick={triggerImport}>Try Again</Button>
      </Banner>
    );
  }

  if (!isImporting && !importFetcher.data && store.productCount > 0) {
    return (
      <Banner title="Products Ready" tone="success">
        <p>
          You have {store.productCount} products ready for
          sustainability tracking.
        </p>
      </Banner>
    );
  }

  // Show fetcher data if exists (for debugging)
  if (fetcher.data?.product) {
    return (
      <>
        <Text as="h3" variant="headingMd">
          productCreate mutation
        </Text>
        <Box
          padding="400"
          background="bg-surface-active"
          borderWidth="025"
          borderRadius="200"
          borderColor="border"
          overflowX="scroll"
        >
          <pre style={{ margin: 0 }}>
            <code>
              {JSON.stringify(fetcher.data.product, null, 2)}
            </code>
          </pre>
        </Box>
        <Text as="h3" variant="headingMd">
          productVariantsBulkUpdate mutation
        </Text>
        <Box
          padding="400"
          background="bg-surface-active"
          borderWidth="025"
          borderRadius="200"
          borderColor="border"
          overflowX="scroll"
        >
          <pre style={{ margin: 0 }}>
            <code>
              {JSON.stringify(fetcher.data.variant, null, 2)}
            </code>
          </pre>
        </Box>
      </>
    );
  }

  return null;
}