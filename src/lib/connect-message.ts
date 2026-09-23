/**
 * The one word the hosted connect pages and the product agree on.
 *
 * It lives away from both pages because three of them post or read it, and a
 * string that drifts between two of them is a flow that silently never reports
 * back.
 */
export const CONNECT_MESSAGE_TYPE = 'openipaas:connect';

export type ConnectOutcome = 'connected' | 'cancelled' | 'failed' | 'used';

export interface ConnectMessage {
  type: typeof CONNECT_MESSAGE_TYPE;
  status: ConnectOutcome;
  connection?: string;
}
