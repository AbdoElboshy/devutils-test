// Server entry for the operations bundle. esbuild bundles this to
// dist/operations.server.mjs — imported by server/api-v1.mjs. No React.
export { executeOperation, operations } from "./platform/operations";
export type { ApiOperationRequest, ApiOperationResponse } from "./platform/operations";
