/**
 * @file saas-transform.ts
 * @description SaaS CI/CD build-time connector for pre-compiling native & web Direct-Path templates.
 * Dispatches declarative UI intents to the proprietary transformation gateway and records compute metrics.
 */

export interface ISaasTransformConfig {
  /** Gateway transformation endpoint URL (defaults to http://127.0.0.1:9876) */
  endpoint?: string;
  /** Authentication API key (`X-Synetics-Api-Key`) */
  apiKey: string;
  /** Target execution platform */
  targetPlatform?: 'web' | 'ios' | 'android';
}

export interface ISaasTransformResult {
  spec: any;
  computeTimeUs: number;
  computeUnits: number;
  targetPlatform: string;
}

/**
 * Invokes the SaaS transformation gateway to project an intent into a target-optimized Direct-Path bundle.
 */
export async function projectIntentViaSaas(
  intent: string,
  schema: Record<string, any>,
  config: ISaasTransformConfig
): Promise<ISaasTransformResult> {
  const endpoint = (config.endpoint || 'http://127.0.0.1:9876') + '/v1/transform/project';
  const targetPlatform = config.targetPlatform || 'web';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Synetics-Api-Key': config.apiKey,
    },
    body: JSON.stringify({
      intent,
      schema,
      target_platform: targetPlatform,
    }),
  });

  if (!res.ok) {
    throw new Error(`SaaS Transformation failed with HTTP ${res.status}: ${res.statusText}`);
  }

  const computeTimeUs = parseInt(res.headers.get('x-synetics-compute-time-us') || '0', 10);
  const computeUnits = parseInt(res.headers.get('x-synetics-compute-units') || '1', 10);
  const spec = await res.json();

  return {
    spec,
    computeTimeUs,
    computeUnits,
    targetPlatform,
  };
}
