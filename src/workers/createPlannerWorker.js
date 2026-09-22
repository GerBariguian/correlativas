export function createPlannerWorker() {
  return new Worker(new URL('./planner.worker.js', import.meta.url), { type: 'module' })
}
