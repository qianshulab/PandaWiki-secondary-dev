import { ConstsHomePageSetting } from '@/request/types';
import { getBasePath } from '@/utils/getBasePath';

export const INIT_DOC_DATA = [
  {
    type: 2,
    emoji: '🔥',
    name: '快速上手',
    summary:
      '本文档介绍当前知识库的基础使用流程：登录控制台、配置模型、创建内容、发布并访问 Wiki 网站。',
    content:
      '<p><strong>PandaWiki</strong> 是一款 AI 大模型驱动的知识库搭建系统，可用于构建产品文档、技术文档、FAQ 和博客系统。</p><h1>登录控制台</h1><p>使用管理员账号登录控制台后，可以在左侧导航中管理文档、发布内容、查看统计和调整站点设置。</p><h1>配置 AI 模型</h1><p>首次使用前，请在系统配置中填写你自己的模型供应商、API Key、对话模型、向量模型和重排序模型。</p><p>模型配置完成后，可以使用 AI 创作、AI 问答和 AI 搜索能力。</p><h1>创建并发布内容</h1><p>在“文档”页面创建或导入内容，确认内容无误后进入“发布”页面发布到 Wiki 站点。</p><h1>访问 Wiki 网站</h1><p>发布完成后，可以通过后台“访问 Wiki 网站”按钮或站点监听地址访问前台页面。</p>',
  },
  {
    type: 2,
    emoji: '📡',
    name: '接入 AI 模型',
    summary:
      '说明系统需要配置对话模型、向量模型和重排序模型，并提醒使用自己的模型服务地址和 API Token。',
    content:
      '<div data-id="alert_model_required" data-variant="warning" data-type="icon" data-node="alert"><p><strong>PandaWiki</strong> 依赖 AI 大模型完成创作、问答、摘要和搜索增强。未配置模型时，AI 相关能力将无法正常使用。</p></div><h2>必须配置的模型</h2><ul class="bullet-list" data-type="bulletList"><li><p><strong>智能对话模型</strong>：用于智能问答、摘要生成和内容创作。</p></li><li><p><strong>向量模型</strong>：用于将文档内容转化为向量，支撑搜索和问答召回。</p></li><li><p><strong>重排序模型</strong>：用于对召回结果进行二次排序，提升问答准确性。</p></li></ul><h2>配置建议</h2><p>请在后台模型配置中填写你自己的 Base URL、API Key 和模型名称。生产环境不要复用测试 Key，也不要把 API Key 写入源码或文档。</p><p>模型配置保存后，建议创建一篇测试文档并执行一次问答，确认模型链路、向量化和重排序均正常。</p>',
  },
] as const;

export const INIT_LADING_DATA = {
  title: 'PandaWiki',
  theme_mode: 'light',
  home_page_setting:
    ConstsHomePageSetting.HomePageSettingCustom as ConstsHomePageSetting,
  icon: getBasePath('/images/init/icon.png'),
  btns: [],
  web_app_custom_style: {
    allow_theme_switching: false,
    header_search_placeholder: '问问 AI 吧',
    show_brand_info: true,
    footer_show_intro: true,
    social_media_accounts: [],
  },
  footer_settings: {
    footer_style: 'complex',
    corp_name: '',
    icp: '',
    brand_name: 'PandaWiki 知识库',
    brand_desc:
      'PandaWiki 是一款 AI 驱动的知识库系统，支持构建产品文档、技术文档、FAQ 和博客，提供 AI 创作、问答和搜索能力。',
    brand_logo: getBasePath('/images/init/brand_logo.png'),
    brand_groups: [],
  },
  web_app_landing_configs: [
    {
      type: 'banner',
      banner_config: {
        title: '欢迎使用 PandaWiki AI 知识库',
        title_color: '#6E73FE',
        title_font_size: 60,
        subtitle:
          '构建智能化产品文档、技术文档、FAQ 和博客系统，提供 AI 创作、AI 问答和 AI 搜索能力。',
        placeholder: '有问题？问问 AI',
        subtitle_color: '#ffffff80',
        subtitle_font_size: 16,
        bg_url: '',
        hot_search: ['如何使用知识库', '如何配置 AI 模型', '如何发布 Wiki 网站'],
        btns: [
          {
            id: '1760701149843',
            text: '查看文档',
            type: 'contained',
            href: '',
          },
        ],
      },
      node_ids: [],
      nodes: null,
    },
    {
      type: 'basic_doc',
      basic_doc_config: {
        title: '极速入门',
        title_color: '#000000',
        bg_color: '#ffffff00',
      },
      node_ids: [],
    },
    {
      type: 'carousel',
      carousel_config: {
        title: '产品介绍',
        bg_color: '#3248F2',
        list: [
          {
            id: '1760701308042',
            title: '数据统计',
            url: getBasePath('/images/init/carousel_data_statistics.jpg'),
            desc: '',
          },
          {
            id: '1760701285851',
            title: '文档管理',
            url: getBasePath('/images/init/carousel_doc_manage.jpg'),
            desc: '',
          },
          {
            id: '1760701343411',
            title: '文档首页',
            url: getBasePath('/images/init/carousel_doc_home.jpg'),
            desc: '',
          },
          {
            id: '1760701321421',
            title: '智能问答',
            url: getBasePath('/images/init/carousel_ai_qa.jpg'),
            desc: '',
          },
          {
            id: '1760701346392',
            title: '三方机器人集成',
            url: getBasePath('/images/init/carousel_third_party_robot.jpg'),
            desc: '',
          },
          {
            id: '1760701385679',
            title: '网页挂件机器人',
            url: getBasePath('/images/init/carousel_web_robot.jpg'),
            desc: '',
          },
        ],
      },
      node_ids: [],
      nodes: null,
    },
    {
      type: 'faq',
      faq_config: {
        title: '常见问题',
        title_color: '#000000',
        bg_color: '#ffffff00',
        list: [
          {
            id: '1760701530938',
            question: '如何配置 AI 模型？',
            link: '',
          },
          {
            id: '1760701557320',
            question: '如何发布 Wiki 网站？',
            link: '',
          },
        ],
      },
      node_ids: [],
      nodes: null,
    },
  ],
};
