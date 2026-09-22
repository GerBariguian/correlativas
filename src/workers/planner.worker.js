import { runPlannerWorkerRequest } from './plannerWorkerProtocol.js'

self.onmessage = ({ data }) => self.postMessage(runPlannerWorkerRequest(data))
