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

export interface AppConfig {
  kismet: KismetConfig;
  email: EmailConfig;
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
  };
}
