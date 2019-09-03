import * as R from 'ramda';
import { TaskStates, TaskTypes } from './constants/task';
import {
  FailureStrategies as WorkfloFailureStrategies,
  WorkflowStates,
} from './constants/workflow';
import { poll, consumerClient, flush, sendEvent } from './kafka';
import { taskInstanceStore, workflowInstanceStore } from './store';
import {
  AllTaskType,
  IParallelTask,
  IDecisionTask,
} from './workflowDefinition';
import { IWorkflow } from './workflow';
import { ITask } from './task';
import { toObjectByKey } from './utils/common';

export interface IWorkflowUpdate {
  workflowId: string;
  status: WorkflowStates;
  output?: any;
}

export interface ITaskUpdate {
  transactionId: string;
  taskId: string;
  status: TaskStates;
  output?: any;
  logs?: any[] | any;
}

const isAllCompleted = R.all(R.pathEq(['status'], TaskStates.Completed));

const getNextPath = (currentPath: (string | number)[]): (string | number)[] => [
  ...R.init(currentPath),
  +R.last(currentPath) + 1,
];

const isChildOfDecisionDefault = (
  tasks: AllTaskType[],
  currentPath: (string | number)[],
): boolean =>
  R.pathEq(
    [...R.dropLast(2, currentPath), 'type'],
    TaskTypes.Decision,
    tasks,
  ) && R.nth(-2, currentPath) === 'defaultDecision';

const isChildOfDecisionCase = (
  tasks: AllTaskType[],
  currentPath: (string | number)[],
): boolean =>
  R.pathEq(
    [...R.dropLast(3, currentPath), 'type'],
    TaskTypes.Decision,
    tasks,
  ) && R.nth(-3, currentPath) === 'decisions';

const isTaskOfActivityTask = (
  tasks: AllTaskType[],
  currentPath: (string | number)[],
): boolean => !!R.path(getNextPath(currentPath), tasks);

const isTaskOfParallelTask = (
  tasks: AllTaskType[],
  currentPath: (string | number)[],
): boolean =>
  R.pathEq([...R.dropLast(3, currentPath), 'type'], TaskTypes.Parallel, tasks);

const getNextParallelTask = (
  tasks: AllTaskType[],
  currentPath: (string | number)[],
  taskData: { [taskReferenceName: string]: ITask } = {},
): { isCompleted: boolean; taskPath: (string | number)[] } => {
  // If still got next task in line
  if (R.path(getNextPath(currentPath), tasks)) {
    return {
      isCompleted: false,
      taskPath: getNextPath(currentPath),
    };
  }

  const allTaskStatuses = R.pathOr([], R.dropLast(2, currentPath), tasks).map(
    (pTask: AllTaskType[]) =>
      R.path([R.last(pTask).taskReferenceName], taskData),
  );
  // All of line are completed
  if (isAllCompleted(allTaskStatuses)) {
    return getNextTaskPath(tasks, R.dropLast(3, currentPath), taskData);
  }

  // Wait for other line
  return {
    isCompleted: false,
    taskPath: null,
  };
};

// Check if it's system task
const getNextTaskPath = (
  tasks: AllTaskType[],
  currentPath: (string | number)[],
  taskData: { [taskReferenceName: string]: ITask } = {},
): { isCompleted: boolean; taskPath: (string | number)[] } => {
  // Check if this's the final task
  if (R.equals([tasks.length - 1], currentPath))
    return { isCompleted: true, taskPath: null };

  switch (true) {
    case isTaskOfParallelTask(tasks, currentPath):
      return getNextParallelTask(tasks, currentPath, taskData);
    case isChildOfDecisionDefault(tasks, currentPath):
      return getNextTaskPath(tasks, R.dropLast(2, currentPath), taskData);
    case isChildOfDecisionCase(tasks, currentPath):
      return getNextTaskPath(tasks, R.dropLast(3, currentPath), taskData);
    case isTaskOfActivityTask(tasks, currentPath):
      return { isCompleted: false, taskPath: getNextPath(currentPath) };
    // This case should never fall
    default:
      throw new Error('Task is invalid');
  }
};

const findNextParallelTaskPath = (
  taskReferenceName: string,
  tasks: AllTaskType[],
  currentPath: (string | number)[],
  currentTask: IParallelTask,
) => {
  for (
    let pTasksIndex = 0;
    pTasksIndex < currentTask.parallelTasks.length;
    pTasksIndex++
  ) {
    const taskPath = findTaskPath(taskReferenceName, tasks, [
      ...currentPath,
      'parallelTasks',
      pTasksIndex,
      0,
    ]);
    if (taskPath) return taskPath;
  }
  return findTaskPath(taskReferenceName, tasks, getNextPath(currentPath));
};

const findNextDecisionTaskPath = (
  taskReferenceName: string,
  tasks: AllTaskType[],
  currentPath: (string | number)[],
  currentTask: IDecisionTask,
) => {
  const decisionsPath = [
    ...Object.keys(currentTask.decisions).map((decision: string) => [
      'decisions',
      decision,
    ]),
    ['defaultDecision'],
  ];
  for (const decisionPath of decisionsPath) {
    const taskPath = findTaskPath(taskReferenceName, tasks, [
      ...currentPath,
      ...decisionPath,
      0,
    ]);
    if (taskPath) return taskPath;
  }
  return findTaskPath(taskReferenceName, tasks, getNextPath(currentPath));
};

export const findTaskPath = (
  taskReferenceName: string,
  tasks: AllTaskType[],
  currentPath: (string | number)[] = [0],
): (string | number)[] => {
  const currentTask: AllTaskType = R.path(currentPath, tasks);
  if (currentTask)
    if (currentTask.taskReferenceName === taskReferenceName) return currentPath;
    else
      switch (currentTask.type) {
        case TaskTypes.Parallel:
          return findNextParallelTaskPath(
            taskReferenceName,
            tasks,
            currentPath,
            currentTask,
          );
        case TaskTypes.Decision:
          return findNextDecisionTaskPath(
            taskReferenceName,
            tasks,
            currentPath,
            currentTask,
          );
        case TaskTypes.SubWorkflow:
        case TaskTypes.Task:
        case TaskTypes.Compensate:
        default:
          return findTaskPath(
            taskReferenceName,
            tasks,
            getNextPath(currentPath),
          );
      }
  else return null;
};

export const getTaskData = async (
  workflow: IWorkflow,
): Promise<{ [taskReferenceName: string]: ITask }> => {
  const tasks = await taskInstanceStore.getAll(workflow.workflowId);
  return tasks.reduce((result: { [ref: string]: ITask }, task: ITask) => {
    result[task.taskReferenceName] = task;
    return result;
  }, {});
};

const getTaskInfo = async (task: ITask) => {
  const workflow: IWorkflow = await workflowInstanceStore.get(task.workflowId);

  const taskData = await getTaskData(workflow);
  const currentTaskPath = findTaskPath(
    task.taskReferenceName,
    workflow.workflowDefinition.tasks,
  );
  const nextTaskPath = getNextTaskPath(
    workflow.workflowDefinition.tasks,
    currentTaskPath,
    taskData,
  );

  return {
    workflow,
    taskData,
    currentTaskPath,
    nextTaskPath,
  };
};

const handleCompletedTask = async (task: ITask) => {
  const { workflow, taskData, nextTaskPath } = await getTaskInfo(task);

  if (!nextTaskPath.isCompleted && nextTaskPath.taskPath) {
    await taskInstanceStore.create(
      workflow,
      R.path(nextTaskPath.taskPath, workflow.workflowDefinition.tasks),
      taskData,
      true,
    );
  } else if (nextTaskPath.isCompleted) {
    // When workflow is completed
    await Promise.all([
      workflowInstanceStore.delete(workflow.workflowId),
      taskInstanceStore.deleteAll(workflow.workflowId),
    ]);
  }
};

const getRewindTasks = R.compose(
  R.map(
    (task: ITask): AllTaskType => {
      return {
        name: task.taskName,
        taskReferenceName: task.taskReferenceName,
        type: TaskTypes.Compensate,
        inputParameters: {
          input: `\${workflow.input.${task.taskReferenceName}.input}`,
          output: `\${workflow.input.${task.taskReferenceName}.output}`,
        },
      };
    },
  ),
  R.sort((taskA: ITask, taskB: ITask): number => {
    return taskB.endTime - taskA.endTime;
  }),
  R.filter((task: ITask | any): boolean => {
    return task.type === TaskTypes.Task && task.status === TaskStates.Completed;
  }),
);

const handleFailedTask = async (task: ITask) => {
  // If got change to retry
  if (task.retries > 0) {
    const { workflow, taskData, currentTaskPath } = await getTaskInfo(task);
    await taskInstanceStore.delete(task.taskId);
    // TODO Much delay before dispatch
    await taskInstanceStore.create(
      workflow,
      R.path(currentTaskPath, workflow.workflowDefinition.tasks),
      taskData,
      true,
      {
        retries: task.retries - 1,
        isRetried: true,
      },
    );
  } else {
    const tasksData = await taskInstanceStore.getAll(task.workflowId);
    const runningTasks = tasksData.filter((taskData: ITask) => {
      [TaskStates.Inprogress, TaskStates.Scheduled].includes(taskData.status) &&
        taskData.taskReferenceName !== task.taskReferenceName;
    });

    // No running task, start recovery
    // If there are running task wait for them first
    if (runningTasks.length === 0) {
      const workflow = await workflowInstanceStore.update({
        workflowId: task.workflowId,
        status: WorkflowStates.Failed,
      });
      switch (workflow.workflowDefinition.failureStrategy) {
        case WorkfloFailureStrategies.RecoveryWorkflow:
          await workflowInstanceStore.create(
            undefined,
            workflow.workflowDefinition,
            tasksData,
          );
          break;
        case WorkfloFailureStrategies.Retry:
          if (workflow.retries > 0) {
            await workflowInstanceStore.create(
              workflow.transactionId,
              workflow.workflowDefinition,
              tasksData,
              undefined,
              {
                retries: workflow.retries - 1,
              },
            );
          }
          break;
        case WorkfloFailureStrategies.Rewind:
          await workflowInstanceStore.create(
            workflow.transactionId,
            {
              name: workflow.workflowDefinition.name,
              rev: `${workflow.workflowDefinition.rev}_compensate`,
              tasks: getRewindTasks(tasksData),
              failureStrategy: WorkfloFailureStrategies.Failed,
            },
            toObjectByKey(tasksData, 'taskReferenceName'),
          );
          break;
        case WorkfloFailureStrategies.RewindThenRetry:
          await workflowInstanceStore.create(
            workflow.transactionId,
            {
              name: workflow.workflowDefinition.name,
              rev: `${workflow.workflowDefinition.rev}_compensate`,
              tasks: getRewindTasks(tasksData),
              failureStrategy: WorkfloFailureStrategies.Failed,
            },
            toObjectByKey(tasksData, 'taskReferenceName'),
          );
          break;

        case WorkfloFailureStrategies.Failed:
          // We don't do anything in this case
          break;
        default:
          break;
      }
    }
  }
};

const processTasksOfWorkflow = async (
  workflowTasksUpdate: ITaskUpdate[],
): Promise<any> => {
  for (const taskUpdate of workflowTasksUpdate) {
    try {
      const task = await taskInstanceStore.update(taskUpdate);

      switch (taskUpdate.status) {
        case TaskStates.Completed:
          await handleCompletedTask(task);
          break;
        case TaskStates.Failed:
          await handleFailedTask(task);
          break;

        default:
          break;
      }
    } catch (error) {
      sendEvent({
        transactionId: taskUpdate.transactionId,
        type: 'TASK',
        isError: true,
        error,
        timestamp: Date.now(),
      });
    }
  }
};

export const executor = async () => {
  try {
    const tasksUpdate: ITaskUpdate[] = await poll(consumerClient, 300);
    const groupedTasks = R.toPairs(
      R.groupBy(R.path(['workflowId']), tasksUpdate),
    );

    await Promise.all(
      groupedTasks.map(
        ([_workflowId, workflowTasksUpdate]: [string, ITaskUpdate[]]) =>
          processTasksOfWorkflow(workflowTasksUpdate),
      ),
    );

    consumerClient.commit();
    await flush(1000 + 20 * tasksUpdate.length);
  } catch (error) {
    // Handle error here
    console.log(error);
  } finally {
    setImmediate(executor);
  }
};
