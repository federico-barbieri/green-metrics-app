// app/utils/index/indexActions.js
import { authenticate } from "../../shopify.server";
import { handleGenerateProduct } from "../actions/generateProduct";
import { handleCreateMetafieldDefinitions } from "../actions/createMetafieldDefinitions";
import { handleImportProducts } from "../actions/importProducts";
import { handleSyncMissingProducts } from "../actions/syncMissingProducts";



export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  switch (action) {
    case "generate_product":
      return handleGenerateProduct({ admin });
    
    case "create_metafield_definitions":
      return handleCreateMetafieldDefinitions({ admin });
    
    case "import_products":
      return handleImportProducts({ admin, session });
    
    case "sync_missing_products":
      return handleSyncMissingProducts({ admin, session });
    
    default:
      return null;
  }
};