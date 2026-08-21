export interface WorkbenchBaselineState {
  readonly connectionStatus: string;
  readonly healthCheckStatus: string;
  readonly platformStatus: string;
  readonly vaultPermissionStatus: string;
}

export const WORKBENCH_BASELINE_STATE: WorkbenchBaselineState = Object.freeze({
  connectionStatus: '尚未连接 DSH',
  healthCheckStatus: '尚未实现',
  platformStatus: '仅桌面端',
  vaultPermissionStatus: '未启用',
});
