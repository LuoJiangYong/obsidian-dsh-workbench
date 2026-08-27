import { describe, expect, it } from 'vitest';

import {
  canSubmitNewTask,
  createNewTaskState,
  reduceNewTaskState,
} from '../src/new-task-state';
import { createVaultFileContext } from '../src/new-task-context';

describe('新建任务宿主状态', () => {
  it('以对话与空草稿的确定性空态开始', () => {
    const state = createNewTaskState();

    expect(state).toEqual({
      draft: '',
      mode: 'chat',
      contextError: null,
      contexts: [],
    });
    expect(canSubmitNewTask(state, 'idle')).toBe(false);
  });

  it('加入、移除上下文或显示错误时保留草稿与其他状态', () => {
    const context = createVaultFileContext('current-note', '项目/周报.md');
    let state = reduceNewTaskState(createNewTaskState(), {
      type: 'draft-changed',
      draft: '总结当前笔记',
    });
    state = reduceNewTaskState(state, { type: 'context-added', context });
    expect(state.contexts).toEqual([context]);
    expect(state.draft).toBe('总结当前笔记');

    state = reduceNewTaskState(state, {
      type: 'context-error-changed',
      message: '所选文件已失效',
    });
    expect(state.contextError).toBe('所选文件已失效');
    expect(state.contexts).toEqual([context]);

    state = reduceNewTaskState(state, { type: 'context-removed', id: context.id });
    expect(state.contexts).toEqual([]);
    expect(state.draft).toBe('总结当前笔记');
  });

  it('把文件夹展开的多篇笔记一次加入并保持草稿', () => {
    let state = reduceNewTaskState(createNewTaskState(), {
      type: 'draft-changed',
      draft: '总结资料文件夹',
    });
    const contexts = [
      createVaultFileContext('vault-file', '资料/一.md'),
      createVaultFileContext('vault-file', '资料/子目录/二.md'),
    ];

    state = reduceNewTaskState(state, { type: 'contexts-added', contexts });

    expect(state.contexts).toEqual(contexts);
    expect(state.draft).toBe('总结资料文件夹');
    expect(state.contextError).toBeNull();
  });

  it('只更新当前动作对应的字段且不修改旧状态', () => {
    const initial = createNewTaskState();
    const withMode = reduceNewTaskState(initial, { type: 'mode-changed', mode: 'task' });
    const withDraft = reduceNewTaskState(withMode, {
      type: 'draft-changed',
      draft: '  整理本周项目进展  ',
    });

    expect(initial).toEqual(createNewTaskState());
    expect(withMode).toEqual({ ...initial, mode: 'task' });
    expect(withDraft).toEqual({
      ...initial,
      draft: '  整理本周项目进展  ',
      mode: 'task',
    });
  });

  it('只有对话模式、非空草稿和非活动阶段同时满足时才可发送', () => {
    let state = createNewTaskState();
    state = reduceNewTaskState(state, { type: 'draft-changed', draft: '总结当前上下文' });
    expect(canSubmitNewTask(state, 'idle')).toBe(true);
    expect(canSubmitNewTask(state, 'completed')).toBe(true);
    expect(canSubmitNewTask(state, 'running')).toBe(false);

    state = reduceNewTaskState(state, { type: 'mode-changed', mode: 'task' });
    expect(canSubmitNewTask(state, 'idle')).toBe(false);
    state = reduceNewTaskState(state, { type: 'mode-changed', mode: 'chat' });
    state = reduceNewTaskState(state, { type: 'draft-changed', draft: '   ' });
    expect(canSubmitNewTask(state, 'idle')).toBe(false);
  });
});
