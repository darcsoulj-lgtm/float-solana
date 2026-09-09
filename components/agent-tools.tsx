'use client';
import { useEffect } from 'react';
import { api } from '@/lib/client';
export function AgentTools() {
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'list_available_holder_surveys',
            description:
              'Read currently available live and simulated HolderPulse surveys. Simulated examples are explicitly marked; this does not create or submit a response.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            async execute(input: unknown) {
              if (
                !input ||
                typeof input !== 'object' ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error('Expected an empty object.');
              return api('surveys');
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, []);
  return null;
}
