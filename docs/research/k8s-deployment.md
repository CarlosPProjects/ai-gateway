# Deploying TypeScript (Bun) with Redis on GKE Autopilot

This guide outlines the best practices for deploying a high-performance TypeScript application (using the Bun runtime) alongside Redis on Google Kubernetes Engine (GKE) Autopilot.

## 1. GKE Autopilot Specifics

GKE Autopilot manages the underlying infrastructure (nodes, OS patching, bin-packing), allowing you to focus on the workloads. However, it imposes specific constraints to maintain its SLA.

### Resource Requests & Limits
In Autopilot, **you pay for the resources you request**.
- **Rule of Thumb**: Set `requests` equal to `limits` (Guaranteed QoS) for critical production workloads to ensure stability.
- **Bursting**: Autopilot now supports generic ephemeral storage and burstable pods (where `limits > requests`), but for consistent performance, stick to 1:1 ratios.
- **CPU**: requests are rounded up to the nearest 250m vCPU.
- **Memory**: Minimum is 512MiB.

### Manifest Adjustments
- **Remove Node Selectors**: Do not use `nodeSelector` or `affinity` to pin pods to specific nodes; Autopilot handles placement.
- **Security Context**: You generally cannot use `privileged: true`. Most capabilities (`NET_ADMIN`, etc.) are blocked unless explicitly allowed by the Autopilot policy (which is stricter than Standard).
- **DaemonSets**: Avoid them if possible. Autopilot supports them but they bill differently and can be tricky to manage. Use sidecars for per-pod agents.

## 2. Redis on Kubernetes: Strategy

### Decision: Managed vs. Self-Hosted
| Feature | **Google Cloud Memorystore** | **Self-Hosted (StatefulSet)** |
| :--- | :--- | :--- |
| **Maintenance** | Zero (Fully Managed) | High (OS updates, Redis patching) |
| **Persistence** | RDB/AOF supported (Tier dependent) | Full control (PVCs) |
| **Modules** | Limited (Standard Redis) | **Full Support** (Redis Stack / Vector) |
| **Cost** | Higher (Service fee) | Lower (Raw compute/storage costs) |

**Recommendation**:
- Use **Memorystore** for standard caching/pub-sub needs to reduce ops overhead.
- Use **Self-Hosted (StatefulSet)** if you specifically need **RediSearch/Vector Search** (Redis Stack) or extreme cost optimization for dev environments.

### Self-Hosted Best Practices (Redis Stack)
If deploying self-hosted, use a **StatefulSet** to ensure stable network IDs (`redis-0`, `redis-1`) and persistent storage ordering.

*   **Persistence**: Mount a `PersistentVolumeClaim` to `/data`.
*   **Config**: Use a `ConfigMap` for `redis.conf` to tune eviction policies (`maxmemory-policy allkeys-lru`).

## 3. Docker Multi-Stage Builds (Bun)

**Optimal Dockerfile Pattern:**
```dockerfile
ARG BUN_VERSION=1.2.4
FROM oven/bun:${BUN_VERSION} as base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/index.ts .
COPY --from=prerelease /usr/src/app/src src/

USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "index.ts" ]
```

## 4. Horizontal Pod Autoscaler (HPA)

### Scaling Metrics
1. **CPU/Memory (Standard)**: Target 60-70% utilization.
2. **Request Count (Best for APIs)**: Scale based on RPS via Google Cloud Managed Prometheus (GMP).
3. **KEDA (Recommended)**: For event-driven scaling (Redis List length, Pub/Sub lag).

## 5. Observability

### Structured Logging (Pino for GCP)
```typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  messageKey: 'message', 
  formatters: {
    level(label, number) {
      return { severity: label.toUpperCase() };
    },
  },
});
```

### OpenTelemetry
Deploy an **OpenTelemetry Collector** as a sidecar.
- App sends traces to `localhost:4317` (gRPC)
- Sidecar batches and exports to Google Cloud Trace

## 6. Security

### Secret Management
- Use **Google Secret Manager** + **External Secrets Operator (ESO)** with Workload Identity
- Do NOT use raw K8s Secrets for sensitive data

### Network Policies
- Default deny ingress to Redis except from API deployment
- Restrict egress to necessary external services

## Appendix: Manifest Examples

### Deployment (API)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      serviceAccountName: api-sa
      containers:
      - name: api
        image: gcr.io/my-project/api:v1
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
```

### StatefulSet (Redis Stack)
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: "redis-service"
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis/redis-stack-server:latest
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-data
          mountPath: /data
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
  volumeClaimTemplates:
  - metadata:
      name: redis-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: "standard-rwo"
      resources:
        requests:
          storage: 10Gi
```
