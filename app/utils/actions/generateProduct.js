// app/utils/actions/generateProduct.js

export const handleGenerateProduct = async ({ admin }) => {
    const color = ["Red", "Orange", "Yellow", "Green"][
      Math.floor(Math.random() * 4)
    ];
    
    const response = await admin.graphql(
      `#graphql
        mutation populateProduct($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id
              title
              handle
              status
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    barcode
                    createdAt
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          product: {
            title: `${color} Snowboard`,
          },
        },
      },
    );
    
    const responseJson = await response.json();
    const product = responseJson.data.productCreate.product;
    const variantId = product.variants.edges[0].node.id;
    
    const variantResponse = await admin.graphql(
      `#graphql
      mutation shopifyRemixTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
            createdAt
          }
        }
      }`,
      {
        variables: {
          productId: product.id,
          variants: [{ id: variantId, price: "100.00" }],
        },
      },
    );
    
    const variantResponseJson = await variantResponse.json();
  
    return {
      action: "generate_product",
      product: responseJson.data.productCreate.product,
      variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
    };
  };