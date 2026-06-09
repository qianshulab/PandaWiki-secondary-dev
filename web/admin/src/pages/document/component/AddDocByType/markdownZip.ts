import { formatByte } from '@/utils';
import JSZip, { type JSZipObject } from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import type { ListDataItem } from '.';

type UploadAttachment = (file: File) => Promise<string>;

interface ParseMarkdownZipOptions {
  parentId: string | null;
  uploadAttachment: UploadAttachment;
}

const markdownExtReg = /\.(md|markdown|mdown)$/i;
const ignoredPathReg = /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/i;
const externalUrlReg = /^(https?:|data:|mailto:|tel:|#|\/static-file\/)/i;

const mimeTypeMap: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export const isMarkdownZipFile = (file: File) => /\.zip$/i.test(file.name);

const decodeBytes = (
  bytes: Uint8Array,
  encodings: Array<{ label: string; fatal?: boolean }>,
) => {
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding.label, {
        fatal: encoding.fatal ?? false,
      }).decode(bytes);
    } catch {
      // try next encoding
    }
  }

  return new TextDecoder().decode(bytes);
};

const toUint8Array = (bytes: Uint8Array | string[] | ArrayLike<number>) => {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) {
    return new Uint8Array(bytes.map(item => item.charCodeAt(0)));
  }

  return new Uint8Array(bytes);
};

const decodeZipFileName = (
  bytes: Uint8Array | string[] | ArrayLike<number>,
) => {
  return decodeBytes(toUint8Array(bytes), [
    { label: 'utf-8', fatal: true },
    { label: 'gb18030' },
    { label: 'gbk' },
  ]);
};

const decodeTextFile = (bytes: Uint8Array) => {
  return decodeBytes(bytes, [
    { label: 'utf-8', fatal: true },
    { label: 'gb18030' },
    { label: 'gbk' },
  ]);
};

const normalizeZipPath = (path: string) => {
  const parts: string[] = [];
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');

  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join('/');
};

const tryDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripQueryAndHash = (path: string) => path.split(/[?#]/)[0];

const dirname = (path: string) => {
  const normalized = normalizeZipPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
};

const basename = (path: string) => {
  const normalized = normalizeZipPath(path);
  return normalized.split('/').pop() || normalized || 'attachment';
};

const extname = (path: string) => {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
};

const removeExt = (name: string) => name.replace(/\.[^.]+$/, '');

const isExternalUrl = (url: string) => externalUrlReg.test(url.trim());

const zipPathKey = (path: string) => normalizeZipPath(path).toLowerCase();

const makeFolderItemId = (path: string) => `mdzip-folder:${path}`;

const createFileFromZipObject = async (entry: JSZipObject, path: string) => {
  const blob = await entry.async('blob');
  const filename = basename(path);

  return new File([blob], filename, {
    type: mimeTypeMap[extname(filename)] || 'application/octet-stream',
  });
};

const getMarkdownTargetCandidates = (target: string) => {
  const trimmed = target.trim();
  const candidates: string[] = [];

  if (!trimmed) return candidates;

  if (trimmed.startsWith('<')) {
    const endIndex = trimmed.indexOf('>');
    if (endIndex > 0) {
      candidates.push(trimmed.slice(1, endIndex));
    }
  }

  candidates.push(trimmed);

  const firstToken = trimmed.split(/\s+/)[0];
  if (firstToken && firstToken !== trimmed) {
    candidates.push(firstToken);
  }

  return [...new Set(candidates)];
};

const resolveArchivePath = (
  rawRef: string,
  mdDir: string,
  fileMap: Map<string, JSZipObject>,
) => {
  const withoutWrapper = rawRef.trim().replace(/^<|>$/g, '');
  if (!withoutWrapper || isExternalUrl(withoutWrapper)) return null;

  const decoded = tryDecodeURIComponent(stripQueryAndHash(withoutWrapper));
  if (!decoded || markdownExtReg.test(decoded)) return null;

  const candidates = decoded.startsWith('/')
    ? [decoded.slice(1)]
    : [`${mdDir}/${decoded}`, decoded];

  for (const candidate of candidates) {
    const normalized = normalizeZipPath(candidate);
    const entry = fileMap.get(zipPathKey(normalized));
    if (entry && !entry.dir) {
      return normalizeZipPath(entry.name);
    }
  }

  return null;
};

const collectReferences = (
  content: string,
  mdDir: string,
  fileMap: Map<string, JSZipObject>,
) => {
  const refToAssetPath = new Map<string, string>();
  const addReference = (rawRef: string) => {
    const assetPath = resolveArchivePath(rawRef, mdDir, fileMap);
    if (assetPath) {
      refToAssetPath.set(rawRef, assetPath);
    }
  };

  content.replace(
    /(!?\[[^\]]*?\]\()([^)]+)(\))/g,
    (_match, _prefix, target) => {
      getMarkdownTargetCandidates(target).forEach(addReference);
      return _match;
    },
  );

  content.replace(
    /\b(?:src|href)=(["'])([^"']+)\1/gi,
    (_match, _quote, url) => {
      addReference(url);
      return _match;
    },
  );

  content.replace(/!\[\[([^\]]+)\]\]/g, (_match, url) => {
    addReference(url);
    return _match;
  });

  return refToAssetPath;
};

const replaceReferences = (
  content: string,
  refToStaticUrl: Map<string, string>,
) => {
  const replaceRef = (value: string) => refToStaticUrl.get(value) || value;

  let nextContent = content.replace(
    /(!?\[[^\]]*?\]\()([^)]+)(\))/g,
    (match, prefix, target, suffix) => {
      let replacedTarget = target;
      const candidates = getMarkdownTargetCandidates(target).sort(
        (a, b) => b.length - a.length,
      );

      for (const candidate of candidates) {
        const staticUrl = refToStaticUrl.get(candidate);
        if (staticUrl) {
          replacedTarget = target.replace(candidate, staticUrl);
          break;
        }
      }

      return replacedTarget === target
        ? match
        : `${prefix}${replacedTarget}${suffix}`;
    },
  );

  nextContent = nextContent.replace(
    /(\b(?:src|href)=["'])([^"']+)(["'])/gi,
    (_match, prefix, url, suffix) => `${prefix}${replaceRef(url)}${suffix}`,
  );

  nextContent = nextContent.replace(/!\[\[([^\]]+)\]\]/g, (match, url) => {
    const staticUrl = refToStaticUrl.get(url);
    return staticUrl ? `![](${staticUrl})` : match;
  });

  return nextContent;
};

const createFolderItems = (
  mdPaths: string[],
  parentId: string | null,
): ListDataItem[] => {
  const folderPaths = new Set<string>();

  mdPaths.forEach(path => {
    const dir = dirname(path);
    if (!dir) return;

    const parts = dir.split('/');
    for (let i = 1; i <= parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join('/'));
    }
  });

  return [...folderPaths]
    .sort((a, b) => a.split('/').length - b.split('/').length)
    .map(path => {
      const parentPath = dirname(path);

      return {
        uuid: uuidv4(),
        parent_id: parentPath ? makeFolderItemId(parentPath) : parentId || '',
        id: makeFolderItemId(path),
        title: basename(path),
        summary: 'Markdown 压缩包目录',
        file: false,
        open: true,
        folderReq: true,
        status: 'parsed' as const,
      };
    });
};

export const parseMarkdownZipFile = async (
  file: File,
  options: ParseMarkdownZipOptions,
): Promise<ListDataItem[]> => {
  const zip = await JSZip.loadAsync(file, {
    decodeFileName: decodeZipFileName,
  });
  const entries = Object.values(zip.files)
    .map(entry => {
      entry.name = normalizeZipPath(entry.name);
      return entry;
    })
    .filter(entry => entry.name && !ignoredPathReg.test(entry.name));
  const fileMap = new Map<string, JSZipObject>();

  entries.forEach(entry => {
    if (!entry.dir) {
      fileMap.set(zipPathKey(entry.name), entry);
    }
  });

  const mdEntries = entries
    .filter(entry => !entry.dir && markdownExtReg.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  if (mdEntries.length === 0) {
    throw new Error('压缩包内未找到 Markdown 文件');
  }

  const uploadedAssets = new Map<string, string>();
  const mdItems: ListDataItem[] = [];

  for (const mdEntry of mdEntries) {
    const mdPath = normalizeZipPath(mdEntry.name);
    const mdDir = dirname(mdPath);
    const mdBytes = await mdEntry.async('uint8array');
    const rawContent = decodeTextFile(mdBytes);
    const references = collectReferences(rawContent, mdDir, fileMap);
    const refToStaticUrl = new Map<string, string>();

    for (const [rawRef, assetPath] of references) {
      let staticUrl = uploadedAssets.get(assetPath);
      if (!staticUrl) {
        const assetEntry = fileMap.get(zipPathKey(assetPath));
        if (!assetEntry) continue;

        const assetFile = await createFileFromZipObject(assetEntry, assetPath);
        staticUrl = await options.uploadAttachment(assetFile);
        uploadedAssets.set(assetPath, staticUrl);
      }
      refToStaticUrl.set(rawRef, staticUrl);
    }

    const content = replaceReferences(rawContent, refToStaticUrl);
    const parentPath = mdDir ? makeFolderItemId(mdDir) : options.parentId || '';

    mdItems.push({
      uuid: uuidv4(),
      parent_id: parentPath,
      id: `mdzip-doc:${mdPath}`,
      title: removeExt(basename(mdPath)),
      summary: `Markdown 压缩包解析完成，附件 ${refToStaticUrl.size} 个，原文件 ${formatByte(mdBytes.byteLength)}`,
      file: true,
      open: false,
      status: 'parsed',
      content,
      content_type: 'md',
      file_type: 'md',
    });
  }

  return [
    ...createFolderItems(
      mdEntries.map(entry => entry.name),
      options.parentId,
    ),
    ...mdItems,
  ];
};
