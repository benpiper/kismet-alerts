import AxiosDigestAuth from '@acidemic/axios-digest-auth';
import { logger } from './logger.ts';
import { validateConfig, type NvrConfig } from './config.ts';

let configCache: NvrConfig | undefined | null = null;
let digestAuthInstance: any = null;

function getNvrConfig(): NvrConfig | undefined {
  if (configCache === null) {
    const config = validateConfig();
    configCache = config.nvr;
  }
  return configCache;
}

function getDigestAuthClient(nvrConfig: NvrConfig) {
  if (!digestAuthInstance) {
    // @ts-ignore
    const AxiosDigestAuthClass = AxiosDigestAuth.default || AxiosDigestAuth;
    digestAuthInstance = new AxiosDigestAuthClass({
      username: nvrConfig.username,
      password: nvrConfig.password,
    });
  }
  return digestAuthInstance;
}

export interface NvrSnapshot {
  filename: string;
  content: Buffer;
  cid: string;
}

export async function getNvrSnapshots(overrideChannels?: number[]): Promise<NvrSnapshot[]> {
  const nvrConfig = getNvrConfig();

  if (!nvrConfig) {
    // NVR is not configured, return empty snapshots
    return [];
  }

  const { ip, snapshotChannels } = nvrConfig;
  const targetChannels = overrideChannels && overrideChannels.length > 0
    ? overrideChannels
    : snapshotChannels;

  const snapshots: NvrSnapshot[] = [];

  logger.info(`Fetching NVR snapshots for channels: ${targetChannels.join(', ')}`);

  const digestClient = getDigestAuthClient(nvrConfig);

  for (const chId of targetChannels) {
    // For analog/TVI channels (< 500), use direct Streaming path.
    // For IP cameras (>= 500), use the StreamingProxy path.
    const url = chId < 500
      ? `http://${ip}/ISAPI/Streaming/channels/${chId}/picture?videoResolutionWidth=1920&videoResolutionHeight=1080`
      : `http://${ip}/ISAPI/ContentMgmt/StreamingProxy/channels/${chId}/picture?videoResolutionWidth=1920&videoResolutionHeight=1080`;

    logger.debug(`Retrieving snapshot from NVR channel ${chId}`, { url });

    try {
      const response = await digestClient.request({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: 5000,
      });

      if (response.status === 200) {
        const buffer = Buffer.from(response.data);
        snapshots.push({
          filename: `channel_${chId}.jpg`,
          content: buffer,
          cid: `nvr_channel_${chId}`,
        });
        logger.info(`Successfully retrieved snapshot for NVR channel ${chId} (${buffer.length} bytes)`);
      } else {
        logger.warn(`Non-200 response when fetching snapshot for channel ${chId}`, {
          status: response.status,
          data: response.data?.toString().substring(0, 200),
        });
      }
    } catch (error: any) {
      logger.error(`Error fetching NVR snapshot for channel ${chId}`, {
        error: error.message,
        url,
      });
    }
  }

  return snapshots;
}
