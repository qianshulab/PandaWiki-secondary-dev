import type {
  DomainAccessSettings,
  DomainKnowledgeBaseDetail,
} from '@/request/types';

const ipv4Reg = /^(\d{1,3}\.){3}\d{1,3}$/;

export const isIpLikeAdminHost = (host?: string) => {
  const normalizedHost = (host || '').trim().toLowerCase();

  if (!normalizedHost) return false;
  if (normalizedHost === 'localhost') return true;
  if (ipv4Reg.test(normalizedHost)) return true;
  if (normalizedHost.startsWith('[') && normalizedHost.endsWith(']'))
    return true;

  return normalizedHost.includes(':');
};

export const buildListenWikiUrl = (accessSettings?: DomainAccessSettings) => {
  const host = accessSettings?.hosts?.[0] || '';
  if (!host) return '';

  if (accessSettings?.ssl_ports && accessSettings.ssl_ports.length > 0) {
    return accessSettings.ssl_ports.includes(443)
      ? `https://${host}`
      : `https://${host}:${accessSettings.ssl_ports[0]}`;
  }

  if (accessSettings?.ports && accessSettings.ports.length > 0) {
    return accessSettings.ports.includes(80)
      ? `http://${host}`
      : `http://${host}:${accessSettings.ports[0]}`;
  }

  return '';
};

export const shouldUseExternalWikiUrl = () => {
  if (typeof window === 'undefined') return false;

  const adminHost = window.location.hostname;

  return Boolean(adminHost) && !isIpLikeAdminHost(adminHost);
};

export const getWikiAccessUrl = (kb?: DomainKnowledgeBaseDetail | null) => {
  const accessSettings = kb?.access_settings;
  const externalUrl = accessSettings?.base_url?.trim();

  if (externalUrl && shouldUseExternalWikiUrl()) {
    return externalUrl;
  }

  return buildListenWikiUrl(accessSettings);
};
