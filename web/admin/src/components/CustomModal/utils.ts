import { getBasePath } from '@/utils/getBasePath';

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

const handleHeaderProps = (setting: any) => {
  return {
    title: setting.title,
    logo: getBasePath(setting.icon || ''),
    btns: setting.btns
      ?.filter((btn: any) => !shouldRemoveOfficialItem(btn))
      .map((btn: any) => ({
        ...btn,
        url: getBasePath(btn.url || ''),
        icon: getBasePath(btn.icon || ''),
      })),
    homePath: window.__BASENAME__ || '',
    placeholder:
      setting.web_app_custom_style?.header_search_placeholder || '搜索...',
  };
};

const handleFooterProps = (setting: any) => {
  const footerSettings = setting.footer_settings || {};
  const customStyle = setting.web_app_custom_style || {};
  return {
    footerSetting: {
      ...footerSettings,
      brand_logo: getBasePath(footerSettings?.brand_logo || ''),
      brand_groups:
        footerSettings.brand_groups
          ?.map((group: any) => ({
            ...group,
            links:
              group.links?.filter(
                (link: any) => !shouldRemoveOfficialItem(link),
              ) || [],
          }))
          .filter((group: any) => group.links.length > 0) || [],
    },
    logo: getBasePath('/images/init/icon.png'),
    showBrand: customStyle?.show_brand_info || false,
    customStyle: {
      ...customStyle,
      social_media_accounts:
        customStyle?.social_media_accounts
          ?.filter((item: any) => !shouldRemoveOfficialItem(item))
          .map((item: any) => ({
            ...item,
            icon: getBasePath(item.icon),
          })) || [],
    },
  };
};

const handleFaqProps = (config: any = {}) => {
  return {
    title: config.title || '链接组',
    items:
      config.list
        ?.filter((item: any) => !shouldRemoveOfficialItem(item))
        .map((item: any) => ({
          question: item.question,
          url: item.link,
        })) || [],
  };
};

const handleBasicDocProps = (config: any = {}) => {
  return {
    title: config.title || '文档摘要卡片',

    items:
      config.nodes?.map((item: any) => ({
        ...item,
        summary: item.summary || '暂无摘要',
      })) || [],
  };
};

const handleDirDocProps = (config: any = {}) => {
  return {
    title: config.title || '文件夹卡片',
    items:
      config.nodes?.map((item: any) => ({
        ...item,
        recommend_nodes: [...(item.recommend_nodes || [])].sort(
          (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
        ),
      })) || [],
  };
};

const handleNavDocProps = (config: any = {}) => {
  return {
    title: config.title || '目录卡片',
    items: config.nodes || [],
  };
};

const handleSimpleDocProps = (config: any = {}) => {
  return {
    title: config.title || '简易文档卡片',
    items:
      config.nodes?.map((item: any) => ({
        ...item,
      })) || [],
  };
};

const handleCarouselProps = (config: any = {}) => {
  return {
    title: config.title || '轮播图',
    bgColor: config.bg_color || '#3248F2',
    titleColor: config.title_color || '#ffffff',
    items:
      config.list?.map((item: any) => ({
        id: item.id,
        title: item.title,
        url: getBasePath(item.url),
        desc: item.desc,
      })) || [],
  };
};

const handleBannerProps = (config: any = {}) => {
  return {
    title: {
      text: config.title,
      color: config.title_color,
      fontSize: config.title_font_size,
    },
    subtitle: {
      text: config.subtitle,
      color: config.subtitle_color,
      fontSize: config.subtitle_font_size,
    },
    bg_url: getBasePath(config.bg_url),
    search: {
      placeholder: config.placeholder,
      hot: config.hot_search,
    },
    btns: config.btns || [],
  };
};

const handleTextProps = (config: any = {}) => {
  return {
    title: config.title || '标题',
  };
};

const handleMetricsProps = (config: any = {}) => {
  return {
    title: config.title || '指标卡片',
    items: config.list || [],
  };
};

const handleCaseProps = (config: any = {}) => {
  return {
    title: config.title || '案例卡片',
    items: config.list || [],
  };
};

const handleFeatureProps = (config: any = {}) => {
  return {
    title: config.title || '产品特性',
    items: config.list || [],
  };
};

const handleImgTextProps = (config: any = {}) => {
  return {
    title: config.title || '左图右字',
    item: {
      ...(config.item || {}),
      url: getBasePath(config.item?.url || ''),
    },
    direction: 'row',
  };
};

const handleTextImgProps = (config: any = {}) => {
  return {
    title: config.title || '右图左字',
    item: {
      ...(config.item || {}),
      url: getBasePath(config.item?.url || ''),
    },
    direction: 'row-reverse',
  };
};

const handleCommentProps = (config: any = {}) => {
  return {
    title: config.title || '评论卡片',
    items:
      config.list?.map((item: any) => ({
        ...item,
        avatar: getBasePath(item.avatar || ''),
      })) || [],
  };
};

const handleBlockGridProps = (config: any = {}) => {
  return {
    title: config.title || '区块网格',
    items:
      config.list?.map((item: any) => ({
        ...item,
        url: getBasePath(item.url || ''),
      })) || [],
  };
};

const handleQuestionProps = (config: any = {}) => {
  return {
    title: config.title || '常见问题',
    items: config.list || [],
  };
};

export const handleComponentProps = (
  type: string,
  id: string,
  setting: any,
) => {
  if (type === 'header') {
    return handleHeaderProps(setting);
  } else if (type === 'footer') {
    return handleFooterProps(setting);
  } else {
    const config = (setting.web_app_landing_configs || []).find(
      (c: any) => c.id === id,
    );

    switch (type) {
      case 'faq':
        return handleFaqProps(config);
      case 'basic_doc':
        return handleBasicDocProps(config);
      case 'dir_doc':
        return handleDirDocProps(config);
      case 'simple_doc':
        return handleSimpleDocProps(config);
      case 'nav_doc':
        return handleNavDocProps(config);
      case 'carousel':
        return handleCarouselProps(config);
      case 'banner':
        return handleBannerProps(config);
      case 'text':
        return handleTextProps(config);
      case 'metrics':
        return handleMetricsProps(config);
      case 'case':
        return handleCaseProps(config);
      case 'feature':
        return handleFeatureProps(config);
      case 'img_text':
        return handleImgTextProps(config);
      case 'text_img':
        return handleTextImgProps(config);
      case 'comment':
        return handleCommentProps(config);
      case 'block_grid':
        return handleBlockGridProps(config);
      case 'question':
        return handleQuestionProps(config);
    }
  }
};

export const findConfigById = (configs: any[], id: string) => {
  const config = configs.find(item => item.id === id);
  return config || {};
};

export const handleLandingConfigs = ({
  id,
  config,
  values,
}: {
  id: string;
  config: any[];
  values: any;
}) => {
  return config.map(item => {
    if (item.id === id) {
      return {
        type: item.type,
        id: item.id,
        ...values,
      };
    }
    return item;
  });
};
