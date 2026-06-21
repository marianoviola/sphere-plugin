// Read the optional Sphere Node configuration from the environment. Claude
// Desktop injects these from MCPB user_config (the token from the OS keychain)
// via the manifest mcp_config.env mapping. Both are optional by design: the
// plugin is useful with neither set.

export interface NodeConfig {
  url?: string;
  token?: string;
}

export function readNodeConfig(env: NodeJS.ProcessEnv = process.env): NodeConfig {
  const url = env.SPHERE_NODE_URL?.trim();
  const token = env.SPHERE_NODE_TOKEN?.trim();
  return {
    url: url ? url : undefined,
    token: token ? token : undefined,
  };
}
