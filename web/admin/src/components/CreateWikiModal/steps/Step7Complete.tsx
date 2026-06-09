import { useMemo } from 'react';
import { Box, Stack, Button } from '@mui/material';
import complete from '@/assets/images/init/complete.png';
import { useAppSelector } from '@/store';
import { getWikiAccessUrl } from '@/utils/wikiUrl';

const Step7Complete = () => {
  const { kbDetail } = useAppSelector(state => state.config);

  const wikiUrl = useMemo(() => {
    return getWikiAccessUrl(kbDetail);
  }, [kbDetail]);

  return (
    <Stack
      gap={2}
      alignItems='center'
      justifyContent='center'
      sx={{ height: '100%' }}
    >
      <Box component='img' src={complete} sx={{ width: 274 }}></Box>
      <Box sx={{ fontSize: 14, color: 'text.tertiary' }}>配置完成</Box>
      <Button
        variant='contained'
        onClick={() => {
          if (wikiUrl) {
            window.open(wikiUrl, '_blank');
          }
        }}
      >
        访问 WIKI 网站
      </Button>
    </Stack>
  );
};

export default Step7Complete;
