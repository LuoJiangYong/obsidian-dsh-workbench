import {
  addNewTaskContextSelections,
  addNewTaskContextSelection,
  removeNewTaskContextSelection,
  type NewTaskContextSelection,
} from './new-task-context';

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
export type NewTaskRuntimeStatus = 'disconnected' | 'connected';

export interface NewTaskState {
  readonly contextError: string | null;
  readonly contexts: readonly NewTaskContextSelection[];
  readonly draft: string;
  readonly mode: NewTaskMode;
}

export type NewTaskAction =
  | { readonly type: 'context-added'; readonly context: NewTaskContextSelection }
  | { readonly type: 'contexts-added'; readonly contexts: readonly NewTaskContextSelection[] }
  | { readonly type: 'context-error-changed'; readonly message: string | null }
  | { readonly type: 'context-removed'; readonly id: string }
  | { readonly type: 'draft-changed'; readonly draft: string }
  | { readonly type: 'mode-changed'; readonly mode: NewTaskMode };

export function createNewTaskState(): NewTaskState {
  return Object.freeze({
    contextError: null,
    contexts: Object.freeze([]),
    draft: '',
    mode: 'chat',
  });
}

export function reduceNewTaskState(
  state: NewTaskState,
  action: NewTaskAction,
): NewTaskState {
  switch (action.type) {
    case 'context-added':
      return Object.freeze({
        ...state,
        contextError: null,
        contexts: addNewTaskContextSelection(state.contexts, action.context),
      });
    case 'contexts-added':
      return Object.freeze({
        ...state,
        contextError: null,
        contexts: addNewTaskContextSelections(state.contexts, action.contexts),
      });
    case 'context-error-changed':
      return Object.freeze({ ...state, contextError: action.message });
    case 'context-removed':
      return Object.freeze({
        ...state,
        contextError: null,
        contexts: removeNewTaskContextSelection(state.contexts, action.id),
      });
    case 'draft-changed':
      return Object.freeze({ ...state, draft: action.draft });
    case 'mode-changed':
      return Object.freeze({ ...state, mode: action.mode });
  }
}

export function canSubmitNewTask(state: NewTaskState, phase: NewTaskPhase): boolean {
  return state.draft.trim().length > 0
    && state.mode === 'chat'
    && (phase === 'idle'
      || phase === 'cancelled'
      || phase === 'completed'
      || phase === 'failed');
}
