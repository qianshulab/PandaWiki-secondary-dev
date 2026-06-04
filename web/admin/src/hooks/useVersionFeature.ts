import {
  FeatureStatus,
  VersionInfoMap,
  VersionInfo,
  getFeatureValue,
} from '@/constant/version';
import { ConstsLicenseEdition } from '@/request/types';
import { useAppSelector } from '@/store';

export const useFeatureValue = <K extends keyof VersionInfo['features']>(
  key: K,
): VersionInfo['features'][K] => {
  const { license } = useAppSelector(state => state.config);
  return getFeatureValue(license.edition!, key);
};

export const useFeatureValueSupported = (
  key: keyof VersionInfo['features'],
) => {
  const { license } = useAppSelector(state => state.config);
  return (
    getFeatureValue(license.edition!, key) === FeatureStatus.SUPPORTED ||
    getFeatureValue(license.edition!, key) === FeatureStatus.ADVANCED
  );
};

export const useVersionInfo = () => {
  const { license } = useAppSelector(state => state.config);
  return (
    VersionInfoMap[
      license.edition ?? ConstsLicenseEdition.LicenseEditionFree
    ] || VersionInfoMap[ConstsLicenseEdition.LicenseEditionFree]
  );
};


export type FeaturePolicyFlag =
  | 'allow_admin_perm'
  | 'allow_custom_copyright'
  | 'allow_comment_audit'
  | 'allow_advanced_bot'
  | 'allow_watermark'
  | 'allow_copy_protection'
  | 'allow_open_ai_bot_settings'
  | 'allow_mcp_server'
  | 'allow_node_stats'
  | 'allow_doc_history'
  | 'allow_contribution'
  | 'allow_visitor_permission_control';

export const licensePolicyFlagEnabled = (
  license: any,
  flag: FeaturePolicyFlag,
  fallbackPermission: ConstsLicenseEdition[] = [],
): boolean => {
  const policyValue = license?.limitation?.[flag];
  if (typeof policyValue === 'boolean') return policyValue;
  const edition = license?.edition ?? ConstsLicenseEdition.LicenseEditionFree;
  return fallbackPermission.includes(edition);
};

export const useLicensePolicyFlag = (
  flag: FeaturePolicyFlag,
  fallbackPermission: ConstsLicenseEdition[] = [],
) => {
  const { license } = useAppSelector(state => state.config);
  return licensePolicyFlagEnabled(license, flag, fallbackPermission);
};
