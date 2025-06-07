// app/routes/app._index.jsx - Simplified main file
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

// Import components
import WelcomeCard from "../components/index/WelcomeCard";
import SustainabilityReportDownload from "../components/index/SustainabilityReportDownload";
import ProductSyncStatus from "../components/index/ProductSyncStatus";
import MetafieldSetupStatus from "../components/index/MetafieldSetupStatus";
import ProductImportStatus from "../components/index/ProductImportStatus";
import SidebarInfo from "../components/index/SidebarInfo";

// Import loader and action from separate files
import { loader } from "../utils/index/indexLoader";
import { action } from "../utils/index/indexActions";

// Re-export loader and action
export { loader, action };

export default function Index() {
  const loaderData = useLoaderData();
  
  const canGenerateReport = 
    loaderData.store.productCount > 0 && 
    !loaderData.needsMetafieldSetup && 
    !loaderData.needsImport;

  return (
    <Page>
      <TitleBar title="Green Metrics App" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <WelcomeCard />
              
              {/* Only show sync status if there are issues */}
              {loaderData.syncStatus !== "synced" && <ProductSyncStatus loaderData={loaderData} />}
              
              <MetafieldSetupStatus />
              
              <ProductImportStatus loaderData={loaderData} />
              
              {canGenerateReport && <SustainabilityReportDownload />}
            </BlockStack>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <SidebarInfo />
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}