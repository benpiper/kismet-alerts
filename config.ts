export interface KismetConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export interface NvrConfig {
  ip: string;
  username: string;
  password: string;
  snapshotChannels: number[];
}

export interface AppConfig {
  kismet: KismetConfig;
  email: EmailConfig;
  nvr?: NvrConfig;
}

export function validateConfig(): AppConfig {
  const requiredVars = [
    'KISMET_HOST',
    'KISMET_PORT',
    'KISMET_USERNAME',
    'KISMET_PASSWORD',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'EMAIL_FROM',
    'EMAIL_TO',
  ];

  const errors: string[] = [];

  // Check all required variables exist
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate port numbers are integers in valid range
  const portVars = ['KISMET_PORT', 'EMAIL_PORT'];
  for (const portVar of portVars) {
    if (process.env[portVar]) {
      const port = parseInt(process.env[portVar], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push(`Invalid port number for ${portVar}: ${process.env[portVar]} (must be 1-65535)`);
      }
    }
  }

  // Validate email addresses contain '@'
  const emailVars = ['EMAIL_FROM', 'EMAIL_TO'];
  for (const emailVar of emailVars) {
    if (process.env[emailVar] && !process.env[emailVar].includes('@')) {
      errors.push(`Invalid email format for ${emailVar}: ${process.env[emailVar]} (must contain @)`);
    }
  }

  // Throw if any validation failed
  if (errors.length > 0) {
    const errorMessage = 'Configuration validation failed:\n' + errors.map(e => `  - ${e}`).join('\n');
    throw new Error(errorMessage);
  }

  let nvrConfig: NvrConfig | undefined;
  if (process.env.NVR_IP) {
    if (!process.env.NVR_USERNAME || !process.env.NVR_PASSWORD) {
      throw new Error('Configuration validation failed:\n  - Missing required NVR_USERNAME or NVR_PASSWORD since NVR_IP is provided');
    }

    let snapshotChannels: number[] = [101];
    if (process.env.NVR_SNAPSHOT_CHANNELS) {
      const parsed = process.env.NVR_SNAPSHOT_CHANNELS.split(',')
        .map(ch => parseInt(ch.trim(), 10));
      if (parsed.some(isNaN)) {
        throw new Error(`Configuration validation failed:\n  - Invalid format for NVR_SNAPSHOT_CHANNELS: ${process.env.NVR_SNAPSHOT_CHANNELS} (must be a comma-separated list of integers)`);
      }
      snapshotChannels = parsed;
    }

    nvrConfig = {
      ip: process.env.NVR_IP,
      username: process.env.NVR_USERNAME,
      password: process.env.NVR_PASSWORD,
      snapshotChannels,
    };
  }

  return {
    kismet: {
      host: process.env.KISMET_HOST!,
      port: parseInt(process.env.KISMET_PORT!, 10),
      username: process.env.KISMET_USERNAME!,
      password: process.env.KISMET_PASSWORD!,
    },
    email: {
      host: process.env.EMAIL_HOST!,
      port: parseInt(process.env.EMAIL_PORT!, 10),
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
      from: process.env.EMAIL_FROM!,
      to: process.env.EMAIL_TO!,
    },
    nvr: nvrConfig,
  };
}
