import { KBDetail } from '@/assets/type';

const OFFICIAL_LINK_PATTERNS = [
  'pandawiki.docs.baizhi.cloud',
  'release.baizhi.cloud',
  'sentry.baizhi.cloud',
  'baizhi.cloud/consult',
  'bbs.baizhi.cloud',
  'pandawiki.qa.baizhi.cloud',
  'github.com/chaitin/PandaWiki',
  'ly.safepoint.cloud',
  'model-square.app.baizhi.cloud/token',
];

const OFFICIAL_TEXT_PATTERNS = [
  'GitHub',
  'Github',
  '帮助文档',
  '在线支持',
  '微信交流群',
  '企业微信交流群',
  '社区论坛',
  '官方论坛',
  '商务咨询',
  '立即更新',
];

const containsOfficialPattern = (value?: string | null) => {
  if (!value) return false;
  return (
    OFFICIAL_LINK_PATTERNS.some(pattern => value.includes(pattern)) ||
    OFFICIAL_TEXT_PATTERNS.some(pattern => value.includes(pattern))
  );
};

const shouldRemoveOfficialItem = (item: Record<string, any>) => {
  return ['url', 'href', 'link', 'text', 'name', 'icon'].some(key =>
    containsOfficialPattern(item?.[key]),
  );
};

export const sanitizeOfficialLinks = (kbDetail?: KBDetail): KBDetail | undefined => {
  if (!kbDetail?.settings) return kbDetail;

  const settings = kbDetail.settings;
  const customStyle = settings.web_app_custom_style || {};
  const footerSettings = settings.footer_settings;

  return {
    ...kbDetail,
    settings: {
      ...settings,
      btns: settings.btns?.filter(btn => !shouldRemoveOfficialItem(btn)) || [],
      web_app_custom_style: {
        ...customStyle,
        social_media_accounts:
          customStyle.social_media_accounts?.filter(
            item => !shouldRemoveOfficialItem(item),
          ) || [],
      },
      footer_settings: footerSettings
        ? {
            ...footerSettings,
            brand_groups:
              footerSettings.brand_groups
                ?.map(group => ({
                  ...group,
                  links:
                    group.links?.filter(
                      link => !shouldRemoveOfficialItem(link),
                    ) || [],
                }))
                .filter(group => group.links.length > 0) || [],
          }
        : footerSettings,
      web_app_landing_configs:
        settings.web_app_landing_configs?.map(config => ({
          ...config,
          banner_config: config.banner_config
            ? {
                ...config.banner_config,
                btns:
                  config.banner_config.btns?.filter(
                    btn => !shouldRemoveOfficialItem(btn),
                  ) || [],
              }
            : config.banner_config,
          faq_config: config.faq_config
            ? {
                ...config.faq_config,
                list:
                  config.faq_config.list?.filter(
                    item => !shouldRemoveOfficialItem(item),
                  ) || [],
              }
            : config.faq_config,
        })) || [],
    },
  };
};
