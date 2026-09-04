// Job handlers must be registered before the worker starts claiming.
import './features';
import './platform/jobs/builtin';
export { startWorker, type Worker } from './platform/jobs/worker';
