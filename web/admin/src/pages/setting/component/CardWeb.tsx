import { getApiV1AppDetail } from '@/request/App';
import {
  DomainAppDetailResp,
  DomainKnowledgeBaseDetail,
} from '@/request/types';
import { Box } from '@mui/material';
import { useEffect, useState } from 'react';
import CardAuth from './CardAuth';
import CardBasicInfo from './CardBasicInfo';
import CardCatalog from './CardCatalog';
import CardCustom from './CardCustom';
import CardListen from './CardListen';
import CardProxy from './CardProxy';
import CardStyle from './CardStyle';
import CardWebCustomCode from './CardWebCustomCode';
import CardWebSEO from './CardWebSEO';
import CardQaCopyright from './CardQaCopyright';
import CardWebStats from './CardWebStats';

interface CardWebProps {
  kb: DomainKnowledgeBaseDetail;
  refresh: () => void;
}

const CardWeb = ({ kb, refresh }: CardWebProps) => {
  const [info, setInfo] = useState<DomainAppDetailResp | null>(null);

  const mergeInfoSettings = (
    updater: (current: DomainAppDetailResp) => DomainAppDetailResp['settings'],
  ) => {
    setInfo(current => {
      if (!current) return current;
      return {
        ...current,
        settings: updater(current),
      };
    });
  };

  const getInfo = async () => {
    const res = await getApiV1AppDetail({ kb_id: kb.id!, type: '1' });
    setInfo(res);
  };

  useEffect(() => {
    getInfo();
  }, [kb]);

  if (!info?.id) return <></>;

  return (
    <Box
      sx={{
        width: 1000,
        margin: 'auto',
        pb: 4,
      }}
    >
      <CardCustom
        kb={kb}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            ...value,
          }));
        }}
        info={info}
      />
      <CardStyle
        id={info.id}
        data={info}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            theme_mode: value.theme_mode,
            theme_and_style: {
              ...current.settings?.theme_and_style,
              doc_width: value.doc_width,
              bg_image: value.bg_image,
            },
          }));
        }}
      />
      <CardListen kb={kb} refresh={refresh} />
      <CardProxy kb={kb} refresh={refresh} />
      <CardBasicInfo kb={kb} refresh={refresh} />
      <CardQaCopyright
        data={info}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            conversation_setting: value,
          }));
        }}
      />
      <CardAuth kb={kb} refresh={refresh} />
      <CardCatalog
        id={info.id}
        data={info}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            catalog_settings: {
              ...current.settings?.catalog_settings,
              ...value,
            },
          }));
        }}
      />

      <CardWebSEO
        id={info.id}
        data={info}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            ...value,
          }));
        }}
      />

      <CardWebCustomCode
        id={info.id}
        data={info}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            ...value,
          }));
        }}
      />
      <CardWebStats
        id={info.id}
        data={info}
        refresh={value => {
          mergeInfoSettings(current => ({
            ...current.settings,
            stats_setting: {
              ...current.settings?.stats_setting,
              ...value,
            },
          }));
        }}
      />
    </Box>
  );
};
export default CardWeb;
