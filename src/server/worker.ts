// Job handlers must be registered before the worker starts claiming.
import './features';
import './platform/jobs/builtin';
import './platform/notify';
import './platform/storage/jobs';
export { startWorker, type Worker } from './platform/jobs/worker';
