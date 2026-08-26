export type NewTaskMode = 'chat' | 'task';

export type NewTaskPhase =
  | 'idle'
  | 'validating'
  | 'starting'
  | 'running'
  | 'awaiting_permission'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type NewTaskReviewStatus = 'pending' | 'ready';
export type NewTaskRuntimeStatus = 'disconnected' | 'connected';

export interface NewTaskState {
  readonly draft: string;
  readonly mode: NewTaskMode;
  readonly phase: NewTaskPhase;
  readonly reviewStatus: NewTaskReviewStatus;
  readonly runtimeStatus: NewTaskRuntimeStatus;
}

export type NewTaskAction =
  | { readonly type: 'draft-changed'; readonly draft: string }
  | { readonly type: 'mode-changed'; readonly mode: NewTaskMode }
  | { readonly type: 'phase-changed'; readonly phase: NewTaskPhase }
  | { readonly type: 'review-status-changed'; readonly status: NewTaskReviewStatus }
  | { readonly type: 'runtime-status-changed'; readonly status: NewTaskRuntimeStatus };

export function createNewTaskState(): NewTaskState {
  return Object.freeze({
    draft: '',
    mode: 'chat',
    phase: 'idle',
    reviewStatus: 'pending',
    runtimeStatus: 'disconnected',
  });
}

export function reduceNewTaskState(
  state: NewTaskState,
  action: NewTaskAction,
): NewTaskState {
  switch (action.type) {
    case 'draft-changed':
      return Object.freeze({ ...state, draft: action.draft });
    case 'mode-changed':
      return Object.freeze({ ...state, mode: action.mode });
    case 'phase-changed':
      return Object.freeze({ ...state, phase: action.phase });
    case 'review-status-changed':
      return Object.freeze({ ...state, reviewStatus: action.status });
    case 'runtime-status-changed':
      return Object.freeze({ ...state, runtimeStatus: action.status });
  }
}

export function canSubmitNewTask(state: NewTaskState): boolean {
  return state.draft.trim().length > 0
    && state.phase === 'idle'
    && state.reviewStatus === 'ready'
    && state.runtimeStatus === 'connected';
}
