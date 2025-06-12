Green Metrics - Shopify Sustainability Analytics App

A comprehensive embedded Shopify app that empowers fashion retailers to track, analyze, and optimize their sustainability metrics. Built as a bachelor thesis project demonstrating modern web development practices and environmental consciousness in e-commerce.

Project Overview
Green Metrics is an embedded Shopify admin app that helps fashion retailers monitor and improve their environmental impact through detailed analytics. The app integrates seamlessly into the Shopify admin panel, providing store owners with actionable insights on their sustainability performance across multiple key metrics.

Core Functionality

Delivery Distance Insights
The app calculates and tracks delivery distances from warehouse locations to customer addresses, providing store owners with comprehensive shipping efficiency analytics. Key features include:

Average Delivery Distance Calculation: Automatically computes mean delivery distances from warehouse coordinates to customer zip codes
Delivery Hotspots Identification: Identifies zip codes with high delivery volumes (3+ deliveries) and highlights areas of operational efficiency
Distance Distribution Analysis: Provides insights into delivery patterns and helps identify optimization opportunities

Local Production Tracking
Monitors the ratio of locally produced vs internationally sourced products in a store's catalog:

Locally Produced Ratio: Calculates percentage of products marked as locally produced (currently 67% in demo data)
Product Origin Management: Allows store owners to update product origin status through an intuitive interface
Bulk Classification Tools: Enables efficient management of large product catalogs with quick toggle functionality

Packaging Weight Analysis
Implements Product-to-Weight Ratio (PWR) analysis to optimize packaging efficiency:

PWR Score Calculation: Automatically calculates packaging efficiency ratios (packaging weight ÷ product weight)
Efficiency Categorization: Classifies products as Excellent (PWR ≤ 0.60), Acceptable (0.60-1.20), or Heavy Packaging (PWR > 1.20)
Optimization Recommendations: Identifies products with poor packaging efficiency for improvement targeting
Real-time Updates: Recalculates scores automatically when product or packaging weights are modified

Sustainable Fiber Usage Tracking
Monitors sustainable material content across the product catalog:

Sustainable Material Percentage: Tracks the decimal percentage of sustainable materials in each product
70% Sustainability Threshold: Uses industry-standard 70% threshold to classify products as sustainable
Sustainability Score Calculation: Provides store-wide sustainability metrics (currently 80% in demo)
Quick Preset Options: Offers common sustainability percentages (25%, 50%, 75%, 100%) for efficient data entry

Technical Architecture

Backend Infrastructure
Framework: Built using Remix, a modern full-stack React framework that provides server-side rendering and optimal performance for embedded Shopify apps.

Database Architecture: Utilizes PostgreSQL 15 instead of the default SQLite to support multi-tenant operations without concurrency issues. The database handles multiple store installations simultaneously with proper isolation and performance optimization.

API Integration: Implements GraphQL for Shopify Admin API communication, leveraging Shopify's preferred modern API approach over legacy REST endpoints. This enables efficient data fetching with precise query capabilities.
Real-time Synchronization: Uses Shopify webhooks to maintain data consistency. The app automatically updates its database when products are created, modified, or deleted in the Shopify admin, ensuring real-time accuracy without manual syncing.

Data Models & Relationships
The application maintains four core data models:

Store: Manages multi-tenant store data including warehouse coordinates and calculated sustainability metrics
Product: Stores product information with sustainability metafields (materials, weights, origin status)
Order: Tracks order data with calculated delivery distances for shipping analysis
ProductMetricsHistory: Maintains complete audit trail of all sustainability metric changes over time

Performance Monitoring
Prometheus Integration: Implements custom metrics collection for monitoring app performance and sustainability KPIs. The system tracks response times, database query performance, and business metrics.
Grafana Dashboards: Provides visual monitoring of both technical performance and sustainability analytics through customized dashboards that use Prometheus as the data source.

Data Processing Workflow
Webhook Processing
When products are created or updated in Shopify, the app receives webhook notifications and processes them through:

Data Validation: Verifies webhook authenticity using HMAC signatures
Database Updates: Upserts product information with new sustainability data
Metric Recalculation: Automatically recalculates store-wide sustainability scores
Historical Tracking: Records all changes in the metrics history table for audit purposes

Distance Calculation Engine
For delivery distance analysis, the app:

Geocoding Integration: Converts warehouse addresses and customer zip codes to coordinates
Distance Computation: Calculates great-circle distances between warehouse and delivery locations
Hotspot Analysis: Identifies delivery clusters and efficiency patterns
Performance Caching: Stores calculated distances to avoid redundant computations

Business Intelligence Features
Sustainability Scoring Algorithm
The app implements a comprehensive sustainability scoring system that weighs:

Percentage of locally produced products (reduces transportation emissions)
Average sustainable material content across catalog
Packaging efficiency scores (minimizes waste)
Delivery distance optimization (reduces shipping impact)

Analytics Dashboard
Provides store owners with actionable insights through:

Real-time Metrics: Live updates of sustainability KPIs
Trend Analysis: Historical performance tracking and improvement identification
Benchmarking Data: Comparative analysis against sustainability best practices
Actionable Recommendations: Specific suggestions for improving environmental impact