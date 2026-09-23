/**
 * Sends one test error to GlitchTip and exits, to verify error tracking after a deploy:
 *
 *   docker exec $(docker ps -q -f name=srv-captain--suffa-api) node dist/error-test.js
 *
 * Exit codes: 0 = sent, 1 = invalid configuration, 2 = SUFFA_ERROR_DSN not set.
 */
import { ConfigError, loadConfig } from './config.js';
import { createErrorReporter } from './observability/errors.js';

async function main(): Promise<number> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(JSON.stringify({ msg: 'config.invalid', issues: error.issues }));
      return 1;
    }
    throw error;
  }
  const errors = createErrorReporter({
    dsn: config.errorDsn,
    release: config.version,
    environment: config.env,
    role: config.role,
  });
  if (!errors.enabled) {
    console.error(
      JSON.stringify({ msg: 'error_test.disabled', hint: 'set SUFFA_ERROR_DSN' })
    );
    return 2;
  }
  errors.capture(new Error(`Suffa error tracking test (${config.version})`), {
    test: true,
  });
  await errors.flush(5000);
  process.stdout.write(
    `${JSON.stringify({ msg: 'error_test.sent', release: config.version })}\n`
  );
  return 0;
}

process.exit(await main());
