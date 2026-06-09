import { putApiV1KnowledgeBaseDetail } from '@/request/KnowledgeBase';
import { DomainKnowledgeBaseDetail } from '@/request/types';
import { FormItem, SettingCardItem } from './Common';
import { validateUrl } from '@/utils';
import { buildListenWikiUrl } from '@/utils/wikiUrl';
import { TextField } from '@mui/material';
import { message } from '@ctzhian/ui';
import { useEffect, useState } from 'react';

const CardBasicInfo = ({
  kb,
  refresh,
}: {
  kb: DomainKnowledgeBaseDetail;
  refresh: () => void;
}) => {
  const [url, setUrl] = useState<string>('');
  const [isEdit, setIsEdit] = useState<boolean>(false);

  const handleSave = () => {
    try {
      const normalizedUrl = url.trim();

      if (!validateUrl(normalizedUrl) && normalizedUrl !== '') {
        throw new Error('请输入正确的网址');
      }

      putApiV1KnowledgeBaseDetail({
        id: kb.id!,
        access_settings: { ...kb.access_settings, base_url: normalizedUrl },
      }).then(() => {
        message.success('保存成功');
        setIsEdit(false);
        refresh();
      });
    } catch (e) {
      message.error('请输入正确的网址');
    }
  };

  useEffect(() => {
    setUrl(kb?.access_settings?.base_url || '');
    setIsEdit(false);
  }, [kb]);

  const baseUrlPlaceholder = () => {
    return buildListenWikiUrl(kb.access_settings);
  };

  return (
    <SettingCardItem title='网站基本信息' isEdit={isEdit} onSubmit={handleSave}>
      <FormItem label='外网 Wiki 访问域名'>
        <TextField
          fullWidth
          label='外网 Wiki 访问域名'
          value={url}
          onChange={e => {
            setUrl(e.target.value);
            setIsEdit(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleSave();
            }
          }}
          placeholder={baseUrlPlaceholder()}
          helperText='后台通过域名访问时，“访问 Wiki 网站”优先打开此地址；后台通过内网 IP 访问时仍打开服务监听地址。'
        />
      </FormItem>
    </SettingCardItem>
  );
};

export default CardBasicInfo;
