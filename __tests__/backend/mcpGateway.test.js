const {createMcpGateway} = require('../../backend/src/mcp/mcpGateway');

describe('mcp gateway', () => {
  test('blocks unknown server by allowlist', async () => {
    const gateway = createMcpGateway({
      builtInServers: [
        {
          serverId: 'app-core',
          allowTools: ['app.summarize_current_page'],
          invokeTool: jest.fn(async () => ({status: 'applied'})),
        },
      ],
    });

    await expect(
      gateway.invokeTool({
        serverId: 'unknown-server',
        toolName: 'app.summarize_current_page',
        args: {},
      }),
    ).rejects.toMatchObject({
      code: 'forbidden_scope',
    });
  });

  test('blocks unknown tool by allowlist', async () => {
    const gateway = createMcpGateway({
      builtInServers: [
        {
          serverId: 'app-core',
          allowTools: ['app.summarize_current_page'],
          invokeTool: jest.fn(async () => ({status: 'applied'})),
        },
      ],
    });

    await expect(
      gateway.invokeTool({
        serverId: 'app-core',
        toolName: 'settings.apply_patch',
        args: {syncOnWifi: true},
      }),
    ).rejects.toMatchObject({
      code: 'forbidden_scope',
    });
  });

  test('sanitizes input and output with tool schema', async () => {
    const invokeTool = jest.fn(async ({args}) => ({
      status: 'applied',
      output: {
        postId: String(args.draftId),
        draftId: String(args.draftId),
        secret: 'should_not_leak',
      },
    }));
    const gateway = createMcpGateway({
      builtInServers: [
        {
          serverId: 'app-core',
          allowTools: ['community.publish_draft'],
          invokeTool,
        },
      ],
    });

    const result = await gateway.invokeTool({
      serverId: 'app-core',
      toolName: 'community.publish_draft',
      args: {
        draftId: 'd-1',
        unknownArg: 'x',
      },
    });

    expect(invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        args: {draftId: 'd-1'},
      }),
    );
    expect(result.output).toEqual({
      postId: 'd-1',
      draftId: 'd-1',
    });
    expect(result).toEqual(
      expect.objectContaining({
        serverId: 'app-core',
        toolName: 'community.publish_draft',
        requestId: expect.any(String),
        latencyMs: expect.any(Number),
      }),
    );
  });

  test('does not expose disabled external server as callable', async () => {
    const gateway = createMcpGateway({
      externalServers: [
        {
          serverId: 'ext-demo',
          endpoint: 'https://example.com/mcp',
          allowTools: ['community.create_draft'],
          enabled: false,
        },
      ],
    });

    expect(gateway.listServerIds()).not.toContain('ext-demo');
    expect(gateway.hasEnabledExternalServers()).toBe(false);
    await expect(
      gateway.invokeTool({
        serverId: 'ext-demo',
        toolName: 'community.create_draft',
        args: {},
      }),
    ).rejects.toMatchObject({
      code: 'forbidden_scope',
    });
  });
});
