import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '2rem',
      }}>
        {/* Header Section */}
        <div style={{
          textAlign: 'center',
          marginBottom: '3rem',
          color: 'white'
        }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: '700',
            marginBottom: '1rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            Sustainable Fashion Metrics
          </h1>
          <p style={{
            fontSize: '1.25rem',
            opacity: '0.9',
            maxWidth: '600px',
            margin: '0 auto',
            lineHeight: '1.6'
          }}>
            Track and manage your product sustainability metrics with ease. 
            Monitor locally produced vs internationally produced items in your store.
          </p>
        </div>

        {/* Login Form Section */}
        {showForm && (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '3rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            maxWidth: '500px',
            margin: '0 auto 3rem auto'
          }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '1.5rem',
              color: '#2d3748',
              textAlign: 'center'
            }}>
              Connect Your Store
            </h2>
            <Form method="post" action="/auth/login">
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#4a5568',
                  marginBottom: '0.5rem'
                }}>
                  Shop domain
                </label>
                <input
                  type="text"
                  name="shop"
                  placeholder="my-shop-domain.myshopify.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
                <p style={{
                  fontSize: '0.75rem',
                  color: '#718096',
                  marginTop: '0.25rem'
                }}>
                  Enter your Shopify store domain
                </p>
              </div>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                Log in
              </button>
            </Form>
          </div>
        )}

        {/* Features Section */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gap: '2rem',
          marginBottom: '3rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            transition: 'transform 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-5px)'}
          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#2d3748',
              marginBottom: '1rem'
            }}>
              Production Analytics
            </h3>
            <p style={{
              color: '#718096',
              lineHeight: '1.6'
            }}>
              Get detailed insights into your locally vs internationally produced products 
              with comprehensive ratio tracking and visual dashboards.
            </p>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            transition: 'transform 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-5px)'}
          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#2d3748',
              marginBottom: '1rem'
            }}>
              Product Management
            </h3>
            <p style={{
              color: '#718096',
              lineHeight: '1.6'
            }}>
              Easily categorize and manage your products' production origins 
              with intuitive metafield editing and bulk operations.
            </p>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            transition: 'transform 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.transform = 'translateY(-5px)'}
          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#2d3748',
              marginBottom: '1rem'
            }}>
              🌱 Sustainability Tracking
            </h3>
            <p style={{
              color: '#718096',
              lineHeight: '1.6'
            }}>
              Monitor your store's sustainability progress and make data-driven 
              decisions to improve your environmental impact.
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '12px',
          padding: '1.5rem',
          color: 'white',
          textAlign: 'center',
          backdropFilter: 'blur(10px)'
        }}>
          <p style={{
            margin: 0,
            opacity: '0.9'
          }}>
            This application is part of a bachelor project focused on sustainable fashion metrics. 
            Connect your Shopify store to start tracking your product sustainability data.
          </p>
        </div>
      </div>
    </div>
  );
}