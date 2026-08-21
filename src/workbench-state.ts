import { type DshHealthResult, TARGET_DSH_VERSION } from './dsh-health';

export interface WorkbenchState {
  readonly connectionStatus: string;
  readonly healthCheckStatus: string;
  readonly platformStatus: string;
  readonly vaultPermissionStatus: string;
}

export function createWorkbenchState(health: DshHealthResult): WorkbenchState {
  return Object.freeze({
    connectionStatus: '尚未连接 DSH',
    healthCheckStatus: formatHealthStatus(health),
    platformStatus: '仅桌面端',
    vaultPermissionStatus: '未启用',
  });
}

function formatHealthStatus(health: DshHealthResult): string {
  switch (health.status) {
    case 'unchecked':
      return '尚未检测';
    case 'checking':
      return '正在检测 DSH';
    case 'available':
      return `DSH 可执行（${health.version}）`;
    case 'unsupported-version':
      return `检测到 ${health.version}，当前目标版本为 ${TARGET_DSH_VERSION}`;
    case 'invalid-command':
      return health.message;
    case 'not-found':
      return '找不到 DSH 命令或文件';
    case 'invalid-output':
      return 'DSH 未返回可识别的版本';
    case 'timed-out':
      return 'DSH 健康检查超时';
    case 'cancelled':
      return 'DSH 健康检查已取消';
    case 'failed':
      return health.diagnostic;
  }
}
