import { getFeatureFlags } from '../../utils/configuration';
import ErrorMonitoringConfig from './types/ServiceConfiguration';

const { enabled = false } = (getFeatureFlags()?.features?.error_monitoring as ErrorMonitoringConfig) || {};

export const isFeatureEnabled = () => {
  return enabled;
};
