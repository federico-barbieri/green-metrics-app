// app/components/index/ProductSyncStatus.jsx
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Banner, Button, List } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function ProductSyncStatus({ loaderData }) {
  const { 
    store, 
    syncStatus,
    shopifyProductCount,
    missingProductsCount,
    missingProducts
  } = loaderData;
  
  const syncFetcher = useFetcher();
  const shopify = useAppBridge();

  const isSyncing = 
    ["loading", "submitting"].includes(syncFetcher.state) &&
    syncFetcher.formMethod === "POST";

  // Auto-sync effect
  useEffect(() => {
    const shouldAutoSync = 
      syncStatus === "needs_sync" && 
      missingProductsCount > 0 && 
      missingProductsCount < 50 && 
      !isSyncing && 
      !syncFetcher.data;

    if (shouldAutoSync) {
      console.log(`🔄 Auto-syncing ${missingProductsCount} missing products...`);
      syncFetcher.submit({ action: "sync_missing_products" }, { method: "POST" });
    }
  }, [syncStatus, missingProductsCount, isSyncing, syncFetcher]);

  // Success toast effect
  useEffect(() => {
    if (syncFetcher.data?.success) {
      shopify.toast.show(`${syncFetcher.data.syncCount} missing products synced`);
    }
  }, [syncFetcher.data, shopify]);

  const triggerSync = () => {
    syncFetcher.submit({ action: "sync_missing_products" }, { method: "POST" });
  };

  // Render different sync statuses
  if (syncStatus === "needs_sync" && !isSyncing) {
    return (
      <Banner title={`${missingProductsCount} Products Need Syncing`} tone="warning">
        <p>
          Found {missingProductsCount} products in Shopify that need to be added to our database.
          {missingProductsCount < 50 ? " We'll sync them automatically." : " Click below to sync manually."}
        </p>
        {missingProductsCount >= 50 && (
          <Button onClick={triggerSync} disabled={isSyncing}>
            Sync Missing Products
          </Button>
        )}
      </Banner>
    );
  }

  if (syncStatus === "might_need_sync" && !isSyncing) {
    return (
      <Banner title="Large Store - Manual Sync Recommended" tone="info">
        <p>
          Your store has many products. We've checked the first {shopifyProductCount} and found {missingProductsCount} that need syncing.
          There might be more products to sync.
        </p>
        <Button onClick={triggerSync} disabled={isSyncing}>
          Sync Products
        </Button>
      </Banner>
    );
  }

  if (syncStatus === "needs_cleanup") {
    return (
      <Banner title="Database Cleanup Needed" tone="info">
        <p>
          Some products in our database may have been deleted from your Shopify store. 
          Database: {store.productCount}, Shopify: {shopifyProductCount}+
        </p>
      </Banner>
    );
  }

  if (syncStatus === "synced" && store.productCount > 0) {
    return (
      <Banner title="Products In Sync" tone="success">
        <p>All {store.productCount} products are synchronized and ready for sustainability tracking.</p>
      </Banner>
    );
  }

  if (syncStatus === "error") {
    return (
      <Banner title="Sync Check Failed" tone="critical">
        <p>Unable to check product sync status. Check logs for details.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </Banner>
    );
  }

  if (isSyncing) {
    return (
      <Banner title="Syncing Missing Products" tone="info">
        <p>We're adding missing products to the database and setting up their sustainability metrics...</p>
      </Banner>
    );
  }

  if (syncFetcher.data?.success) {
    return (
      <Banner title="Sync Complete" tone="success">
        <p>{syncFetcher.data.message}</p>
      </Banner>
    );
  }

  if (syncFetcher.data?.success === false) {
    return (
      <Banner title="Sync Failed" tone="critical">
        <p>Failed to sync products: {syncFetcher.data.error}</p>
        <Button onClick={triggerSync}>Try Again</Button>
      </Banner>
    );
  }

  // Debug info for development
  if (missingProducts && missingProducts.length > 0 && process.env.NODE_ENV === 'development') {
    return (
      <Banner title="Debug: Missing Products" tone="info">
        <p>Sample missing products:</p>
        <List>
          {missingProducts.slice(0, 3).map(product => (
            <List.Item key={product.id}>{product.title}</List.Item>
          ))}
        </List>
      </Banner>
    );
  }

  return null;
}