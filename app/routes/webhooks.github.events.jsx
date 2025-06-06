import { json } from "@remix-run/node";

export async function action({ request }) {
  
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {

    
    return json({ 
      success: true, 
      message: "Webhook received successfully",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Error processing webhook:", error);
    
    return json({ 
      success: false, 
      error: "Failed to process webhook" 
    }, { status: 400 });
  }
}

// Handle GET requests (for webhook verification if needed)
export async function loader() {
  return json({ 
    message: "Coolify GitHub Events Webhook Endpoint",
    status: "active",
    timestamp: new Date().toISOString()
  });
}