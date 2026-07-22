export interface SupabaseRpcClient {
  rpc: unknown;
}

type SupabaseRpcCaller = (
  name: string,
  params: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;

export function callSupabaseRpc(
  client: SupabaseRpcClient,
  name: string,
  params: Record<string, unknown>,
) {
  const rpc = client.rpc as SupabaseRpcCaller;
  return rpc.call(client, name, params);
}
