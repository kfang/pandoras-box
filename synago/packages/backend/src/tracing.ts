import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"

const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
})

sdk.start()

process.on("SIGTERM", () => {
  sdk.shutdown().catch((err: unknown) => {
    console.error("Error shutting down OTel SDK:", err)
  })
})
