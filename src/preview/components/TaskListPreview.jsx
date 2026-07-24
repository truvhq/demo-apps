/**
 * Renders the same TaskList that the POSTasks host used to render directly. TASKS
 * is imported on the iframe side so only serializable task state crosses the
 * postMessage boundary: taskStates maps taskId to 'ready' | 'completed' | 'failed'
 * (the host derives it from its taskOrders/taskStatus maps, and re-resolves the
 * full task object by id on 'task:start').
 */

import { TaskList, TASKS } from '../../demos/scaffolding/pos-tasks.jsx';
import { postEvent } from '../protocol.js';

export function TaskListPreview({ applicationId, taskStates = {} }) {
  // TaskList reads taskOrders[id] truthiness and taskStatus[id] === 'completed';
  // rebuild both maps from the serializable taskStates prop.
  const taskOrders = {};
  const taskStatus = {};
  for (const task of TASKS) {
    const state = taskStates[task.id];
    if (state === 'ready' || state === 'completed') taskOrders[task.id] = true;
    if (state === 'completed') taskStatus[task.id] = 'completed';
  }

  return (
    <div>
      <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-1.5">Complete Your Verifications</h2>
      <p class="text-[15px] text-[#808080] leading-[1.5] mb-2">Application: <code class="text-[13px] bg-gray-100 px-1.5 py-0.5 rounded">{applicationId}</code></p>
      <p class="text-[15px] text-[#808080] leading-[1.5] mb-7">Complete each verification by connecting through Bridge.</p>
      <TaskList tasks={TASKS} taskOrders={taskOrders} taskStatus={taskStatus} onStart={(task) => postEvent('task:start', [task.id])} />
    </div>
  );
}
