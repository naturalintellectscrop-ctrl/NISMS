// Vercel serverless entry: exports the Express app as the request handler.
// All routes are rewritten here by vercel.json; Express sees the original path.
import { createApp } from '../src/app';

const app = createApp();

export default app;
