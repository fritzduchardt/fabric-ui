# Fabric

This repository contains the deployment configuration for Fabric UI, a personal AI assistant running as a Progressive Webb App. It includes a Dockerfile for the web UI and a comprehensive Helm chart for deploying the full application stack (UI and Backend) to a Kubernetes cluster.

## Architecture

The application consists of two main components:

-   **Backend**: A service that processes requests and interacts with a persistent file system. It is designed to work with personal notes (e.g., Obsidian vaults) and predefined patterns.
-   **UI**: A static web interface served by Nginx, which also acts as a reverse proxy to the backend API. It is designed as a Progressive Web App (PWA) for a native-like experience.

## Helm Chart Deployment

The primary method of deployment is through the provided Helm chart located in the `charts/fabric` directory.

### Prerequisites

-   A running Kubernetes cluster.
-   Helm v3 installed.
-   An Ingress controller (e.g., NGINX) installed in the cluster.
-   [cert-manager](https://cert-manager.io/docs/installation/) installed for automated TLS certificate management.
-   A persistent volume available on a specific node, accessible via `hostPath`.

### Installation

1.  **Configure Values**: Before deploying, customize the configuration in `charts/fabric/values.yaml`. Key values to review include:
    -   `ingress.host`: Set your public-facing domain.
    -   `backend.syncFiles`: The absolute path on the Kubernetes node where your files (Obsidian vaults, patterns) are stored.
    -   `backend.nodeSelector`: Ensure the backend pod is scheduled on the node that contains the `hostPath` volume.
    -   `basicAuth.authFile`: Update the `auth/htpasswd` file with your desired credentials.

2.  **Deploy the Chart**: Use Helm to install the chart into your cluster.

    ```bash
    # Navigate to the chart directory
    cd charts/fabric

    # Install the helm chart
    helm install fabric . --namespace fabric --create-namespace
    ```

## Local UI Development

The top-level `Dockerfile` can be used to build and run the UI container in isolation for development or testing purposes.

```bash
# Build the UI image
docker build -t fabric-ui .

# Run the UI container locally
# Note: This does not include the backend service.
docker run -p 8082:80 -d --rm fabric-ui
```
