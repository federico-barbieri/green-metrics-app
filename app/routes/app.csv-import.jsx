// app/routes/app.csv-import.jsx 
import { Page } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import CSVMetafieldImporter from "../components/CSVMetafieldImporter";

export default function CSVImportPage() {
  return (
    <Page>
      <TitleBar title="CSV Metafield Import" />
      <CSVMetafieldImporter />
    </Page>
  );
}