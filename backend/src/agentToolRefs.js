const DEFAULT_BUILTIN_MCP_SERVER_ID = 'app-core';

const ACTION_TOOL_REF_MAP = Object.freeze({
  'navigation::navigate_tab': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'navigation.navigate_tab',
  },
  'app::summarize_current_page': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'app.summarize_current_page',
  },
  'grading::apply_visual_suggest': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'grading.apply_visual_suggest',
  },
  'convert::start_task': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'convert.start_task',
  },
  'community::create_draft': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'community.create_draft',
  },
  'community::publish_draft': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'community.publish_draft',
  },
  'settings::apply_patch': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'settings.apply_patch',
  },
  'permission::request': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'permission.request',
  },
  'auth::require_login': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'auth.require_login',
  },
  'file::pick': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'file.pick',
  },
  'file::write': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'file.write',
  },
  'settings::open': {
    serverId: DEFAULT_BUILTIN_MCP_SERVER_ID,
    toolName: 'settings.open',
  },
});

const ACTION_TOOL_META_MAP = Object.freeze({
  'navigation::navigate_tab': {
    displayName: '前往页面',
    requiredContext: [],
    requiredDevicePermissions: [],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'client_action',
  },
  'app::summarize_current_page': {
    displayName: '总结当前页面',
    requiredContext: [],
    requiredDevicePermissions: [],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: false,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'summary',
  },
  'grading::apply_visual_suggest': {
    displayName: '执行智能调色',
    requiredContext: ['context.color.image'],
    requiredDevicePermissions: ['photo_library'],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: false,
    confirmationPolicy: 'never',
    resultCardKind: 'grading_result',
  },
  'convert::start_task': {
    displayName: '启动建模任务',
    requiredContext: ['context.modeling.image'],
    requiredDevicePermissions: ['photo_library'],
    supportsAsync: true,
    riskLevel: 'medium',
    resumable: true,
    clientOwned: false,
    confirmationPolicy: 'always',
    resultCardKind: 'model_ready',
  },
  'community::create_draft': {
    displayName: '创建社区草稿',
    requiredContext: [],
    requiredDevicePermissions: [],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: false,
    confirmationPolicy: 'never',
    resultCardKind: 'draft_ready',
  },
  'community::publish_draft': {
    displayName: '发布社区草稿',
    requiredContext: ['context.community.draftId'],
    requiredDevicePermissions: [],
    supportsAsync: false,
    riskLevel: 'high',
    resumable: true,
    clientOwned: false,
    confirmationPolicy: 'always',
    resultCardKind: 'community_published',
  },
  'settings::apply_patch': {
    displayName: '应用设置变更',
    requiredContext: [],
    requiredDevicePermissions: [],
    supportsAsync: false,
    riskLevel: 'high',
    resumable: false,
    clientOwned: false,
    confirmationPolicy: 'always',
    resultCardKind: 'settings_updated',
  },
  'permission::request': {
    displayName: '请求客户端权限',
    requiredContext: [],
    requiredDevicePermissions: [],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'permission_required',
  },
  'auth::require_login': {
    displayName: '请求登录',
    requiredContext: [],
    requiredDevicePermissions: ['auth_session'],
    supportsAsync: false,
    riskLevel: 'medium',
    resumable: true,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'auth_required',
  },
  'file::pick': {
    displayName: '选择文件',
    requiredContext: [],
    requiredDevicePermissions: ['file_read'],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'context_required',
  },
  'file::write': {
    displayName: '写回文件',
    requiredContext: [],
    requiredDevicePermissions: ['file_write'],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'file_saved',
  },
  'settings::open': {
    displayName: '打开系统设置',
    requiredContext: [],
    requiredDevicePermissions: ['system_settings'],
    supportsAsync: false,
    riskLevel: 'low',
    resumable: true,
    clientOwned: true,
    confirmationPolicy: 'never',
    resultCardKind: 'client_action',
  },
});

const asTrimmed = value => (typeof value === 'string' ? value.trim() : '');

const toActionKey = action => `${String(action?.domain || '')}::${String(action?.operation || '')}`;

const normalizeToolRef = value => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const serverId = asTrimmed(value.serverId || value.server_id);
  const toolName = asTrimmed(value.toolName || value.tool_name);
  if (!serverId || !toolName) {
    return null;
  }
  return {
    serverId,
    toolName,
  };
};

const resolveActionToolRef = action => {
  const explicit = normalizeToolRef(action?.toolRef || action?.tool_ref);
  if (explicit) {
    return explicit;
  }
  const mapped = ACTION_TOOL_REF_MAP[toActionKey(action)];
  if (!mapped) {
    return null;
  }
  return {
    serverId: mapped.serverId,
    toolName: mapped.toolName,
  };
};

const resolveActionToolMeta = action => {
  const metadata = ACTION_TOOL_META_MAP[toActionKey(action)];
  if (!metadata) {
    return {
      requiredContext: [],
      requiredDevicePermissions: [],
      supportsAsync: false,
      riskLevel: 'low',
      resumable: false,
      clientOwned: false,
      confirmationPolicy: 'never',
    };
  }
  return {
    displayName:
      typeof metadata.displayName === 'string' && metadata.displayName.trim()
        ? metadata.displayName.trim()
        : undefined,
    requiredContext: Array.isArray(metadata.requiredContext) ? [...metadata.requiredContext] : [],
    requiredDevicePermissions: Array.isArray(metadata.requiredDevicePermissions)
      ? [...metadata.requiredDevicePermissions]
      : [],
    supportsAsync: metadata.supportsAsync === true,
    riskLevel:
      metadata.riskLevel === 'medium' || metadata.riskLevel === 'high' ? metadata.riskLevel : 'low',
    resumable: metadata.resumable === true,
    clientOwned: metadata.clientOwned === true,
    confirmationPolicy: metadata.confirmationPolicy === 'always' ? 'always' : 'never',
    resultCardKind:
      typeof metadata.resultCardKind === 'string' && metadata.resultCardKind.trim()
        ? metadata.resultCardKind.trim()
        : undefined,
  };
};

const listMappedToolRefs = () =>
  Object.values(ACTION_TOOL_REF_MAP).map(item => ({
    serverId: item.serverId,
    toolName: item.toolName,
  }));

const listToolRegistry = () =>
  Object.entries(ACTION_TOOL_REF_MAP).map(([actionKey, toolRef]) => ({
    actionKey,
    toolRef: {
      serverId: toolRef.serverId,
      toolName: toolRef.toolName,
    },
    toolMeta: resolveActionToolMeta({
      domain: actionKey.split('::')[0],
      operation: actionKey.split('::')[1],
    }),
  }));

module.exports = {
  DEFAULT_BUILTIN_MCP_SERVER_ID,
  ACTION_TOOL_REF_MAP,
  ACTION_TOOL_META_MAP,
  toActionKey,
  normalizeToolRef,
  resolveActionToolRef,
  resolveActionToolMeta,
  listMappedToolRefs,
  listToolRegistry,
};
